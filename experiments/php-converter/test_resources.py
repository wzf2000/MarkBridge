"""Bounded synthetic resource probes, not a production throughput benchmark."""

import json
from pathlib import Path
import subprocess
import time
import unittest

ROOT = Path(__file__).resolve().parent
COMMAND = [
    "php",
    "-d",
    "memory_limit=128M",
    "-d",
    "disable_functions=exec,shell_exec,system,passthru,proc_open,popen,pcntl_exec",
    str(ROOT / "cli.php"),
]


def samples():
    return [
        ("unclosed-dollar-at-limit", "$" + "x" * 262143, False),
        ("unclosed-dollar-below-limit", "$" + "x" * 250000, True),
        ("deep-quote", "> " * 40 + "nested", False),
        ("many-paragraphs", "Paragraph.\n\n" * 6000, False),
        ("oversized-source", "x" * 262145, False),
        ("sparse-table", "|" + "head|" * 100 + "\n|" + "---|" * 100 + "\n" + "|x|\n" * 150, False),
        ("excessive-footnote", "[^a]" * 18000 + "\n\n[^a]: note.\n", False),
        ("repeated-footnote", "ref[^a] " * 800 + "\n\n[^a]: One note.\n", None),
        ("many-delimiters", "*a **b " * 5000, None),
    ]


class ResourceTests(unittest.TestCase):
    def test_bounded_inputs(self):
        records = []
        for name, source, expected in samples():
            with self.subTest(name=name):
                started = time.perf_counter()
                result = subprocess.run(
                    COMMAND,
                    input=json.dumps({"mode": "markdown", "source": source}),
                    text=True,
                    capture_output=True,
                    timeout=5,
                )
                elapsed = round((time.perf_counter() - started) * 1000, 2)
                self.assertEqual(result.returncode, 0, result.stderr)
                output = json.loads(result.stdout)
                self.assertIsInstance(output.get("ok"), bool)
                if expected is not None:
                    self.assertEqual(output["ok"], expected, output.get("code"))
                if output["ok"]:
                    self.assertEqual(output["source"], source)
                    reverse = subprocess.run(
                        COMMAND,
                        input=json.dumps({"mode": "blocks", "serialized": output["serialized"]}),
                        text=True,
                        capture_output=True,
                        timeout=5,
                    )
                    self.assertEqual(reverse.returncode, 0, reverse.stderr)
                    decoded = json.loads(reverse.stdout)
                    self.assertTrue(decoded.get("ok"), decoded)
                    rebuild = subprocess.run(
                        COMMAND,
                        input=json.dumps({"mode": "markdown", "source": decoded["source"]}),
                        text=True,
                        capture_output=True,
                        timeout=5,
                    )
                    self.assertEqual(rebuild.returncode, 0, rebuild.stderr)
                    rebuilt = json.loads(rebuild.stdout)
                    self.assertTrue(rebuilt.get("ok"), rebuilt)
                    self.assertEqual(rebuilt["serialized"], output["serialized"])
                records.append(
                    {
                        "id": name,
                        "source_bytes": len(source.encode()),
                        "php_process_ms": elapsed,
                        "ok": output["ok"],
                        "code": output.get("code"),
                    }
                )
        (ROOT / "results-resources.json").write_text(json.dumps(records, indent=2) + "\n")


if __name__ == "__main__":
    unittest.main()
