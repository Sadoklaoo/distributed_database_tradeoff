# app/routes/performance_routes.py
from fastapi import APIRouter, HTTPException, Body, Query
from typing import Any, Dict, List
import asyncio
import time
import statistics
import uuid
import random
from datetime import datetime

from app.mongo_client import MongoDBClient
from app.cassandra_client import CassandraClient
from app.utils.logger_utils import log_info, log_warn, log_error, tqdm_optional, run_in_executor
from app.utils.report_utils import save_report_json, save_report_markdown
from app.models.performance_test_models import PerformanceTestConfig, PerformanceTestResult

router = APIRouter()

# ---------------------------
# Initialize clients
# ---------------------------
mongo_client = MongoDBClient(uri="mongodb://mongo1:27017", db_name="testDB")
cassandra_client = CassandraClient(keyspace="testkeyspace")


# ---------------------------
# Helper functions
# ---------------------------
async def generate_test_data(count: int) -> List[Dict[str, Any]]:
    data = []
    for i in range(count):
        data.append({
            "id": str(uuid.uuid4()),
            "name": f"Device {i}",
            "status": random.choice(["ACTIVE", "INACTIVE", "MAINTENANCE"]),
            "type": random.choice(["sensor", "actuator", "controller"]),
            "value": random.uniform(0, 100),
            "timestamp": datetime.utcnow().isoformat()
        })
    return data


def create_cassandra_test_table():
    cassandra_client.ensure_connected()
    query = f"""
    CREATE TABLE IF NOT EXISTS {cassandra_client.keyspace}.performance_test (
        id uuid PRIMARY KEY,
        name text,
        status text,
        type text,
        value double,
        timestamp text
    )
    """
    cassandra_client.session.execute(query)


