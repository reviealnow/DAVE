# Log Event Detector

`tools/log_event_detector.py` scans text logs recursively and detects major abnormal events.

## What it detects

Keywords (case-insensitive):
- `Q6 crash`
- `kernel panic`
- `panic`
- `watchdog`
- `segmentation fault`
- `fatal error`
- `assert`
- `reboot`
- `restart`
- `call trace`
- `stack trace`
- `crash`

Severity mapping:
- `critical`: kernel panic / Q6 crash / watchdog
- `high`: segmentation fault / fatal error / assert
- `medium`: reboot / restart / panic / call trace / stack trace / generic crash

## Usage

From project root:

```bash
python3 tools/log_event_detector.py --root . --output log_events.json
```

Optional flags:

```bash
python3 tools/log_event_detector.py \
  --root . \
  --output log_events.json \
  --context 20 \
  --merge-distance 8 \
  --extensions .log,.txt,.out,.err,.trace
```

## Output

Output JSON includes:
- scan metadata
- merged event list
- `event_time` (if found, else `unknown`)
- inferred `process_or_program`, `current_activity`, `suspected_trigger` (or `unknown`)
- raw evidence lines with line numbers (20 lines before/after by default)

## Extend keyword rules

Edit `KEYWORD_RULES` in:
- `tools/log_event_detector.py`

Each rule is defined by:
- `name`
- regex `pattern`
- `severity`

This keeps detection logic centralized and easy to maintain.
