# Scaling Notes

## Current MVP performance model

| Component | MVP choice | Reason |
|---|---|---|
| Host | Raspberry Pi 4 / local server | Lab-first deployment |
| Backend workers | 1 (single uvicorn process) | Simplicity, SQLite WAL OK for few users |
| Database | SQLite with WAL mode | Zero-config, sufficient for <50 concurrent users |
| File storage | Local disk (`data/fileshare/uploads/`) | No external dependency |
| Real-time DUT data | WebSocket push (existing) | Already correct architecture |
| Auth | JWT in httpOnly cookie | Stateless, no Redis needed for MVP |

## Why 10,000 REST API calls/sec is the wrong target for DUT monitoring

The DUT dashboard updates CPU, memory, and Wi-Fi client data in real time.

If this were implemented as REST polling:
- 1 browser tab × 3 panels × 1 poll/second = **3 req/s per user**
- 10 lab engineers = **30 req/s** minimum
- With 100ms polling: **300 req/s** just for live data

This is unnecessary load. The system already uses the correct architecture:
- Serial data → parser → WebSocket broadcast to all connected tabs
- Each DUT event is pushed once, received by all subscribers
- No polling amplification

**Rule**: High-frequency live DUT data must use WebSocket push. REST is for:
- Control actions (open/close serial, send command)
- Login/logout/register
- File upload/download
- Historical queries (snapshot list)
- Initial state snapshot on page load

## Data flow summary

```
DUT serial port
    ↓ (SerialWorker thread)
SysMonParser
    ↓ (on_event callback)
WebSocketManager.emit_from_thread()
    ↓ (asyncio broadcast)
All connected browser tabs (WebSocket)
    ↓ (React state update)
CpuChart / MemoryChart / ClientsPanel (re-render at ~1 Hz)
```

REST APIs used for: open/close serial, download log, list snapshots, auth, fileshare CRUD.

## Scaling path from Raspberry Pi to production

### Stage 1: Pi (current)
- SQLite WAL + single uvicorn worker
- 5–20 concurrent users, <5 DUT sessions
- Works fine

### Stage 2: Linux server (50–200 users)
```bash
# Multiple uvicorn workers
uvicorn app.main:app --workers 4 --host 0.0.0.0 --port 8765
```
Limitation: SQLite is single-writer. Safe for read-heavy workloads.

### Stage 3: PostgreSQL migration
Replace SQLite with PostgreSQL:
1. Change `FILESHARE_DB_PATH` to a PostgreSQL DSN via env var
2. Swap `sqlite3` calls in `app/db/database.py` for `asyncpg` or `psycopg3`
3. Run migration script: `app/db/migrations.py` → Alembic
4. SQLite data can be exported via `sqlite3 ... .dump` and imported

### Stage 4: Redis for session / pub-sub
When running multiple workers:
- JWT is already stateless — no Redis needed for auth
- Redis becomes useful for: rate limiting, cross-worker WebSocket pub-sub (if needed), background job queues

### Stage 5: Object storage for large files
When uploads grow beyond local disk:
- Add `FILESHARE_STORAGE_BACKEND=s3` env var
- `fileshare_service.py` → add storage abstraction layer
- Upload to S3/MinIO, store object key in DB instead of local path
- Generate pre-signed download URLs

### Stage 6: Nginx / Caddy + HTTPS
```
Browser → Caddy (TLS) → uvicorn (backend + SPA)
```
Set `SESSION_COOKIE_SECURE=true` when behind HTTPS.

## Load testing plan

When ready to performance-test:

```bash
# Install k6
brew install k6

# Test fileshare upload endpoint
k6 run scripts/k6_upload.js

# Test WebSocket concurrent connections
k6 run --vus 50 --duration 30s scripts/k6_websocket.js
```

Target metrics:
| Metric | Raspberry Pi target | Server target |
|---|---|---|
| REST p95 latency | < 200 ms | < 50 ms |
| Error rate | < 0.1% | < 0.01% |
| Concurrent WS clients | 5 | 100+ |
| Upload throughput | 10 MB/s | 100 MB/s |
| Peak RSS | < 400 MB | < 1 GB |

## Frontend performance

Current patterns to maintain:
- Console lines: batched via `console_line_batch`, capped at 1000 lines in state
- CPU/memory history: `slice(-60)` — rolling 60-point window
- Port scanning: 3-second interval with in-flight guard (`rescanInFlightRef`)
- WebSocket: single connection per browser tab, not per component

Patterns to avoid:
- `setInterval` polling for DUT state (use WebSocket)
- Fetching file list on every render (fetch once, update via optimistic UI)
- Large snapshot replays without throttling
