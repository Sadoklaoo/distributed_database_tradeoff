import asyncio
import time
import statistics
import uuid
import json
from typing import Dict, List, Any
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field
import random
import string
from cassandra import InvalidRequest

from ..mongo_client import MongoDBClient
from ..cassandra_client import CassandraClient
import os

router = APIRouter()

# Initialize clients
mongo_uri = os.getenv("MONGO_URI", "mongodb://mongo1:27017")
mongo_db = os.getenv("MONGO_DB", "testDB")
cassandra_keyspace = os.getenv("CASSANDRA_KEYSPACE", "testkeyspace")

mongo_client = MongoDBClient(uri=mongo_uri, db_name=mongo_db)
cassandra_client = CassandraClient(keyspace=cassandra_keyspace)


class PerformanceTestConfig(BaseModel):
    operationCount: int = Field(
        default=1000,
        gt=0,
        le=10000,
        description="Number of operations to perform"
    )
    batchSize: int = Field(
        default=100,
        gt=0,
        le=1000,
        description="Batch size for operations"
    )
    consistencyLevel: str = Field(
        default="eventual",
        pattern="^(eventual|strong)$",
        description="Consistency level for operations"
    )
    testType: str = Field(
        default="mixed",
        pattern="^(mixed|read|write|update)$",
        description="Type of operations to test"
    )


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
            "id": str(uuid.uuid4()),
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
    """Test MongoDB performance with real measurements"""
    results = {
        "latencies": [],
        "throughput": [],
        "errors": 0,
        "total_operations": config.operationCount,
        "total_time": 0
    }

    try:
        await mongo_client.connect()
        test_data = await generate_test_data(config.operationCount)
        start_time = time.time()

        # Batch operations
        for i in range(0, len(test_data), config.batchSize):
            batch = test_data[i:i + config.batchSize]

            # Insert
            insert_start = time.time()
            for doc in batch:
                await mongo_client.insert_document("performance_test", doc)
            insert_time = time.time() - insert_start
            results["latencies"].append({
                "operation": "insert",
                "latency": insert_time,
                "batch_size": len(batch),
                "timestamp": time.time()
            })

            # Read
            if config.testType in ["mixed", "read"]:
                read_start = time.time()
                await mongo_client.find_documents("performance_test", {"status": "ACTIVE"})
                read_time = time.time() - read_start
                results["latencies"].append({
                    "operation": "read",
                    "latency": read_time,
                    "batch_size": len(batch),
                    "timestamp": time.time()
                })

            # Update
            if config.testType in ["mixed", "update"]:
                update_start = time.time()
                for doc in batch:
                    await mongo_client.update_document(
                        "performance_test",
                        {"id": doc["id"]},
                        {"status": "UPDATED"}
                    )
                update_time = time.time() - update_start
                results["latencies"].append({
                    "operation": "update",
                    "latency": update_time,
                    "batch_size": len(batch),
                    "timestamp": time.time()
                })

        results["total_time"] = time.time() - start_time
        results["throughput"] = (config.operationCount / results["total_time"]) if results["total_time"] > 0 else 0

    except Exception as e:
        results["errors"] += 1
        print(f"MongoDB test error: {str(e)}")

    return results


def create_cassandra_test_table():
    """Create the performance test table in Cassandra with a stable schema.

    Store metadata as JSON text to avoid complex map/list type conversions.
    """
    ks = cassandra_client.keyspace or cassandra_keyspace
    query = f"""
    CREATE TABLE IF NOT EXISTS {ks}.performance_test (
        id uuid PRIMARY KEY,
        name text,
        status text,
        type text,
        location text,
        timestamp double,
        value double,
        metadata text
    )
    """
    cassandra_client.ensure_connected()
    cassandra_client.session.execute(query)


async def test_cassandra_performance(config: PerformanceTestConfig) -> Dict[str, Any]:
    """Test Cassandra performance with real measurements"""
    results = {
        "latencies": [],
        "throughput": [],
        "errors": 0,
        "total_operations": config.operationCount,
        "total_time": 0
    }

    try:
        test_data = await generate_test_data(config.operationCount)
        cassandra_client.ensure_connected()
        # Create table with proper schema
        create_cassandra_test_table()

        start_time = time.time()

        # Convert test data for Cassandra: json-serialize metadata and UUIDify id
        for doc in test_data:
            if isinstance(doc.get("metadata"), dict):
                doc["metadata"] = json.dumps(doc["metadata"], default=str)
            doc["id"] = uuid.UUID(doc["id"])

        # Ensure test table exists (client may manage schema tracking)
        try:
            cassandra_client._ensure_table_exists("performance_test")
        except Exception:
            # _ensure_table_exists may not be present or may fail; proceed assuming table exists
            pass

        # Batch operations
        for i in range(0, len(test_data), config.batchSize):
            batch = test_data[i:i + config.batchSize]

            # Insert
            insert_start = time.time()
            for doc in batch:
                # client.insert_document is expected to handle writing the provided dict
                cassandra_client.insert_document("performance_test", doc)
            insert_time = time.time() - insert_start
            results["latencies"].append({
                "operation": "insert",
                "latency": insert_time,
                "batch_size": len(batch),
                "timestamp": time.time()
            })

            # Read
            if config.testType in ["mixed", "read"]:
                read_start = time.time()
                cassandra_client.find_documents("performance_test", {"status": "ACTIVE"})
                read_time = time.time() - read_start
                results["latencies"].append({
                    "operation": "read",
                    "latency": read_time,
                    "batch_size": len(batch),
                    "timestamp": time.time()
                })

            # Update
            if config.testType in ["mixed", "update"]:
                update_start = time.time()
                for doc in batch:
                    cassandra_client.update_document(
                        "performance_test",
                        {"id": doc["id"]},
                        {"status": "UPDATED"}
                    )
                update_time = time.time() - update_start
                results["latencies"].append({
                    "operation": "update",
                    "latency": update_time,
                    "batch_size": len(batch),
                    "timestamp": time.time()
                })

        results["total_time"] = time.time() - start_time
        results["throughput"] = (config.operationCount / results["total_time"]) if results["total_time"] > 0 else 0

    except Exception as e:
        results["errors"] += 1
        print(f"Cassandra test error: {str(e)}")

    return results


