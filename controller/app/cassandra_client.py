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
                v = uuid.UUID(v)
            except ValueError:
                pass
        new_d[k] = v
    return new_d


class CassandraClient:
    def __init__(self, keyspace: str, replication_factor: int = 3):
        # Defer connecting at import/startup; connect lazily on first use
        self.cluster = Cluster(contact_points=CONTACT_POINTS)
        self.session = None
        self.keyspace = keyspace
        self.replication_factor = replication_factor

    def ensure_connected(self):
        if self.session is not None:
            return
        # Attempt to connect with retries so API can start before Cassandra
        start = time.time()
        timeout = 90
        last_error = None
        while time.time() - start < timeout:
            try:
                self.session = self.cluster.connect()
                # Wait for cluster ready
                self._wait_for_cluster()
                # Ensure keyspace
                self._create_keyspace_if_not_exists(self.replication_factor)
                self.session.set_keyspace(self.keyspace)
                return
            except Exception as e:
                last_error = e
                time.sleep(3)
        raise RuntimeError(f"Cassandra connect failed after retries: {last_error}")

    def _wait_for_cluster(self, timeout: int = 60):
        """Wait until at least one node is available."""
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
        """Create the keyspace if it doesn't exist."""
        query = f"""
        CREATE KEYSPACE IF NOT EXISTS {self.keyspace}
        WITH replication = {{ 'class': 'SimpleStrategy', 'replication_factor': '{replication_factor}' }}
        """
        try:
            self.session.execute(query)
            print(f"✅ Keyspace '{self.keyspace}' is ready")
        except InvalidRequest as e:
            raise RuntimeError(f"❌ Failed to create keyspace {self.keyspace}: {e}")

    # ---------------------------
    # CRUD Operations (unchanged)
    # ---------------------------

    def insert_document(self, table: str, document: dict):
        self.ensure_connected()
        if "id" not in document:
            document["id"] = uuid.uuid4()
        else:
            document = _convert_uuid_values(document)

        columns = ", ".join(document.keys())
        placeholders = ", ".join(["%s"] * len(document))
        query = f"INSERT INTO {table} ({columns}) VALUES ({placeholders})"
        try:
            self.session.execute(query, tuple(document.values()))
            return document
        except InvalidRequest as e:
            raise e

    def find_documents(self, table: str, filters: dict = None):
        filters = _convert_uuid_values(filters or {})

        if filters:
            conditions = " AND ".join([f"{k}=%s" for k in filters.keys()])
            query = f"SELECT * FROM {table} WHERE {conditions} ALLOW FILTERING"
            values = tuple(filters.values())
        else:
            query = f"SELECT * FROM {table}"
            values = ()

        stmt = SimpleStatement(query)
        self.ensure_connected()
        rows = self.session.execute(stmt, values)
        return [dict(row._asdict()) for row in rows]

    def update_document(self, table: str, filters: dict, updates: dict):
        if not filters or not updates:
            raise ValueError("Both filter and update must be provided")

        filters = _convert_uuid_values(filters)
        updates = _convert_uuid_values(updates)

        set_clause = ", ".join([f"{k}=%s" for k in updates.keys()])
        where_clause = " AND ".join([f"{k}=%s" for k in filters.keys()])
        query = f"UPDATE {table} SET {set_clause} WHERE {where_clause}"

        self.ensure_connected()
        values = tuple(updates.values()) + tuple(filters.values())
        self.session.execute(query, values)
        return {"matched": len(filters), "modified": len(updates)}

    def delete_document(self, table: str, filters: dict):
        if not filters:
            raise ValueError("Filter is required for delete")

        filters = _convert_uuid_values(filters)
        where_clause = " AND ".join([f"{k}=%s" for k in filters.keys()])
        query = f"DELETE FROM {table} WHERE {where_clause}"

        self.ensure_connected()
        values = tuple(filters.values())
        self.session.execute(query, values)
        return {"deleted": True, "filter": filters}


# ---------------------------
# Cluster Metadata (unchanged)
# ---------------------------

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
        peers.append(
            {
                "peer": str(getattr(r, "peer", None)),
                "data_center": getattr(r, "data_center", None),
                "host_id": str(getattr(r, "host_id", None)),
                "rpc_address": str(getattr(r, "rpc_address", None)),
            }
        )

    cluster.shutdown()
    return {"local": local, "peers": peers}
