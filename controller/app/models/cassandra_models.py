# ---------------------------
# Pydantic Models
# ---------------------------
from typing import Any, Dict
from pydantic import BaseModel


class CassandraDocument(BaseModel):
    """
    Flexible model for Cassandra document (row)
    """
    id: str | None = None
    name: str | None = None
    status: str | None = None
    type: str | None = None
    
    class Config:
        extra = "allow"  # Allow additional fields

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
    updated: bool
    fields_updated: int
    filter_used: Dict[str, Any]
    updates_applied: Dict[str, Any]

class UpdateRequest(BaseModel):
    filters: Dict[str, Any]
    updates: Dict[str, Any]

class DeleteResponse(BaseModel):
    deleted: int