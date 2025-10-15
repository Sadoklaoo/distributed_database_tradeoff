import asyncio
import time
import statistics
from typing import Dict, List, Any
from fastapi import APIRouter, HTTPException, Query, Body
from pydantic import BaseModel
import random
import string

router = APIRouter()

class PerformanceTestConfig(BaseModel):
    operationCount: int = 1000
    batchSize: int = 100
    consistencyLevel: str = "eventual"
    testType: str = "mixed"

class PerformanceTestResult(BaseModel):
    summary: Dict[str, Any]
    latencyMetrics: List[Dict[str, Any]]
    throughputMetrics: List[Dict[str, Any]]
    detailedResults: Dict[str, Any]

async def generate_test_data(count: int) -> List[Dict[str, Any]]:
    """Generate test data for performance testing"""
    data = []
    for i in range(count):
        data.append({
            "id": f"test_{i}",
            "name": f"Device {i}",
            "status": random.choice(["ACTIVE", "INACTIVE", "MAINTENANCE"]),
            "type": random.choice(["sensor", "actuator", "controller"]),
            "location": f"Building {random.randint(1, 10)}",
            "timestamp": time.time(),
            "value": random.uniform(0, 100),
            "metadata": {
                "version": random.randint(1, 5),
                "tags": [random.choice(string.ascii_letters) for _ in range(3)]
            }
        })
    return data

async def test_mongodb_performance(config: PerformanceTestConfig) -> Dict[str, Any]:
    """Test MongoDB performance"""
    # For now, return mock data since we need proper client initialization
    results = {
        "latencies": [
            {"operation": "insert", "latency": 2.5, "batch_size": config.batchSize},
            {"operation": "read", "latency": 1.8, "batch_size": config.batchSize},
            {"operation": "update", "latency": 3.2, "batch_size": config.batchSize}
        ],
        "throughput": [],
        "errors": 0,
        "total_operations": config.operationCount,
        "total_time": config.operationCount * 0.002  # Mock timing
    }
    results["throughput"] = results["total_operations"] / results["total_time"] if results["total_time"] > 0 else 0
    return results

async def test_cassandra_performance(config: PerformanceTestConfig) -> Dict[str, Any]:
    """Test Cassandra performance"""
    # For now, return mock data since we need proper client initialization
    results = {
        "latencies": [
            {"operation": "insert", "latency": 1.9, "batch_size": config.batchSize},
            {"operation": "read", "latency": 1.2, "batch_size": config.batchSize},
            {"operation": "update", "latency": 2.1, "batch_size": config.batchSize}
        ],
        "throughput": [],
        "errors": 0,
        "total_operations": config.operationCount,
        "total_time": config.operationCount * 0.0015  # Mock timing (Cassandra faster)
    }
    results["throughput"] = results["total_operations"] / results["total_time"] if results["total_time"] > 0 else 0
    return results

@router.post("/run", response_model=PerformanceTestResult)
async def run_performance_test(config: PerformanceTestConfig = Body(...)):
    """Run comprehensive performance test comparing MongoDB and Cassandra"""
    try:
        # Run tests in parallel
        mongo_task = asyncio.create_task(test_mongodb_performance(config))
        cassandra_task = asyncio.create_task(test_cassandra_performance(config))
        
        mongo_results, cassandra_results = await asyncio.gather(mongo_task, cassandra_task)
        
        # Process results
        mongo_latencies = [r["latency"] for r in mongo_results["latencies"]]
        cassandra_latencies = [r["latency"] for r in cassandra_results["latencies"]]
        
        # Create latency comparison data
        operations = ["insert", "read", "update"]
        latency_metrics = []
        for op in operations:
            mongo_op_latencies = [r["latency"] for r in mongo_results["latencies"] if r["operation"] == op]
            cassandra_op_latencies = [r["latency"] for r in cassandra_results["latencies"] if r["operation"] == op]
            
            latency_metrics.append({
                "operation": op,
                "mongodb": statistics.mean(mongo_op_latencies) if mongo_op_latencies else 0,
                "cassandra": statistics.mean(cassandra_op_latencies) if cassandra_op_latencies else 0
            })
        
        # Create throughput timeline data
        throughput_metrics = []
        time_points = list(range(0, int(max(mongo_results["total_time"], cassandra_results["total_time"])), 5))
        for t in time_points:
            throughput_metrics.append({
                "time": f"{t}s",
                "mongodb": mongo_results["throughput"] if t <= mongo_results["total_time"] else 0,
                "cassandra": cassandra_results["throughput"] if t <= cassandra_results["total_time"] else 0
            })
        
        # Calculate summary metrics
        summary = {
            "totalOperations": config.operationCount,
            "avgLatencyMongo": statistics.mean(mongo_latencies) if mongo_latencies else 0,
            "avgLatencyCassandra": statistics.mean(cassandra_latencies) if cassandra_latencies else 0,
            "throughputMongo": mongo_results["throughput"],
            "throughputCassandra": cassandra_results["throughput"],
            "throughputDiff": ((cassandra_results["throughput"] - mongo_results["throughput"]) / mongo_results["throughput"] * 100) if mongo_results["throughput"] > 0 else 0,
            "errorRateMongo": (mongo_results["errors"] / config.operationCount * 100) if config.operationCount > 0 else 0,
            "errorRateCassandra": (cassandra_results["errors"] / config.operationCount * 100) if config.operationCount > 0 else 0
        }
        
        return PerformanceTestResult(
            summary=summary,
            latencyMetrics=latency_metrics,
            throughputMetrics=throughput_metrics,
            detailedResults={
                "mongodb": mongo_results,
                "cassandra": cassandra_results
            }
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Performance test failed: {str(e)}")

@router.get("/metrics")
async def get_performance_metrics():
    """Get current performance metrics"""
    try:
        # This would typically connect to monitoring systems
        return {
            "mongodb": {
                "activeConnections": 15,
                "queriesPerSecond": 120,
                "avgResponseTime": 2.5,
                "memoryUsage": "45%"
            },
            "cassandra": {
                "activeConnections": 8,
                "queriesPerSecond": 200,
                "avgResponseTime": 1.8,
                "memoryUsage": "38%"
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
