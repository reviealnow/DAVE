# Deployment on Raspberry Pi / LAN Server

## Quick start (one command)

```bash
cd /home/pi/Dave
./scripts/start_pi_server.sh
```

This script:
1. Creates `data/fileshare/uploads/` if missing
2. Creates / activates Python venv
3. Installs dependencies from `requirements.txt`
4. Generates a random `AUTH_SECRET_KEY` in `.env` (first run only)
5. Starts backend on `0.0.0.0:8765`
6. Prints access URLs

## First-time setup

```bash
# Clone repo
git clone https://github.com/reviealnow/Dave.git
cd Dave

# Optional: set custom port or upload path
echo "APP_PORT=8765" >> .env
echo "FILESHARE_MAX_UPLOAD_MB=200" >> .env

# Start
./scripts/start_pi_server.sh
```

Then open `http://<pi-ip>:8765/` in any browser on your LAN.

## Serve built React frontend (recommended for production)

In dev mode the Vite dev server is not running on the Pi, so serve the built frontend:

```bash
# On your dev machine
cd frontend
npm install
npm run build:web

# Copy dist/ to Pi (or build on Pi)
rsync -av dist/ pi@<pi-ip>:/home/pi/Dave/frontend/dist/
```

When `APP_MODE=server` and `frontend/dist/` exists, FastAPI automatically serves the React SPA at `/`.

If `frontend/dist/` doesn't exist, the backend still works for API calls — just open the dev frontend separately.

## Environment variables (.env file)

```
APP_MODE=server
APP_HOST=0.0.0.0
APP_PORT=8765
AUTH_SECRET_KEY=<generated automatically>
SESSION_COOKIE_SECURE=false
SESSION_COOKIE_SAMESITE=lax
FILESHARE_DB_PATH=./data/fileshare/fileshare.db
FILESHARE_UPLOAD_DIR=./data/fileshare/uploads
FILESHARE_MAX_UPLOAD_MB=200
```

## Run as a systemd service (auto-start on boot)

```ini
# /etc/systemd/system/dave.service
[Unit]
Description=Dave Lab Portal
After=network.target

[Service]
User=pi
WorkingDirectory=/home/pi/Dave/backend
ExecStart=/home/pi/Dave/.venv/bin/python -m app.main --host 0.0.0.0 --port 8765
EnvironmentFile=/home/pi/Dave/.env
Environment=DAVE_ROOT=/home/pi/Dave
Environment=DAVE_DATA_DIR=/home/pi/Dave/data
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable dave
sudo systemctl start dave
sudo systemctl status dave
```

## Backup

```bash
# Backup everything (uploads + DB)
rsync -av /home/pi/Dave/data/ /backup/dave-data/
```

## Future: HTTPS with Caddy reverse proxy

```caddyfile
# /etc/caddy/Caddyfile
yourdomain.com {
    reverse_proxy localhost:8765
}
```

Caddy auto-provisions TLS certificates. Set `SESSION_COOKIE_SECURE=true` when behind HTTPS.
