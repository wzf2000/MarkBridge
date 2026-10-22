"""Guard the three real backend save passes without executing a WordPress site."""

from pathlib import Path
import copy
import importlib.util
import json
import os
import tempfile
import re
import subprocess
import sys
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]


spec = importlib.util.spec_from_file_location(
    "check_ci_pipeline", ROOT / "scripts/check_ci_pipeline.py"
)
pipeline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)


class PipelineCoverage(unittest.TestCase):
    sha = "a" * 40

    def setUp(self):
        self.raw = {
            "schema": 1,
            "source_sha": self.sha,
            "errors": [],
            "suites": [{"specs": []}],
            "stats": {
                "expected": 6,
                "unexpected": 0,
                "flaky": 0,
                "skipped": 0,
                "duration": 99,
            },
        }
        for index, project in enumerate(sorted(set.union(*pipeline.GROUPS.values()))):
            self.raw["suites"][0]["specs"].append(
                {
                    "id": "test-" + str(index),
                    "ok": True,
                    "tests": [
                        {
                            "projectName": project,
                            "expectedStatus": "passed",
                            "status": "expected",
                            "results": [
                                {"status": "passed", "retry": 0, "errors": [], "duration": 10}
                            ],
                        }
                    ],
                }
            )
        self.discovery = pipeline.discover(self.raw, self.sha)
        self.reports = []
        for group, projects in pipeline.GROUPS.items():
            raw = copy.deepcopy(self.raw)
            raw["suites"][0]["specs"] = [
                spec
                for spec in raw["suites"][0]["specs"]
                if spec["tests"][0]["projectName"] in projects
            ]
            raw["stats"]["expected"] = len(raw["suites"][0]["specs"])
            self.reports.append(pipeline.summarize(raw, self.discovery, self.sha, group))

    def test_gate_requires_exact_shards_source_and_identities(self):
        result = pipeline.gate(self.discovery, self.reports, self.sha)
        self.assertEqual(result["count"], 6)
        self.assertEqual(len(result["tests"]), 6)
        self.assertEqual(result["slowest"], result["tests"][:20])
        summary = pipeline.step_summary(result)
        self.assertIn("6 unique tests passed", summary)
        self.assertIn("Slowest tests", summary)
        self.assertIn("chromium-desktop", summary)
        variants = []
        variants.append(self.reports[:-1])
        variants.append(self.reports + [self.reports[0]])
        for field, value in [("source_sha", "b" * 40), ("status", "failed"), ("group", "unknown")]:
            reports = copy.deepcopy(self.reports)
            reports[0][field] = value
            variants.append(reports)
        for mutation in [
            "missing",
            "duplicate",
            "wrong-id",
            "wrong-project",
            "retry",
            "skip",
            "attempts",
        ]:
            reports = copy.deepcopy(self.reports)
            if mutation == "missing":
                reports[-1]["tests"].pop()
            elif mutation == "duplicate":
                reports[-1]["tests"].append(reports[-1]["tests"][0])
            elif mutation in ["retry", "skip", "attempts"]:
                field, value = {
                    "retry": ("retry", 1),
                    "skip": ("status", "skipped"),
                    "attempts": ("attempts", 2),
                }[mutation]
                reports[0]["tests"][0][field] = value
            else:
                reports[0]["tests"][0]["id" if mutation == "wrong-id" else "project"] = "different"
            variants.append(reports)
        for reports in variants:
            with self.subTest(reports=reports), self.assertRaises(ValueError):
                pipeline.gate(self.discovery, reports, self.sha)
        discovery = copy.deepcopy(self.discovery)
        discovery["source_sha"] = "b" * 40
        with self.assertRaises(ValueError):
            pipeline.gate(discovery, self.reports, self.sha)

    def test_report_rejects_skip_retry_failure_errors_and_partial_inventory(self):
        group = "chromium-desktop"
        raw = copy.deepcopy(self.raw)
        raw["suites"][0]["specs"] = [raw["suites"][0]["specs"][0]]
        raw["stats"]["expected"] = 1
        pipeline.summarize(raw, self.discovery, self.sha, group)
        for mutation in [
            "skipped",
            "failed",
            "interrupted",
            "retry",
            "flaky",
            "error",
            "global",
            "missing",
            "duplicate",
            "id",
            "stats",
            "sha",
        ]:
            changed = copy.deepcopy(raw)
            spec = changed["suites"][0]["specs"][0]
            test = spec["tests"][0]
            if mutation in ["skipped", "failed", "interrupted"]:
                test["results"][0]["status"] = mutation
            elif mutation == "retry":
                test["results"][0]["retry"] = 1
            elif mutation == "flaky":
                test["results"].append(test["results"][0])
            elif mutation == "error":
                test["results"][0]["errors"] = ["error"]
            elif mutation == "sha":
                changed["source_sha"] = "b" * 40
            elif mutation == "global":
                changed["errors"] = ["error"]
            elif mutation == "missing":
                changed["suites"][0]["specs"] = []
            elif mutation == "duplicate":
                changed["suites"][0]["specs"].append(spec)
            elif mutation == "id":
                spec["id"] = "other-test"
            else:
                changed["stats"]["expected"] = 2
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                pipeline.summarize(changed, self.discovery, self.sha, group)

    def test_custom_reporter_schema_preserves_individual_test_ids(self):
        report = copy.deepcopy(self.raw)
        report["tests"] = [
            dict(test, id=spec["id"], ok=spec["ok"], project=test["projectName"])
            for spec in report.pop("suites")[0]["specs"]
            for test in spec["tests"]
        ]
        discovery = pipeline.discover(report, self.sha)
        self.assertEqual(discovery, self.discovery)
        report["tests"] = [
            test for test in report["tests"] if test["project"] == "desktop-chromium"
        ]
        report["stats"]["expected"] = 1
        pipeline.summarize(report, discovery, self.sha, "chromium-desktop")
        report["source_sha"] = "b" * 40
        with self.assertRaises(ValueError):
            pipeline.summarize(report, discovery, self.sha, "chromium-desktop")

    def test_discovery_requires_unique_full_project_inventory(self):
        for mutation in ["missing", "duplicate", "errors"]:
            raw = copy.deepcopy(self.raw)
            if mutation == "missing":
                raw["suites"][0]["specs"].pop()
            elif mutation == "duplicate":
                raw["suites"][0]["specs"].append(raw["suites"][0]["specs"][0])
            else:
                raw["errors"] = ["discovery failed"]
            with self.assertRaises(ValueError):
                pipeline.discover(raw, self.sha)

    def test_workflow_gate_and_trigger_contracts(self):
        workflow = (ROOT / ".github/workflows/ci.yml").read_text()
        self.assertIn("push:\n    branches: [main]\n  pull_request:", workflow)
        self.assertNotIn("paths:", workflow)
        self.assertIn(
            "cancel-in-progress: ${{ github.event_name == 'pull_request' && !inputs.source_sha }}",
            workflow,
        )
        self.assertIn("needs: [build, save, unit, browser, php-converter]", workflow)
        gate = workflow.split("  verify:\n", 1)[1]
        self.assertIn("if: always()", gate)
        self.assertIn("job['result'] == 'success'", gate)
        self.assertIn("check_ci_pipeline.py gate", gate)
        # A successful explicit rerun must not collect retained failure artifacts.
        self.assertIn("pattern: markbridge-browser-coverage-*", gate)
        self.assertNotIn("pattern: markbridge-browser-*", gate)
        self.assertLess(
            gate.index("check_ci_pipeline.py gate"), gate.index("name: markbridge-release-")
        )
        self.assertNotIn("name: markbridge-release-", workflow.split("  verify:\n", 1)[0])
        self.assertIn("release_artifact_id: ${{ steps.release.outputs.artifact-id }}", gate)
        self.assertIn(
            "release_artifact_digest: ${{ format('sha256:{0}', steps.release.outputs.artifact-digest) }}",
            gate,
        )
        self.assertEqual(
            workflow.count("persist-credentials: false"), workflow.count("uses: actions/checkout@")
        )
        for group in pipeline.GROUPS:
            self.assertIn("group: " + group, workflow)
        self.assertIn("--retries=0 --reporter=line,json", workflow)
        self.assertNotIn("--shard", workflow)
        config = (ROOT / "playwright.config.cjs").read_text()
        self.assertIn("fullyParallel: false", config)
        self.assertIn("workers: 1", config)
        self.assertIn("python3 scripts/package.py", workflow)
        self.assertIn('--bundle dist --sha "$SOURCE_SHA" --hydrate', workflow)

    def test_manual_reruns_replace_only_this_runs_artifacts_and_pin_build_id(self):
        workflow = (ROOT / ".github/workflows/ci.yml").read_text()
        self.assertEqual(
            workflow.count("overwrite: ${{ github.run_attempt > 1 }}"),
            workflow.count("uses: actions/upload-artifact@v7"),
        )
        self.assertIn("artifact_id: ${{ steps.build-inputs.outputs.artifact-id }}", workflow)
        self.assertEqual(workflow.count("artifact-ids: ${{ needs.build.outputs.artifact_id }}"), 4)
        self.assertEqual(
            workflow.count("name: markbridge-build-${{ inputs.source_sha || github.sha }}"), 1
        )
        self.assertIn('--bundle dist --sha "$SOURCE_SHA" --hydrate', workflow)
        release = (ROOT / ".github/workflows/release.yml").read_text()
        self.assertIn(
            "name: markbridge-publish-${{ needs.resolve.outputs.sha }}-attempt${{ github.run_attempt }}",
            release,
        )
        self.assertNotIn("overwrite:", release)


