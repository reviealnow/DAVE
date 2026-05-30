#!/usr/bin/env bash
# start_lan.sh — Build frontend and serve DAVE on the local LAN
# Usage: ./scripts/start_lan.sh [port]
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$REPO_ROOT/.venv"
BACKEND="$REPO_ROOT/backend"
FRONTEND="$REPO_ROOT/frontend"
DATA="$REPO_ROOT/data/fileshare"
PORT=${1:-8765}

echo "=== DAVE — LAN Server Startup ==="
echo "Repo root : $REPO_ROOT"

# 1. Data directories
mkdir -p "$DATA/uploads"
echo "[OK] Data directories ready"

# 2. Python venv
if [ ! -f "$VENV/bin/python" ]; then
  echo "[..] Creating Python venv..."
  python3 -m venv "$VENV"
fi
source "$VENV/bin/activate"
echo "[OK] venv: $(python --version)"

# 3. Python dependencies
pip install -q -r "$BACKEND/requirements.txt"
echo "[OK] Python dependencies installed"

# 4. Build frontend
echo "[..] Building frontend..."
cd "$FRONTEND"
npm install --silent
npm run build --silent
cd "$REPO_ROOT"
echo "[OK] Frontend built → frontend/dist/"

# 5. .env / secret key
ENV_FILE="$REPO_ROOT/.env"
if [ ! -f "$ENV_FILE" ]; then
  SECRET=$(python -c "import secrets; print(secrets.token_hex(32))")
  echo "AUTH_SECRET_KEY=$SECRET" > "$ENV_FILE"
  echo "[OK] Generated .env with AUTH_SECRET_KEY"
fi
set -o allexport; source "$ENV_FILE"; set +o allexport

# 6. Detect LAN IP (macOS: en0/en1, Linux fallback)
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null \
  || ipconfig getifaddr en1 2>/dev/null \
  || hostname -I 2>/dev/null | awk '{print $1}' \
  || echo "<your-lan-ip>")

echo ""
echo "┌─────────────────────────────────────────┐"
echo "│  DAVE is ready — share these URLs       │"
echo "├─────────────────────────────────────────┤"
printf "│  Dashboard  : http://%-20s│\n" "${LAN_IP}:${PORT}/"
printf "│  File Share : http://%-20s│\n" "${LAN_IP}:${PORT}/fileshare"
printf "│  Health     : http://%-20s│\n" "${LAN_IP}:${PORT}/health"
echo "└─────────────────────────────────────────┘"
echo ""
echo "  (Press Ctrl+C to stop)"
echo ""

# 7. Start backend (serves built frontend as static files)
export APP_MODE=server
export DAVE_ROOT="$REPO_ROOT"
export DAVE_DATA_DIR="$REPO_ROOT/data"

cd "$BACKEND"
exec python -m app.main --host 0.0.0.0 --port "$PORT"
