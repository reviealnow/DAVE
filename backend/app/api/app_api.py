from __future__ import annotations

from fastapi import APIRouter, Query, Request

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
