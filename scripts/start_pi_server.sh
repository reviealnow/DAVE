#!/usr/bin/env bash
# start_pi_server.sh — Raspberry Pi / LAN server one-command startup
# Usage: ./scripts/start_pi_server.sh
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$REPO_ROOT/.venv"
BACKEND="$REPO_ROOT/backend"
DATA="$REPO_ROOT/data/fileshare"

echo "=== DAVE — Server Startup ==="
echo "Repo root : $REPO_ROOT"
echo "Data dir  : $DATA"

# 1. Create data directories
mkdir -p "$DATA/uploads"
echo "[OK] Data directories ready"

# 2. Create / activate venv if missing
if [ ! -f "$VENV/bin/python" ]; then
  echo "[..] Creating Python venv..."
  python3 -m venv "$VENV"
fi
source "$VENV/bin/activate"
echo "[OK] venv active: $(python --version)"

# 3. Install / update dependencies
pip install -q -r "$BACKEND/requirements.txt"
echo "[OK] Dependencies installed"

# 4. Detect local IP
PI_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$PI_IP" ]; then
  PI_IP="<your-pi-ip>"
fi

# 5. Generate a secret key if not already set in .env
ENV_FILE="$REPO_ROOT/.env"
if [ ! -f "$ENV_FILE" ]; then
  SECRET=$(python -c "import secrets; print(secrets.token_hex(32))")
  echo "AUTH_SECRET_KEY=$SECRET" > "$ENV_FILE"
  echo "[OK] Generated .env with AUTH_SECRET_KEY"
fi
set -o allexport; source "$ENV_FILE"; set +o allexport

# 6. Start backend
export APP_MODE=server
export APP_HOST=0.0.0.0
export APP_PORT=${APP_PORT:-8765}
export DAVE_ROOT="$REPO_ROOT"
export DAVE_DATA_DIR="$REPO_ROOT/data"

echo ""
echo "=== Starting backend on 0.0.0.0:$APP_PORT ==="
echo ""
echo "  Dashboard  : http://${PI_IP}:${APP_PORT}/"
echo "  File Share : http://${PI_IP}:${APP_PORT}/fileshare"
echo "  Health     : http://${PI_IP}:${APP_PORT}/health"
echo ""
echo "  (Press Ctrl+C to stop)"
echo ""

cd "$BACKEND"
exec python -m app.main --host 0.0.0.0 --port "$APP_PORT"
