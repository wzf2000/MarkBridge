"""A refused distribution must not replace a reviewed ZIP or pass publisher validation."""

import importlib.util
import hashlib
import json
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


class RetainedAssets(unittest.TestCase):
    def fixture(self, root):
        body = b"previous reviewed browser resource\n"
        digest = hashlib.sha256(body).hexdigest()
        name = "reader-" + digest[:12] + ".js"
        (root / "plugin").mkdir()
        (root / "plugin" / name).write_bytes(body)
        data = {"schema": 1, "files": {name: digest}}
        (root / "retained-assets.json").write_text(json.dumps(data))
        return name, data, {"retained-assets.json", "plugin/" + name}

    def test_exact_tracked_resource_is_retained_and_untracked_extra_is_ignored(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            name, _, tracked = self.fixture(root)
            (root / "plugin" / "unreviewed-aaaaaaaaaaaa.js").write_bytes(b"untracked")
            self.assertEqual(package.retained_assets(root, tracked, set()), {"plugin/" + name})

    def test_rejects_tampering_untracked_inputs_active_collision_and_symlinks(self):
        for mode in ["bytes", "untracked", "manifest", "active", "symlink", "undeclared"]:
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                name, _, tracked = self.fixture(root)
                active = set()
                if mode == "bytes":
                    (root / "plugin" / name).write_bytes(b"changed")
                elif mode == "untracked":
                    tracked.remove("plugin/" + name)
                elif mode == "manifest":
                    tracked.remove("retained-assets.json")
                elif mode == "active":
                    active.add(name)
                elif mode == "symlink":
                    (root / "original.js").write_bytes((root / "plugin" / name).read_bytes())
                    (root / "plugin" / name).unlink()
                    (root / "plugin" / name).symlink_to(root / "original.js")
                else:
                    tracked.add("plugin/unreviewed-aaaaaaaaaaaa.js")
                with self.assertRaises(RuntimeError):
                    package.retained_assets(root, tracked, active)

    def test_rejects_non_hash_names_digest_prefix_mismatch_and_path_escape(self):
        for name in ["reader.js", "reader-aaaaaaaaaaaa.js", "../reader-aaaaaaaaaaaa.js"]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                original, data, tracked = self.fixture(root)
                data["files"] = {name: data["files"][original]}
                (root / "retained-assets.json").write_text(json.dumps(data))
                tracked.add("plugin/" + name)
                with self.assertRaises(RuntimeError):
                    package.retained_assets(root, tracked, set())


if __name__ == "__main__":
    unittest.main()
