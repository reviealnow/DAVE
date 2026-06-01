from __future__ import annotations

import csv
import json
import shutil
import subprocess
import time
import zipfile
from datetime import datetime
import os
from pathlib import Path
import re
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from serial.tools import list_ports

from app.config import ANALYZER_SCRIPT, EVENT_DETECTOR_SCRIPT, LOG_DIR, python_tool_argv
from app.tools import dispatch
from app.tools.context import AppContext

router = APIRouter(prefix="/api/serial", tags=["serial"])


class SerialOpenRequest(BaseModel):
    port: str = ""
    baudrate: int = 115200
    mode: Literal["serial", "replay"] = "serial"
    replay_path: str | None = None
    replay_interval_ms: int = 100


class SerialSendRequest(BaseModel):
    text: str


class DownloadWorkflowError(Exception):
    def __init__(self, message: str, status_code: int = 500) -> None:
        super().__init__(message)
        self.status_code = status_code


MIN_SNAPSHOT_MARKERS = 2
DIRECT_DOWNLOAD_MAX_LINES = 100
TOP_COMMAND_PATTERN = re.compile(r"\btop\b", re.IGNORECASE)


def create_dut_session_dir() -> Path:
    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
    except Exception as exc:
        raise DownloadWorkflowError(f"failed to create logs root directory: {exc}", status_code=500) from exc

    for _ in range(3):
        session_name = f"dut-session-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        session_dir = LOG_DIR / session_name
        try:
            session_dir.mkdir(parents=False, exist_ok=False)
            return session_dir
        except FileExistsError:
            time.sleep(1)
        except Exception as exc:
            raise DownloadWorkflowError(f"failed to create directory: {exc}", status_code=500) from exc

    raise DownloadWorkflowError("failed to create directory: session name collision", status_code=500)


def save_downloaded_log_to_session(file_name: str, session_dir: Path) -> Path:
    safe_name = Path(file_name).name
    if safe_name != file_name:
        raise DownloadWorkflowError("failed to download DUT log: invalid file name", status_code=400)

    src = LOG_DIR / safe_name
    if not src.exists() or not src.is_file():
        raise DownloadWorkflowError("log file not found", status_code=404)

    dst = session_dir / safe_name
    try:
        shutil.copy2(src, dst)
    except Exception as exc:
        raise DownloadWorkflowError(f"failed to write downloaded DUT log: {exc}", status_code=500) from exc
    return dst


def should_bypass_analyzer(log_path: Path) -> bool:
    line_count = 0
    has_top_command = False
    try:
        with log_path.open("r", encoding="utf-8", errors="ignore") as fp:
            for line in fp:
                line_count += 1
                if TOP_COMMAND_PATTERN.search(line):
                    has_top_command = True
                if line_count >= DIRECT_DOWNLOAD_MAX_LINES:
                    return False
    except Exception as exc:
        raise DownloadWorkflowError(f"failed to read downloaded DUT log: {exc}", status_code=500) from exc
    return line_count < DIRECT_DOWNLOAD_MAX_LINES and not has_top_command


def ensure_log_has_minimum_snapshots(log_path: Path, minimum_markers: int = MIN_SNAPSHOT_MARKERS) -> None:
    marker = "= Test Time:"
    try:
        with log_path.open("r", encoding="utf-8", errors="ignore") as fp:
            count = 0
            for line in fp:
                if marker in line:
                    count += 1
                    if count >= minimum_markers:
                        return
    except Exception as exc:
        raise DownloadWorkflowError(f"failed to read downloaded DUT log: {exc}", status_code=500) from exc
    raise DownloadWorkflowError(
        f"log too short for analysis; need at least {minimum_markers} snapshots ('{marker}')",
        status_code=422,
    )


