# Dave — Integration Plan

## What we merged and why

### Source repositories
| Repo | Role in Dave |
|---|---|
| DUT_browser | Main app → Landing page / DUT Dashboard |
| LAN_filesever2 | File sharing → `/fileshare` module |

### Why one backend, not two services

LAN_filesever2 was a standalone Flask app. Running it alongside DUT_browser's FastAPI would require:
- Two ports (e.g. 8765 for DUT, 8766 for files)
- Two separate login systems or complex cross-origin session sharing
- Nginx/proxy config just to make them appear as one URL to the frontend

By porting all Flask logic into FastAPI we get:
- One process, one port, one login system
- Shared SQLite database for users + files
- Single React frontend app with proper routing
- Easier Raspberry Pi deployment (one command)

### What was ported from LAN_filesever2

| Flask feature | Dave equivalent |
|---|---|
| `auth.py` (werkzeug sessions) | `app/auth/` (JWT + httpOnly cookie) |
| `db.py` (Flask g pattern) | `app/db/database.py` (standalone context manager) |
| `file_service.py` | `app/services/fileshare_service.py` |
| Jinja2 HTML templates | React `FileSharePage.tsx` |
| `config.py` (hardcoded paths) | `app/config.py` (env-configurable) |
| Bulletin board | Not ported (not in product scope) |

### What was extended beyond LAN_filesever2

- `visibility` (public/private) with owner enforcement
- `artifact_type` field for test artifact classification
- `checksum` (SHA-256) per file
- `download_count` tracking
- Audit log for all operations (login, upload, download, delete, visibility change)
- Owner-only delete
- JWT auth instead of server-side Flask sessions

## Shared auth model

One `users` table in `data/fileshare/fileshare.db` serves all modules:
- DUT dashboard routes
- `/fileshare` routes
- Future modules (settings, testcase manager, etc.)

The JWT is stored in an httpOnly cookie named `access_token`. This cookie is:
- Never readable by JavaScript (httpOnly)
- Sent automatically by the browser on all same-origin requests
- Configurable for Secure (HTTPS) and SameSite via env vars

## Data directory strategy

```
data/
└── fileshare/
    ├── uploads/        # uploaded files (never in git)
    └── fileshare.db    # SQLite (never in git)
```

Runtime data is completely outside the source tree. This means:
- `git pull` never overwrites data
- Backup is just `rsync data/` to safe location
- Easy to move to external storage later
