from __future__ import annotations

import hashlib
import re
import time
import uuid
from pathlib import Path

_SAFE_PATTERN = re.compile(r"[^a-zA-Z0-9._-]")


def sanitize_display_name(name: str) -> str:
    name = Path(name).name
    return name[:255] if name else "unnamed"


def generate_stored_name(original: str) -> str:
    ext = Path(original).suffix.lower()
    ext = re.sub(r"[^a-z0-9.]", "", ext)[:10]
    uid = uuid.uuid4().hex
    ts = int(time.time() * 1000)
    return f"{ts}_{uid}{ext}"


def safe_extension(filename: str) -> str:
    return Path(filename).suffix.lstrip(".").lower()


def file_checksum(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()
