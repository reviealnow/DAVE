from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.tools import dispatch
from app.tools.context import AppContext

router = APIRouter(prefix="/api/analyzer", tags=["analyzer"])


class AnalyzerRunRequest(BaseModel):
    log_path: str


@router.post("/run")
def run_analyzer_http(body: AnalyzerRunRequest, request: Request) -> dict:
    try:
        return dispatch("run_analyzer", {"log_path": body.log_path}, AppContext.from_request(request))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
