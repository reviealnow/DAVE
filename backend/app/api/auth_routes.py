from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.auth.dependencies import get_current_user
from app.auth.models import LoginRequest, RegisterRequest, UserResponse
from app.auth.password import hash_password, verify_password
from app.auth.session import create_access_token
from app.config import ACCESS_TOKEN_EXPIRE_MINUTES, SESSION_COOKIE_SAMESITE, SESSION_COOKIE_SECURE
from app.db.database import db_ctx, execute, query_one

router = APIRouter(prefix="/api/auth", tags=["auth"])

_COOKIE = "access_token"


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=_COOKIE,
        value=token,
        httponly=True,
        secure=SESSION_COOKIE_SECURE,
        samesite=SESSION_COOKIE_SAMESITE,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, response: Response, request: Request) -> dict:
    existing = query_one("SELECT id FROM users WHERE username = ?", (body.username,))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")

    pw_hash = hash_password(body.password)
    with db_ctx() as conn:
        cursor = conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (body.username, pw_hash),
        )
        user_id = cursor.lastrowid
        conn.execute(
            "INSERT INTO audit_log (user_id, action, ip_address) VALUES (?, 'register', ?)",
            (user_id, request.client.host if request.client else None),
        )

    token = create_access_token(user_id)
    _set_auth_cookie(response, token)
    return {"ok": True, "user": {"id": user_id, "username": body.username, "role": "user"}}


@router.post("/login")
def login(body: LoginRequest, response: Response, request: Request) -> dict:
    ip = request.client.host if request.client else None
    user = query_one("SELECT * FROM users WHERE username = ?", (body.username,))

    if user is None or not verify_password(body.password, user["password_hash"]):
        with db_ctx() as conn:
            conn.execute(
                "INSERT INTO audit_log (action, detail, ip_address) VALUES ('login_fail', ?, ?)",
                (body.username, ip),
            )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    if not user["is_active"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")

    token = create_access_token(user["id"])
    _set_auth_cookie(response, token)

    with db_ctx() as conn:
        conn.execute(
            "INSERT INTO audit_log (user_id, action, ip_address) VALUES (?, 'login_success', ?)",
            (user["id"], ip),
        )

    return {"ok": True, "user": {"id": user["id"], "username": user["username"], "role": user["role"]}}


@router.post("/logout")
def logout(response: Response) -> dict:
    response.delete_cookie(key=_COOKIE, path="/")
    return {"ok": True}


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)) -> dict:
    return {"id": current_user["id"], "username": current_user["username"], "role": current_user["role"]}
