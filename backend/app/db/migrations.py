from __future__ import annotations

from app.db.database import _connect

_USERS = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    UNIQUE NOT NULL,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'user',
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""

_FILES = """
CREATE TABLE IF NOT EXISTS files (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_user_id     INTEGER NOT NULL,
    original_filename TEXT    NOT NULL,
    stored_filename   TEXT    UNIQUE NOT NULL,
    content_type      TEXT    NOT NULL DEFAULT 'application/octet-stream',
    size_bytes        INTEGER NOT NULL,
    visibility        TEXT    NOT NULL DEFAULT 'private',
    artifact_type     TEXT    NOT NULL DEFAULT 'general',
    description       TEXT,
    checksum          TEXT,
    download_count    INTEGER NOT NULL DEFAULT 0,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_user_id) REFERENCES users(id)
);
"""

_AUDIT_LOG = """
CREATE TABLE IF NOT EXISTS audit_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER,
    action        TEXT NOT NULL,
    resource_type TEXT,
    resource_id   TEXT,
    detail        TEXT,
    ip_address    TEXT,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""

_INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_files_owner ON files(owner_user_id);",
    "CREATE INDEX IF NOT EXISTS idx_files_visibility ON files(visibility);",
    "CREATE INDEX IF NOT EXISTS idx_files_artifact_type ON files(artifact_type);",
    "CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);",
]


def init_db() -> None:
    conn = _connect()
    try:
        conn.execute(_USERS)
        conn.execute(_FILES)
        conn.execute(_AUDIT_LOG)
        for idx in _INDEXES:
            conn.execute(idx)
        conn.commit()
    finally:
        conn.close()
