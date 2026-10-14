"""A refused distribution must not replace a reviewed ZIP or pass publisher validation."""

import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / (name + ".py"))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


package = module("package")
release = module("release_workflow")


class PackageLimits(unittest.TestCase):
    def test_compressed_size_boundary_preserves_existing_archive(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            installed = root / "reviewed.zip"
            installed.write_bytes(b"existing reviewed artifact")
            for size in [0, 10_000_000, 10_000_001]:
                candidate = root / "candidate.zip.tmp"
                with candidate.open("wb") as stream:
                    stream.truncate(size)
                with self.subTest(size=size), self.assertRaises(RuntimeError):
                    package.finalize_archive(candidate, installed)
                self.assertEqual(installed.read_bytes(), b"existing reviewed artifact")
                self.assertFalse(candidate.exists())

    def test_valid_under_limit_can_promote_but_crc_and_same_version_cannot(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive, candidate = root / "reviewed.zip", root / "candidate.zip.tmp"
            with zipfile.ZipFile(candidate, "w") as bundle:
                bundle.writestr("markbridge/a.txt", b"safe")
            overhead = candidate.stat().st_size - 4
            with zipfile.ZipFile(candidate, "w") as bundle:
                bundle.writestr("markbridge/a.txt", b"s" * (9_999_999 - overhead))
            self.assertEqual(candidate.stat().st_size, 9_999_999)
            package.finalize_archive(candidate, archive)
            reviewed = archive.read_bytes()
            candidate.write_bytes(reviewed)
            package.finalize_archive(candidate, archive)
            candidate.write_bytes(b"invalid ZIP")
            with self.assertRaises(zipfile.BadZipFile):
                package.finalize_archive(candidate, archive)
            self.assertEqual(archive.read_bytes(), reviewed)
            corrupt = bytearray(reviewed)
            corrupt[30 + len("markbridge/a.txt")] ^= 1
            candidate.write_bytes(corrupt)
            with self.assertRaises(RuntimeError):
                package.finalize_archive(candidate, archive)
            self.assertEqual(archive.read_bytes(), reviewed)
            with zipfile.ZipFile(candidate, "w") as bundle:
                bundle.writestr("markbridge/a.txt", b"changed")
            with self.assertRaises(RuntimeError):
                package.finalize_archive(candidate, archive)
            self.assertEqual(archive.read_bytes(), reviewed)

    def test_release_entry_rejects_oversize_before_reading_untrusted_sidecars(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with (root / "markbridge-2.0.0.zip").open("wb") as stream:
                stream.truncate(10_000_000)
            with self.assertRaises(ValueError):
                release.verify_bundle(root, "2.0.0", "a" * 40)


if __name__ == "__main__":
    unittest.main()