def run_analyzer_for_session(session_dir: Path) -> None:
    if not ANALYZER_SCRIPT.exists() or not ANALYZER_SCRIPT.is_file():
        raise DownloadWorkflowError("analyzer3.py not found", status_code=500)

    mpl_config_dir = LOG_DIR / ".mplconfig"
    try:
        mpl_config_dir.mkdir(parents=True, exist_ok=True)
    except Exception as exc:
        raise DownloadWorkflowError(f"failed to prepare analyzer runtime directory: {exc}", status_code=500) from exc

    env = os.environ.copy()
    env["MPLCONFIGDIR"] = str(mpl_config_dir)
    env["MPLBACKEND"] = "Agg"

    try:
        completed = subprocess.run(
            python_tool_argv(ANALYZER_SCRIPT),
            cwd=session_dir,
            capture_output=True,
            text=True,
            env=env,
        )
    except Exception as exc:
        raise DownloadWorkflowError(f"failed to execute analyzer3.py: {exc}", status_code=500) from exc

    if completed.returncode != 0:
        stderr = completed.stderr.strip()
        stdout = completed.stdout.strip()
        combined = f"{stderr}\n{stdout}".strip()
        if "Matplotlib is building the font cache" in combined:
            raise DownloadWorkflowError(
                "analyzer runtime setup issue (matplotlib font cache), not log content issue",
                status_code=500,
            )
        message = stderr or stdout or "analyzer3.py execution failed"
        raise DownloadWorkflowError(f"analyzer3.py execution failed: {message}", status_code=500)


def run_event_detector_for_session(session_dir: Path) -> None:
    """Best-effort crash/abnormal-event scan over the session log(s).

    Runs tools/log_event_detector.py against the session directory and drops a
    log_events.json next to the analyzer outputs (so it gets zipped into the
    bundle). This is additive: any failure here is logged but never blocks the
    CPU/Memory analysis download. analyzer3.py is the primary product; the event
    report is a bonus for chasing kernel panic / Q6 crash / watchdog, etc.
    """
    if not EVENT_DETECTOR_SCRIPT.exists() or not EVENT_DETECTOR_SCRIPT.is_file():
        print("[dave] log_event_detector.py not found; skipping crash-event scan")
        return

    output_path = session_dir / "log_events.json"
    try:
        completed = subprocess.run(
            [
                *python_tool_argv(EVENT_DETECTOR_SCRIPT),
                "--root",
                str(session_dir),
                "--output",
                str(output_path),
            ],
            cwd=session_dir,
            capture_output=True,
            text=True,
        )
    except Exception as exc:  # pragma: no cover - defensive, never break download
        print(f"[dave] event detector failed to execute (ignored): {exc}")
        return

    if completed.returncode != 0:
        message = completed.stderr.strip() or completed.stdout.strip() or "unknown error"
        print(f"[dave] event detector exited non-zero (ignored): {message}")


def zip_session_dir(session_dir: Path) -> Path:
    if not session_dir.exists() or not session_dir.is_dir():
        raise DownloadWorkflowError("failed to create zip: session directory not found", status_code=500)

    zip_path = session_dir.with_suffix(".zip")
    try:
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for item in sorted(session_dir.rglob("*")):
                if item.is_file():
                    zf.write(item, arcname=item.relative_to(session_dir.parent))
    except Exception as exc:
        raise DownloadWorkflowError(f"failed to create zip: {exc}", status_code=500) from exc
    return zip_path


@router.get("/ports")
def list_serial_ports_http(request: Request) -> dict:
    return dispatch("list_serial_ports", {}, AppContext.from_request(request))


@router.post("/open")
def open_serial_http(body: SerialOpenRequest, request: Request) -> dict:
    try:
        return dispatch("open_serial", body.model_dump(), AppContext.from_request(request))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/close")
def close_serial_http(request: Request) -> dict:
    return dispatch("close_serial", {}, AppContext.from_request(request))


@router.post("/send")
def send_serial_http(body: SerialSendRequest, request: Request) -> dict:
    try:
        return dispatch("send_serial", {"text": body.text}, AppContext.from_request(request))
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/efficiency-report")
def get_efficiency_report_http(request: Request) -> dict:
    return dispatch("get_efficiency_report", {}, AppContext.from_request(request))


