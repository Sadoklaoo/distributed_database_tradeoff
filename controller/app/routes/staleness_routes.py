# ---------------------------------------------------------------------------
# staleness_routes.py
# ---------------------------------------------------------------------------

import asyncio
import json
import statistics
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Report storage
# ---------------------------------------------------------------------------

REPORTS_DIR = Path("/app/logs/staleness_reports")
REPORTS_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class StalenessConfig(BaseModel):
    iterations: int = 200
    write_delay_ms: float = 50.0
    consistency: str = "ONE"
    mongo_write_concern: int = 1
    mongo_read_secondary: bool = True

class StalenessStats(BaseModel):
    mean_ms: float
    median_ms: float
    p95_ms: float
    p99_ms: float
    max_ms: float
    stale_reads: int
    total_reads: int
    stale_ratio: float

class StalenessResult(BaseModel):
    cassandra: StalenessStats
    mongodb: StalenessStats
    config: StalenessConfig
    completed_at: str

# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(tags=["staleness"])

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _aggregate(samples: list[float], total: int) -> StalenessStats:
    if not samples:
        return StalenessStats(
            mean_ms=0, median_ms=0, p95_ms=0, p99_ms=0, max_ms=0,
            stale_reads=0, total_reads=total, stale_ratio=0.0
        )
    stale = [s for s in samples if s > 0]
    sorted_s = sorted(samples)

    def percentile(data, pct):
        idx = int(len(data) * pct / 100)
        return data[min(idx, len(data) - 1)]

    return StalenessStats(
        mean_ms=round(statistics.mean(samples), 3),
        median_ms=round(statistics.median(samples), 3),
        p95_ms=round(percentile(sorted_s, 95), 3),
        p99_ms=round(percentile(sorted_s, 99), 3),
        max_ms=round(max(samples), 3),
        stale_reads=len(stale),
        total_reads=total,
        stale_ratio=round(len(stale) / total, 4) if total else 0.0
    )


def _save_report(result: StalenessResult) -> str:
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"staleness_{ts}.json"
    path = REPORTS_DIR / filename
    with open(path, "w") as f:
        json.dump(result.model_dump(), f, indent=2)
    return filename

# ---------------------------------------------------------------------------
# Cassandra measurement
# ---------------------------------------------------------------------------

async def _measure_cassandra(config: StalenessConfig) -> StalenessStats:
    from cassandra.cluster import Cluster
    from cassandra.policies import RoundRobinPolicy
    from cassandra.query import SimpleStatement, ConsistencyLevel as CL

    cl_map = {"ONE": CL.ONE, "QUORUM": CL.QUORUM, "ALL": CL.ALL}
    write_cl = cl_map.get(config.consistency.upper(), CL.ONE)
    read_cl  = cl_map.get(config.consistency.upper(), CL.ONE)

    def _run():
        cluster = Cluster(
            ["cassandra1", "cassandra2", "cassandra3"],
            load_balancing_policy=RoundRobinPolicy(),
            protocol_version=4,
            connect_timeout=30,
            control_connection_timeout=30,
        )
        session = cluster.connect()
        session.default_timeout = 30.0

        keyspace = "testkeyspace"
        table    = "staleness_test"

        session.execute(f"""
            CREATE KEYSPACE IF NOT EXISTS {keyspace}
            WITH replication = {{'class': 'SimpleStrategy', 'replication_factor': 3}}
        """, timeout=30.0)
        session.set_keyspace(keyspace)
        session.execute(f"""
            CREATE TABLE IF NOT EXISTS {table} (
                id            uuid PRIMARY KEY,
                written_at_us bigint,
                value         text
            )
        """, timeout=30.0)

        record_id = uuid.uuid4()
        now_us = int(time.time() * 1_000_000)
        session.execute(
            SimpleStatement(
                f"INSERT INTO {table} (id, written_at_us, value) VALUES (%s, %s, %s)",
                consistency_level=write_cl,
            ),
            (record_id, now_us, "seed"),
            timeout=30.0,
        )

        samples = []
        for _ in range(config.iterations):
            write_us = int(time.time() * 1_000_000)
            session.execute(
                SimpleStatement(
                    f"UPDATE {table} SET written_at_us = %s, value = %s WHERE id = %s",
                    consistency_level=write_cl,
                ),
                (write_us, f"v{write_us}", record_id),
                timeout=30.0,
            )
            read_time_us = int(time.time() * 1_000_000)
            row = session.execute(
                SimpleStatement(
                    f"SELECT written_at_us FROM {table} WHERE id = %s",
                    consistency_level=read_cl,
                ),
                (record_id,),
                timeout=30.0,
            ).one()
            if row:
                staleness_ms = max(0.0, (read_time_us - row.written_at_us) / 1000.0)
                samples.append(staleness_ms)
            else:
                samples.append(0.0)
            time.sleep(config.write_delay_ms / 1000.0)

        session.execute(f"DROP TABLE IF EXISTS {keyspace}.{table}", timeout=30.0)
        cluster.shutdown()
        return samples

    loop = asyncio.get_event_loop()
    samples = await loop.run_in_executor(None, _run)
    return _aggregate(samples, config.iterations)

