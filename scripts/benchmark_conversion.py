"""Measure fixed synthetic conversion workloads without a WordPress database."""

import argparse
import hashlib
import json
from pathlib import Path
import statistics
import subprocess
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", required=True, type=Path)
    parser.add_argument("--php", default="php")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    runtime = args.runtime.resolve()
    if args.output.exists():
        parser.error("Output must be new; preserve previous observations")
    commands = {
        "php": [
            args.php,
            "-r",
            "require $argv[1]; echo json_encode(\\MarkBridge\\Probe\\Worker::convert(json_decode(stream_get_contents(STDIN), true)));",
            str(root / "plugin/includes/php-converter/Worker.php"),
        ],
        "node": [str(runtime / "node/bin/node"), str(runtime / "worker.cjs"), str(runtime)],
    }
    versions = {
        name: subprocess.check_output([cmd[0], "--version"], text=True).splitlines()[0]
        for name, cmd in commands.items()
    }
    report = {
        "schema": 1,
        "versions": versions,
        "conditions": "Direct process startup plus conversion; no HTTP or database; OS/filesystem caches uncontrolled.",
        "samples": [],
        "summaries": [],
    }
    for fixture, count in [("small", 2), ("long", 80)]:
        text = "# Synthetic benchmark\n\n" + "".join(
            "## Part "
            + str(i)
            + "\n\nText **bold** with $x_i^2$.\n\n```python\nvalue = "
            + str(i)
            + "\n```\n\n"
            for i in range(count)
        )
        payload = json.dumps({"mode": "markdown", "source": text, "documentId": "Benchmark21"})
        for backend, cmd in commands.items():
            times = []
            for repeat in range(5):
                start = time.perf_counter()
                response = subprocess.run(
                    cmd, input=payload, text=True, capture_output=True, timeout=60, check=True
                )
                duration = (time.perf_counter() - start) * 1000
                result = json.loads(response.stdout)
                if not result.get("ok") or result.get("document", {}).get("source") != text:
                    raise RuntimeError("Synthetic conversion did not preserve the source")
                times.append(duration)
                report["samples"].append(
                    {
                        "fixture": fixture,
                        "backend": backend,
                        "repeat": repeat + 1,
                        "ms": round(duration, 2),
                        "sourceBytes": len(text.encode()),
                        "sourceSha256": hashlib.sha256(text.encode()).hexdigest(),
                    }
                )
            report["summaries"].append(
                {
                    "fixture": fixture,
                    "backend": backend,
                    "medianMs": round(statistics.median(times), 2),
                    "minMs": round(min(times), 2),
                    "maxMs": round(max(times), 2),
                }
            )
    args.output.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