class VerifiedPackageInputs(unittest.TestCase):
    def test_hydration_restores_only_allowlisted_generated_assets(self):
        with patch.dict(sys.modules), patch.object(sys, "path", [str(ROOT / "scripts"), *sys.path]):
            spec = importlib.util.spec_from_file_location(
                "prepare_ci_package", ROOT / "scripts/prepare_ci_package.py"
            )
            package = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(package)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "plugin").mkdir()
            (root / "plugin/source.php").write_text("retained tracked source")
            bodies = {
                "assets.json": json.dumps({"ui.js": "ui-123456789abc.js"}),
                "runtime-contract.json": "{}",
                "vendor-manifest.json": "{}",
                "php-converter-manifest.json": json.dumps(
                    {
                        "files": {
                            "includes/php-converter/scoped/input.php": "digest",
                            "source.php": "digest",
                        }
                    }
                ),
                "kernel.js": "kernel",
                "emoji.js": "emoji",
                "ui-123456789abc.js": "ui",
                "includes/php-converter/scoped/input.php": "scoped dependency",
                "source.php": "retained tracked source",
                "docs/private.md": "not an asset",
            }
            archive = root / "markbridge-3.0.1.zip"
            with zipfile.ZipFile(archive, "w") as bundle:
                for name, body in bodies.items():
                    bundle.writestr("markbridge/" + name, body)
            os.utime(root / "plugin/source.php", (100, 100))
            with (
                patch.object(package, "ROOT", root),
                patch.object(
                    package.subprocess, "check_output", return_value="plugin/source.php\n"
                ),
            ):
                package.hydrate(root, "3.0.1")
            self.assertEqual((root / "plugin/source.php").read_text(), "retained tracked source")
            self.assertEqual((root / "plugin/source.php").stat().st_mtime, 100)
            self.assertEqual((root / "plugin/kernel.js").read_text(), "kernel")
            self.assertEqual(
                (root / "plugin/includes/php-converter/scoped/input.php").read_text(),
                "scoped dependency",
            )
            self.assertFalse((root / "plugin/docs").exists())
            (root / "plugin/source.php").write_text("different tracked source")
            with (
                patch.object(package, "ROOT", root),
                patch.object(
                    package.subprocess, "check_output", return_value="plugin/source.php\n"
                ),
                self.assertRaises(ValueError),
            ):
                package.hydrate(root, "3.0.1")
            (root / "plugin/source.php").write_text("retained tracked source")
            (root / "plugin/kernel.js").unlink()
            (root / "plugin/kernel.js").symlink_to(root / "plugin/source.php")
            with (
                patch.object(package, "ROOT", root),
                patch.object(
                    package.subprocess, "check_output", return_value="plugin/source.php\n"
                ),
                self.assertRaises(ValueError),
            ):
                package.hydrate(root, "3.0.1")


