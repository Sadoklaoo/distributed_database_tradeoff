import asyncio
import time
import uuid
import random
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Body
from pydantic import BaseModel

router = APIRouter()


class RecoveryBenchmarkConfig(BaseModel):
    target_node: str = "mongo1"
    system: str = "mongodb"
    probe_interval_ms: float = 200
    max_recovery_wait_s: int = 60
    pre_failure_writes: int = 20


class RecoveryTimings(BaseModel):
    time_to_first_failure_ms: Optional[float]
    time_to_container_start_ms: Optional[float]
    time_to_first_success_ms: Optional[float]
    total_unavailability_ms: Optional[float]
    election_duration_ms: Optional[float]
    pre_failure_mean_latency_ms: Optional[float]
    post_recovery_mean_latency_ms: Optional[float]
    probe_count: int
    error_count: int


class RecoveryBenchmarkResult(BaseModel):
    system: str
    target_node: str
    timings: RecoveryTimings
    probe_timeline: list
    completed_at: str
    mode: str


# ---------------------------------------------------------------------------
# MongoDB probe
# ---------------------------------------------------------------------------

async def _probe_mongo(collection_name: str = "recovery_probe") -> dict:
    try:
        from app.mongo_client import MongoDBClient
        import os

        uri = os.getenv(
            "MONGO_URI",
            "mongodb://mongo1:27017,mongo2:27017,mongo3:27017/testDB?replicaSet=rs0",
        )

        client = MongoDBClient(uri, "testDB")

        t0 = time.monotonic()
        await client.connect()

        doc_id = str(uuid.uuid4())
        await client.insert_document(collection_name, {"_id": doc_id, "ts": time.time()})

        latency_ms = (time.monotonic() - t0) * 1000
        client.close()

        return {"success": True, "latency_ms": round(latency_ms, 2), "error": None}

    except Exception as e:
        return {"success": False, "latency_ms": None, "error": str(e)[:120]}


# ---------------------------------------------------------------------------
# Cassandra probe
# ---------------------------------------------------------------------------

def _probe_cassandra_sync() -> dict:
    try:
        from cassandra.cluster import Cluster
        from cassandra.query import SimpleStatement

        cluster = Cluster(
            ["cassandra1", "cassandra2", "cassandra3"],
            protocol_version=4,
            connect_timeout=5,
        )

        session = cluster.connect("testkeyspace")

        t0 = time.monotonic()

        session.execute(
            SimpleStatement(
                "INSERT INTO testkeyspace.performance_test "
                "(id, name, status, type, value, timestamp) "
                "VALUES (%s, %s, %s, %s, %s, %s)"
            ),
            (uuid.uuid4(), "probe", "ACTIVE", "sensor", 0.0, str(time.time())),
            timeout=5.0,
        )

        latency_ms = (time.monotonic() - t0) * 1000
        cluster.shutdown()

        return {"success": True, "latency_ms": round(latency_ms, 2), "error": None}

    except Exception as e:
        return {"success": False, "latency_ms": None, "error": str(e)[:120]}


async def _probe_cassandra() -> dict:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _probe_cassandra_sync)


# ---------------------------------------------------------------------------
# Main benchmark endpoint
# ---------------------------------------------------------------------------

@router.post("/recovery-benchmark", response_model=RecoveryBenchmarkResult)
async def recovery_benchmark(config: RecoveryBenchmarkConfig = Body(...)):

    try:
        import docker as docker_lib
        docker_client = docker_lib.from_env()
        container = docker_client.containers.get(config.target_node)
        docker_available = True
    except Exception:
        docker_available = False

    probe_fn = _probe_mongo if config.system == "mongodb" else _probe_cassandra
    timeline = []
    interval_s = config.probe_interval_ms / 1000.0

    # ── 1. Warm-up ─────────────────────────────────────────
    pre_latencies = []
    for _ in range(config.pre_failure_writes):
        r = await probe_fn()
        if r["success"] and r["latency_ms"] is not None:
            pre_latencies.append(r["latency_ms"])
        await asyncio.sleep(interval_s)

    pre_mean = round(sum(pre_latencies) / len(pre_latencies), 2) if pre_latencies else None

    if not docker_available:
        return RecoveryBenchmarkResult(
            system=config.system,
            target_node=config.target_node,
            timings=RecoveryTimings(
                time_to_first_failure_ms=None,
                time_to_container_start_ms=None,
                time_to_first_success_ms=None,
                total_unavailability_ms=None,
                election_duration_ms=None,
                pre_failure_mean_latency_ms=pre_mean,
                post_recovery_mean_latency_ms=None,
                probe_count=config.pre_failure_writes,
                error_count=0,
            ),
            probe_timeline=timeline,
            completed_at=datetime.now(timezone.utc).isoformat(),
            mode="unavailable",
        )

    # ── 2. Inject failure + immediate recovery ─────────────
    t_stop = time.monotonic()
    container.stop(timeout=5)

    await asyncio.sleep(1)  # simulate real-world delay

    container.start()
    t_container_start_ms = round((time.monotonic() - t_stop) * 1000, 1)

    # ── 3. Probing loop ────────────────────────────────────
    t_first_failure_ms = None
    t_first_success_ms = None
    probe_count = 0
    error_count = 0
    post_latencies = []

    deadline = t_stop + config.max_recovery_wait_s

    while time.monotonic() < deadline:
        t_probe = time.monotonic()
        r = await probe_fn()
        elapsed_ms = round((t_probe - t_stop) * 1000, 1)

        timeline.append({
            "t_ms": elapsed_ms,
            "success": r["success"],
            "latency_ms": r["latency_ms"],
            "error": r["error"],
        })

        probe_count += 1

        if not r["success"]:
            error_count += 1
            if t_first_failure_ms is None:
                t_first_failure_ms = elapsed_ms

        else:
            # First success AFTER failure
            if t_first_failure_ms is not None and t_first_success_ms is None:
                t_first_success_ms = elapsed_ms

            # Collect post-recovery latency samples
            if t_first_success_ms is not None:
                if r["latency_ms"] is not None:
                    post_latencies.append(r["latency_ms"])
                if len(post_latencies) >= 10:
                    break

        # small jitter to avoid sync artifacts
        await asyncio.sleep(interval_s + random.uniform(0, 0.05))

    # ── 4. Metrics ─────────────────────────────────────────
    total_unavailability = None
    if t_first_failure_ms is not None and t_first_success_ms is not None:
        total_unavailability = round(t_first_success_ms - t_first_failure_ms, 1)

    post_mean = round(sum(post_latencies) / len(post_latencies), 2) if post_latencies else None

    timings = RecoveryTimings(
        time_to_first_failure_ms=t_first_failure_ms,
        time_to_container_start_ms=t_container_start_ms,
        time_to_first_success_ms=t_first_success_ms,
        total_unavailability_ms=total_unavailability,
        election_duration_ms=total_unavailability,
        pre_failure_mean_latency_ms=pre_mean,
        post_recovery_mean_latency_ms=post_mean,
        probe_count=probe_count,
        error_count=error_count,
    )

    return RecoveryBenchmarkResult(
        system=config.system,
        target_node=config.target_node,
        timings=timings,
        probe_timeline=timeline,
        completed_at=datetime.now(timezone.utc).isoformat(),
        mode="docker",
    )