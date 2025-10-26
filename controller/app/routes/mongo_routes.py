import time
from fastapi import APIRouter, HTTPException, Body, Query
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
from app.mongo_client import MongoDBClient
from app.models.mongo_models import DeleteBody, DeleteResponse, FindBody, InsertResponse, UpdateBody, UpdateResponse
from app.utils.bson_utils import bson_to_json_compatible
import os

from app.utils.request_stats import increment_request_count

router = APIRouter()
mongo_uri = os.getenv("MONGO_URI", "mongodb://mongo1:27017")
db_name = os.getenv("MONGO_DB", "testDB")
client = MongoDBClient(uri=mongo_uri, db_name=db_name)



# ---------------------------
# Health / Status
# ---------------------------
@router.get("/ping")
async def ping_mongo():
    """Ping MongoDB to verify connection"""
    start = time.time()
    try:
        
        result = await client.ping()
        
        return bson_to_json_compatible(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        duration = time.time() - start
        increment_request_count("mongo", duration)

@router.get("/status")
async def status_mongo():
    """Get MongoDB replica set status"""
    start = time.time()
    try:
        result = await client.replset_status()
        
        return bson_to_json_compatible(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        duration = time.time() - start
        increment_request_count("mongo", duration)

# ---------------------------
# CRUD Endpoints
# ---------------------------
@router.post("/insert", response_model=InsertResponse)
async def insert_document(
    collection: str = Query(..., description="MongoDB collection name"),
    document: Dict[str, Any] = Body(..., description="Document to insert", example={"name": "Device A", "status": "active"})
):
    """Insert a document into a MongoDB collection"""
    start = time.time()
    try:
        inserted_id = await client.insert_document(collection, document)
        return {"inserted_id": str(inserted_id)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        duration = time.time() - start
        increment_request_count("mongo", duration)

@router.post("/find")
async def find_documents(
    collection: str = Query(..., description="MongoDB collection name"),
    body: FindBody = Body(..., description="Filter and limit options")
):
    """Find documents in a MongoDB collection"""
    start = time.time()
    try:
        # Only pass `filter` (no projection)
        docs = await client.find_documents(collection, body.filter)

        return bson_to_json_compatible(docs)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        duration = time.time() - start
        increment_request_count("mongo", duration)

@router.put("/update", response_model=UpdateResponse)
async def update_document(
    collection: str = Query(..., description="MongoDB collection name"),
    body: UpdateBody = Body(..., description="Filter and update instructions")
):
    """
    Update documents in a MongoDB collection.

    Example body:
    {
      "filter": {"name": "Device A"},
      "update": {"status": "inactive"}
    }
    """
    start = time.time()
    try:
        result = await client.update_document(collection, body.filter, body.update)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        duration = time.time() - start
        increment_request_count("mongo", duration)

@router.delete("/delete", response_model=DeleteResponse)
async def delete_document(
    collection: str = Query(..., description="MongoDB collection name"),
    body: DeleteBody = Body(..., description="Filter criteria for deletion")
):
    """
    Delete documents in a MongoDB collection.

    Example body:
    {
      "filter": {"name": "Device A"}
    }
    """
    start = time.time()
    try:
        result = await client.delete_document(collection, body.filter)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        duration = time.time() - start
        increment_request_count("mongo", duration)
