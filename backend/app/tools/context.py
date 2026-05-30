from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from fastapi import Request

    from app.parser.sysmon_parser import SysMonParser
    from app.serial.serial_worker import SerialWorker
    from app.services.analyzer_service import AnalyzerService
    from app.services.version_service import VersionService


@dataclass
class AppContext:
    serial_worker: "SerialWorker"
    analyzer_service: "AnalyzerService"
    version_service: "VersionService"
    parser: "SysMonParser"

    @classmethod
    def from_request(cls, request: "Request") -> "AppContext":
        s = request.app.state
        return cls(
            serial_worker=s.serial_worker,
            analyzer_service=s.analyzer_service,
            version_service=s.version_service,
            parser=s.parser,
        )

    @classmethod
    def from_state(cls, state: Any) -> "AppContext":
        return cls(
            serial_worker=state.serial_worker,
            analyzer_service=state.analyzer_service,
            version_service=state.version_service,
            parser=state.parser,
        )