class CISaveCoverage(unittest.TestCase):
    def test_new_save_contracts_run_in_every_existing_backend_pass(self):
        workflow = (ROOT / ".github/workflows/ci.yml").read_text()
        block = workflow.split("- name: Verify the real WordPress PHP and Node save chains\n", 1)[
            1
        ].split("\n      - name:", 1)[0]
        shell = (
            "\n".join(line[10:] for line in block.splitlines()[1:] if line.startswith("          "))
            + "\n"
        )
        result = subprocess.run(["bash", "-n"], input=shell, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        passes = re.split(r"wp_test eval-file tests/ci-backend.php (php|node)\n", shell)
        self.assertEqual(passes[1::2], ["php", "node", "php"])
        existing = [
            "native-rest",
            "teaching",
            "provider",
            "recovery",
            "frontmatter",
            "resource-import",
            "code-tabs",
            "export",
            "merge",
            "block-adapters",
            "native-group",
            "native-text",
            "code-literals",
            "localization",
            "authoring",
            "technical-writing",
            "native-media",
            "batch",
        ]
        for backend, commands in zip(passes[1::2], passes[2::2]):
            for name in existing + ["paired-backups", "references", "collections"]:
                with self.subTest(backend=backend, test=name):
                    self.assertEqual(
                        commands.count("wp_test eval-file tests/" + name + "-save.php\n"), 1
                    )
                    self.assertTrue((ROOT / "tests" / (name + "-save.php")).is_file())
        self.assertIn(
            "disable_functions=exec,shell_exec,system,passthru,proc_open,popen,pcntl_exec", shell
        )
        self.assertIn("wp_test eval-file tests/php-backend-save.php", shell)
        # The retained cross-site tool requires a separately installed destination and
        # explicit output directory. It must not be mistaken for a one-site save check.
        self.assertNotIn("media-relocation-save.php", shell)
        for name in ["bibliography-v2-save.php", "mermaid-save.php"]:
            self.assertNotIn(name, shell)

    def test_authoring_scope_is_standalone_and_teacher_remains_explicit(self):
        standalone = (ROOT / "tests/authoring-save.php").read_text()
        integration = (ROOT / "tests/integration/authoring-extension-save.php").read_text()
        workflow = (ROOT / ".github/workflows/ci.yml").read_text()
        self.assertIn("markbridge_register_teaching_component($providerId", standalone)
        self.assertIn("$GLOBALS['mbb_components'] = $savedRegistry", standalone)
        self.assertIn("unlink($fixtureFile)", standalone)
        self.assertNotIn("node-diagram", standalone)
        for version in ["0.1.0", "0.2.0"]:
            self.assertIn("mbb_component_provider('node-diagram', '" + version + "')", integration)
        self.assertIn("Invalid graph domain overwrote a valid article.", integration)
        self.assertNotIn("authoring-extension-save.php", workflow)
        for source in [standalone, integration]:
            self.assertIn("MARKBRIDGE_TEST_WORDPRESS_ROOT", source)
            self.assertIn("wp_get_environment_type() !== 'local'", source)


class PublicationProfile(unittest.TestCase):
    def test_explicit_inputs_fail_closed_and_core_discovery_remains_self_contained(self):
        env = os.environ.copy()
        for key in ["MARKBRIDGE_TEST_PUBLISHER_ROOT", "MARKBRIDGE_TEST_PUBLICATION_INPUTS"]:
            env.pop(key, None)
        command = [
            "node",
            str(ROOT / "node_modules/@playwright/test/cli.js"),
            "test",
            "--config=playwright.publication.config.cjs",
            "--list",
            "--reporter=list",
        ]
        result = subprocess.run(command, cwd=ROOT, env=env, text=True, capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("requires explicit MARKBRIDGE_TEST_PUBLISHER_ROOT", result.stderr)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            publisher = root / "publisher"
            (publisher / "plugin").mkdir(parents=True)
            for name in ["publisher.js", "zip.js"]:
                (publisher / "plugin" / name).write_text("// Discovery only; never executed.\n")
            env["MARKBRIDGE_TEST_PUBLISHER_ROOT"] = str(publisher)
            result = subprocess.run(command, cwd=ROOT, env=env, text=True, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("requires explicit MARKBRIDGE_TEST_PUBLICATION_INPUTS", result.stderr)
            archive = root / "synthetic-input.zip"
            archive.write_bytes(b"discovery only")
            env["MARKBRIDGE_TEST_PUBLICATION_INPUTS"] = str(archive)
            result = subprocess.run(command, cwd=ROOT, env=env, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("Total: 4 tests in 1 file", result.stdout)
        result = subprocess.run(
            [
                "node",
                str(ROOT / "node_modules/@playwright/test/cli.js"),
                "test",
                "tests/browser/static-export-math.spec.cjs",
                "--project=desktop-chromium",
                "--list",
                "--reporter=list",
            ],
            cwd=ROOT,
            env=env,
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Total: 4 tests in 1 file", result.stdout)
        self.assertNotIn("optional retained", result.stdout)
        self.assertNotIn("optional frozen Publisher", result.stdout)


if __name__ == "__main__":
    unittest.main()
