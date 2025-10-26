import time
from fastapi import APIRouter, HTTPException, Body, Query
from cassandra import InvalidRequest
from app.cassandra_client import CassandraClient, get_cluster_info
import os

from app.models.cassandra_models import CassandraDeleteBody, CassandraDocument, CassandraFindBody, DeleteResponse, InsertResponse, UpdateRequest, UpdateResponse
from app.utils.request_stats import increment_request_count

cassandra_router = APIRouter()
CASSANDRA_KEYSPACE = os.getenv("CASSANDRA_KEYSPACE", "testkeyspace")
client: CassandraClient | None = None

def get_client() -> CassandraClient:
    global client
    if client is None:
        client = CassandraClient(keyspace=CASSANDRA_KEYSPACE)
    return client



# ---------------------------
# Cluster Info / Health
# ---------------------------
@cassandra_router.get("/status")
def cassandra_status():
    """Return Cassandra cluster info: local node + peers"""
    start = time.time()
    try:
        info = get_cluster_info()
        return info
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        duration = time.time() - start
        increment_request_count("cassandra", duration)

@cassandra_router.get("/health")
def cassandra_health():
    """Simple health check for Cassandra connectivity"""
    start = time.time()
    try:
        cluster_info = get_cluster_info()
        return {"status": "ok", "cluster": cluster_info["local"]["data_center"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        duration = time.time() - start
        increment_request_count("cassandra", duration)

# ---------------------------
# CRUD Operations
# ---------------------------
@cassandra_router.post("/insert", response_model=InsertResponse)
def insert_document(
    table: str = Query(..., description="Cassandra table name"),
    document: CassandraDocument = Body(
        ..., 
        description="Document (row) to insert",
        example={
            "id": "2e762622-80e5-4c4f-8bba-7e4bb42f1577",
            "name": "Device A",
            "status": "ACTIVE",
            "type": "sensor"
        }
    )
):
    """Insert a row into a Cassandra table"""
    start = time.time()
    try:
        # Convert to dict and remove None values
        doc_dict = {
            k: v for k, v in document.model_dump(exclude_unset=True).items() 
            if v is not None
        }
        result = get_client().insert_document(table, doc_dict)
        return {"inserted": True, "data": result}
    except InvalidRequest as e:
        raise HTTPException(status_code=400, detail=f"Invalid request: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        duration = time.time() - start
        increment_request_count("cassandra", duration)

@cassandra_router.post("/find")
def find_documents(
    table: str = Query(..., description="Cassandra table name"),
    body: CassandraFindBody = Body(default=CassandraFindBody(), description="Optional filters")
):
    """Find rows in a Cassandra table"""
    start = time.time()
    try:
        results = get_client().find_documents(table, body.filters)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        duration = time.time() - start
        increment_request_count("cassandra", duration)

@cassandra_router.put("/update", response_model=UpdateResponse)
async def update_document(
    table: str = Query(..., description="Cassandra table name"),
    request: UpdateRequest = Body(
        ...,
        example={
            "filters": {"id": "2e762622-80e5-4c4f-8bba-7e4bb42f1577"},
            "updates": {"name": "Device B", "status": "ACTIVE"}
        }
    )
):
    """Update a document in Cassandra table"""
    start = time.time()
    try:
        result = get_client().update_document(table, request.filters, request.updates)
        return UpdateResponse(**result)
    except InvalidRequest as e:
        raise HTTPException(status_code=400, detail=f"Invalid request: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        duration = time.time() - start
        increment_request_count("cassandra", duration)

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
    start = time.time()
    try:
        result = get_client().delete_document(table, body.filter)
        return {"deleted": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        duration = time.time() - start
        increment_request_count("cassandra", duration)
