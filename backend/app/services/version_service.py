from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.versioning import read_release_config, read_version


@dataclass
class CachedUpdateResult:
    payload: dict
    expires_at: datetime


class VersionService:
    def __init__(self) -> None:
        self._cache: CachedUpdateResult | None = None

    def get_metadata(self) -> dict:
        config = read_release_config()
        return {
          "product_name": config["product_name"],
          "current_version": read_version(),
          "repository": os.getenv("DUT_GITHUB_REPOSITORY", config["github_repository"]),
          "releases_page": config["releases_page"],
        }

    def check_for_updates(self, force: bool = False) -> dict:
        now = datetime.now(timezone.utc)
        if not force and self._cache and self._cache.expires_at > now:
            return self._cache.payload

        payload = self._build_update_payload(now)
        self._cache = CachedUpdateResult(payload=payload, expires_at=now + timedelta(minutes=10))
        return payload

    def _build_update_payload(self, checked_at: datetime) -> dict:
        current_version = read_version()
        config = read_release_config()
        repository = os.getenv("DUT_GITHUB_REPOSITORY", config["github_repository"])

        try:
            latest_version, source = self._fetch_latest_version(repository)
            update_available = self._is_remote_newer(current_version, latest_version)
            if update_available:
                message = f"New version available: {latest_version}"
            else:
                message = f"You are running the latest version: {current_version}"
            return {
                "ok": True,
                "current_version": current_version,
                "latest_version": latest_version,
                "update_available": update_available,
                "message": message,
                "source": source,
                "repository": repository,
                "checked_at": checked_at.isoformat(),
                "releases_page": config["releases_page"],
            }
        except Exception as exc:
            return {
                "ok": False,
                "current_version": current_version,
                "latest_version": current_version,
                "update_available": False,
                "message": f"Version check failed: {exc}",
                "source": "error",
                "repository": repository,
                "checked_at": checked_at.isoformat(),
                "releases_page": config["releases_page"],
            }

    def _fetch_latest_version(self, repository: str) -> tuple[str, str]:
        config = read_release_config()
        latest_release_url = f"https://api.github.com/repos/{repository}/releases/latest"
        tags_url = f"https://api.github.com/repos/{repository}/tags"

        try:
            release_data = self._get_json(latest_release_url)
            tag_name = str(release_data.get("tag_name", "")).strip()
            if tag_name:
                return self._normalize_version(tag_name), "release"
        except HTTPError as exc:
            if exc.code not in {403, 404}:
                raise RuntimeError(f"GitHub release lookup failed with HTTP {exc.code}") from exc
        except URLError as exc:
            raise RuntimeError(f"GitHub release lookup failed: {exc.reason}") from exc

        try:
            tag_data = self._get_json(tags_url)
            if isinstance(tag_data, list) and tag_data:
                first_tag = str(tag_data[0].get("name", "")).strip()
                if first_tag:
                    return self._normalize_version(first_tag), "tag"
        except HTTPError as exc:
            raise RuntimeError(f"GitHub tag lookup failed with HTTP {exc.code}") from exc
        except URLError as exc:
            raise RuntimeError(f"GitHub tag lookup failed: {exc.reason}") from exc

        raise RuntimeError(f"No releases or tags found for {config['product_name']}")

    def _get_json(self, url: str) -> dict | list:
        request = Request(
            url,
            headers={
                "Accept": "application/vnd.github+json",
                "User-Agent": "dut-browser-version-checker",
            },
        )
        with urlopen(request, timeout=5) as response:
            return json.loads(response.read().decode("utf-8"))

    def _normalize_version(self, version: str) -> str:
        return version if version.startswith("v") else f"v{version}"

    def _is_remote_newer(self, current_version: str, latest_version: str) -> bool:
        current_parts = self._parse_version(current_version)
        latest_parts = self._parse_version(latest_version)
        return latest_parts > current_parts

    def _parse_version(self, version: str) -> tuple[int, int, int]:
        normalized = version[1:] if version.startswith("v") else version
        parts = normalized.split(".", 2)
        try:
            major = int(parts[0]) if len(parts) > 0 else 0
            minor = int(parts[1]) if len(parts) > 1 else 0
            patch = int(parts[2].split("-")[0].split("+")[0]) if len(parts) > 2 else 0
            return major, minor, patch
        except (ValueError, IndexError):
            return (0, 0, 0)
