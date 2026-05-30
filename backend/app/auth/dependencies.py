from __future__ import annotations

from fastapi import Cookie, HTTPException, status

from app.auth.session import extract_user_id
from app.db.database import query_one


def _fetch_user(user_id: int) -> dict:
    row = query_one("SELECT id, username, role, is_active FROM users WHERE id = ?", (user_id,))
    if row is None or not row["is_active"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return dict(row)


def get_current_user(access_token: str | None = Cookie(default=None)) -> dict:
    if not access_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        user_id = extract_user_id(access_token)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return _fetch_user(user_id)


def get_current_user_optional(access_token: str | None = Cookie(default=None)) -> dict | None:
    if not access_token:
        return None
    try:
        user_id = extract_user_id(access_token)
        return _fetch_user(user_id)
    except (ValueError, HTTPException):
        return None
