import os
import secrets
import sys
from pathlib import Path

from dotenv import load_dotenv

# ── Frozen (PyInstaller desktop sidecar) awareness ────────────────────────────
# In a packaged desktop build the backend runs as a PyInstaller binary spawned
# by the Tauri shell — there is no source tree on disk, so paths cannot be
# derived from this file's location. Two roots matter:
#   • RESOURCE_ROOT — read-only bundled files (VERSION, release.json, tools/).
#                     PyInstaller extracts these under sys._MEIPASS.
#   • DATA_DIR      — writable runtime data (DB, uploads, logs, .env). The Tauri
#                     shell passes DAVE_DATA_DIR pointing at the OS app-data dir.
# In a normal source/server install both collapse back to the repo, so behaviour
# is unchanged.
_FROZEN = bool(getattr(sys, "frozen", False))

# config.py lives at Dave/backend/app/config.py → parents[2] = Dave/
_SOURCE_ROOT = Path(__file__).resolve().parents[2]

if _FROZEN:
    RESOURCE_ROOT = Path(getattr(sys, "_MEIPASS", Path(sys.executable).resolve().parent))
else:
    RESOURCE_ROOT = _SOURCE_ROOT


def _default_data_dir() -> Path:
    """Writable data dir when DAVE_DATA_DIR is not set."""
    if not _FROZEN:
        return _SOURCE_ROOT / "data"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "DAVE"
    if os.name == "nt":
        base = os.getenv("APPDATA") or str(Path.home() / "AppData" / "Roaming")
        return Path(base) / "DAVE"
    base = os.getenv("XDG_DATA_HOME") or str(Path.home() / ".local" / "share")
    return Path(base) / "DAVE"


# ── Repository / runtime roots ────────────────────────────────────────────────
ROOT_DIR = Path(os.getenv("DAVE_ROOT", RESOURCE_ROOT))
DATA_DIR = Path(os.getenv("DAVE_DATA_DIR", _default_data_dir()))

# ── .env location ─────────────────────────────────────────────────────────────
# Source/dev/server: repo root (existing behaviour). Frozen desktop: the writable
# data dir, since the app bundle is read-only.
_ENV_FILE = (DATA_DIR / ".env") if _FROZEN else (_SOURCE_ROOT / ".env")

# Load .env first so all os.getenv() calls below pick it up
load_dotenv(_ENV_FILE)

# ── Ensure a stable AUTH_SECRET_KEY exists ────────────────────────────────────
# If not set via environment or .env, generate one and persist it to .env.
# This runs once on first startup; subsequent restarts read the same key.
if not os.getenv("AUTH_SECRET_KEY"):
    _ENV_FILE.parent.mkdir(parents=True, exist_ok=True)
    _new_key = secrets.token_hex(32)
    with _ENV_FILE.open("a", encoding="utf-8") as _fh:
        _fh.write(f"AUTH_SECRET_KEY={_new_key}\n")
    os.environ["AUTH_SECRET_KEY"] = _new_key
    # Reload so the rest of this module sees the new value
    load_dotenv(_ENV_FILE, override=True)
    print(f"[dave] Generated stable AUTH_SECRET_KEY → {_ENV_FILE}")

# ── DUT / serial / analyzer paths (preserved from DUT_browser) ────────────────
LOG_DIR = DATA_DIR / "logs"
SNAPSHOT_FILE = LOG_DIR / "snapshots.jsonl"
TOOLS_DIR = RESOURCE_ROOT / "tools"
ANALYZER_SCRIPT = TOOLS_DIR / "analyzer3.py"
EVENT_DETECTOR_SCRIPT = TOOLS_DIR / "log_event_detector.py"
ANALYZER_OUTPUT_DIR = LOG_DIR / "analyzer_output"


def python_tool_argv(script: "str | os.PathLike[str]") -> list[str]:
    """Command prefix to run a bundled Python tool script as a subprocess.

    Normal install → [python, script]. In a frozen PyInstaller build,
    sys.executable is the backend binary itself (not a Python interpreter), so we
    re-enter it in "--run-tool" mode, which runpy-executes the script (see
    backend/desktop_backend.py). Append any tool args after this prefix.
    """
    if _FROZEN:
        return [sys.executable, "--run-tool", str(script)]
    return [sys.executable, str(script)]

# ── App mode ──────────────────────────────────────────────────────────────────
# desktop : Tauri window spawns this backend; listen on 127.0.0.1 only
# server  : LAN/Pi web service; listen on 0.0.0.0
APP_MODE = os.getenv("APP_MODE", "desktop")
APP_HOST = os.getenv("APP_HOST", "127.0.0.1" if APP_MODE == "desktop" else "0.0.0.0")
APP_PORT = int(os.getenv("APP_PORT", "8765"))

# ── Auth / JWT ────────────────────────────────────────────────────────────────
AUTH_SECRET_KEY = os.environ["AUTH_SECRET_KEY"]  # guaranteed set above
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
