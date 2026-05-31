from __future__ import annotations

import importlib
import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture()
def env(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()
    monkeypatch.setenv("FILESHARE_DB_PATH", str(db_path))
    monkeypatch.setenv("FILESHARE_UPLOAD_DIR", str(upload_dir))
    monkeypatch.setenv("APP_MODE", "server")
    monkeypatch.setenv("AUTH_SECRET_KEY", "test-secret-fileshare")

    import app.config as cfg
    import app.db.database as dbmod
    importlib.reload(cfg)
    importlib.reload(dbmod)

    from app.db.migrations import init_db
    init_db()

    yield {"db": db_path, "uploads": upload_dir}

    importlib.reload(cfg)
    importlib.reload(dbmod)


@pytest.fixture()
def client(env):
    from app.main import app
    with TestClient(app) as c:
        yield c


def _register(client, username="alice", password="secret123"):
    res = client.post("/api/auth/register", json={"username": username, "password": password})
    assert res.status_code == 201, res.text
    return res.json()["user"]


def _login(client, username="alice", password="secret123"):
    client.post("/api/auth/login", json={"username": username, "password": password})


def _upload(client, filename="test.log", content=b"hello", visibility="private", artifact_type="general"):
    return client.post(
        "/api/fileshare/upload",
        files={"file": (filename, io.BytesIO(content), "text/plain")},
        data={"visibility": visibility, "artifact_type": artifact_type},
    )


# ── Upload ────────────────────────────────────────────────────────────────────

def test_upload_authenticated_succeeds(client):
    _register(client)
    _login(client)
    res = _upload(client)
    assert res.status_code == 201
    info = res.json()["file"]
    assert info["original_filename"] == "test.log"
    assert info["visibility"] == "private"
    assert info["artifact_type"] == "general"


def test_upload_unauthenticated_returns_401(client):
    res = _upload(client)
    assert res.status_code == 401


def test_upload_disallowed_extension_returns_415(client):
    _register(client)
    _login(client)
    res = _upload(client, filename="evil.exe", content=b"bad")
    assert res.status_code == 415


def test_upload_default_artifact_type_is_general(client):
    _register(client)
    _login(client)
    res = client.post(
        "/api/fileshare/upload",
        files={"file": ("note.txt", io.BytesIO(b"hi"), "text/plain")},
        data={"visibility": "private"},
    )
    assert res.status_code == 201
    assert res.json()["file"]["artifact_type"] == "general"


def test_upload_explicit_artifact_type(client):
    _register(client)
    _login(client)
    res = _upload(client, filename="cap.pcap", content=b"data", artifact_type="pcap")
    assert res.status_code == 201
    assert res.json()["file"]["artifact_type"] == "pcap"


# ── List ──────────────────────────────────────────────────────────────────────

def test_list_own_private_files(client):
    _register(client, "alice")
    _login(client, "alice")
    _upload(client, visibility="private")
    res = client.get("/api/fileshare/files")
    assert res.status_code == 200
    assert len(res.json()["files"]) == 1


def test_list_does_not_include_others_private_files(client):
    _register(client, "alice")
    _register(client, "bob", "pass456")

    _login(client, "alice")
    _upload(client, visibility="private")
    client.post("/api/auth/logout")

    _login(client, "bob", "pass456")
    res = client.get("/api/fileshare/files")
    assert res.status_code == 200
    assert all(f["visibility"] == "public" or f["owner_username"] == "bob" for f in res.json()["files"])


def test_list_public_files_visible_to_others(client):
    _register(client, "alice")
    _register(client, "bob", "pass456")

    _login(client, "alice")
    _upload(client, visibility="public")
    client.post("/api/auth/logout")

    _login(client, "bob", "pass456")
    res = client.get("/api/fileshare/files")
    assert any(f["visibility"] == "public" for f in res.json()["files"])


# ── Download ──────────────────────────────────────────────────────────────────

def test_download_own_private_file(client):
    _register(client, "alice")
    _login(client, "alice")
    up = _upload(client, content=b"secret data")
    fid = up.json()["file"]["id"]
    res = client.get(f"/api/fileshare/download/{fid}")
    assert res.status_code == 200
    assert res.content == b"secret data"


def test_download_public_file_as_other_user(client):
    _register(client, "alice")
    _register(client, "bob", "pass456")

    _login(client, "alice")
    up = _upload(client, content=b"shared!", visibility="public")
    fid = up.json()["file"]["id"]
    client.post("/api/auth/logout")

    _login(client, "bob", "pass456")
    res = client.get(f"/api/fileshare/download/{fid}")
    assert res.status_code == 200


def test_download_private_file_as_non_owner_returns_403(client):
    _register(client, "alice")
    _register(client, "bob", "pass456")

    _login(client, "alice")
    up = _upload(client, visibility="private")
    fid = up.json()["file"]["id"]
    client.post("/api/auth/logout")

    _login(client, "bob", "pass456")
    res = client.get(f"/api/fileshare/download/{fid}")
    assert res.status_code == 403


# ── Delete ────────────────────────────────────────────────────────────────────

def test_delete_own_file(client):
    _register(client)
    _login(client)
    up = _upload(client)
    fid = up.json()["file"]["id"]
    res = client.delete(f"/api/fileshare/files/{fid}")
    assert res.status_code == 204


def test_delete_other_users_file_returns_403(client):
    _register(client, "alice")
    _register(client, "bob", "pass456")

    _login(client, "alice")
    up = _upload(client, visibility="public")
    fid = up.json()["file"]["id"]
    client.post("/api/auth/logout")

    _login(client, "bob", "pass456")
    res = client.delete(f"/api/fileshare/files/{fid}")
    assert res.status_code == 403


# ── Batch delete ──────────────────────────────────────────────────────────────

def test_batch_delete_all_own_files(client):
    _register(client)
    _login(client)
    ids = [_upload(client, filename=f"f{n}.log").json()["file"]["id"] for n in range(3)]

    res = client.post("/api/fileshare/files/batch-delete", json={"ids": ids})
    assert res.status_code == 200, res.text
    body = res.json()
    assert sorted(body["deleted"]) == sorted(ids)
    assert body["failed"] == []
    assert client.get("/api/fileshare/files").json()["files"] == []


def test_batch_delete_mixed_ownership_partial(client):
    _register(client, "alice")
    _register(client, "bob", "pass456")

    _login(client, "bob", "pass456")
    bob_pub = _upload(client, filename="bob.log", visibility="public").json()["file"]["id"]
    client.post("/api/auth/logout")

    _login(client, "alice")
    alice_id = _upload(client, filename="alice.log").json()["file"]["id"]

    res = client.post("/api/fileshare/files/batch-delete", json={"ids": [alice_id, bob_pub]})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["deleted"] == [alice_id]
    assert body["failed"] == [{"id": bob_pub, "reason": "forbidden"}]


def test_batch_delete_nonexistent_id(client):
    _register(client)
    _login(client)
    fid = _upload(client).json()["file"]["id"]

    res = client.post("/api/fileshare/files/batch-delete", json={"ids": [fid, 99999]})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["deleted"] == [fid]
    assert body["failed"] == [{"id": 99999, "reason": "not_found"}]


def test_batch_delete_empty_list(client):
    _register(client)
    _login(client)
    res = client.post("/api/fileshare/files/batch-delete", json={"ids": []})
    assert res.status_code == 200, res.text
    assert res.json() == {"deleted": [], "failed": []}


def test_batch_delete_unauthenticated_returns_401(client):
    res = client.post("/api/fileshare/files/batch-delete", json={"ids": [1]})
    assert res.status_code == 401


def test_batch_delete_dedups_repeated_ids(client):
    _register(client)
    _login(client)
    fid = _upload(client).json()["file"]["id"]
    res = client.post("/api/fileshare/files/batch-delete", json={"ids": [fid, fid, fid]})
    assert res.status_code == 200, res.text
    assert res.json()["deleted"] == [fid]


# ── Visibility toggle ─────────────────────────────────────────────────────────

def test_toggle_visibility_as_owner(client):
    _register(client)
    _login(client)
    up = _upload(client, visibility="private")
    fid = up.json()["file"]["id"]

    res = client.patch(f"/api/fileshare/files/{fid}/visibility", json={"visibility": "public"})
    assert res.status_code == 200
    assert res.json()["file"]["visibility"] == "public"


def test_toggle_visibility_as_non_owner_returns_403(client):
    _register(client, "alice")
    _register(client, "bob", "pass456")

    _login(client, "alice")
    up = _upload(client, visibility="public")
    fid = up.json()["file"]["id"]
    client.post("/api/auth/logout")

    _login(client, "bob", "pass456")
    res = client.patch(f"/api/fileshare/files/{fid}/visibility", json={"visibility": "private"})
    assert res.status_code == 403


# ── Path traversal ────────────────────────────────────────────────────────────

def test_path_traversal_in_filename_is_sanitized(client):
    _register(client)
    _login(client)
    res = client.post(
        "/api/fileshare/upload",
        files={"file": ("../../../etc/passwd", io.BytesIO(b"bad"), "text/plain")},
        data={"visibility": "private"},
    )
    # Either rejected (415) if no valid ext, or uploaded with safe stored name
    if res.status_code == 201:
        info = res.json()["file"]
        # stored filename must not contain path separators
        assert "/" not in info["original_filename"].lstrip("./\\")
