# dashboard.py
from fastapi import APIRouter
from typing import Any, Dict
import asyncio

# Import your existing functions/clients
from .mongo_routes import status_mongo
from .cassandra_routes import cassandra_status
from .report_routes import get_live_metrics
from .failure_routes import get_container_uptimes
from app.utils.health import health_check  # Adjust import path if main.py is outside app

router = APIRouter()

@router.get("/summary")
async def dashboard_summary() -> Dict[str, Any]:
    """
    Aggregated summary:
    - Controller health (sync)
    - MongoDB cluster status (async)
    - Cassandra cluster status (sync)
    - Container uptimes (async)
    - Live metrics (sync)
    """
    try:
        # Run sync functions in thread
        controller_task = asyncio.to_thread(health_check)
        cassandra_task = asyncio.to_thread(cassandra_status)
        live_task = asyncio.to_thread(get_live_metrics)

        # Async functions wrapped in tasks
        mongo_task = asyncio.create_task(status_mongo())
        uptime_task = asyncio.create_task(get_container_uptimes(names=["mongo1","mongo2","mongo3"]))

        # Await all concurrently
        controller, mongo, cassandra, uptimes, live_metrics = await asyncio.gather(
            controller_task, mongo_task, cassandra_task, uptime_task, live_task, return_exceptions=True
        )

        # Handle exceptions gracefully
        if isinstance(controller, Exception):
            controller = {"status": "error", "message": str(controller)}
        if isinstance(mongo, Exception):
            mongo = {"status": "error", "message": str(mongo)}
        if isinstance(cassandra, Exception):
            cassandra = {"status": "error", "message": str(cassandra)}
        if isinstance(uptimes, Exception):
            uptimes = {}
        if isinstance(live_metrics, Exception):
            live_metrics = {}

        # Normalize live metrics to avoid non-serializable objects
        normalized_live = {
            "timestamp": live_metrics.get("timestamp"),
            "cpu_percent": live_metrics.get("cpu_percent", 0),
            "memory_percent": live_metrics.get("memory", {}).get("percent", 0),
            "mongo": {
                "throughput": live_metrics.get("mongo", {}).get("throughput", 0),
                "avg_latency": live_metrics.get("mongo", {}).get("avg_latency", 0)
            },
            "cassandra": {
                "throughput": live_metrics.get("cassandra", {}).get("throughput", 0),
                "avg_latency": live_metrics.get("cassandra", {}).get("avg_latency", 0)
            }
        }

        return {
            "controller": controller,
            "mongo": mongo,
            "cassandra": cassandra,
            "uptimes": uptimes,
            "liveMetrics": normalized_live
        }

    except Exception as e:
        return {"error": str(e)}
