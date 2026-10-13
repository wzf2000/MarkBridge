"""Readable source inputs must never admit path escape or symlink traversal."""

import importlib.util
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location(
    "package_source", Path(__file__).resolve().parents[1] / "scripts/package_source.py"
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SourcePathGuards(unittest.TestCase):
    def test_readable_source_path_escape_and_link_guards(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "tree"
            root.mkdir()
            (root / "vendor/font/mjs").mkdir(parents=True)
            file = root / "vendor/font/mjs/readable.js"
            file.write_text("export const glyph = 1;\n")
            outside = Path(temporary) / "outside"
            outside.write_text("private sentinel")
            self.assertEqual(MODULE.source_file("vendor/font/mjs/readable.js", root), file)
            for name in (
                "vendor/font/mjs/../../../../outside",
                "vendor/font/mjs/../mjs/readable.js",
                "/outside",
                "vendor\\font\\mjs\\readable.js",
                "vendor/font/mjs//readable.js",
                "vendor/font/mjs/./readable.js",
                "vendor/font/mjs/readable.js\x00",
                "vendor/font/mjs/readable.js\n",
                "vendor/font/mjs/missing.js",
                "vendor/font/mjs",
            ):
                with self.subTest(name=name), self.assertRaises(RuntimeError):
                    MODULE.source_file(name, root)
            (root / "linked").symlink_to(outside)
            (root / "linked-directory").symlink_to(root / "vendor")
            (root / "broken").symlink_to(root / "missing")
            for name in ("linked", "linked-directory/font/mjs/readable.js", "broken"):
                with self.subTest(name=name), self.assertRaises(RuntimeError):
                    MODULE.source_file(name, root)
            self.assertEqual(outside.read_text(), "private sentinel")


if __name__ == "__main__":
    unittest.main()
