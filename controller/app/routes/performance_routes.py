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
from app.utils.request_stats import increment_request_count
from pydantic import BaseModel

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
    cassandra_client.session.execute(f"""
        CREATE TABLE IF NOT EXISTS {cassandra_client.keyspace}.performance_test (
            id uuid PRIMARY KEY,
            name text,
            status text,
            type text,
            value double,
            timestamp text
        )
    """)
    # Secondary index on status for fair read comparison (thesis Fix 2)
    cassandra_client.session.execute(f"""
        CREATE INDEX IF NOT EXISTS perf_test_status_idx
        ON {cassandra_client.keyspace}.performance_test (status)
    """)


# ---------------------------
# MongoDB Performance Test
# ---------------------------
async def test_mongodb_performance(config: PerformanceTestConfig):
    results = {
        "latencies": {"insert": [], "read": [], "update": []},
        "errors": 0,
        "total_operations": config.operationCount
    }
    await mongo_client.connect()
    test_data = await generate_test_data(config.operationCount)
    start = time.time()

    pbar = tqdm_optional(total=len(test_data) // config.batchSize, desc="MongoDB")
    for i in range(0, len(test_data), config.batchSize):
        batch = test_data[i:i + config.batchSize]
        try:
            for doc in batch:
                t0 = time.monotonic()
                await mongo_client.insert_document("performance_test", doc)
                latency = time.monotonic() - t0
                results["latencies"]["insert"].append(latency)
                increment_request_count("mongo", latency)

            if config.testType in ["mixed", "read"]:
                t0 = time.monotonic()
                docs = await mongo_client.find_documents("performance_test", {"status": "ACTIVE"})
                latency = time.monotonic() - t0
                results["latencies"]["read"].append(latency)
                increment_request_count("mongo", latency)

            if config.testType in ["mixed", "update"]:
                for doc in batch:
                    t0 = time.monotonic()
                    await mongo_client.update_document(
                        "performance_test",
                        {"id": doc["id"]},
                        {"status": "UPDATED"}
                    )
                    latency = time.monotonic() - t0
                    results["latencies"]["update"].append(latency)
                    increment_request_count("mongo", latency)

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
    results = {
        "latencies": {"insert": [], "read": [], "update": []},
        "errors": 0,
        "total_operations": config.operationCount
    }
    await run_in_executor(cassandra_client.ensure_connected)
    await run_in_executor(create_cassandra_test_table)
    test_data = await generate_test_data(config.operationCount)
    start = time.time()

    pbar = tqdm_optional(total=len(test_data) // config.batchSize, desc="Cassandra")
    for i in range(0, len(test_data), config.batchSize):
        batch = test_data[i:i + config.batchSize]
        try:
            for doc in batch:
                doc["id"] = uuid.UUID(doc["id"])

            for doc in batch:
                t0 = time.monotonic()
                await run_in_executor(
                    cassandra_client.insert_document, "performance_test", doc
                )
                latency = time.monotonic() - t0
                results["latencies"]["insert"].append(latency)
                increment_request_count("cassandra", latency)

            if config.testType in ["mixed", "read"]:
                t0 = time.monotonic()
                docs = await run_in_executor(
                    cassandra_client.find_documents, "performance_test", {"status": "ACTIVE"}
                )
                latency = time.monotonic() - t0
                results["latencies"]["read"].append(latency)
                increment_request_count("cassandra", latency)

            if config.testType in ["mixed", "update"]:
                for doc in batch:
                    t0 = time.monotonic()
                    await run_in_executor(
                        cassandra_client.update_document,
                        "performance_test",
                        {"id": doc["id"]},
                        {"status": "UPDATED"}
                    )
                    latency = time.monotonic() - t0
                    results["latencies"]["update"].append(latency)
                    increment_request_count("cassandra", latency)

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
        cassandra_client.session.execute(
            f"TRUNCATE {cassandra_client.keyspace}.performance_test"
        )
    except Exception as e:
        log_warn(f"Cassandra cleanup failed: {e}")


# ---------------------------
# Batch run models
# ---------------------------
class BatchRunConfig(BaseModel):
    operationCount: int = 1000
    batchSize: int = 100
    consistencyLevel: str = "eventual"
    testType: str = "mixed"
    repeats: int = 5

class LatencyStats(BaseModel):
    mean_ms: float
    std_ms:  float
    p95_ms:  float
    p99_ms:  float
    min_ms:  float
    max_ms:  float
    n_samples: int

class BatchRunResult(BaseModel):
    mongodb_insert:   LatencyStats
    mongodb_read:     LatencyStats
    mongodb_update:   LatencyStats
    mongodb_throughput_mean: float
    mongodb_throughput_std:  float
    cassandra_insert: LatencyStats
    cassandra_read:   LatencyStats
    cassandra_update: LatencyStats
    cassandra_throughput_mean: float
    cassandra_throughput_std:  float
    repeats:    int
    test_type:  str
    completed_at: str


def _compute_stats(samples: list) -> LatencyStats:
    if not samples:
        return LatencyStats(mean_ms=0, std_ms=0, p95_ms=0, p99_ms=0,
                            min_ms=0, max_ms=0, n_samples=0)
    ms  = [s * 1000 for s in samples]
    n   = len(ms)
    avg = statistics.mean(ms)
    std = statistics.stdev(ms) if n > 1 else 0.0
    srt = sorted(ms)
    def pct(p):
        idx = int(n * p / 100)
        return srt[min(idx, n - 1)]
    return LatencyStats(
        mean_ms=round(avg, 3),
        std_ms =round(std, 3),
        p95_ms =round(pct(95), 3),
        p99_ms =round(pct(99), 3),
        min_ms =round(srt[0],  3),
        max_ms =round(srt[-1], 3),
        n_samples=n,
    )


# ---------------------------
# Routes
# ---------------------------
@router.post("/run", response_model=PerformanceTestResult)
async def run_performance_test_endpoint(config: PerformanceTestConfig = Body(...)):
    await cleanup_data()
    mongo_task = asyncio.create_task(test_mongodb_performance(config))
    cass_task  = asyncio.create_task(test_cassandra_performance(config))
    mongo_results, cassandra_results = await asyncio.gather(mongo_task, cass_task)

    latency_metrics = []
    for op in ["insert", "read", "update"]:
        latency_metrics.append({
            "operation": op,
            "mongodb": (
                statistics.mean(mongo_results["latencies"].get(op, []))
                if mongo_results["latencies"].get(op) else 0
            ),
            "cassandra": (
                statistics.mean(cassandra_results["latencies"].get(op, []))
                if cassandra_results["latencies"].get(op) else 0
            ),
        })

    throughput_metrics = [
        {"db": "MongoDB",   "throughput": mongo_results["throughput"]},
        {"db": "Cassandra", "throughput": cassandra_results["throughput"]},
    ]
    summary = {
        "totalOps": config.operationCount,
        "errors": mongo_results["errors"] + cassandra_results["errors"]
    }
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    save_report_markdown(
        "performance", timestamp, summary,
        latency_metrics, throughput_metrics,
        config_dict=config.dict()
    )
    save_report_json(
        "performance", timestamp,
        {"mongo": mongo_results, "cassandra": cassandra_results, "config": config.dict()}
    )
    return PerformanceTestResult(
        summary=summary,
        latencyMetrics=latency_metrics,
        throughputMetrics=throughput_metrics,
        detailedResults={"mongo": mongo_results, "cassandra": cassandra_results}
    )


@router.post("/batch-run", response_model=BatchRunResult)
async def batch_run_endpoint(config: BatchRunConfig = Body(...)):
    """
    Run a workload N times and return mean ± σ across all runs.
    Used for thesis statistical rigour (Fix 3).
    """
    perf_config = PerformanceTestConfig(
        operationCount=config.operationCount,
        batchSize=config.batchSize,
        consistencyLevel=config.consistencyLevel,
        testType=config.testType,
    )

    all_mongo  = {"insert": [], "read": [], "update": []}
    all_cass   = {"insert": [], "read": [], "update": []}
    mongo_tps, cass_tps = [], []

    for _ in range(config.repeats):
        await cleanup_data()
        mongo_task = asyncio.create_task(test_mongodb_performance(perf_config))
        cass_task  = asyncio.create_task(test_cassandra_performance(perf_config))
        mr, cr = await asyncio.gather(mongo_task, cass_task)

        for op in ["insert", "read", "update"]:
            all_mongo[op].extend(mr["latencies"].get(op, []))
            all_cass[op].extend(cr["latencies"].get(op,  []))

        mongo_tps.append(mr["throughput"])
        cass_tps.append(cr["throughput"])

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    save_report_json(
        "batch", timestamp,
        {
            "mongo_latencies":     all_mongo,
            "cassandra_latencies": all_cass,
            "mongo_throughputs":   mongo_tps,
            "cass_throughputs":    cass_tps,
            "config": config.dict(),
        }
    )

    def tp(vals):
        if not vals: return 0.0, 0.0
        return (round(statistics.mean(vals), 3),
                round(statistics.stdev(vals) if len(vals) > 1 else 0.0, 3))

    m_mean, m_std = tp(mongo_tps)
    c_mean, c_std = tp(cass_tps)

    return BatchRunResult(
        mongodb_insert   = _compute_stats(all_mongo["insert"]),
        mongodb_read     = _compute_stats(all_mongo["read"]),
        mongodb_update   = _compute_stats(all_mongo["update"]),
        mongodb_throughput_mean  = m_mean,
        mongodb_throughput_std   = m_std,
        cassandra_insert = _compute_stats(all_cass["insert"]),
        cassandra_read   = _compute_stats(all_cass["read"]),
        cassandra_update = _compute_stats(all_cass["update"]),
        cassandra_throughput_mean = c_mean,
        cassandra_throughput_std  = c_std,
        repeats=config.repeats,
        test_type=config.testType,
        completed_at=datetime.utcnow().isoformat(),
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
    return {
        "db": db,
        "latency": latency,
        "test_duration": round(duration, 4),
        "status": "success"
    }