from fastapi import APIRouter, HTTPException, Body, Query
from pydantic import BaseModel
from typing import Dict, Any
from cassandra import InvalidRequest
from app.cassandra_client import CassandraClient, get_cluster_info
import os

cassandra_router = APIRouter()
CASSANDRA_KEYSPACE = os.getenv("CASSANDRA_KEYSPACE", "testkeyspace")
client: CassandraClient | None = None

def get_client() -> CassandraClient:
    global client
    if client is None:
        client = CassandraClient(keyspace=CASSANDRA_KEYSPACE)
    return client

# ---------------------------
# Pydantic Models
# ---------------------------
class CassandraDocument(BaseModel):
    """
    Flexible model for Cassandra document (row)
    """
    pass

class CassandraFindBody(BaseModel):
    filters: Dict[str, Any] = {}

class CassandraUpdateBody(BaseModel):
    filter: Dict[str, Any]
    update: Dict[str, Any]

class CassandraDeleteBody(BaseModel):
    filter: Dict[str, Any]

class InsertResponse(BaseModel):
    inserted: bool
    data: Dict[str, Any]

class UpdateResponse(BaseModel):
    updated: int

class DeleteResponse(BaseModel):
    deleted: int

# ---------------------------
# Cluster Info / Health
# ---------------------------
@cassandra_router.get("/status")
def cassandra_status():
    """Return Cassandra cluster info: local node + peers"""
    try:
        info = get_cluster_info()
        return info
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@cassandra_router.get("/health")
def cassandra_health():
    """Simple health check for Cassandra connectivity"""
    try:
        cluster_info = get_cluster_info()
        return {"status": "ok", "cluster": cluster_info["local"]["data_center"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ---------------------------
# CRUD Operations
# ---------------------------
@cassandra_router.post("/insert", response_model=InsertResponse)
def insert_document(
    table: str = Query(..., description="Cassandra table name"),
    document: CassandraDocument = Body(..., description="Document (row) to insert", example={"id": "uuid-string", "name": "Alice"})
):
    """Insert a row into a Cassandra table"""
    try:
        result = get_client().insert_document(table, document.model_dump(exclude_unset=False))
        return {"inserted": True, "data": result}
    except InvalidRequest as e:
        raise HTTPException(status_code=400, detail=f"Invalid request: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@cassandra_router.post("/find")
def find_documents(
    table: str = Query(..., description="Cassandra table name"),
    body: CassandraFindBody = Body(default=CassandraFindBody(), description="Optional filters")
):
    """Find rows in a Cassandra table"""
    try:
        results = get_client().find_documents(table, body.filters)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@cassandra_router.put("/update", response_model=UpdateResponse)
def update_document(
    table: str = Query(..., description="Cassandra table name"),
    body: CassandraUpdateBody = Body(..., description="Filter and update instructions")
):
    """
    Update rows in a Cassandra table.

    Example body:
    {
        "filter": {"id": "uuid-string"},
        "update": {"status": "inactive"}
    }
    """
    try:
        result = get_client().update_document(table, body.filter, body.update)
        return {"updated": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@cassandra_router.delete("/delete", response_model=DeleteResponse)
def delete_document(
    table: str = Query(..., description="Cassandra table name"),
    body: CassandraDeleteBody = Body(..., description="Filter criteria for deletion")
):
    """
    Delete rows from a Cassandra table.

    Example body:
    {
        "filter": {"id": "uuid-string"}
    }
    """
    try:
        result = get_client().delete_document(table, body.filter)
        return {"deleted": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
