from __future__ import annotations

from fastapi import HTTPException, UploadFile, status

from app.config import FILESHARE_ALLOWED_EXTENSIONS, FILESHARE_MAX_UPLOAD_MB
from app.security.filenames import safe_extension


def validate_upload(file: UploadFile) -> None:
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No filename provided")

    ext = safe_extension(file.filename)
    if ext not in FILESHARE_ALLOWED_EXTENSIONS:
        allowed = ", ".join(f".{e}" for e in sorted(FILESHARE_ALLOWED_EXTENSIONS))
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"File type '.{ext}' is not allowed. Accepted: {allowed}",
        )

    max_bytes = FILESHARE_MAX_UPLOAD_MB * 1024 * 1024
    if file.size and file.size > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {FILESHARE_MAX_UPLOAD_MB} MB limit",
        )