@router.get("/logs/{file_name}")
def download_log(file_name: str) -> FileResponse:
    try:
        safe_name = Path(file_name).name
        if safe_name != file_name:
            raise DownloadWorkflowError("failed to download DUT log: invalid file name", status_code=400)

        source_log_path = LOG_DIR / safe_name
        if not source_log_path.exists() or not source_log_path.is_file():
            raise DownloadWorkflowError("log file not found", status_code=404)

        if should_bypass_analyzer(source_log_path):
            return FileResponse(path=source_log_path, filename=safe_name, media_type="text/plain")

        session_dir = create_dut_session_dir()
        log_path = save_downloaded_log_to_session(file_name=safe_name, session_dir=session_dir)
        ensure_log_has_minimum_snapshots(log_path=log_path)
        run_analyzer_for_session(session_dir=session_dir)
        run_event_detector_for_session(session_dir=session_dir)
        zip_path = zip_session_dir(session_dir=session_dir)
    except DownloadWorkflowError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"unexpected error while preparing DUT log bundle: {exc}") from exc

    return FileResponse(
        path=zip_path,
        filename=zip_path.name,
        media_type="application/zip",
    )


def _to_number(value: str):
    text = (value or "").strip()
    if text == "":
        return None
    try:
        if "." in text:
            return float(text)
        return int(text)
    except ValueError:
        try:
            return float(text)
        except ValueError:
            return text


def parse_cpu_csv(session_dir: Path) -> list[dict]:
    matches = sorted(session_dir.glob("*cpu_usage.csv"))
    if not matches:
        return []
    rows: list[dict] = []
    with matches[0].open("r", newline="", encoding="utf-8", errors="ignore") as fp:
        for raw in csv.DictReader(fp):
            row: dict = {}
            for key, value in raw.items():
                if key in ("Timestamp", "Timestamp_MMDD_HHMMSS"):
                    row[key] = value
                elif key.endswith("_UsagePct"):
                    row[key] = _to_number(value)
            rows.append(row)
    return rows


def parse_memory_csv(session_dir: Path) -> list[dict]:
    matches = sorted(session_dir.glob("*memory.csv"))
    if not matches:
        return []
    keep_numeric = ("MemAvailable_kB", "Slab_kB", "SUnreclaim_kB", "EffectiveAvailable_kB")
    rows: list[dict] = []
    with matches[0].open("r", newline="", encoding="utf-8", errors="ignore") as fp:
        for raw in csv.DictReader(fp):
            row: dict = {}
            for key, value in raw.items():
                if key in ("Timestamp", "Timestamp_MMDD_HHMMSS"):
                    row[key] = value
                elif key in keep_numeric:
                    row[key] = _to_number(value)
            rows.append(row)
    return rows


def read_spike_report(session_dir: Path) -> str:
    matches = sorted(session_dir.glob("*cpu_spike_report.txt"))
    if not matches:
        return ""
    try:
        return matches[0].read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""


def read_log_events(session_dir: Path) -> tuple[list[dict], dict]:
    events_path = session_dir / "log_events.json"
    if not events_path.exists():
        return [], {"merged_event_count": 0}
    try:
        data = json.loads(events_path.read_text(encoding="utf-8", errors="ignore"))
    except Exception:
        return [], {"merged_event_count": 0}
    events = data.get("events", []) if isinstance(data, dict) else []
    summary = {"merged_event_count": data.get("merged_event_count", len(events))} if isinstance(data, dict) else {"merged_event_count": 0}
    return events, summary


@router.get("/logs/{file_name}/analysis")
def analyze_log(file_name: str) -> dict:
    try:
        safe_name = Path(file_name).name
        if safe_name != file_name:
            raise DownloadWorkflowError("failed to analyze DUT log: invalid file name", status_code=400)

        source_log_path = LOG_DIR / safe_name
        if not source_log_path.exists() or not source_log_path.is_file():
            raise DownloadWorkflowError("log file not found", status_code=404)

        if should_bypass_analyzer(source_log_path):
            return {
                "analyzed": False,
                "file_name": safe_name,
                "reason": "log too short for analysis",
            }

        session_dir = create_dut_session_dir()
        log_path = save_downloaded_log_to_session(file_name=safe_name, session_dir=session_dir)
        ensure_log_has_minimum_snapshots(log_path=log_path)
        run_analyzer_for_session(session_dir=session_dir)
        run_event_detector_for_session(session_dir=session_dir)

        events, event_summary = read_log_events(session_dir)
        return {
            "analyzed": True,
            "file_name": safe_name,
            "cpu": parse_cpu_csv(session_dir),
            "memory": parse_memory_csv(session_dir),
            "spike_report": read_spike_report(session_dir),
            "events": events,
            "event_summary": event_summary,
        }
    except DownloadWorkflowError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"unexpected error while analyzing DUT log: {exc}") from exc
