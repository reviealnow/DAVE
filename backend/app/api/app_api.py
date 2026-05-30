from __future__ import annotations

from fastapi import APIRouter, Query, Request

from app.serial.serial_worker import SerialWorker
from app.parser.sysmon_parser import SysMonParser
from app.services.version_service import VersionService

router = APIRouter(prefix="/api/app", tags=["app"])


@router.get("/meta")
def app_meta(request: Request) -> dict:
    service: VersionService = request.app.state.version_service
    return service.get_metadata()


@router.get("/update-check")
def update_check(request: Request, force: bool = Query(default=False)) -> dict:
    service: VersionService = request.app.state.version_service
    return service.check_for_updates(force=force)


@router.get("/status")
def app_status(request: Request) -> dict:
    worker: SerialWorker = request.app.state.serial_worker
    parser: SysMonParser = request.app.state.parser
    serial_status = worker.status
    snapshot = parser.last_snapshot

    dut_summary: dict | None = None
    if snapshot is not None:
        cpu_cores = snapshot.get("cpu", {})
        avg_idle = (
            sum(c.get("idle", 0.0) for c in cpu_cores.values()) / len(cpu_cores)
            if cpu_cores
            else None
        )
        mem = snapshot.get("memory")
        wifi_clients = snapshot.get("wifi_clients", {})
        total_clients = sum(len(v) for v in wifi_clients.values()) if isinstance(wifi_clients, dict) else 0
        dut_summary = {
            "timestamp": snapshot.get("timestamp"),
            "cpu_avg_idle_pct": round(avg_idle, 1) if avg_idle is not None else None,
            "memory": mem,
            "wifi_client_count": total_clients,
        }

    return {
        "serial": serial_status,
        "dut": dut_summary,
    }
