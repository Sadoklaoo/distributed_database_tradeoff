from fastapi import APIRouter, HTTPException, Body, Query
from cassandra import InvalidRequest
from app.cassandra_client import CassandraClient, get_cluster_info
import os

# --------------------------------------------------
# Router Definition
# --------------------------------------------------
cassandra_router = APIRouter()

# Cassandra Configuration
CASSANDRA_KEYSPACE = os.getenv("CASSANDRA_KEYSPACE", "testkeyspace")

# Initialize Client
client = CassandraClient(keyspace=CASSANDRA_KEYSPACE)


# --------------------------------------------------
# Cluster Info / Health
# --------------------------------------------------
@cassandra_router.get("/status")
def cassandra_status():
    """
    Returns basic cluster info: local node + peers.
    """
    try:
        info = get_cluster_info()
        return info
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@cassandra_router.get("/health")
def cassandra_health():
    """
    Simple health check to verify Cassandra cluster connectivity.
    """
    try:
        cluster_info = get_cluster_info()
        return {"status": "ok", "cluster": cluster_info["local"]["data_center"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --------------------------------------------------
# CRUD Operations
# --------------------------------------------------
@cassandra_router.post("/insert")
def insert_document(
    table: str = Query(..., description="Cassandra table name"),
    document: dict = Body(..., description="Document (row) to insert"),
):
    """
    Insert a document (row) into a Cassandra table.
    """
    try:
        result = client.insert_document(table, document)
        return {"inserted": True, "data": result}
    except InvalidRequest as e:
        raise HTTPException(status_code=400, detail=f"Invalid request: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@cassandra_router.post("/find")
def find_documents(
    table: str = Query(..., description="Cassandra table name"),
    filters: dict = Body(default={}, description="Optional filters"),
):
    """
    Retrieve all rows from the specified Cassandra table (supports basic filters).
    """
    try:
        results = client.find_documents(table, filters)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@cassandra_router.put("/update")
def update_document(
    table: str = Query(..., description="Cassandra table name"),
    body: dict = Body(..., description="Filter and update instructions"),
):
    """
    Update rows in the Cassandra table matching the given filter.

    Example body:
    {
        "filter": {"id": "<uuid>"},
        "update": {"status": "inactive"}
    }
    """
    try:
        filter_query = body.get("filter", {})
        update_query = body.get("update", {})
        result = client.update_document(table, filter_query, update_query)
        return {"updated": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@cassandra_router.delete("/delete")
def delete_document(
    table: str = Query(..., description="Cassandra table name"),
    body: dict = Body(..., description="Filter criteria"),
):
    """
    Delete rows from the Cassandra table matching the provided filter.

    Example body:
    {
        "filter": {"id": "<uuid>"}
    }
    """
    try:
        filters = body.get("filter", {})
        result = client.delete_document(table, filters)
        return {"deleted": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
