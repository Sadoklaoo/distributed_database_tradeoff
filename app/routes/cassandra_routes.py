import os
import uuid
from cassandra.cluster import Cluster, Session
from typing import List, Dict

CONTACT_STR = os.getenv("CASSANDRA_CONTACT_POINTS", "cassandra1,cassandra2,cassandra3")
CONTACT_POINTS = [c.strip() for c in CONTACT_STR.split(",") if c.strip()]


class CassandraClient:
    def __init__(self, contact_points: List[str] = CONTACT_POINTS, keyspace: str = "testkeyspace"):
        self.contact_points = contact_points
        self.keyspace = keyspace
        self.cluster: Cluster = None
        self.session: Session = None

    def connect(self):
        if not self.cluster:
            self.cluster = Cluster(contact_points=self.contact_points)
            self.session = self.cluster.connect(self.keyspace)

    def close(self):
        if self.cluster:
            self.cluster.shutdown()

    # ---------------------------
    # Cluster Info
    # ---------------------------
    def get_cluster_info(self):
        self.connect()
        local_row = self.session.execute("SELECT host_id, data_center, rack, broadcast_address FROM system.local").one()
        local = {
            "host_id": str(local_row.host_id) if local_row else None,
            "data_center": getattr(local_row, "data_center", None),
            "rack": getattr(local_row, "rack", None),
            "broadcast_address": str(getattr(local_row, "broadcast_address", None))
        }

        peers = []
        rows = self.session.execute("SELECT peer, data_center, host_id, rpc_address FROM system.peers")
        for r in rows:
            peers.append({
                "peer": str(getattr(r, "peer", None)),
                "data_center": getattr(r, "data_center", None),
                "host_id": str(getattr(r, "host_id", None)),
                "rpc_address": str(getattr(r, "rpc_address", None))
            })

        return {"local": local, "peers": peers}

    # ---------------------------
    # CRUD
    # ---------------------------
    def insert_document(self, table: str, document: Dict):
        self.connect()
        # Add a generated _id like Mongo
        doc_id = str(uuid.uuid4())
        document_with_id = {"_id": doc_id, **document}
        columns = ", ".join(document_with_id.keys())
        placeholders = ", ".join(["%s"] * len(document_with_id))
        query = f"INSERT INTO {table} ({columns}) VALUES ({placeholders})"
        self.session.execute(query, tuple(document_with_id.values()))
        return {"inserted_id": doc_id, "document": document_with_id}

    def find_documents(self, table: str, filter_query: Dict = None):
        self.connect()
        query = f"SELECT * FROM {table}"
        params = ()
        if filter_query:
            conditions = " AND ".join([f"{k}=%s" for k in filter_query.keys()])
            query += f" WHERE {conditions}"
            params = tuple(filter_query.values())
        rows = self.session.execute(query, params)
        results = []
        for row in rows:
            row_dict = dict(row._asdict())
            results.append({"_id": row_dict.get("_id", str(uuid.uuid4())), "collection": table, "document": row_dict})
        return results

    def update_document(self, table: str, filter_query: Dict, update_query: Dict):
        self.connect()
        set_clause = ", ".join([f"{k}=%s" for k in update_query.keys()])
        where_clause = " AND ".join([f"{k}=%s" for k in filter_query.keys()])
        query = f"UPDATE {table} SET {set_clause} WHERE {where_clause}"
        self.session.execute(query, tuple(update_query.values()) + tuple(filter_query.values()))
        return {"status": "ok"}

    def delete_document(self, table: str, filter_query: Dict):
        self.connect()
        where_clause = " AND ".join([f"{k}=%s" for k in filter_query.keys()])
        query = f"DELETE FROM {table} WHERE {where_clause}"
        self.session.execute(query, tuple(filter_query.values()))
        return {"status": "ok"}
