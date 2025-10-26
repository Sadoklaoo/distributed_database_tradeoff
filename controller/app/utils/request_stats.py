import time
from threading import Lock

# Thread-safe in case of concurrency
_lock = Lock()

# Separate stats per DB
request_stats = {
    "mongo": {"count": 0, "total_time": 0.0},
    "cassandra": {"count": 0, "total_time": 0.0},
    "general": {"count": 0, "total_time": 0.0},
}

def increment_request_count(db: str, duration: float):
    """Increment request count and add duration for given db"""
    with _lock:
        if db not in request_stats:
            request_stats[db] = {"count": 0, "total_time": 0.0}
        request_stats[db]["count"] += 1
        request_stats[db]["total_time"] += duration


def get_request_stats(db: str):
    """Return current stats and reset counters for smoother live metrics"""
    with _lock:
        stats = request_stats.get(db, {"count": 0, "total_time": 0.0})
        count = stats["count"]
        total_time = stats["total_time"]
        avg_latency = total_time / count if count > 0 else 0.0

        # Reset after reading
        request_stats[db] = {"count": 0, "total_time": 0.0}

        return {
            "throughput": count,       # requests per interval
            "avg_latency": avg_latency # average latency in seconds
        }
