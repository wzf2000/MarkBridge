"""Restricted probe assertions; not a production compatibility suite."""

import json
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parent
PHP = [
    "php",
    "-d",
    "disable_functions=exec,shell_exec,system,passthru,proc_open,popen,pcntl_exec",
    str(ROOT / "cli.php"),
]


def convert(mode, value):
    request = {"mode": mode, "source" if mode == "markdown" else "serialized": value}
    process = subprocess.run(
        PHP, input=json.dumps(request), text=True, capture_output=True, timeout=10
    )
    return json.loads(process.stdout)


class ProbeTests(unittest.TestCase):
    def test_actual_block_edit_is_exported(self):
        original = convert("markdown", "# Title\n\nOriginal **bold**.\n")
        self.assertTrue(original["ok"], original)
        modified = original["serialized"].replace("Original", "Changed")
        reverse = convert("blocks", modified)
        self.assertTrue(reverse["ok"], reverse)
        self.assertIn("Changed", reverse["source"])
        self.assertNotIn("Original", reverse["source"])
        self.assertEqual(convert("markdown", reverse["source"])["serialized"], modified)

    def test_unknown_attributes_and_malformed_structure(self):
        cases = [
            "<!-- wp:third-party/widget --><div>Keep me</div><!-- /wp:third-party/widget -->",
            '<!-- wp:paragraph {"align":"right"} --><p>Text</p><!-- /wp:paragraph -->',
            '<!-- wp:paragraph --><p style="color:red">Text</p><!-- /wp:paragraph -->',
            '<!-- wp:paragraph --><p onclick="alert(1)">Text</p><!-- /wp:paragraph -->',
            "<!-- wp:paragraph --><p>Text</p><!-- /wp:heading -->",
            "<!-- wp:paragraph --><p>Text</p>",
            "<!-- wp:paragraph --><p>Text</p><!-- /wp:paragraph -->UNTRACKED",
            '<!-- wp:paragraph --><p><a href="https://example.com" href="javascript:bad">link</a></p><!-- /wp:paragraph -->',
        ]
        for value in cases:
            with self.subTest(value=value):
                self.assertFalse(convert("blocks", value)["ok"])

    def test_no_silent_html_or_script_link_acceptance(self):
        for value in [
            "<script>alert(1)</script>",
            '<span style="color:red">Text</span>',
            "[bad](javascript:alert%281%29)",
        ]:
            with self.subTest(value=value):
                self.assertFalse(convert("markdown", value)["ok"])

    def test_input_and_nesting_limit(self):
        for value in ["x" * 262145, "a\0b", "> " * 40 + "nested"]:
            with self.subTest(length=len(value)):
                self.assertFalse(convert("markdown", value)["ok"])

    def test_unimplemented_features_are_explicit(self):
        for value in [
            "Text[^note].\n\n[^note]: note",
            "![alt](https://example.com/a.png)",
            "|a|b|\n|-|-|\n|c|d|",
        ]:
            with self.subTest(value=value):
                self.assertFalse(convert("markdown", value)["ok"])

    def test_escaped_and_entity_task_markers_not_checked(self):
        for value in [
            "- \\[x] literal\n",
            "- &#91;x&#93; literal\n",
            "- &lbrack;x&rbrack; literal\n",
            "- [&#120;] literal\n",
        ]:
            with self.subTest(value=value):
                result = convert("markdown", value)
                # Conservative rejection is acceptable for this experiment.
                if result["ok"]:
                    self.assertNotIn("mbb/task-item", result["serialized"])

    def test_task_marker_before_continuation(self):
        result = convert("markdown", "- [x]\n  done\n")
        self.assertTrue(result["ok"], result)
        self.assertNotIn("mbb/task-item", result["serialized"])
        self.assertIn("<br>", result["serialized"])

    def test_original_source_is_retained(self):
        value = "# Title\n\nText.\n\n[unused]: https://example.com\n"
        result = convert("markdown", value)
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["source"], value)
        self.assertIn("normalized_source", result)

    def test_code_does_not_become_math_or_tasks(self):
        value = "```text\n$x$\n- [x] literal\n[^note]\n```\n"
        result = convert("markdown", value)
        self.assertTrue(result["ok"], result)
        self.assertNotIn("wp:mbb/math", result["serialized"])
        self.assertNotIn("wp:mbb/task-item", result["serialized"])
        self.assertEqual(convert("blocks", result["serialized"])["source"], value)


if __name__ == "__main__":
    unittest.main()
