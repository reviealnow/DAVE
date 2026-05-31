#!/usr/bin/env python3
"""Detect major abnormal events from text logs.

Behavior:
- Recursively scans log-like files from a root directory.
- Detects abnormal events by keyword rules.
- Captures context lines around each hit.
- Infers event metadata from nearby lines when possible.
- Merges duplicate/nearby hits likely belonging to the same event.
- Writes structured JSON with raw evidence.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Sequence


SEVERITY_RANK = {"critical": 3, "high": 2, "medium": 1}
DEFAULT_EXTENSIONS = {".log", ".txt", ".out", ".err", ".trace"}
SKIP_DIRS = {".git", ".venv", "node_modules", "__pycache__"}


@dataclass(frozen=True)
class KeywordRule:
    name: str
    pattern: re.Pattern[str]
    severity: str


KEYWORD_RULES: Sequence[KeywordRule] = [
    KeywordRule("q6_crash", re.compile(r"\bq6\s+crash\b", re.IGNORECASE), "critical"),
    KeywordRule("kernel_panic", re.compile(r"\bkernel\s+panic\b", re.IGNORECASE), "critical"),
    KeywordRule("watchdog", re.compile(r"\bwatchdog(?:\s+reset|\s+bite|\s+timeout)?\b", re.IGNORECASE), "critical"),
    KeywordRule("segmentation_fault", re.compile(r"\bsegmentation\s+fault\b", re.IGNORECASE), "high"),
    KeywordRule("fatal_error", re.compile(r"\bfatal\s+error\b", re.IGNORECASE), "high"),
    KeywordRule("assert", re.compile(r"\bassert(?:ion)?\b", re.IGNORECASE), "high"),
    KeywordRule("reboot", re.compile(r"\breboot(?:ing)?\b", re.IGNORECASE), "medium"),
    KeywordRule("restart", re.compile(r"\brestart(?:ed|ing)?\b", re.IGNORECASE), "medium"),
    KeywordRule("panic", re.compile(r"\bpanic\b", re.IGNORECASE), "medium"),
    KeywordRule("call_trace", re.compile(r"\bcall\s+trace\b", re.IGNORECASE), "medium"),
    KeywordRule("stack_trace", re.compile(r"\bstack\s+trace\b", re.IGNORECASE), "medium"),
    KeywordRule("crash", re.compile(r"\bcrash(?:ed|ing)?\b", re.IGNORECASE), "medium"),
]

DATETIME_PATTERNS = [
    re.compile(r"\b\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?\b"),
    re.compile(r"\b\d{2}/\d{2}/\d{4}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?\b"),
    re.compile(r"\b\d{2}:\d{2}:\d{2}(?:[.,]\d+)?\b"),
    re.compile(r"\[(\d+\.\d+)\]"),
]

PROCESS_PATTERNS = [
    re.compile(r"\bpid[:=]\s*\d+\s+comm[:=]\s*([\w./-]+)", re.IGNORECASE),
    re.compile(r"\bcomm[:=]\s*([\w./-]+)", re.IGNORECASE),
    re.compile(r"\b(?:process|task)\s+([\w./-]+)", re.IGNORECASE),
    re.compile(r"\b([\w./-]+)\[(\d+)\]"),
    re.compile(r"^([\w./-]+):"),
]

ACTIVITY_HINT_PATTERN = re.compile(
    r"\b(while|during|running|starting|stopping|processing|handling|executing|loading|initializing|connecting|updating|scanning)\b",
    re.IGNORECASE,
)
TRIGGER_HINT_PATTERN = re.compile(
    r"\b(because|due\s+to|caused\s+by|after|triggered\s+by|failed|failure|timeout|oom|out\s+of\s+memory|null\s+pointer|deadlock)\b",
    re.IGNORECASE,
)


@dataclass
class Hit:
    file_path: str
    line_index: int
    line_text: str
    rule_name: str
    severity: str


@dataclass
class MergedEvent:
    file_path: str
    start_index: int
    end_index: int
    hit_line_indices: list[int]
    keywords: set[str]
    severity: str


def collect_log_files(root: Path, extensions: set[str]) -> list[Path]:
    collected: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for filename in filenames:
            if filename.startswith("."):
                continue
            p = Path(dirpath) / filename
            if p.suffix.lower() in extensions or "log" in filename.lower():
                collected.append(p)
    return sorted(collected)


def read_lines(path: Path) -> list[str]:
    with path.open("r", encoding="utf-8", errors="ignore") as f:
        return [line.rstrip("\n") for line in f]


def detect_hits(file_path: str, lines: Sequence[str]) -> list[Hit]:
    hits: list[Hit] = []
    for idx, line in enumerate(lines):
        for rule in KEYWORD_RULES:
            if rule.pattern.search(line):
                hits.append(
                    Hit(
                        file_path=file_path,
                        line_index=idx,
                        line_text=line,
                        rule_name=rule.name,
                        severity=rule.severity,
                    )
                )
    return hits


def choose_severity(a: str, b: str) -> str:
    return a if SEVERITY_RANK[a] >= SEVERITY_RANK[b] else b


def merge_hits(hits: Iterable[Hit], merge_distance: int) -> list[MergedEvent]:
    sorted_hits = sorted(hits, key=lambda h: (h.file_path, h.line_index))
    merged: list[MergedEvent] = []

    for hit in sorted_hits:
        if not merged:
            merged.append(
                MergedEvent(
                    file_path=hit.file_path,
                    start_index=hit.line_index,
                    end_index=hit.line_index,
                    hit_line_indices=[hit.line_index],
                    keywords={hit.rule_name},
                    severity=hit.severity,
                )
            )
            continue

        last = merged[-1]
        same_file = hit.file_path == last.file_path
        close_enough = hit.line_index <= last.end_index + merge_distance

        if same_file and close_enough:
            last.end_index = max(last.end_index, hit.line_index)
            last.hit_line_indices.append(hit.line_index)
            last.keywords.add(hit.rule_name)
            last.severity = choose_severity(last.severity, hit.severity)
        else:
            merged.append(
                MergedEvent(
                    file_path=hit.file_path,
                    start_index=hit.line_index,
                    end_index=hit.line_index,
                    hit_line_indices=[hit.line_index],
                    keywords={hit.rule_name},
                    severity=hit.severity,
                )
            )

    return merged


def nearest_match_value(patterns: Sequence[re.Pattern[str]], lines: Sequence[str], center_index: int, max_radius: int = 30) -> str:
    best_value = ""
    best_distance = max_radius + 1
    lo = max(0, center_index - max_radius)
    hi = min(len(lines) - 1, center_index + max_radius)

    for i in range(lo, hi + 1):
        text = lines[i]
        dist = abs(i - center_index)
        if dist > best_distance:
            continue
        for pattern in patterns:
            m = pattern.search(text)
            if not m:
                continue
            value = m.group(1) if m.lastindex else m.group(0)
            if dist < best_distance:
                best_value = value.strip()
                best_distance = dist
    return best_value


def infer_process(lines: Sequence[str], center_index: int) -> str:
    value = nearest_match_value(PROCESS_PATTERNS, lines, center_index)
    return value or "unknown"


def infer_activity(lines: Sequence[str], center_index: int, max_radius: int = 20) -> str:
    lo = max(0, center_index - max_radius)
    hi = min(len(lines) - 1, center_index + max_radius)
    best = ""
    best_distance = max_radius + 1

    for i in range(lo, hi + 1):
        text = lines[i].strip()
        if not text:
            continue
        if not ACTIVITY_HINT_PATTERN.search(text):
            continue
        dist = abs(i - center_index)
        if dist < best_distance:
            best_distance = dist
            best = text
    return best or "unknown"


def infer_trigger(lines: Sequence[str], center_index: int, max_radius: int = 20) -> str:
    lo = max(0, center_index - max_radius)
    hi = min(len(lines) - 1, center_index + max_radius)
    best = ""
    best_distance = max_radius + 1

    for i in range(lo, hi + 1):
        text = lines[i].strip()
        if not text:
            continue
        if not TRIGGER_HINT_PATTERN.search(text):
            continue
        dist = abs(i - center_index)
        if dist < best_distance:
            best_distance = dist
            best = text
    return best or "unknown"


def extract_event_time(lines: Sequence[str], center_index: int) -> str:
    value = nearest_match_value(DATETIME_PATTERNS, lines, center_index)
    return value or "unknown"


def build_event_record(
    merged_event: MergedEvent,
    file_lines: Sequence[str],
    context_before_after: int,
    event_id: int,
) -> dict:
    context_start = max(0, merged_event.start_index - context_before_after)
    context_end = min(len(file_lines) - 1, merged_event.end_index + context_before_after)

    center = merged_event.hit_line_indices[len(merged_event.hit_line_indices) // 2]
    evidence = [
        {"line_number": i + 1, "text": file_lines[i]}
        for i in range(context_start, context_end + 1)
    ]

    return {
        "event_id": event_id,
        "file_path": merged_event.file_path,
        "severity": merged_event.severity,
        "matched_keywords": sorted(merged_event.keywords),
        "event_time": extract_event_time(file_lines, center),
        "process_or_program": infer_process(file_lines, center),
        "current_activity": infer_activity(file_lines, center),
        "suspected_trigger": infer_trigger(file_lines, center),
        "hit_line_numbers": sorted({i + 1 for i in merged_event.hit_line_indices}),
        "context_start_line": context_start + 1,
        "context_end_line": context_end + 1,
        "raw_evidence_lines": evidence,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Detect major abnormal events from log files.")
    parser.add_argument("--root", default=".", help="Root directory to scan recursively (default: current directory)")
    parser.add_argument("--output", default="log_events.json", help="Output JSON path (default: log_events.json)")
    parser.add_argument(
        "--extensions",
        default=",".join(sorted(DEFAULT_EXTENSIONS)),
        help="Comma-separated file extensions to scan (default: .err,.log,.out,.trace,.txt)",
    )
    parser.add_argument("--context", type=int, default=20, help="Context lines before/after each event (default: 20)")
    parser.add_argument(
        "--merge-distance",
        type=int,
        default=8,
        help="Line-distance threshold for merging nearby hits in same file (default: 8)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = Path(args.root).resolve()
    extensions = {ext.strip().lower() for ext in args.extensions.split(",") if ext.strip()}

    files = collect_log_files(root, extensions)
    all_hits: list[Hit] = []
    file_cache: dict[str, list[str]] = {}

    for path in files:
        lines = read_lines(path)
        file_cache[str(path)] = lines
        all_hits.extend(detect_hits(str(path), lines))

    merged = merge_hits(all_hits, merge_distance=args.merge_distance)

    events = [
        build_event_record(
            merged_event=event,
            file_lines=file_cache[event.file_path],
            context_before_after=args.context,
            event_id=i,
        )
        for i, event in enumerate(merged, start=1)
    ]

    output_data = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "scan_root": str(root),
        "scan_file_count": len(files),
        "raw_hit_count": len(all_hits),
        "merged_event_count": len(events),
        "events": events,
    }

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)

    print(f"[OK] Scanned files: {len(files)}")
    print(f"[OK] Raw hits: {len(all_hits)}")
    print(f"[OK] Merged events: {len(events)}")
    print(f"[OK] Output: {output_path.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
