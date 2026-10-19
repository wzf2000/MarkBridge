"""Guard release identity, reviewed notes, and installation artifact integrity."""

import copy
from datetime import datetime, timedelta, timezone
import hashlib
import io
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
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

with patch.object(sys, "path", [str(ROOT / "scripts"), *sys.path]):
    reuse_spec = importlib.util.spec_from_file_location(
        "release_reuse", ROOT / "scripts/release_reuse.py"
    )
    reuse = importlib.util.module_from_spec(reuse_spec)
    reuse_spec.loader.exec_module(reuse)


class ReleaseReuse(unittest.TestCase):
    sha = "a" * 40
    now = datetime(2026, 1, 20, tzinfo=timezone.utc)

    def setUp(self):
        self.run = {
            "id": 10,
            "workflow_id": 20,
            "path": ".github/workflows/ci.yml",
            "event": "push",
            "head_branch": "main",
            "head_sha": self.sha,
            "repository": {"id": 30},
            "head_repository": {"id": 30},
            "status": "completed",
            "conclusion": "success",
            "run_attempt": 1,
            "run_started_at": "2026-01-19T00:00:00Z",
            "updated_at": "2026-01-19T01:00:00Z",
        }
        self.artifact = {
            "id": 40,
            "name": "markbridge-release-" + self.sha,
            "expired": False,
            "digest": "sha256:" + "b" * 64,
            "size_in_bytes": 100,
            "created_at": "2026-01-19T00:59:00Z",
            "expires_at": "2026-02-19T00:59:00Z",
            "workflow_run": {
                "id": 10,
                "repository_id": 30,
                "head_repository_id": 30,
                "head_branch": "main",
                "head_sha": self.sha,
            },
        }

    def choose(self, runs=None, artifacts=None, force=False):
        return reuse.select(
            [self.run] if runs is None else runs,
            lambda run_id: [self.artifact] if artifacts is None else artifacts,
            30,
            20,
            self.sha,
            self.now,
            force=force,
        )

    def test_reuse_selects_only_successful_same_repository_main_push(self):
        self.assertEqual(
            self.choose(),
            {"run_id": 10, "artifact_id": 40, "artifact_digest": "sha256:" + "b" * 64},
        )
        for key, value in [
            ("event", "pull_request"),
            ("head_branch", "topic"),
            ("head_sha", "c" * 40),
            ("repository", {"id": 31}),
            ("head_repository", {"id": 31}),
            ("workflow_id", 21),
            ("path", ".github/workflows/other.yml"),
            ("status", "in_progress"),
            ("conclusion", "failure"),
            ("conclusion", "cancelled"),
            ("run_attempt", 2),
            ("id", True),
            ("run_started_at", "2026-01-01T00:00:00Z"),
            ("updated_at", "2026-01-21T00:00:00Z"),
        ]:
            run = dict(self.run, **{key: value})
            with self.subTest(key=key, value=value):
                self.assertIsNone(self.choose(runs=[run]))
        self.assertIsNone(self.choose(runs=[]))
        self.assertIsNone(self.choose(artifacts=[]))
        self.assertIsNone(
            reuse.select(
                [self.run],
                lambda run_id: self.fail("force must not query artifacts"),
                30,
                20,
                self.sha,
                self.now,
                force=True,
            )
        )

    def test_artifact_identity_and_attempt_window_fail_closed(self):
        for key, value in [
            ("expired", True),
            ("name", "markbridge-build-" + self.sha),
            ("id", "40"),
            ("digest", "sha256:bad"),
            ("digest", ""),
            ("size_in_bytes", 0),
            ("size_in_bytes", 30_000_000),
            ("created_at", "2026-01-18T00:59:00Z"),
            ("created_at", "2026-01-19T01:01:00Z"),
            ("expires_at", "2026-01-19T01:00:00Z"),
        ]:
            with self.subTest(key=key, value=value):
                self.assertIsNone(self.choose(artifacts=[dict(self.artifact, **{key: value})]))
        for key, value in [
            ("id", 11),
            ("repository_id", 31),
            ("head_repository_id", 31),
            ("head_branch", "topic"),
            ("head_sha", "c" * 40),
        ]:
            artifact = copy.deepcopy(self.artifact)
            artifact["workflow_run"][key] = value
            with self.subTest(key=key):
                self.assertIsNone(self.choose(artifacts=[artifact]))
        with self.assertRaises(ValueError):
            self.choose(artifacts=[self.artifact, self.artifact])
        # API failures must not silently downgrade into a successful reuse selection.
        with self.assertRaises(RuntimeError):
            reuse.select(
                [self.run],
                lambda run_id: (_ for _ in ()).throw(RuntimeError("API failed")),
                30,
                20,
                self.sha,
                self.now,
            )

    def test_fresh_transfer_requires_current_main_release_attempt(self):
        run = dict(
            self.run,
            path=".github/workflows/release.yml",
            event="workflow_dispatch",
            run_attempt=2,
            status="in_progress",
            conclusion=None,
        )
        self.assertTrue(reuse.fresh_identity(run, 30, self.sha, 10, 2))
        for key, value in [
            ("id", 11),
            ("run_attempt", 1),
            ("event", "pull_request"),
            ("path", ".github/workflows/ci.yml"),
            ("head_branch", "topic"),
            ("head_sha", "b" * 40),
            ("repository", {"id": 31}),
            ("head_repository", {"id": 31}),
            ("status", "completed"),
            ("conclusion", "failure"),
        ]:
            with self.subTest(key=key):
                self.assertFalse(
                    reuse.fresh_identity(dict(run, **{key: value}), 30, self.sha, 10, 2)
                )
        artifact = dict(self.artifact, created_at="2026-01-19T01:01:00Z")
        self.assertFalse(reuse.artifact_identity(artifact, run, 30, self.sha, self.now))
        self.assertTrue(
            reuse.artifact_identity(artifact, run, 30, self.sha, self.now, in_progress=True)
        )

    def test_transfer_requires_archive_digest_five_files_and_inner_proof(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            version = "1.2.0"
            manifest = {
                "schema": 1,
                "version": version,
                "source_commit": self.sha,
                "files": {"plugin.php": hashlib.sha256(b"plugin").hexdigest()},
            }
            raw = json.dumps(manifest).encode()
            inner = io.BytesIO()
            with zipfile.ZipFile(inner, "w") as bundle:
                bundle.writestr("markbridge/plugin.php", b"plugin")
                bundle.writestr("markbridge/release-manifest.json", raw)
            name = "markbridge-" + version
            files = {
                name + ".zip": inner.getvalue(),
                name + ".manifest.json": raw,
                name
                + ".zip.sha256": (
                    hashlib.sha256(inner.getvalue()).hexdigest() + "  " + name + ".zip\n"
                ).encode(),
                "release-notes.md": b"reviewed notes",
            }
            proof = {
                "version": version,
                "source_commit": self.sha,
                "files": {key: hashlib.sha256(body).hexdigest() for key, body in files.items()},
            }
            files["release-validation.json"] = json.dumps(proof).encode()

            def archive(contents):
                output = io.BytesIO()
                with zipfile.ZipFile(output, "w") as bundle:
                    for filename, body in contents.items():
                        bundle.writestr(filename, body)
                data = output.getvalue()
                return data, "sha256:" + hashlib.sha256(data).hexdigest()

            data, digest = archive(files)
            reuse.verify_transfer(data, digest, directory / "good", version, self.sha)
            self.assertEqual({p.name for p in (directory / "good").iterdir()}, set(files))
            for mutation in ["digest", "extra", "missing", "notes", "sha", "inner"]:
                changed = dict(files)
                selected_sha, selected_digest = self.sha, digest
                if mutation == "extra":
                    changed["extra"] = b"unexpected"
                elif mutation == "missing":
                    changed.pop("release-notes.md")
                elif mutation == "notes":
                    changed["release-notes.md"] = b"changed notes"
                elif mutation == "sha":
                    selected_sha = "c" * 40
                elif mutation == "inner":
                    changed[name + ".zip"] = b"corrupt zip"
                    changed[name + ".zip.sha256"] = (
                        hashlib.sha256(changed[name + ".zip"]).hexdigest() + "  " + name + ".zip\n"
                    ).encode()
                    changed_proof = dict(
                        proof,
                        files={
                            key: hashlib.sha256(body).hexdigest()
                            for key, body in changed.items()
                            if key != "release-validation.json"
                        },
                    )
                    changed["release-validation.json"] = json.dumps(changed_proof).encode()
                data, computed = archive(changed)
                selected_digest = "sha256:" + "0" * 64 if mutation == "digest" else computed
                with (
                    self.subTest(mutation=mutation),
                    self.assertRaises((ValueError, zipfile.BadZipFile)),
                ):
                    reuse.verify_transfer(
                        data, selected_digest, directory / mutation, version, selected_sha
                    )

    def test_workflow_preserves_read_only_selection_and_publish_boundary(self):
        workflow = (ROOT / ".github/workflows/release.yml").read_text()
        self.assertIn("force_rebuild:", workflow)
        self.assertIn("if: needs.resolve.outputs.artifact_id == ''", workflow)
        self.assertIn("release_reuse.py download", workflow)
        publish = workflow.split("\n  publish:\n", 1)[1]
        self.assertIn("needs: [resolve, prepare-bundle]", publish)
        self.assertIn(
            "!cancelled() && inputs.publish && needs.resolve.result == 'success'", publish
        )
        self.assertIn("needs.prepare-bundle.result == 'success'", publish)
        self.assertIn("always() && !cancelled() && needs.resolve.result == 'success'", workflow)
        self.assertNotIn("actions/checkout", publish)
        self.assertNotIn("release_reuse.py", publish)
        self.assertIn("artifact-ids: ${{ needs.prepare-bundle.outputs.artifact_id }}", publish)
        self.assertEqual(workflow.count("contents: write"), 1)
        self.assertEqual(workflow.count("actions: read"), 2)


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
        integrated = release.release_notes("- Editor reliability", "1.4.0", "owner/repository")
        self.assertIn("合成站覆盖 PHP／Node 原生 REST 保存链", integrated)
        self.assertIn("拒绝跳过用例", integrated)
        self.assertIn("部分 REST 响应仍为测试替代", integrated)
        self.assertNotIn("CI 未运行完整 WordPress", integrated)
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
