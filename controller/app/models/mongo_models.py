# ---------------------------
# Pydantic Models
# ---------------------------
from typing import Any, Dict, Optional
from pydantic import BaseModel


class FindBody(BaseModel):
    filter: Optional[Dict[str, Any]] = {}
    projection: Optional[Dict[str, int]] = None
    limit: Optional[int] = 0

class UpdateBody(BaseModel):
    filter: Dict[str, Any]
    update: Dict[str, Any]

class DeleteBody(BaseModel):
    filter: Dict[str, Any]

class InsertResponse(BaseModel):
    inserted_id: str

class UpdateResponse(BaseModel):
    matched_count: int
    modified_count: int
    acknowledged: bool

class DeleteResponse(BaseModel):
    deleted_count: int
    acknowledged: bool