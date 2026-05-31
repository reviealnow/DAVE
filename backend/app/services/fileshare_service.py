from __future__ import annotations

import mimetypes
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.config import ARTIFACT_TYPES, FILESHARE_MAX_UPLOAD_MB, FILESHARE_UPLOAD_DIR
from app.db.database import db_ctx, execute, query_all, query_one
from app.security.filenames import (
    file_checksum,
    generate_stored_name,
    sanitize_display_name,
    safe_extension,
)
from app.security.upload_validation import validate_upload


def _audit(conn, user_id: int | None, action: str, resource_type: str | None = None,
           resource_id: str | None = None, detail: str | None = None, ip: str | None = None) -> None:
    conn.execute(
        "INSERT INTO audit_log (user_id, action, resource_type, resource_id, detail, ip_address) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, action, resource_type, resource_id, detail, ip),
    )


async def save_file(
    file: UploadFile,
    owner_id: int,
    visibility: str = "private",
    artifact_type: str = "general",
    description: str | None = None,
    ip: str | None = None,
) -> dict:
    validate_upload(file)

    if artifact_type not in ARTIFACT_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid artifact_type: {artifact_type}")
    if visibility not in ("public", "private"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="visibility must be 'public' or 'private'")

    FILESHARE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    original = sanitize_display_name(file.filename or "upload")
    stored = generate_stored_name(original)
    dest = FILESHARE_UPLOAD_DIR / stored

    max_bytes = FILESHARE_MAX_UPLOAD_MB * 1024 * 1024
    written = 0
    try:
        with dest.open("wb") as fh:
            while True:
                chunk = await file.read(65536)
                if not chunk:
                    break
                written += len(chunk)
                if written > max_bytes:
                    fh.close()
                    dest.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"File exceeds {FILESHARE_MAX_UPLOAD_MB} MB limit",
                    )
                fh.write(chunk)
    except HTTPException:
        raise
    except Exception as exc:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Failed to save file: {exc}") from exc

    checksum = file_checksum(dest)
    content_type = mimetypes.guess_type(original)[0] or "application/octet-stream"

    with db_ctx() as conn:
        cursor = conn.execute(
            """
            INSERT INTO files
              (owner_user_id, original_filename, stored_filename, content_type,
               size_bytes, visibility, artifact_type, description, checksum)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (owner_id, original, stored, content_type, written, visibility, artifact_type, description, checksum),
        )
        file_id = cursor.lastrowid
        _audit(conn, owner_id, "upload", "file", str(file_id), original, ip)

    return get_file_or_404(file_id)


def list_files(
    current_user_id: int,
    visibility_filter: str | None = None,
    artifact_type_filter: str | None = None,
    owner_filter: int | None = None,
    keyword: str | None = None,
) -> list[dict]:
    conditions = [
        "(f.visibility = 'public' OR f.owner_user_id = ?)"
    ]
    params: list = [current_user_id]

    if visibility_filter:
        conditions.append("f.visibility = ?")
        params.append(visibility_filter)
    if artifact_type_filter:
        conditions.append("f.artifact_type = ?")
        params.append(artifact_type_filter)
    if owner_filter is not None:
        conditions.append("f.owner_user_id = ?")
        params.append(owner_filter)
    if keyword:
        conditions.append("f.original_filename LIKE ?")
        params.append(f"%{keyword}%")

    where = " AND ".join(conditions)
    sql = f"""
        SELECT f.id, f.owner_user_id, f.original_filename, f.content_type,
               f.size_bytes, f.visibility, f.artifact_type, f.description,
               f.download_count, f.checksum, f.created_at, f.updated_at,
               u.username AS owner_username
        FROM files AS f
        JOIN users AS u ON f.owner_user_id = u.id
        WHERE {where}
        ORDER BY f.created_at DESC, f.id DESC
    """
    rows = query_all(sql, tuple(params))
    return [dict(r) for r in rows]


def get_file_or_404(file_id: int) -> dict:
    row = query_one(
        """
        SELECT f.id, f.owner_user_id, f.original_filename, f.stored_filename,
               f.content_type, f.size_bytes, f.visibility, f.artifact_type,
               f.description, f.download_count, f.checksum, f.created_at, f.updated_at,
               u.username AS owner_username
        FROM files AS f
        JOIN users AS u ON f.owner_user_id = u.id
        WHERE f.id = ?
        """,
        (file_id,),
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return dict(row)


def get_download_path(file_id: int, current_user_id: int, ip: str | None = None) -> tuple[Path, str]:
    info = get_file_or_404(file_id)

    if info["visibility"] == "private" and info["owner_user_id"] != current_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    path = FILESHARE_UPLOAD_DIR / info["stored_filename"]
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found on disk")

    with db_ctx() as conn:
        conn.execute(
            "UPDATE files SET download_count = download_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (file_id,),
        )
        _audit(conn, current_user_id, "download", "file", str(file_id), info["original_filename"], ip)

    return path, info["original_filename"]


def delete_file(file_id: int, current_user_id: int, ip: str | None = None) -> None:
    info = get_file_or_404(file_id)

    if info["owner_user_id"] != current_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the owner can delete this file")

    path = FILESHARE_UPLOAD_DIR / info["stored_filename"]
    path.unlink(missing_ok=True)

    with db_ctx() as conn:
        conn.execute("DELETE FROM files WHERE id = ?", (file_id,))
        _audit(conn, current_user_id, "delete", "file", str(file_id), info["original_filename"], ip)


def delete_files(file_ids: list[int], current_user_id: int, ip: str | None = None) -> dict:
    """Delete multiple files in one DB transaction.

    Per-file ownership/existence is checked individually; a file the caller
    doesn't own or that doesn't exist is reported under "failed" rather than
    aborting the whole batch. Blobs are unlinked for every successfully removed
    row. A single ``batch_delete`` audit entry summarises the operation.
    """
    deleted: list[int] = []
    failed: list[dict] = []

    # De-dup while preserving order so the same id can't be processed twice.
    seen: set[int] = set()
    ordered_ids = [fid for fid in file_ids if not (fid in seen or seen.add(fid))]

    with db_ctx() as conn:
        for file_id in ordered_ids:
            row = conn.execute(
                "SELECT id, owner_user_id, stored_filename FROM files WHERE id = ?",
                (file_id,),
            ).fetchone()
            if row is None:
                failed.append({"id": file_id, "reason": "not_found"})
                continue
            if row["owner_user_id"] != current_user_id:
                failed.append({"id": file_id, "reason": "forbidden"})
                continue

            (FILESHARE_UPLOAD_DIR / row["stored_filename"]).unlink(missing_ok=True)
            conn.execute("DELETE FROM files WHERE id = ?", (file_id,))
            deleted.append(file_id)

        if deleted:
            _audit(
                conn, current_user_id, "batch_delete", "file",
                ",".join(str(i) for i in deleted),
                f"deleted {len(deleted)} file(s)", ip,
            )

    return {"deleted": deleted, "failed": failed}


def set_visibility(file_id: int, visibility: str, current_user_id: int, ip: str | None = None) -> dict:
    if visibility not in ("public", "private"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="visibility must be 'public' or 'private'")

    info = get_file_or_404(file_id)
    if info["owner_user_id"] != current_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the owner can change visibility")

    with db_ctx() as conn:
        conn.execute(
            "UPDATE files SET visibility = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (visibility, file_id),
        )
        _audit(conn, current_user_id, "visibility_change", "file", str(file_id), visibility, ip)

    return get_file_or_404(file_id)


def set_artifact_type(file_id: int, artifact_type: str, current_user_id: int, ip: str | None = None) -> dict:
    if artifact_type not in ARTIFACT_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid artifact_type: {artifact_type}")

    info = get_file_or_404(file_id)
    if info["owner_user_id"] != current_user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the owner can change artifact type")

    with db_ctx() as conn:
        conn.execute(
            "UPDATE files SET artifact_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (artifact_type, file_id),
        )
        _audit(conn, current_user_id, "artifact_type_change", "file", str(file_id), artifact_type, ip)

    return get_file_or_404(file_id)
