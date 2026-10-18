"""Guard the three real backend save passes without executing a WordPress site."""

from pathlib import Path
import os
import tempfile
import re
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]


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
