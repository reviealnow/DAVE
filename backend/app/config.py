import os
import secrets
from pathlib import Path

# ── Repository / runtime root ─────────────────────────────────────────────────
ROOT_DIR = Path(os.getenv("DAVE_ROOT", Path(__file__).resolve().parents[2]))
DATA_DIR = Path(os.getenv("DAVE_DATA_DIR", ROOT_DIR / "data"))

# ── DUT / serial / analyzer paths (preserved from DUT_browser) ────────────────
LOG_DIR = DATA_DIR / "logs"
SNAPSHOT_FILE = LOG_DIR / "snapshots.jsonl"
TOOLS_DIR = ROOT_DIR / "tools"
ANALYZER_SCRIPT = TOOLS_DIR / "analyzer3.py"
ANALYZER_OUTPUT_DIR = LOG_DIR / "analyzer_output"

# ── App mode ──────────────────────────────────────────────────────────────────
# desktop : Tauri window spawns this backend; listen on 127.0.0.1 only
# server  : LAN/Pi web service; listen on 0.0.0.0
APP_MODE = os.getenv("APP_MODE", "desktop")
APP_HOST = os.getenv("APP_HOST", "127.0.0.1" if APP_MODE == "desktop" else "0.0.0.0")
APP_PORT = int(os.getenv("APP_PORT", "8765"))

# ── Auth / JWT ────────────────────────────────────────────────────────────────
# WARNING: set AUTH_SECRET_KEY in env for production; default generates a
# random key each restart (all sessions invalidated on restart).
AUTH_SECRET_KEY = os.getenv("AUTH_SECRET_KEY", secrets.token_hex(32))
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))  # 8 h
SESSION_COOKIE_SECURE = os.getenv("SESSION_COOKIE_SECURE", "false").lower() in {"1", "true", "yes"}
SESSION_COOKIE_SAMESITE: str = os.getenv("SESSION_COOKIE_SAMESITE", "lax")

# ── Fileshare ─────────────────────────────────────────────────────────────────
_FS_BASE = DATA_DIR / "fileshare"
FILESHARE_DB_PATH = Path(os.getenv("FILESHARE_DB_PATH", _FS_BASE / "fileshare.db"))
FILESHARE_UPLOAD_DIR = Path(os.getenv("FILESHARE_UPLOAD_DIR", _FS_BASE / "uploads"))
FILESHARE_MAX_UPLOAD_MB = int(os.getenv("FILESHARE_MAX_UPLOAD_MB", "50"))

FILESHARE_ALLOWED_EXTENSIONS: frozenset[str] = frozenset({
    "csv", "gif", "jpeg", "jpg", "json", "log", "pcap", "pcapng",
    "pdf", "png", "txt", "zip", "tar", "gz", "bin", "img", "md",
    "xlsx", "docx", "pptx", "html", "xml",
})

ARTIFACT_TYPES: frozenset[str] = frozenset({
    "general",
    "raw_log",
    "analyzer_report",
    "pcap",
    "pcapng",
    "firmware",
    "test_plan",
    "screenshot",
    "customer_evidence",
    "regression_bundle",
    "config_backup",
    "other",
})
