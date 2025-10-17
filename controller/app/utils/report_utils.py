# app/utils/report_utils.py
import os
import json
from datetime import datetime
from app.utils.logger_utils import log_info, tqdm_optional

REPORT_DIR = "logs/performance_reports"


def ensure_dir():
    os.makedirs(REPORT_DIR, exist_ok=True)


def save_report_json(prefix: str, timestamp: str, data: dict):
    """Save performance report as JSON"""
    ensure_dir()
    path = os.path.join(REPORT_DIR, f"{prefix}_{timestamp}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    log_info(f"JSON report saved at {path}")
    return path


def save_report_markdown(prefix: str, timestamp: str, summary: dict, latency: list, throughput: list):
    """Save performance report as Markdown"""
    ensure_dir()
    path = os.path.join(REPORT_DIR, f"{prefix}_{timestamp}.md")

    # Use tqdm for visual progress if available
    total_steps = len(summary) + len(latency) + len(throughput) + 3
    pbar = tqdm_optional(total=total_steps, desc="Writing report", unit="step")

    with open(path, "w", encoding="utf-8") as f:
        f.write(f"# Performance Report ({timestamp})\n\n")

        f.write("## Summary\n")
        for k, v in summary.items():
            f.write(f"- **{k}**: {v}\n")
            if pbar:
                pbar.update(1)

        f.write("\n## Latency\n")
        for entry in latency:
            f.write(f"- MongoDB: {entry['mongodb']:.4f}s | Cassandra: {entry['cassandra']:.4f}s\n")
            if pbar:
                pbar.update(1)

        f.write("\n## Throughput\n")
        for entry in throughput:
            db = entry.get("db", "unknown")
            f.write(f"- {db}: {entry['throughput']:.2f} ops/s\n")
            if pbar:
                pbar.update(1)

    if pbar:
        pbar.close()

    log_info(f"Markdown report saved at {path}")
    return path


def get_latest_report():
    """Return the latest report file path"""
    ensure_dir()
    files = [os.path.join(REPORT_DIR, f) for f in os.listdir(REPORT_DIR)]
    if not files:
        return None
    latest = max(files, key=os.path.getmtime)
    return latest
