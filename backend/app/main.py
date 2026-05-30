from __future__ import annotations

import asyncio
import json
import os
from argparse import ArgumentParser
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.app_api import router as app_router
from app.api.analyzer_api import router as analyzer_router
from app.api.auth_routes import router as auth_router
from app.api.fileshare_routes import router as fileshare_router
from app.api.serial_api import router as serial_router
from app.api.snapshot_api import router as snapshot_router
from app.config import ANALYZER_OUTPUT_DIR, APP_MODE, ROOT_DIR, SNAPSHOT_FILE
from app.db.migrations import init_db
from app.parser.sysmon_parser import SysMonParser
from app.serial.serial_worker import SerialWorker
from app.services.analyzer_service import AnalyzerService
from app.services.snapshot_store import SnapshotStore
from app.services.version_service import VersionService
from app.tools import dispatch, list_tools
from app.tools.context import AppContext
from app.versioning import read_version
from app.websocket.ws_manager import WebSocketManager


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[type-arg]
    # Ensure DB schema exists
    init_db()

    ws_manager = WebSocketManager()
    ws_manager.bind_loop(asyncio.get_running_loop())
    snapshot_store = SnapshotStore(SNAPSHOT_FILE)

    def on_event(event: dict) -> None:
        ws_manager.emit_from_thread(event)
        if event.get("type") == "snapshot_update":
            snapshot_store.append(event["snapshot"])

    app.state.ws_manager = ws_manager
    app.state.snapshot_store = snapshot_store
    app.state.parser = SysMonParser(on_event=on_event)
    app.state.serial_worker = SerialWorker(app.state.parser)
    app.state.analyzer_service = AnalyzerService()
    app.state.version_service = VersionService()

    yield


app = FastAPI(title="Dave — DUT Lab Portal", lifespan=lifespan)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Desktop mode: only allow local Tauri/Vite origins.
# Server mode: allow all origins on the same LAN (tighten with CORS_ORIGINS env for prod).
_cors_origins_env = os.getenv("CORS_ORIGINS", "")
if _cors_origins_env:
    _allowed_origins = [o.strip() for o in _cors_origins_env.split(",") if o.strip()]
elif APP_MODE == "server":
    _allowed_origins = ["*"]
else:
    _allowed_origins = [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://tauri.localhost",
        "tauri://localhost",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(fileshare_router)
app.include_router(app_router)
app.include_router(serial_router)
app.include_router(analyzer_router)
app.include_router(snapshot_router)


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health() -> dict:
    return {"ok": True, "mode": APP_MODE, "version": read_version()}


# ── Analyzer output download (DUT legacy endpoint) ───────────────────────────
@app.get("/api/download/{file_name}")
def download_analyzer_file(file_name: str) -> FileResponse:
    safe_name = Path(file_name).name
    if safe_name != file_name:
        raise HTTPException(status_code=400, detail="Invalid file name")
    file_path = ANALYZER_OUTPUT_DIR / safe_name
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path=file_path, filename=safe_name, media_type="application/octet-stream")


# ── WebSocket (DUT real-time events) ─────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    manager: WebSocketManager = app.state.ws_manager
    await manager.connect(ws)
    ctx = AppContext.from_state(app.state)
    try:
        while True:
            raw = await ws.receive_text()
            try:
                data = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                continue
            if not isinstance(data, dict) or "tool" not in data:
                continue
            tool_name: str = data["tool"]
            params: dict = data.get("params") or {}
            request_id = data.get("request_id")
            try:
                result = list_tools() if tool_name == "list_tools" else dispatch(tool_name, params, ctx)
                await ws.send_json(
                    {"type": "tool_result", "tool": tool_name, "request_id": request_id, "ok": True, "data": result}
                )
            except Exception as exc:
                await ws.send_json(
                    {"type": "tool_result", "tool": tool_name, "request_id": request_id, "ok": False, "error": str(exc)}
                )
    except WebSocketDisconnect:
        manager.disconnect(ws)
    except Exception:
        manager.disconnect(ws)


# ── Serve built React frontend in server mode ─────────────────────────────────
_FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"
if APP_MODE == "server" and _FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(_FRONTEND_DIST), html=True), name="spa")


if __name__ == "__main__":
    import uvicorn

    parser = ArgumentParser(description="Dave backend")
    parser.add_argument("--host", default=os.getenv("APP_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("APP_PORT", "8765")))
    parser.add_argument("--reload", action="store_true")
    args = parser.parse_args()

    uvicorn.run("app.main:app", host=args.host, port=args.port, reload=args.reload)
