# ---------------------------
# Models
# ---------------------------
from typing import Any, Dict, List
from pydantic import BaseModel, Field


class PerformanceTestConfig(BaseModel):
    operationCount: int = Field(default=1000, gt=0, le=10000)
    batchSize: int = Field(default=100, gt=0, le=1000)
    consistencyLevel: str = Field(default="eventual", pattern="^(eventual|strong|session)$")
    testType: str = Field(default="mixed", pattern="^(mixed|read|write|update)$")


class PerformanceTestResult(BaseModel):
    summary: Dict[str, Any]
    latencyMetrics: List[Dict[str, Any]]
    throughputMetrics: List[Dict[str, Any]]
    detailedResults: Dict[str, Any]
