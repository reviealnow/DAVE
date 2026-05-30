from __future__ import annotations

import os
import json
from functools import lru_cache
from pathlib import Path


ROOT_DIR = Path(os.getenv("DUT_BROWSER_ROOT", Path(__file__).resolve().parents[3]))
VERSION_FILE = ROOT_DIR / "VERSION"
RELEASE_CONFIG_FILE = ROOT_DIR / "release.json"


@lru_cache(maxsize=1)
def read_version() -> str:
    return VERSION_FILE.read_text(encoding="utf-8").strip()


@lru_cache(maxsize=1)
def read_release_config() -> dict[str, str]:
    data = json.loads(RELEASE_CONFIG_FILE.read_text(encoding="utf-8"))
    return {str(key): str(value) for key, value in data.items()}