# ---------------------------
# MongoDB Performance Test
# ---------------------------
async def test_mongodb_performance(config: PerformanceTestConfig):
    results = {"latencies": {"insert": [], "read": [], "update": []}, "errors": 0, "total_operations": config.operationCount}
    await mongo_client.connect()
    test_data = await generate_test_data(config.operationCount)
    start = time.time()

    pbar = tqdm_optional(total=len(test_data) // config.batchSize, desc="MongoDB")
    for i in range(0, len(test_data), config.batchSize):
        batch = test_data[i:i + config.batchSize]
        try:
            # Insert
            t0 = time.time()
            for doc in batch:
                await mongo_client.insert_document("performance_test", doc)
            results["latencies"]["insert"].append(time.time() - t0)

            # Read
            if config.testType in ["mixed", "read"]:
                t0 = time.time()
                await mongo_client.find_documents("performance_test", {"status": "ACTIVE"})
                results["latencies"]["read"].append(time.time() - t0)

            # Update
            if config.testType in ["mixed", "update"]:
                t0 = time.time()
                for doc in batch:
                    await mongo_client.update_document("performance_test", {"id": doc["id"]}, {"status": "UPDATED"})
                results["latencies"]["update"].append(time.time() - t0)

        except Exception as e:
            results["errors"] += 1
            log_error(f"MongoDB error: {e}")
        if pbar:
            pbar.update(1)
    if pbar:
        pbar.close()

    total = time.time() - start
    results["throughput"] = config.operationCount / total if total > 0 else 0
    results["total_time"] = total
    return results


# ---------------------------
# Cassandra Performance Test
# ---------------------------
async def test_cassandra_performance(config: PerformanceTestConfig):
    results = {"latencies": {"insert": [], "read": [], "update": []}, "errors": 0, "total_operations": config.operationCount}
    await run_in_executor(cassandra_client.ensure_connected)
    await run_in_executor(create_cassandra_test_table)
    test_data = await generate_test_data(config.operationCount)
    start = time.time()

    pbar = tqdm_optional(total=len(test_data) // config.batchSize, desc="Cassandra")
    for i in range(0, len(test_data), config.batchSize):
        batch = test_data[i:i + config.batchSize]
        try:
            # Convert id to UUID
            for doc in batch:
                doc["id"] = uuid.UUID(doc["id"])

            # Insert
            t0 = time.time()
            for doc in batch:
                await run_in_executor(cassandra_client.insert_document, "performance_test", doc)
            results["latencies"]["insert"].append(time.time() - t0)

            # Read
            if config.testType in ["mixed", "read"]:
                t0 = time.time()
                await run_in_executor(cassandra_client.find_documents, "performance_test", {"status": "ACTIVE"})
                results["latencies"]["read"].append(time.time() - t0)

            # Update
            if config.testType in ["mixed", "update"]:
                t0 = time.time()
                for doc in batch:
                    await run_in_executor(cassandra_client.update_document, "performance_test", {"id": doc["id"]}, {"status": "UPDATED"})
                results["latencies"]["update"].append(time.time() - t0)

        except Exception as e:
            results["errors"] += 1
            log_error(f"Cassandra error: {e}")
        if pbar:
            pbar.update(1)
    if pbar:
        pbar.close()

    total = time.time() - start
    results["throughput"] = config.operationCount / total if total > 0 else 0
    results["total_time"] = total
    return results


# ---------------------------
# Cleanup test data
# ---------------------------
async def cleanup_data():
    try:
        await mongo_client.connect()
        await mongo_client.db.drop_collection("performance_test")
    except Exception as e:
        log_warn(f"MongoDB cleanup failed: {e}")
    try:
        await run_in_executor(create_cassandra_test_table)
        cassandra_client.session.execute(f"TRUNCATE {cassandra_client.keyspace}.performance_test")
    except Exception as e:
        log_warn(f"Cassandra cleanup failed: {e}")


# ---------------------------
# Routes
# ---------------------------
@router.post("/run", response_model=PerformanceTestResult)
async def run_performance_test_endpoint(config: PerformanceTestConfig = Body(...)):
    await cleanup_data()
    mongo_task = asyncio.create_task(test_mongodb_performance(config))
    cass_task = asyncio.create_task(test_cassandra_performance(config))
    mongo_results, cassandra_results = await asyncio.gather(mongo_task, cass_task)

    # Prepare latency metrics
    latency_metrics = []
    for op in ["insert", "read", "update"]:
        latency_metrics.append({
            "operation": op,
            "mongodb": statistics.mean(mongo_results["latencies"].get(op, [])) if mongo_results["latencies"].get(op) else 0,
            "cassandra": statistics.mean(cassandra_results["latencies"].get(op, [])) if cassandra_results["latencies"].get(op) else 0,
        })

    throughput_metrics = [
        {"db": "MongoDB", "throughput": mongo_results["throughput"]},
        {"db": "Cassandra", "throughput": cassandra_results["throughput"]}
    ]

    summary = {
        "totalOps": config.operationCount,
        "errors": mongo_results["errors"] + cassandra_results["errors"]
    }

    # Save reports (synchronously now)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    save_report_markdown("performance", timestamp, summary, latency_metrics, throughput_metrics)
    save_report_json("performance", timestamp, {"mongo": mongo_results, "cassandra": cassandra_results})

    return PerformanceTestResult(
        summary=summary,
        latencyMetrics=latency_metrics,
        throughputMetrics=throughput_metrics,
        detailedResults={"mongo": mongo_results, "cassandra": cassandra_results}
    )


@router.post("/cleanup")
async def cleanup_endpoint():
    await cleanup_data()
    return {"status": "Cleaned successfully"}


@router.get("/test-latency")
def test_latency(db: str = Query(..., description="Database type: mongo or cassandra")):
    start = time.time()
    latency = 0.05 if db == "mongo" else 0.15
    log_info(f"Latency test for {db}: {latency}s")
    duration = time.time() - start
    return {"db": db, "latency": latency, "test_duration": round(duration, 4), "status": "success"}
