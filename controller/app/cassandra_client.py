import os
import uuid
import time
from cassandra.cluster import Cluster
from cassandra.query import SimpleStatement
from cassandra import InvalidRequest

CONTACT_STR = os.getenv("CASSANDRA_CONTACT_POINTS", "cassandra1,cassandra2,cassandra3")
CONTACT_POINTS = [c.strip() for c in CONTACT_STR.split(",") if c.strip()]


def _convert_uuid_values(d: dict) -> dict:
    """Convert string UUIDs to uuid.UUID objects."""
    new_d = {}
    for k, v in d.items():
        if isinstance(v, str):
            try:
                new_d[k] = uuid.UUID(v)
            except ValueError:
                new_d[k] = v
        else:
            new_d[k] = v
    return new_d

class CassandraClient:
    def init_schema(self):
        self.ensure_connected()
        query = f"""
        CREATE TABLE IF NOT EXISTS {self.keyspace}.devices (
            id uuid PRIMARY KEY,
            name text,
            status text,
            type text
        )
        """
        self.session.execute(query)

    def __init__(self, keyspace: str, replication_factor: int = 3):
        self.cluster = Cluster(contact_points=CONTACT_POINTS)
        self.session = None
        self.keyspace = keyspace
        self.replication_factor = replication_factor
        self._column_cache = {}
        self._prepared_cache = {}

    def execute_prepared(self, query: str, values: list):
        if query not in self._prepared_cache:
            self._prepared_cache[query] = self.session.prepare(query)
        self.session.execute(self._prepared_cache[query], values)   

    def ensure_connected(self):
        if self.session is not None:
            return
        start = time.time()
        timeout = 90
        last_error = None
        while time.time() - start < timeout:
            try:
                self.session = self.cluster.connect()
                self._wait_for_cluster()
                self._create_keyspace_if_not_exists(self.replication_factor)
                self.session.set_keyspace(self.keyspace)
                self.init_schema()
                return
            except Exception as e:
                last_error = e
                time.sleep(3)
        raise RuntimeError(f"Cassandra connect failed after retries: {last_error}")

    def _wait_for_cluster(self, timeout: int = 60):
        start = time.time()
        while True:
            try:
                if self.session is None:
                    raise RuntimeError("Session not initialized")
                self.session.execute("SELECT now() FROM system.local")
                print("✅ Cassandra cluster is reachable")
                break
            except Exception:
                if time.time() - start > timeout:
                    raise RuntimeError("❌ Cassandra cluster not reachable after timeout")
                print("⏳ Waiting for Cassandra cluster...")
                time.sleep(3)

    def _create_keyspace_if_not_exists(self, replication_factor: int):
        query = f"""
        CREATE KEYSPACE IF NOT EXISTS {self.keyspace}
        WITH replication = {{'class': 'SimpleStrategy', 'replication_factor': {replication_factor}}}
        """
        try:
            self.session.execute(query)
            print(f"✅ Keyspace '{self.keyspace}' is ready")
        except InvalidRequest as e:
            raise RuntimeError(f"❌ Failed to create keyspace {self.keyspace}: {e}")
        
    def insert_document(self, table: str, document: dict):
        self.ensure_connected()
        try:
            # Create a working copy of the document
            doc = document.copy()
            
            # Handle ID field
            if "id" not in doc:
                doc["id"] = uuid.uuid4()
            elif isinstance(doc["id"], str):
                try:
                    doc["id"] = uuid.UUID(doc["id"])
                except ValueError:
                    doc["id"] = uuid.uuid4()


            # Create document with all fields
            full_doc = {
                "id": doc["id"],
                "name": doc.get("name"),
                "status": doc.get("status"),
                "type": doc.get("type")
            }

            
            # Build query
            columns = list(full_doc.keys())
            placeholders = ['?'] * len(columns)
            query = (
                f"INSERT INTO {self.keyspace}.{table} "
                f"({', '.join(columns)}) VALUES ({', '.join(placeholders)})"
            )
            
            # Prepare values maintaining column order
            values = [full_doc[col] for col in columns]
            
            
            # Execute with prepared statement
            self.execute_prepared(query, values)

            return {k: str(v) if isinstance(v, uuid.UUID) else v for k, v in full_doc.items()}

        except Exception as exc:
            print(f"❌ Cassandra insert error: {exc}")
            raise InvalidRequest(f"Insert failed: {exc}") from exc

    def find_documents(self, table: str, filters: dict = None):
        self.ensure_connected()
        filters = _convert_uuid_values(filters or {})

        if filters:
            conditions = " AND ".join([f"{k} = ?" for k in filters.keys()])
            query = f"SELECT * FROM {self.keyspace}.{table} WHERE {conditions} ALLOW FILTERING"
            values = list(filters.values())
        else:
            query = f"SELECT * FROM {self.keyspace}.{table}"
            values = []

        try:
            self._prepared_cache[query] = self.session.prepare(query)
            rows = self.session.execute(self._prepared_cache[query], values)
            return [dict(row._asdict()) for row in rows]
        except InvalidRequest as e:
            if "unconfigured table" in str(e).lower():
                self._ensure_table_exists(table)
                return []
            raise

    def update_document(self, table: str, filters: dict, updates: dict) -> dict:
        """Update documents in a Cassandra table that match the filters."""
        try:
            if not filters or not updates:
                raise ValueError("Both filter and update must be provided")

            # Remove primary key from updates if present
            updates = {k: v for k, v in updates.items() if k != 'id'}
            if not updates:
                raise ValueError("No valid fields to update")

            self.ensure_connected()
            

            # Convert UUID strings to UUID objects
            filters = _convert_uuid_values(filters)
            updates = _convert_uuid_values(updates)

            # Build update clause
            set_clause = ", ".join([f"{k} = ?" for k in updates.keys()])
            where_clause = " AND ".join([f"{k} = ?" for k in filters.keys()])
            query = f"UPDATE {self.keyspace}.{table} SET {set_clause} WHERE {where_clause}"

            # Prepare values in correct order
            values = list(updates.values()) + list(filters.values())
            


            # Execute prepared statement
            self.execute_prepared(query, values)

            # Return response matching UpdateResponse model
            return {
                "updated": True,
                "fields_updated": len(updates),
                "filter_used": {k: str(v) if isinstance(v, uuid.UUID) else v for k, v in filters.items()},
                "updates_applied": {k: str(v) if isinstance(v, uuid.UUID) else v for k, v in updates.items()}
            }

        except Exception as exc:
            print(f"❌ Cassandra update error: {exc}")
            raise InvalidRequest(f"Update failed: {exc}") from exc

    def delete_document(self, table: str, filters: dict):
        try:
            if not filters:
                raise ValueError("Filter is required for delete")

            self.ensure_connected()
            filters = _convert_uuid_values(filters)
            
            
            where_clause = " AND ".join([f"{k} = ?" for k in filters.keys()])
            query = f"DELETE FROM {self.keyspace}.{table} WHERE {where_clause}"
            
            values = list(filters.values())
            self.execute_prepared(query, values)
            return 1
        except Exception as e:
            print(f"Delete error: {str(e)}")
            raise InvalidRequest(f"Delete failed: {str(e)}")

    def _ensure_table_exists(self, table: str):
        self.ensure_connected()
        query = f"""
        CREATE TABLE IF NOT EXISTS {self.keyspace}.{table} (
            id uuid PRIMARY KEY
        )
        """
        self.session.execute(query)


    def _existing_columns(self, table: str):
        cache_key = f"{self.keyspace}.{table}"
        if cache_key in self._column_cache:
            return self._column_cache[cache_key]

        rows = self.session.execute(
                f"SELECT column_name FROM system_schema.columns WHERE keyspace_name = '{self.keyspace}' AND table_name = '{table}'"
        )
        columns = {row.column_name for row in rows}
        self._column_cache[cache_key] = columns
        return columns

    def _ensure_columns_exist(self, table: str, document: dict):
        """Ensure all document fields exist as columns in the table."""
        # Get existing columns
        existing = self._existing_columns(table)
        
        # Check each field in document
        for key, value in document.items():
            if key not in existing:
                # Determine CQL type based on Python type
                if isinstance(value, bool):
                    ctype = "boolean"
                elif isinstance(value, int):
                    ctype = "int"
                elif isinstance(value, float):
                    ctype = "double"
                elif isinstance(value, uuid.UUID):
                    ctype = "uuid"
                else:
                    ctype = "text"
                
                try:
                    # Add column if it doesn't exist
                    query = f"ALTER TABLE {self.keyspace}.{table} ADD {key} {ctype}"
                    self.session.execute(query)
                    
                    
                    # Update cache
                    cache_key = f"{self.keyspace}.{table}"
                    if cache_key in self._column_cache:
                        self._column_cache[cache_key].add(key)
                except InvalidRequest as e:
                    # Column might have been added by another process
                    if "already exists" not in str(e).lower():
                        raise

                
def get_cluster_info():
    cluster = Cluster(contact_points=CONTACT_POINTS)
    session = cluster.connect()

    local_row = session.execute(
        "SELECT host_id, data_center, rack, broadcast_address FROM system.local"
    ).one()
    local = {
        "host_id": str(local_row.host_id) if local_row else None,
        "data_center": getattr(local_row, "data_center", None),
        "rack": getattr(local_row, "rack", None),
        "broadcast_address": str(getattr(local_row, "broadcast_address", None)),
    }

    peers = []
    rows = session.execute(
        "SELECT peer, data_center, host_id, rpc_address FROM system.peers"
    )
    for r in rows:
        peers.append({
            "peer": str(getattr(r, "peer", None)),
            "data_center": getattr(r, "data_center", None),
            "host_id": str(getattr(r, "host_id", None)),
            "rpc_address": str(getattr(r, "rpc_address", None)),
        })

    cluster.shutdown()
    return {"local": local, "peers": peers}