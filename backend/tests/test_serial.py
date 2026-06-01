from __future__ import annotations

import sys

import pytest
from fastapi.testclient import TestClient


def _build_snapshot(test_count: int, ts: str, spike: bool) -> str:
    usr = "60.0" if spike else "10.0"
    lines = [
        f"= Test Time: {test_count}, {ts}",
        f"CPU0:  {usr}% usr   5.0% sys   0.0% nic  80.0% idle   0.0% io   1.0% irq   1.0%% sirq",
        "CPU1:   8.0% usr   4.0% sys   0.0% nic  85.0% idle   0.0% io   1.0% irq   1.0%% sirq",
        "MemAvailable:   500000 kB",
        "Slab:   100000 kB",
        "SUnreclaim:   50000 kB",
    ]
    return "\n".join(lines)


def _synthetic_log() -> str:
    blocks = [
        "Mem: running top to capture per-core usage",
        _build_snapshot(1, "2025-01-01 00:00:01", spike=False),
        _build_snapshot(2, "2025-01-01 00:00:02", spike=True),
        _build_snapshot(3, "2025-01-01 00:00:03", spike=False),
        "[  120.5] kernel panic - not syncing: Fatal exception",
    ]
    return "\n".join(blocks) + "\n"


@pytest.fixture()
def serial_client(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    (data_dir / "logs").mkdir(parents=True)
    monkeypatch.setenv("DAVE_DATA_DIR", str(data_dir))
    monkeypatch.setenv("APP_MODE", "server")
    monkeypatch.setenv("AUTH_SECRET_KEY", "test-secret-serial")

    # Force a clean re-import so serial_api re-binds LOG_DIR to the tmp data dir.
    for name in list(sys.modules):
        if name == "app" or name.startswith("app."):
            del sys.modules[name]

    import app.config as cfg  # noqa: F401  (import triggers fresh config load)
    from app.main import app

    log_dir = data_dir / "logs"
    with TestClient(app) as c:
        yield c, log_dir

    for name in list(sys.modules):
        if name == "app" or name.startswith("app."):
            del sys.modules[name]


def test_analysis_full_log(serial_client):
    client, log_dir = serial_client
    (log_dir / "dut.log").write_text(_synthetic_log(), encoding="utf-8")

    res = client.get("/api/serial/logs/dut.log/analysis")
    assert res.status_code == 200, res.text
    body = res.json()

    assert body["analyzed"] is True
    assert body["file_name"] == "dut.log"
    assert len(body["cpu"]) > 0
    assert len(body["memory"]) > 0
    assert "Spike" in body["spike_report"] or "spike" in body["spike_report"].lower()

    severities = {e.get("severity") for e in body["events"]}
    assert "critical" in severities
    assert any("kernel_panic" in e.get("matched_keywords", []) for e in body["events"])


def test_analysis_short_log_not_analyzed(serial_client):
    client, log_dir = serial_client
    (log_dir / "short.log").write_text("just one boring line\n", encoding="utf-8")

    res = client.get("/api/serial/logs/short.log/analysis")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["analyzed"] is False


def test_analysis_missing_file_404(serial_client):
    client, _ = serial_client
    res = client.get("/api/serial/logs/nope.log/analysis")
    assert res.status_code == 404
