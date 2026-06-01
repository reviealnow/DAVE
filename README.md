# DAVE — Lab Portal

DAVE is a self-hosted lab portal that combines a **DUT (Device-Under-Test) dashboard**
with a **lab file-sharing** module behind a single login. It runs as a LAN/Raspberry Pi
web service **or** as a native desktop app (Tauri).

- **DUT Dashboard** — live serial/SysMon telemetry (CPU, memory, Wi-Fi clients),
  console, snapshot replay, and in-app log analysis.
- **File Share** — upload/download lab artifacts (logs, pcaps, firmware, reports)
  with per-file visibility, SHA-256 checksums, artifact typing, and an audit log.
- **One backend, one port, one login** — FastAPI + SQLite serving a React (Vite) frontend.

| | |
|---|---|
| Backend | FastAPI · SQLite · Python 3.11+ |
| Frontend | React 18 · Vite · TypeScript |
| Desktop | Tauri v1 (Rust) |
| Repository | https://github.com/reviealnow/DAVE |

---

## Architecture at a glance

```
                 ┌──────────────────────────────┐
                 │  React frontend (Vite build)  │
                 └──────────────┬────────────────┘
                                │  /api  /ws  /health
                 ┌──────────────▼────────────────┐
                 │  FastAPI backend  :8765        │
                 │  auth · fileshare · serial ·   │
                 │  analyzer · snapshot · app     │
                 └──────────────┬────────────────┘
                                │
                     data/fileshare/fileshare.db  (users + files + audit)
```

The backend runs in one of two modes, selected by the `APP_MODE` env var:

| `APP_MODE` | Host | Frontend served by | Use case |
|---|---|---|---|
| `server` | `0.0.0.0` | **Backend** (`StaticFiles` → `frontend/dist`) | LAN / Raspberry Pi web service |
| `desktop` | `127.0.0.1` | **Tauri** (bundles its own `frontend/dist`) | Native desktop app |

In `desktop` mode the backend is API-only; the Tauri webview detects
`window.__TAURI__` and points all API calls at `http://127.0.0.1:8765`
(see [`frontend/src/api/runtime.ts`](frontend/src/api/runtime.ts)).

---

## Prerequisites

- **Python 3.11+**
- **Node.js 18+** and npm
- For the desktop build only: **Rust** (`rustup`) and the
  [Tauri v1 system prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites)
  (WebView2 on Windows, WebKitGTK on Linux; nothing extra on macOS).

---

## Option A — Run as a LAN / server (recommended for shared labs)

One command builds the frontend, sets up the venv, and serves everything on your LAN:

```bash
git clone https://github.com/reviealnow/DAVE.git
cd DAVE
./scripts/start_lan.sh          # builds frontend, serves on 0.0.0.0:8765
```

Then open `http://<your-lan-ip>:8765/` from any device on the network.

For a headless Raspberry Pi, use `./scripts/start_pi_server.sh` — see
[`docs/DEPLOYMENT_PI.md`](docs/DEPLOYMENT_PI.md) for details (autostart, custom port, etc.).

### First login

There is no default account. Open the app, go to the login page, and **register**
the first user — they're created immediately and logged in. The baseline shipped
database holds a small set of seed users/files for testing only.

---

## Option B — Run as a desktop app (Tauri)

The desktop shell lives in [`desktop/`](desktop/). It hosts the same React frontend
in a native window and **bundles the FastAPI backend as a sidecar** — the shell
spawns it on launch (`127.0.0.1:8765`) and kills it on exit, so the app is fully
self-contained with no manual backend start. Writable data (DB, uploads, logs,
`.env`) lives in the OS app-data dir (e.g. `~/Library/Application Support/DAVE`),
passed to the backend via `DAVE_DATA_DIR`.

### Build the backend sidecar