async def cleanup_test_data():
    """Clean up test collections after performance tests"""
    try:
        # Clean MongoDB
        await mongo_client.connect()
        try:
            await mongo_client.db.drop_collection("performance_test")
        except Exception as e:
            print(f"MongoDB cleanup warning: {e}")

        # Clean Cassandra
        cassandra_client.ensure_connected()
        try:
            # Ensure table exists and then try to truncate it. Ignore "does not exist" errors.
            create_cassandra_test_table()
            try:
                ks = cassandra_client.keyspace or cassandra_keyspace
                cassandra_client.session.execute(f"TRUNCATE {ks}.performance_test")
            except InvalidRequest as ir:
                if "does not exist" in str(ir).lower():
                    print("Cassandra cleanup: table does not exist yet")
                else:
                    raise
        except Exception as e:
            print(f"Cassandra cleanup warning: {e}")

        return {"status": "cleaned"}
    except Exception as e:
        print(f"Cleanup error: {e}")
        raise HTTPException(status_code=500, detail=f"Cleanup failed: {str(e)}")


@router.post("/run", response_model=PerformanceTestResult)
async def run_performance_test(config: PerformanceTestConfig = Body(...)):
    """Run comprehensive performance test comparing MongoDB and Cassandra"""
    try:
        # Ensure resources exist before running
        create_cassandra_test_table()
        await mongo_client.connect()

        # Cleanup before test if possible
        await cleanup_test_data()

        # Run tests in parallel
        mongo_task = asyncio.create_task(test_mongodb_performance(config))
        cassandra_task = asyncio.create_task(test_cassandra_performance(config))

        mongo_results, cassandra_results = await asyncio.gather(
            mongo_task,
            cassandra_task
        )

        # Process results
        mongo_latencies = [r["latency"] for r in mongo_results["latencies"]]
        cassandra_latencies = [r["latency"] for r in cassandra_results["latencies"]]

        # Create latency metrics
        operations = ["insert", "read", "update"]
        latency_metrics = []
        for op in operations:
            mongo_op_latencies = [
                r["latency"]
                for r in mongo_results["latencies"]
                if r["operation"] == op
            ]
            cassandra_op_latencies = [
                r["latency"]
                for r in cassandra_results["latencies"]
                if r["operation"] == op
            ]

            if mongo_op_latencies or cassandra_op_latencies:
                latency_metrics.append({
                    "operation": op,
                    "mongodb": statistics.mean(mongo_op_latencies) if mongo_op_latencies else 0,
                    "cassandra": statistics.mean(cassandra_op_latencies) if cassandra_op_latencies else 0
                })

        # Create throughput metrics
        throughput_metrics = []
        max_time = max(mongo_results.get("total_time", 0), cassandra_results.get("total_time", 0))
        time_points = list(range(0, int(max_time) + 5, 5)) if max_time > 0 else [0]
        for t in time_points:
            throughput_metrics.append({
                "time": f"{t}s",
                "mongodb": mongo_results.get("throughput", 0) if t <= mongo_results.get("total_time", 0) else 0,
                "cassandra": cassandra_results.get("throughput", 0) if t <= cassandra_results.get("total_time", 0) else 0
            })

        # Calculate summary
        summary = {
            "totalOperations": config.operationCount,
            "avgLatencyMongo": statistics.mean(mongo_latencies) if mongo_latencies else 0,
            "avgLatencyCassandra": statistics.mean(cassandra_latencies) if cassandra_latencies else 0,
            "throughputMongo": mongo_results.get("throughput", 0),
            "throughputCassandra": cassandra_results.get("throughput", 0),
            "throughputDiff": (
                (cassandra_results.get("throughput", 0) - mongo_results.get("throughput", 0))
                / mongo_results.get("throughput", 1) * 100
            ) if mongo_results.get("throughput", 0) > 0 else 0,
            "errorRateMongo": (mongo_results.get("errors", 0) / config.operationCount * 100)
                if config.operationCount > 0 else 0,
            "errorRateCassandra": (cassandra_results.get("errors", 0) / config.operationCount * 100)
                if config.operationCount > 0 else 0
        }

        # Clean up after test
        await cleanup_test_data()

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


@router.post("/cleanup")
async def cleanup():
    """Manual cleanup endpoint for test data"""
    return await cleanup_test_data()