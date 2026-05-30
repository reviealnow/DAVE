import json
from pathlib import Path


class SnapshotStore:
    def __init__(self, file_path: Path) -> None:
        self.file_path = file_path
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        self.file_path.touch(exist_ok=True)

    def append(self, snapshot: dict) -> None:
        with self.file_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(snapshot, default=str) + "\n")
