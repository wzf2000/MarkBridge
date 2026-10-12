"""Require the registered browser suite to finish without skips, retries or failures."""

import json
from pathlib import Path
import sys

report = json.loads(Path(sys.argv[1]).read_text())
stats = report["stats"]
if not stats["expected"] or any(stats[key] for key in ["unexpected", "flaky", "skipped"]):
    raise SystemExit("Browser suite incomplete: " + json.dumps(stats))
print("Complete browser suite passed:", stats["expected"], "tests; no skips or retries")
