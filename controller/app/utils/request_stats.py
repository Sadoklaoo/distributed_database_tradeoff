import time
from threading import Lock

request_count = 0
request_lock = Lock()
last_reset_time = time.time()

def increment_request_count():
    global request_count
    with request_lock:
        request_count += 1

def get_request_stats():
    """Return requests per second since last reset."""
    global request_count, last_reset_time
    now = time.time()
    elapsed = now - last_reset_time
    rps = request_count / elapsed if elapsed > 0 else 0
    return {"requests_per_second": round(rps, 2), "total_requests": request_count}
