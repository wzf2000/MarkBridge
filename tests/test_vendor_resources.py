"""Exercise the real locked-resource build in scratch trees, including manual-change refusal."""

import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class VendorResources(unittest.TestCase):
    def test_real_build_is_deterministic_and_preserves_changed_or_unlisted_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "scripts").mkdir()
            (root / "plugin/vendor").mkdir(parents=True)
            script = root / "scripts/copy-math-assets.cjs"
            shutil.copyfile(ROOT / "scripts/copy-math-assets.cjs", script)
            (root / "node_modules").symlink_to(ROOT / "node_modules", target_is_directory=True)

            def build():
                return subprocess.run(["node", str(script)], capture_output=True, text=True)

            first = build()
            self.assertEqual(first.returncode, 0, first.stderr)
            manifest_file = root / "plugin/vendor-manifest.json"
            raw = manifest_file.read_bytes()
            manifest = json.loads(raw)
            self.assertIn("vendor/mathjax-4.1.3/tex-chtml.js", manifest)
            self.assertIn("vendor/mathjax-newcm-font/mjs/common.js", manifest)
            self.assertIn("vendor/mathjax-newcm-font/def/mathjax-newcm.ts", manifest)
            self.assertTrue(any("/chtml/woff2/" in name for name in manifest))
            self.assertTrue(any("/chtml/dynamic/" in name for name in manifest))
            self.assertFalse(any("/mathjax-newcm-font/mjs/svg" in name for name in manifest))
            self.assertFalse(any("/mathjax-4.1.3/tex-svg" in name for name in manifest))
            second = build()
            self.assertEqual(second.returncode, 0, second.stderr)
            self.assertEqual(manifest_file.read_bytes(), raw)
            target = root / "plugin/vendor/mathjax-newcm-font/chtml.js"
            original = target.read_bytes()
            target.write_bytes(original + b"\n// synthetic manual edit\n")
            edited = target.read_bytes()
            self.assertNotEqual(build().returncode, 0)
            self.assertEqual(target.read_bytes(), edited)
            self.assertEqual(manifest_file.read_bytes(), raw)
            target.write_bytes(original)
            extra = root / "plugin/vendor/mathjax-newcm-font/unlisted.txt"
            extra.write_bytes(b"must retain manual unlisted resource")
            self.assertNotEqual(build().returncode, 0)
            self.assertEqual(extra.read_bytes(), b"must retain manual unlisted resource")
            self.assertEqual(manifest_file.read_bytes(), raw)
            extra.unlink()
            target.unlink()
            target.symlink_to(root / "missing-target")
            self.assertNotEqual(build().returncode, 0)
            self.assertTrue(target.is_symlink())
            self.assertEqual(manifest_file.read_bytes(), raw)
            for name, digest in manifest.items():
                if name.endswith("mathjax-newcm-font/chtml.js"):
                    continue
                self.assertEqual(
                    hashlib.sha256((root / "plugin" / name).read_bytes()).hexdigest(), digest
                )


if __name__ == "__main__":
    unittest.main()
