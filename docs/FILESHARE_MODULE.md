# Fileshare Module

## Overview

The `/fileshare` module is the test artifact repository inside Dave Lab Portal.
It is reachable at:

- Browser: `http://<server>:<port>/fileshare`
- API: `http://<server>:<port>/api/fileshare/*`

## File visibility model

| Visibility | Who can list | Who can download | Who can delete | Who can change |
|---|---|---|---|---|
| `private` | Owner only | Owner only | Owner only | Owner only |
| `public` | All authenticated users | All authenticated users | Owner only | Owner only |

There is no anonymous access. All operations require a valid session.

## Owner permission model

- Only the file owner can delete their file.
- Only the file owner can toggle visibility (public ↔ private).
- Only the file owner can change artifact_type.
- Admin role is reserved for future use (stored in `users.role`).

## artifact_type

Every file has an `artifact_type` field. Default is `general`.

| Type | Description |
|---|---|
| `general` | Default, unclassified |
| `raw_log` | Raw serial / syslog output |
| `analyzer_report` | Output from analyzer3.py |
| `pcap` | Wireshark packet capture |
| `pcapng` | Wireshark next-gen packet capture |
| `firmware` | AP / DUT firmware image |
| `test_plan` | Test plan document |
| `screenshot` | Screenshot evidence |
| `customer_evidence` | Files shared with customers |
| `regression_bundle` | Regression test result bundle |
| `config_backup` | Device configuration backup |
| `other` | Anything else |

### Implementation notes
- Stored as a TEXT column in SQLite. No strict enum migration needed for MVP.
- Validation happens in `fileshare_service.py` against `ARTIFACT_TYPES` set in `config.py`.
- Future: could become a separate `artifact_types` lookup table + FK when PostgreSQL migrates.

## API reference

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/fileshare/files` | Required | List files (filtered by visibility rules) |
| POST | `/api/fileshare/upload` | Required | Upload a file (multipart/form-data) |
| GET | `/api/fileshare/download/{id}` | Required | Download file |
| DELETE | `/api/fileshare/files/{id}` | Required (owner) | Delete file |
| PATCH | `/api/fileshare/files/{id}/visibility` | Required (owner) | Toggle visibility |
| PATCH | `/api/fileshare/files/{id}/artifact-type` | Required (owner) | Change artifact type |
| GET | `/api/fileshare/artifact-types` | Required | List valid artifact types |

### Upload request body (multipart/form-data)
| Field | Required | Default | Description |
|---|---|---|---|
| `file` | Yes | — | The file |
| `visibility` | No | `private` | `public` or `private` |
| `artifact_type` | No | `general` | See artifact types table |
| `description` | No | — | Short description |

### GET /api/fileshare/files query params
| Param | Description |
|---|---|
| `visibility` | Filter by `public` or `private` |
| `artifact_type` | Filter by artifact type |
| `owner_id` | Filter by owner user ID |
| `keyword` | Filename contains keyword |

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `FILESHARE_DB_PATH` | `data/fileshare/fileshare.db` | SQLite database path |
| `FILESHARE_UPLOAD_DIR` | `data/fileshare/uploads` | Upload storage directory |
| `FILESHARE_MAX_UPLOAD_MB` | `50` | Maximum upload size in MB |

## Security

1. All fileshare endpoints require authentication (JWT cookie).
2. Uploaded filename is NEVER used as storage filename.
3. Storage filename is `{timestamp_ms}_{uuid4}{sanitized_ext}`.
4. Extension is validated against `FILESHARE_ALLOWED_EXTENSIONS` allowlist.
5. File size is checked both at upload time and during streaming write.
6. Download path is resolved inside `FILESHARE_UPLOAD_DIR` only.
7. Original filename is stored separately for display/download only.
8. SHA-256 checksum is computed after write and stored in DB.
9. All operations are written to `audit_log` table.

## Database schema (fileshare.db)

```sql
CREATE TABLE files (
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
```

## Future: evolving into a full artifact repository

The current schema already supports:
- `related_dut_id` — add as nullable column when DUT management is built
- `related_project_id` — add when project management is built
- `tags` — add as a JSON column or separate `file_tags` table
- `source_module` — track which module produced the artifact

When PostgreSQL migration is ready, the SQLite schema maps cleanly to Postgres with no data loss.
