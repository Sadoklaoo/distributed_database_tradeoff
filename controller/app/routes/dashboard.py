# dashboard.py
from fastapi import APIRouter
from typing import Any, Dict
import asyncio

from .mongo_routes import status_mongo
from .cassandra_routes import cassandra_status
from .report_routes import get_live_metrics
from .failure_routes import simulator
from app.utils.health import health_check

router = APIRouter()

CONTAINER_NAMES = [
    "mongo1", "mongo2", "mongo3",
    "cassandra1", "cassandra2", "cassandra3",
]

@router.get("/summary")
async def dashboard_summary() -> Dict[str, Any]:
    """
    Aggregated summary:
    - Controller health
    - MongoDB cluster status
    - Cassandra cluster status
    - Container uptimes
    - Live metrics
    """
    try:
        controller_task  = asyncio.to_thread(health_check)
        cassandra_task   = asyncio.to_thread(cassandra_status)
        live_task        = asyncio.to_thread(get_live_metrics)
        uptime_task      = asyncio.to_thread(simulator.get_container_uptimes, CONTAINER_NAMES)
        mongo_task       = asyncio.create_task(status_mongo())

        controller, cassandra, live_metrics, uptimes_raw, mongo = await asyncio.gather(
            controller_task, cassandra_task, live_task, uptime_task, mongo_task,
            return_exceptions=True,
        )

        if isinstance(controller, Exception):
            controller = {"status": "error", "message": str(controller)}
        if isinstance(mongo, Exception):
            mongo = {"status": "error", "message": str(mongo)}
        if isinstance(cassandra, Exception):
            cassandra = {"status": "error", "message": str(cassandra)}
        if isinstance(live_metrics, Exception):
            live_metrics = {}
        if isinstance(uptimes_raw, Exception):
            uptimes = {}
        else:
            # get_container_uptimes returns a plain dict {name: {hours, seconds, status}}
            uptimes = uptimes_raw if isinstance(uptimes_raw, dict) else {}

        normalized_live = {
            "timestamp": live_metrics.get("timestamp"),
            "cpu_percent": live_metrics.get("cpu_percent", 0),
            "memory_percent": live_metrics.get("memory", {}).get("percent", 0),
            "mongo": {
                "throughput":  live_metrics.get("mongo", {}).get("throughput", 0),
                "avg_latency": live_metrics.get("mongo", {}).get("avg_latency", 0),
            },
            "cassandra": {
                "throughput":  live_metrics.get("cassandra", {}).get("throughput", 0),
                "avg_latency": live_metrics.get("cassandra", {}).get("avg_latency", 0),
            },
        }

        return {
            "controller":  controller,
            "mongo":       mongo,
            "cassandra":   cassandra,
            "uptimes":     uptimes,
            "liveMetrics": normalized_live,
        }

    except Exception as e:
        return {"error": str(e)}