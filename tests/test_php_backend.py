"""Worker document contract checks, with PHP process execution disabled."""

import json
import os
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
PHP = [
    os.environ.get("MARKBRIDGE_TEST_PHP", "php"),
    "-d",
    "disable_functions=exec,shell_exec,system,passthru,proc_open,popen,pcntl_exec",
    "-r",
    "require $argv[1]; echo json_encode(\\MarkBridge\\Probe\\Worker::convert(json_decode(stream_get_contents(STDIN), true)));",
    str(ROOT / "plugin/includes/php-converter/Worker.php"),
]


def convert(payload):
    result = subprocess.run(
        PHP, input=json.dumps(payload), text=True, capture_output=True, timeout=10
    )
    if result.returncode:
        raise AssertionError(result.stderr)
    return json.loads(result.stdout)


class WorkerTests(unittest.TestCase):
    def document(self, source="Original **text**.\n\n[unused]: https://example.com\n"):
        r = convert({"mode": "markdown", "source": source, "documentId": "test-model"})
        self.assertTrue(r["ok"], r)
        return r["document"]

    def test_shape_and_unchanged_source_preservation(self):
        base = self.document()
        self.assertEqual(
            set(base), {"schema", "converter", "origin", "documentId", "source", "serialized"}
        )
        r = convert(
            {
                "mode": "blocks",
                "base": base,
                "serialized": base["serialized"],
                "documentId": base["documentId"],
            }
        )
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["document"], base)

    def test_edit_uses_blocks_not_cached_source(self):
        base = self.document()
        r = convert(
            {
                "mode": "blocks",
                "base": base,
                "source": "UNTRUSTED CACHE",
                "serialized": base["serialized"].replace("Original", "Changed"),
                "documentId": base["documentId"],
            }
        )
        self.assertTrue(r["ok"], r)
        self.assertIn("Changed", r["document"]["source"])
        self.assertNotIn("Original", r["document"]["source"])
        self.assertNotIn("UNTRUSTED", r["document"]["source"])

    def test_forged_base_and_identity_are_rejected(self):
        base = self.document()
        for field, value in [
            ("schema", 2),
            ("converter", "future"),
            ("origin", "native"),
            ("documentId", "other"),
            ("source", "FORGED"),
            ("serialized", base["serialized"] + "TAMPER"),
        ]:
            with self.subTest(field=field):
                r = convert(
                    {
                        "mode": "blocks",
                        "base": {**base, field: value},
                        "serialized": base["serialized"],
                        "documentId": base["documentId"],
                    }
                )
                self.assertFalse(r["ok"], r)
        old = convert(
            {
                "mode": "blocks",
                "base": {**base, "converter": "0.1.2"},
                "serialized": base["serialized"],
                "documentId": base["documentId"],
            }
        )
        self.assertTrue(old["ok"], old)

    def test_legacy_pair_cannot_authorize_arbitrary_edit(self):
        cases = json.loads((ROOT / "experiments/php-converter/paired-fixtures.json").read_text())
        for item in cases:
            with self.subTest(id=item["id"]):
                restored = convert({"mode": "paired_restore", **item})
                self.assertTrue(restored["ok"], restored)
                base = restored["document"]
                unchanged = convert(
                    {
                        "mode": "blocks",
                        "base": base,
                        "serialized": base["serialized"],
                        "documentId": base["documentId"],
                    }
                )
                self.assertTrue(unchanged["ok"], unchanged)
                self.assertEqual(unchanged["document"]["source"], base["source"])
                bad = convert(
                    {
                        "mode": "blocks",
                        "base": base,
                        "serialized": base["serialized"] + "<!-- wp:unknown/block /-->",
                        "documentId": base["documentId"],
                    }
                )
                self.assertFalse(bad["ok"], bad)

    def test_batch_is_bounded_and_preserves_item_failure(self):
        valid = {"mode": "markdown", "source": "Safe.", "documentId": "batch-document"}
        r = convert(
            {
                "mode": "batch",
                "items": [valid, {**valid, "source": "<script>bad()</script>"}, valid],
            }
        )
        self.assertTrue(r["ok"], r)
        self.assertEqual([x["ok"] for x in r["document"]], [True, False, True])
        self.assertFalse(convert({"mode": "batch", "items": [valid] * 6})["ok"])
        self.assertFalse(convert({"mode": "batch", "items": {"key": valid}})["ok"])
        nested = convert({"mode": "batch", "items": [{"mode": "batch", "items": []}]})
        self.assertFalse(nested["document"][0]["ok"])

    def test_errors_do_not_expose_private_paths(self):
        r = convert({"mode": "markdown", "source": "x" * 262145, "documentId": "limit"})
        self.assertFalse(r["ok"], r)
        self.assertEqual(r["code"], "INPUT_LIMIT")
        self.assertNotIn(str(ROOT), json.dumps(r))


if __name__ == "__main__":
    unittest.main()
