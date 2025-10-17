# app/utils/logger_util.py
import asyncio
import concurrent.futures

# ---------------------------
# Logging helpers
# ---------------------------
def log_info(msg: str):
    print(f"✅ {msg}")

def log_warn(msg: str):
    print(f"⚠️  {msg}")

def log_error(msg: str):
    print(f"❌ {msg}")

# ---------------------------
# TQDM wrapper
# ---------------------------
def tqdm_optional(*args, **kwargs):
    """
    Returns a tqdm progress bar if tqdm is installed, else None.
    """
    try:
        from tqdm import tqdm # type: ignore
        return tqdm(*args, **kwargs)
    except ImportError:
        return None

# ---------------------------
# Async executor helper
# ---------------------------
async def run_in_executor(func, *args, **kwargs):
    """
    Run a blocking function in a ThreadPoolExecutor from async code.
    """
    loop = asyncio.get_running_loop()
    with concurrent.futures.ThreadPoolExecutor() as pool:
        return await loop.run_in_executor(pool, lambda: func(*args, **kwargs))
