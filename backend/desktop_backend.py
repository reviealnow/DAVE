"""PyInstaller entry point for the DAVE desktop backend sidecar.

The Tauri shell spawns this frozen binary (see desktop/src-tauri/src/main.rs).
It is multi-mode so the same binary can also run the bundled analyzer / event
detector tools, which the app normally invokes via `[python, script]` — in a
frozen build there is no separate Python interpreter, so those subprocess calls
re-enter this binary with `--run-tool` (see app.config.python_tool_argv).

Modes
-----
    dave-backend                 → run the FastAPI server (default)
    dave-backend --run-tool S A… → runpy-execute script S with args A… as __main__
"""
from __future__ import annotations

import os
import runpy
import sys


def _run_tool() -> int:
    # argv: [prog, "--run-tool", <script>, *tool_args]
    # Tools run headless (no display), so default matplotlib to the Agg backend.
    os.environ.setdefault("MPLBACKEND", "Agg")
    script = sys.argv[2]
    sys.argv = [script, *sys.argv[3:]]
    runpy.run_path(script, run_name="__main__")
    return 0


def _run_server() -> int:
    import uvicorn

    from app.main import app

    host = os.getenv("APP_HOST", "127.0.0.1")
    port = int(os.getenv("APP_PORT", "8765"))
    uvicorn.run(app, host=host, port=port, log_level="info")
    return 0


def main() -> int:
    if len(sys.argv) >= 3 and sys.argv[1] == "--run-tool":
        return _run_tool()
    return _run_server()


if __name__ == "__main__":
    raise SystemExit(main())
