"""Preparation and PHP diagnostics agree on stable Node version admission."""

import importlib.util
import json
import os
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "prepare_runtime", ROOT / "scripts/prepare_runtime.py"
)
PREPARE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PREPARE)


class RuntimeVersionTests(unittest.TestCase):
    def test_python_and_php_admit_the_same_versions(self):
        cases = {
            "v24.22.1": True,
            "v24.22.2": True,
            "v25.0.0": True,
            "v26.0.0": True,
            "v24.22.0": False,
            "v24.15.0": False,
            "v22.22.2": False,
            "": False,
            "24.22.1": False,
            "v24.22": False,
            "v24.22.1.0": False,
            "v24.22.1-rc.1": False,
            "v24.22.1+build": False,
            "v24.22.1junk": False,
            "vv24.22.1": False,
            "v024.22.1": False,
            "v24.022.1": False,
            "v24.22.01": False,
            "v24.22.1\n": False,
            "damaged": False,
        }
        result = subprocess.run(
            [
                os.environ.get("MARKBRIDGE_TEST_PHP", "php"),
                "-r",
                "function add_action() {} require $argv[1]; "
                "echo json_encode(array_map('mbb_runtime_node_supported', json_decode($argv[2], true)));",
                str(ROOT / "plugin/includes/runtime-settings.php"),
                json.dumps(list(cases)),
            ],
            text=True,
            capture_output=True,
            check=True,
        )
        php_results = json.loads(result.stdout)
        self.assertEqual(len(php_results), len(cases))
        for (version, expected), php_result in zip(cases.items(), php_results):
            with self.subTest(version=version):
                self.assertEqual(PREPARE.supported_node_version(version), expected)
                self.assertEqual(php_result, expected)

    def test_manifest_requires_the_same_supported_executable(self):
        cases = [
            ["v24.22.1", "v24.22.1", True],
            ["v24.22.2", "v24.22.1", False],
            ["v24.22.0", "v24.22.0", False],
            ["v24.22.1-rc.1", "v24.22.1-rc.1", False],
            ["damaged", "damaged", False],
            ["v24.22.1", None, False],
            ["", "", False],
            ["v26.0.0", "v26.0.0", True],
        ]
        result = subprocess.run(
            [
                os.environ.get("MARKBRIDGE_TEST_PHP", "php"),
                "-r",
                "function add_action() {} require $argv[1]; "
                "echo json_encode(array_map(fn($c) => mbb_runtime_node_matches($c[0], $c[1]), json_decode($argv[2], true)));",
                str(ROOT / "plugin/includes/runtime-settings.php"),
                json.dumps(cases),
            ],
            text=True,
            capture_output=True,
            check=True,
        )
        self.assertEqual(json.loads(result.stdout), [case[2] for case in cases])


if __name__ == "__main__":
    unittest.main()
