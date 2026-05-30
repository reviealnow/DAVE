from __future__ import annotations

from app.tools.context import AppContext
from app.tools.registry import tool


@tool(name="run_analyzer", description="Run the log analyzer on a specified log file", tags=["analyzer"])
def run_analyzer(ctx: AppContext, log_path: str) -> dict:
    return ctx.analyzer_service.run(log_path)