# ---------------------------------------------------------------------------
# MongoDB measurement
# ---------------------------------------------------------------------------

async def _measure_mongodb(config: StalenessConfig) -> StalenessStats:
    from motor.motor_asyncio import AsyncIOMotorClient
    from pymongo import ReadPreference

    read_pref = (
        ReadPreference.SECONDARY if config.mongo_read_secondary
        else ReadPreference.PRIMARY
    )
    uri = "mongodb://mongo1:27017,mongo2:27017,mongo3:27017/stalenessDB?replicaSet=rs0"
    client   = AsyncIOMotorClient(uri, w=config.mongo_write_concern)
    db       = client.get_database("stalenessDB", read_preference=ReadPreference.PRIMARY)
    db_read  = client.get_database("stalenessDB", read_preference=read_pref)
    col      = db["staleness_test"]
    col_read = db_read["staleness_test"]

    record_id = str(uuid.uuid4())
    now_us = int(time.time() * 1_000_000)
    await col.insert_one({"_id": record_id, "written_at_us": now_us, "value": "seed"})

    samples = []
    for _ in range(config.iterations):
        write_us = int(time.time() * 1_000_000)
        await col.update_one(
            {"_id": record_id},
            {"$set": {"written_at_us": write_us, "value": f"v{write_us}"}},
        )
        read_time_us = int(time.time() * 1_000_000)
        doc = await col_read.find_one({"_id": record_id})
        if doc:
            staleness_ms = max(0.0, (read_time_us - doc["written_at_us"]) / 1000.0)
            samples.append(staleness_ms)
        else:
            samples.append(0.0)
        await asyncio.sleep(config.write_delay_ms / 1000.0)

    await col.drop()
    client.close()
    return _aggregate(samples, config.iterations)

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/run", response_model=StalenessResult)
async def run_staleness_measurement(config: StalenessConfig = StalenessConfig()):
    """Run staleness measurement for both systems concurrently and save report."""
    cass_stats, mongo_stats = await asyncio.gather(
        _measure_cassandra(config),
        _measure_mongodb(config),
    )
    result = StalenessResult(
        cassandra=cass_stats,
        mongodb=mongo_stats,
        config=config,
        completed_at=datetime.now(timezone.utc).isoformat(),
    )
    _save_report(result)
    return result


@router.get("/reports")
async def list_staleness_reports():
    """Return list of all saved staleness report filenames, newest first."""
    files = sorted(
        [f.name for f in REPORTS_DIR.glob("staleness_*.json")],
        reverse=True,
    )
    return files


@router.get("/reports/{filename}")
async def get_staleness_report(filename: str):
    """Return the full JSON content of a single staleness report."""
    path = REPORTS_DIR / filename
    if not path.exists() or not path.name.startswith("staleness_"):
        raise HTTPException(status_code=404, detail="Report not found")
    with open(path) as f:
        return JSONResponse(content=json.load(f))