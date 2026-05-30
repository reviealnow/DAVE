from __future__ import annotations

from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt

from app.config import ACCESS_TOKEN_EXPIRE_MINUTES, AUTH_SECRET_KEY

_ALGORITHM = "HS256"


def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, AUTH_SECRET_KEY, algorithm=_ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, AUTH_SECRET_KEY, algorithms=[_ALGORITHM])


def extract_user_id(token: str) -> int:
    try:
        payload = decode_token(token)
        raw = payload.get("sub")
        if raw is None:
            raise ValueError("missing sub")
        return int(raw)
    except (JWTError, ValueError, TypeError) as exc:
        raise ValueError("invalid token") from exc
