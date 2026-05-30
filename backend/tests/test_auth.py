from __future__ import annotations

import sqlite3
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture()
def tmp_db(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()
    monkeypatch.setenv("FILESHARE_DB_PATH", str(db_path))
    monkeypatch.setenv("FILESHARE_UPLOAD_DIR", str(upload_dir))
    monkeypatch.setenv("APP_MODE", "server")
    monkeypatch.setenv("AUTH_SECRET_KEY", "test-secret-key-for-testing-only")

    # Re-import config with patched env
    import importlib
    import app.config as cfg
    importlib.reload(cfg)

    import app.db.database as dbmod
    importlib.reload(dbmod)

    from app.db.migrations import init_db
    init_db()

    yield db_path

    # Reload to restore defaults after test
    importlib.reload(cfg)
    importlib.reload(dbmod)


@pytest.fixture()
def client(tmp_db):
    from app.main import app
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


# ── Register ──────────────────────────────────────────────────────────────────

def test_register_creates_user(client):
    res = client.post("/api/auth/register", json={"username": "alice", "password": "secret123"})
    assert res.status_code == 201
    data = res.json()
    assert data["ok"] is True
    assert data["user"]["username"] == "alice"
    assert "access_token" in res.cookies


def test_register_duplicate_username_returns_409(client):
    client.post("/api/auth/register", json={"username": "bob", "password": "secret123"})
    res = client.post("/api/auth/register", json={"username": "bob", "password": "other123"})
    assert res.status_code == 409


def test_register_short_password_returns_422(client):
    res = client.post("/api/auth/register", json={"username": "carol", "password": "ab"})
    assert res.status_code == 422


def test_register_short_username_returns_422(client):
    res = client.post("/api/auth/register", json={"username": "ab", "password": "secret123"})
    assert res.status_code == 422


# ── Login ─────────────────────────────────────────────────────────────────────

def test_login_success(client):
    client.post("/api/auth/register", json={"username": "dave", "password": "secret123"})
    res = client.post("/api/auth/login", json={"username": "dave", "password": "secret123"})
    assert res.status_code == 200
    assert res.json()["ok"] is True
    assert "access_token" in res.cookies


def test_login_wrong_password_returns_401(client):
    client.post("/api/auth/register", json={"username": "eve", "password": "secret123"})
    res = client.post("/api/auth/login", json={"username": "eve", "password": "wrong"})
    assert res.status_code == 401


def test_login_unknown_user_returns_401(client):
    res = client.post("/api/auth/login", json={"username": "nobody", "password": "x"})
    assert res.status_code == 401


# ── Logout ────────────────────────────────────────────────────────────────────

def test_logout_clears_cookie(client):
    client.post("/api/auth/register", json={"username": "frank", "password": "secret123"})
    client.post("/api/auth/login", json={"username": "frank", "password": "secret123"})
    res = client.post("/api/auth/logout")
    assert res.status_code == 200
    # After logout the cookie should be gone or empty
    assert client.cookies.get("access_token", "") == ""


# ── Me ────────────────────────────────────────────────────────────────────────

def test_me_returns_current_user(client):
    client.post("/api/auth/register", json={"username": "grace", "password": "secret123"})
    res = client.get("/api/auth/me")
    assert res.status_code == 200
    assert res.json()["username"] == "grace"


def test_me_unauthenticated_returns_401(client):
    res = client.get("/api/auth/me")
    assert res.status_code == 401
