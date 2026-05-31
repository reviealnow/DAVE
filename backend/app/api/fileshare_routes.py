from __future__ import annotations

from fastapi import APIRouter, Depends, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.auth.dependencies import get_current_user
from app.config import ARTIFACT_TYPES
from app.services import fileshare_service as svc

router = APIRouter(prefix="/api/fileshare", tags=["fileshare"])


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.get("/files")
def list_files(
    request: Request,
    visibility: str | None = None,
    artifact_type: str | None = None,
    owner_id: int | None = None,
    keyword: str | None = None,
    current_user: dict = Depends(get_current_user),
) -> dict:
    files = svc.list_files(
        current_user_id=current_user["id"],
        visibility_filter=visibility,
        artifact_type_filter=artifact_type,
        owner_filter=owner_id,
        keyword=keyword,
    )
    return {"files": files}


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_file(
    request: Request,
    file: UploadFile,
    visibility: str = Form(default="private"),
    artifact_type: str = Form(default="general"),
    description: str | None = Form(default=None),
    current_user: dict = Depends(get_current_user),
) -> dict:
    info = await svc.save_file(
        file=file,
        owner_id=current_user["id"],
        visibility=visibility,
        artifact_type=artifact_type,
        description=description,
        ip=_ip(request),
    )
    return {"ok": True, "file": info}


@router.get("/download/{file_id}")
def download_file(
    file_id: int,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> FileResponse:
    path, original_name = svc.get_download_path(file_id, current_user["id"], _ip(request))
    return FileResponse(
        path=path,
        filename=original_name,
        media_type="application/octet-stream",
    )


@router.delete("/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(
    file_id: int,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> None:
    svc.delete_file(file_id, current_user["id"], _ip(request))


class BatchDeleteBody(BaseModel):
    ids: list[int]


@router.post("/files/batch-delete")
def batch_delete_files(
    body: BatchDeleteBody,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict:
    result = svc.delete_files(body.ids, current_user["id"], _ip(request))
    return result


class VisibilityBody(BaseModel):
    visibility: str


@router.patch("/files/{file_id}/visibility")
def update_visibility(
    file_id: int,
    body: VisibilityBody,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict:
    info = svc.set_visibility(file_id, body.visibility, current_user["id"], _ip(request))
    return {"ok": True, "file": info}


class ArtifactTypeBody(BaseModel):
    artifact_type: str


@router.patch("/files/{file_id}/artifact-type")
def update_artifact_type(
    file_id: int,
    body: ArtifactTypeBody,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict:
    info = svc.set_artifact_type(file_id, body.artifact_type, current_user["id"], _ip(request))
    return {"ok": True, "file": info}


@router.get("/artifact-types")
def list_artifact_types() -> dict:
    return {"types": sorted(ARTIFACT_TYPES)}
