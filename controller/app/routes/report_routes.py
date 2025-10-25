# app/routes/report_routes.py
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
import os
from app.utils.report_utils import get_latest_report, save_report_json, save_report_markdown
from datetime import datetime
import psutil 
from app.utils.logger_utils import log_info
from app.routes.performance_routes import run_performance_test_endpoint

REPORT_DIR = "logs/performance_reports"
router = APIRouter()


@router.get("/")
async def list_reports():
    if not os.path.exists(REPORT_DIR):
        return []
    return sorted(os.listdir(REPORT_DIR), reverse=True)


@router.get("/{filename}")
async def get_report(filename: str):
    file_path = os.path.join(REPORT_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Report not found")
    return FileResponse(file_path)


@router.get("/generate")
async def generate_report_endpoint():
    """
    Generate a new performance report by running the performance tests.
    """
    try:
        from app.models.performance_test_models import PerformanceTestConfig
        config = PerformanceTestConfig()  # default config
        result = await run_performance_test_endpoint(config)  # call the performance test

        # Save reports (synchronously now)
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        save_report_markdown(
            prefix="performance",
            timestamp=timestamp,
            summary=result.summary,
            latency=result.latencyMetrics,
            throughput=result.throughputMetrics
        )
        save_report_json(
            prefix="performance",
            timestamp=timestamp,
            data=result.detailedResults
        )
        log_info(f"Generated new report: performance_{timestamp}.md")
        return {"message": "Report generated successfully", "timestamp": timestamp}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/latest")
def latest_report():
    """
    Fetch the most recently generated report.
    """
    try:
        latest = get_latest_report()
        if not latest:
            raise HTTPException(status_code=404, detail="No reports found.")
        return {"latest_report": latest}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 🧠 New route: Live system performance metrics
@router.get("/metrics/live")
def get_live_metrics():
    """
    Return current system performance metrics such as CPU, memory, and disk usage.
    Useful for dashboard live updates.
    """
    try:
        cpu_percent = psutil.cpu_percent(interval=0.5)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage("/")
        net_io = psutil.net_io_counters()

        metrics = {
            "timestamp": datetime.utcnow().isoformat(),
            "cpu_percent": cpu_percent,
            "memory": {
                "total": memory.total,
                "used": memory.used,
                "percent": memory.percent,
            },
            "disk": {
                "total": disk.total,
                "used": disk.used,
                "percent": disk.percent,
            },
            "network": {
                "bytes_sent": net_io.bytes_sent,
                "bytes_recv": net_io.bytes_recv,
            },
        }

        return metrics
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve live metrics: {e}")