The sidecar is a [PyInstaller](https://pyinstaller.org/) single-file binary built
from [`backend/dave-backend.spec`](backend/dave-backend.spec). It is **not** checked
into git (it's large; gitignored) — build it before building/running the desktop app:

```bash
# from the repo root, in the project venv
.venv/bin/pip install -r backend/requirements-desktop.txt   # first time only
.venv/bin/pyinstaller backend/dave-backend.spec --noconfirm \
    --distpath build/dist --workpath build/work

# place it where Tauri expects it (name must end with the Rust target triple)
mkdir -p desktop/src-tauri/binaries
cp build/dist/dave-backend \
   desktop/src-tauri/binaries/dave-backend-$(rustc -Vv | sed -n 's/host: //p')
```

The frozen binary is multi-mode: it runs the server by default and re-enters itself
in `--run-tool` mode to run the bundled `analyzer3.py` / `log_event_detector.py`
(since there is no separate Python interpreter in a packaged app — see
[`backend/desktop_backend.py`](backend/desktop_backend.py) and
`app.config.python_tool_argv`).

### Develop / run

```bash
cd desktop
npm install        # first time only — installs the Tauri CLI
npm run dev        # = tauri dev (auto-starts the Vite dev server + spawns the sidecar)
```

A native **DAVE** window opens and the bundled backend starts automatically.
If you haven't built the sidecar yet, the shell logs a warning and falls back to a
backend you run manually:

```bash
cd backend && APP_MODE=desktop ../.venv/bin/python -m app.main   # 127.0.0.1:8765
```

### Build a distributable

```bash
cd desktop
npm run build      # = tauri build → .app / .dmg (macOS), .msi (Windows), .deb/.AppImage (Linux)
```

Output lands in `desktop/src-tauri/target/release/bundle/`. The backend sidecar is
bundled in, so the resulting app needs no separate backend.

### Regenerating app icons

Icons in `desktop/src-tauri/icons/` are generated from
[`frontend/public/favicon.svg`](frontend/public/favicon.svg):

```bash
cd desktop
# render the SVG to a 1024×1024 PNG, then generate the icon set
qlmanage -t -s 1024 -o /tmp ../frontend/public/favicon.svg   # macOS; or use any SVG→PNG tool
npm run icon -- /tmp/favicon.svg.png
```

---

## Development (frontend + backend, browser)

```bash
# Backend (auto-reload)
cd backend && ../.venv/bin/python -m app.main --reload

# Frontend (Vite dev server with /api + /ws proxy to :8765)
cd frontend && npm install && npm run dev      # http://127.0.0.1:5173
```

Run the backend test suite:

```bash
.venv/bin/python -m pytest backend/tests -q
```

---

## Configuration

Settings come from environment variables (or a `.env` file at the repo root, which is
auto-created on first run with a generated `AUTH_SECRET_KEY`). See
[`.env.example`](.env.example) for the full list. Common ones:

| Variable | Default | Notes |
|---|---|---|
| `APP_MODE` | `desktop` | `server` for LAN, `desktop` for local-only |
| `APP_HOST` | mode-dependent | `0.0.0.0` (server) / `127.0.0.1` (desktop) |
| `APP_PORT` | `8765` | Backend listen port |
| `AUTH_SECRET_KEY` | auto-generated | JWT signing key — keep stable across restarts |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `480` | Session lifetime (8 h) |
| `SESSION_COOKIE_SECURE` | `false` | Set `true` behind HTTPS |
| `FILESHARE_MAX_UPLOAD_MB` | `50` | Max upload size |

---

## Updates

DAVE checks GitHub Releases for newer versions. The dashboard shows an
**update banner** (`/api/app/update-check`) comparing the local `VERSION` file
against the latest release/tag in
[`reviealnow/DAVE`](https://github.com/reviealnow/DAVE/releases). There is no
auto-installer — when an update is available the banner links to the Releases page,
where you can pull the new version (`git pull` for server mode, or download the new
desktop build).

---

## Project layout

```
DAVE/
├── backend/          FastAPI app (app/), tests, requirements.txt
├── frontend/         React + Vite app (src/), build output → dist/
├── desktop/          Tauri v1 shell (src-tauri/)
├── scripts/          start_lan.sh, start_pi_server.sh
├── tools/            analyzer3.py, log_event_detector.py
├── docs/             deployment, module, scaling, integration notes
├── data/             runtime DB + uploaded files (gitignored)
└── VERSION           current product version
```

---

## Roadmap

- **Desktop CI packaging:** build the sidecar + signed `.dmg`/`.msi`/`.AppImage` in CI
  per platform (each needs its own native PyInstaller build) and attach to GitHub Releases.
- **Backend readiness gate:** brief splash/retry in the shell while the sidecar boots,
  so the first frame never shows a transient connection error.
- **Open Releases in system browser:** wire the `UpdateChecker` link through the Tauri
  `shell.open` API (allowlist already enabled).

## License

Internal lab tooling — see repository for terms.
