"""Guard release identity, reviewed notes, and installation artifact integrity."""

import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "release_workflow", ROOT / "scripts/release_workflow.py"
)
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseGuards(unittest.TestCase):
    def test_requested_version_must_match_all_source_versions(self):
        sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
        version = json.loads((ROOT / "package.json").read_text())["version"]
        release.validate_source(ROOT, version, sha)
        for value in [
            "v" + version,
            version + "; echo bad",
            "99.0.0",
            "1.2.0-rc.0",
            "01.2.0",
        ]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                release.validate_source(ROOT, value, sha)
        with self.assertRaises(ValueError):
            release.validate_source(ROOT, version, "0" * 40)
        with patch.object(release.subprocess, "check_output", return_value="0" * 40):
            with self.assertRaises(ValueError):
                release.validate_source(ROOT, version, sha)

    def test_exact_header_not_substring_and_lock_version(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "plugin").mkdir()
            (root / "package.json").write_text('{"version": "1.2.0"}')
            lock = {"version": "1.2.0", "packages": {"": {"version": "1.2.0"}}}
            (root / "package-lock.json").write_text(json.dumps(lock))
            (root / "plugin/readme.txt").write_text("Stable tag: 1.2.0\n")
            (root / "plugin/markdown-block-bridge.php").write_text("Version: 1.2.00\n")
            with patch.object(release.subprocess, "check_output", return_value="a" * 40):
                with self.assertRaises(ValueError):
                    release.validate_source(root, "1.2.0", "a" * 40)
                (root / "plugin/markdown-block-bridge.php").write_text("Version: 1.2.0\n")
                lock["packages"][""]["version"] = "1.1.0"
                (root / "package-lock.json").write_text(json.dumps(lock))
                with self.assertRaises(ValueError):
                    release.validate_source(root, "1.2.0", "a" * 40)

    def test_notes_use_only_current_exact_changelog_section(self):
        text = (
            "## 1.2.0 — today\n\n- New change [guide](docs/USAGE.md).\n\n## 1.1.0\n\n- Old change\n"
        )
        section = release.changelog_section(text, "1.2.0")
        notes = release.release_notes(section, "1.2.0", "owner/repository")
        self.assertIn("## 🔧 1.2.0 更新", notes)
        self.assertIn("https://github.com/owner/repository/blob/v1.2.0/docs/USAGE.md", notes)
        self.assertIn("CI 未运行完整 WordPress", notes)
        self.assertNotIn("Old change", notes)
        self.assertIn("请配置匹配的私有转换运行环境", notes)
        portable = release.release_notes("- PHP candidate", "1.3.0-rc.1", "owner/repository")
        self.assertIn("新安装使用随 ZIP 附带的 PHP 转换依赖", portable)
        self.assertIn("已有 Node 配置升级后保留原后端", portable)
        self.assertNotIn("请配置匹配的私有转换运行环境", portable)
        for version, changelog in [
            ("1.2", text),
            ("1.1.0", text),
            ("1.2.0", text + "\n## 1.2.0\n- duplicate"),
            ("1.2.0", "## 1.2.0\n"),
        ]:
            with self.subTest(version=version), self.assertRaises(ValueError):
                release.changelog_section(changelog, version)
        with self.assertRaises(ValueError):
            release.release_notes(section, "1.2.0", "owner/repo;bad")

    def test_bundle_and_publisher_reject_corruption_or_wrong_source(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            version, sha = "1.2.0", "a" * 40
            body = b"public plugin"
            manifest = {
                "schema": 1,
                "version": version,
                "source_commit": sha,
                "files": {"plugin.php": hashlib.sha256(body).hexdigest()},
            }
            raw = json.dumps(manifest).encode()
            archive = directory / f"markbridge-{version}.zip"
            with zipfile.ZipFile(archive, "w") as bundle:
                bundle.writestr("markbridge/plugin.php", body)
                bundle.writestr("markbridge/release-manifest.json", raw)
            external = directory / f"markbridge-{version}.manifest.json"
            external.write_bytes(raw)
            checksum = directory / f"markbridge-{version}.zip.sha256"
            checksum.write_text(
                f"{hashlib.sha256(archive.read_bytes()).hexdigest()}  {archive.name}\n"
            )
            release.verify_bundle(directory, version, sha)
            notes = directory / "release-notes.md"
            notes.write_text("reviewed notes")
            files = {
                p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in directory.iterdir()
            }
            (directory / "release-validation.json").write_text(
                json.dumps({"version": version, "source_commit": sha, "files": files})
            )
            # Run the literal publisher validation without a checkout or token.
            workflow = (ROOT / ".github/workflows/release.yml").read_text()
            code = workflow.split("python3 - <<'PY'\n", 1)[1].split("          PY\n", 1)[0]
            code = "\n".join(line[10:] for line in code.splitlines()).replace(
                "pathlib.Path('release')", "pathlib.Path(os.environ['BUNDLE'])"
            )
            import os

            env = dict(
                os.environ,
                RELEASE_VERSION=version,
                SOURCE_SHA=sha,
                BUNDLE=str(directory),
            )
            self.assertEqual(
                subprocess.run(["python3", "-c", code], env=env, capture_output=True).returncode,
                0,
            )
            env["SOURCE_SHA"] = "b" * 40
            self.assertNotEqual(
                subprocess.run(["python3", "-c", code], env=env, capture_output=True).returncode,
                0,
            )
            with self.assertRaises(ValueError):
                release.verify_bundle(directory, version, "b" * 40)
            notes.write_text("tampered notes")
            env["SOURCE_SHA"] = sha
            self.assertNotEqual(
                subprocess.run(["python3", "-c", code], env=env, capture_output=True).returncode,
                0,
            )
            external.write_bytes(raw + b"\n")
            with self.assertRaises(ValueError):
                release.verify_bundle(directory, version, sha)
            checksum.write_text("bad checksum\n")
            with self.assertRaises(ValueError):
                release.verify_bundle(directory, version, sha)


if __name__ == "__main__":
    unittest.main()
