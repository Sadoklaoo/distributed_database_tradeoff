from fastapi import APIRouter, HTTPException
from app.mongo_client import MongoDBClient
from app.utils import bson_to_json_compatible
from fastapi import APIRouter, HTTPException, Body

import os

router = APIRouter()
mongo_uri = os.getenv("MONGO_URI", "mongodb://mongo1:27017")
db_name = os.getenv("MONGO_DB", "testDB")
client = MongoDBClient(uri=mongo_uri, db_name=db_name)

# ---------------------------
# Health / Status
# ---------------------------
@router.get("/ping")
async def ping_mongo():
    try:
        result = await client.ping()
        return bson_to_json_compatible(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/status")
async def status_mongo():
    try:
        result = await client.replset_status()
        return bson_to_json_compatible(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ---------------------------
# CRUD Endpoints
# ---------------------------
@router.post("/insert")
async def insert_document(collection: str, document: dict):
    try:
        inserted_id = await client.insert_document(collection, document)
        return {"inserted_id": inserted_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/find")
async def find_documents(collection: str, body: dict = Body(...)):
    try:
        filter_query = body.get("filter", {})
        projection = body.get("projection")
        limit = body.get("limit", 0)
        docs = await client.find_documents(collection, filter_query)
        return bson_to_json_compatible(docs)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/update")
async def update_document(collection: str, body: dict = Body(...)):
    """
    Example:
    {
      "filter": {"name": "Device A"},
      "update": {"$set": {"status": "inactive"}}
    }
    """
    try:
        filter_query = body.get("filter", {})
        update_query = body.get("update", {})
        result = await client.update_document(collection, filter_query, update_query)
        return {
            "matched_count": result.matched_count,
            "modified_count": result.modified_count,
            "acknowledged": result.acknowledged
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/delete")
async def delete_document(collection: str, body: dict = Body(...)):
    """
    Example:
    {
      "filter": {"name": "Device A"}
    }
    """
    try:
        filter_query = body.get("filter", {})
        result = await client.delete_document(collection, filter_query)
        return {
            "deleted_count": result.deleted_count,
            "acknowledged": result.acknowledged
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))