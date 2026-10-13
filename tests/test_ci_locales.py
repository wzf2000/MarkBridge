"""Core locale ZIP shape checks, using synthetic files and no WordPress bootstrap."""

import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
import warnings
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "prepare_ci_wordpress", ROOT / "scripts/prepare_ci_wordpress.py"
)
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class CoreLocaleArchive(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.site = self.root / "synthetic-wordpress"
        (self.site / "wp-content").mkdir(parents=True)
        self.archive = self.root / "test-locales.zip"

    def archive_files(self, names):
        with zipfile.ZipFile(self.archive, "w", zipfile.ZIP_DEFLATED) as bundle:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", UserWarning)
                for name, value in names:
                    bundle.writestr(name, value)

    def test_closed_inventory_installed_without_settings_or_bootstrap(self):
        values = [
            ("zh_CN.mo", b"synthetic shape fixture, not a real core catalog"),
            ("admin-zh_CN.po", b"fixture"),
            ("zh_CN-" + "a" * 32 + ".json", b"{}"),
            ("zh_CN.l10n.php", b"<?php return [];"),
        ]
        self.archive_files(values)
        result = prepare.install_test_locales(self.archive, self.site)
        self.assertEqual(result, {name: hashlib.sha256(body).hexdigest() for name, body in values})
        for name, body in values:
            self.assertEqual((self.site / "wp-content/languages" / name).read_bytes(), body)
        self.assertFalse((self.site / "wp-config.php").exists())
        with self.assertRaises(RuntimeError):
            prepare.install_test_locales(self.archive, self.site)

    def test_rejects_unsafe_names_and_missing_or_duplicate_inventory(self):
        for name in [
            "../zh_CN.mo",
            "/zh_CN.mo",
            "nested/zh_CN.mo",
            "nested\\zh_CN.mo",
            "script.php",
            "zh_CN.php",
            "other_CN.mo",
            "zh_CN.json.bak",
        ]:
            with self.subTest(name=name):
                self.archive_files([("zh_CN.mo", b"shape"), (name, b"bad")])
                with self.assertRaises(RuntimeError):
                    prepare.install_test_locales(self.archive, self.site)
                self.assertFalse((self.site / "wp-content/languages").exists())
        for entries in [
            [],
            [("admin-zh_CN.mo", b"shape")],
            [("zh_CN.mo", b"a"), ("zh_CN.mo", b"b")],
        ]:
            with self.subTest(entries=entries):
                self.archive_files(entries)
                with self.assertRaises(RuntimeError):
                    prepare.install_test_locales(self.archive, self.site)

    def test_rejects_entry_size_and_symlinks(self):
        self.archive_files([("zh_CN.mo", b"x" * (4 * 1024 * 1024 + 1))])
        with self.assertRaises(RuntimeError):
            prepare.install_test_locales(self.archive, self.site)
        with zipfile.ZipFile(self.archive, "w") as bundle:
            item = zipfile.ZipInfo("zh_CN.mo")
            item.external_attr = 0o120777 << 16
            bundle.writestr(item, b"elsewhere")
        with self.assertRaises(RuntimeError):
            prepare.install_test_locales(self.archive, self.site)
        self.archive_files([("zh_CN.mo", b"shape")])
        outside = self.root / "outside"
        outside.mkdir()
        (self.site / "wp-content").rmdir()
        (self.site / "wp-content").symlink_to(outside, target_is_directory=True)
        with self.assertRaises(RuntimeError):
            prepare.install_test_locales(self.archive, self.site)
        self.assertEqual(list(outside.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
