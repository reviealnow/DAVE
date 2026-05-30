from pydantic import BaseModel, Field


class SnapshotModel(BaseModel):
    """Milestone 0 snapshot placeholder."""

    test_count: int | None = None
    device_ts: str | None = None
    cpu: dict = Field(default_factory=dict)
    memory: dict = Field(default_factory=dict)
    wifi_clients: dict = Field(default_factory=dict)
