"""Backend selection is configuration-based, never a conversion-error fallback."""

import json
import os
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]


class BackendSelectionTests(unittest.TestCase):
    def select(self, path="", constant=None, runtime_constant=None, details=False, **options):
        values = {"mbb_runtime_path": path, **options}
        setup = "$options = json_decode($argv[2], true);"
        setup += "function get_option($key, $default = '') { global $options; return array_key_exists($key, $options) ? $options[$key] : $default; }"
        setup += "function add_action(...$args) {} function add_filter(...$args) {}"
        if constant is not None:
            setup += "define('MARKBRIDGE_CONVERTER_BACKEND', " + json.dumps(constant) + ");"
        if runtime_constant is not None:
            setup += "define('MARKBRIDGE_RUNTIME', " + json.dumps(runtime_constant) + ");"
        setup += "require $argv[1]; echo json_encode([mbb_converter_backend(), mbb_runtime_configuration()]);"
        result = subprocess.run(
            [
                os.environ.get("MARKBRIDGE_TEST_PHP", "php"),
                "-r",
                setup,
                str(ROOT / "plugin/includes/runtime-settings.php"),
                json.dumps(values),
            ],
            text=True,
            capture_output=True,
            check=True,
        )
        return json.loads(result.stdout) if details else json.loads(result.stdout)[0]

    def test_new_install_is_php_without_config(self):
        self.assertEqual(self.select(), "php")

    def test_existing_runtime_keeps_node_even_if_path_is_missing(self):
        self.assertEqual(self.select(path="/missing/synthetic-runtime"), "node")
        self.assertEqual(self.select(runtime_constant="/missing/constant-runtime"), "node")

    def test_explicit_backend_wins(self):
        self.assertEqual(self.select(path="/old/runtime", constant="php"), "php")
        self.assertEqual(self.select(constant="node"), "node")
        self.assertEqual(self.select(constant="invalid"), "invalid")

    def test_database_choice_wins_over_legacy_inference(self):
        for backend in ["php", "node"]:
            with self.subTest(backend=backend):
                self.assertEqual(
                    self.select(
                        path="/old/runtime",
                        runtime_constant="/constant/runtime",
                        mbb_converter_settings={"backend": backend, "runtime_path": "/new/runtime"},
                    ),
                    backend,
                )
        self.assertEqual(
            self.select(
                constant="php",
                mbb_converter_settings={"backend": "node", "runtime_path": "/new/runtime"},
            ),
            "php",
        )

    def test_present_corruption_rejects_instead_of_guessing(self):
        for corrupt in [
            None,
            False,
            "node",
            [],
            {},
            {"backend": "node"},
            {"backend": "unknown", "runtime_path": ""},
            {"backend": "php", "runtime_path": False},
            {"backend": "php", "runtime_path": "", "extra": True},
        ]:
            with self.subTest(corrupt=corrupt):
                self.assertEqual(
                    self.select(path="/old/runtime", mbb_converter_settings=corrupt), "invalid"
                )
        self.assertEqual(self.select(constant="php", mbb_converter_settings=None), "php")

    def test_real_directory_precedence_and_corrupt_directory(self):
        settings = {"backend": "php", "runtime_path": "/new/runtime"}
        result = self.select(path="/old/runtime", mbb_converter_settings=settings, details=True)
        self.assertEqual(
            result, ["php", {"source": "database", "path": "/new/runtime", "managed": False}]
        )
        result = self.select(
            path="/old/runtime",
            runtime_constant="/constant/runtime",
            mbb_converter_settings=settings,
            details=True,
        )
        self.assertEqual(
            result, ["php", {"source": "constant", "path": "/constant/runtime", "managed": True}]
        )
        result = self.select(path="/old/runtime", mbb_converter_settings=None, details=True)
        self.assertEqual(result, ["invalid", {"source": "invalid", "path": "", "managed": False}])

    def test_disabled_process_returns_503_instead_of_fatal(self):
        setup = "function get_option($key, $default = '') { return $default; } function add_action(...$args) {}"
        setup += "function mbb_error($code, $message, $status) { return ['code'=>$code,'status'=>$status]; }"
        setup += "require $argv[1]; echo json_encode(mbb_run_worker([]));"
        result = subprocess.run(
            [
                os.environ.get("MARKBRIDGE_TEST_PHP", "php"),
                "-d",
                "disable_functions=proc_open",
                "-r",
                setup,
                str(ROOT / "plugin/includes/runtime-settings.php"),
            ],
            text=True,
            capture_output=True,
            check=True,
        )
        self.assertEqual(json.loads(result.stdout), {"code": "worker", "status": 503})

    def test_invalid_database_configuration_dispatch_rejects_503(self):
        setup = "function get_option($key, $default = '') { return $key === 'mbb_converter_settings' ? null : '/old/runtime'; }"
        setup += "function add_action(...$args) {} function mbb_error($code, $message, $status) { return ['code'=>$code,'status'=>$status]; }"
        setup += "require $argv[1]; echo json_encode(mbb_converter_dispatch([]));"
        result = subprocess.run(
            [
                os.environ.get("MARKBRIDGE_TEST_PHP", "php"),
                "-r",
                setup,
                str(ROOT / "plugin/includes/runtime-settings.php"),
            ],
            text=True,
            capture_output=True,
            check=True,
        )
        self.assertEqual(json.loads(result.stdout), {"code": "conversion_backend", "status": 503})

    def test_foreign_dependencies_and_composer_do_not_collide(self):
        for order in ["before", "after"]:
            with self.subTest(order=order):
                foreign = """
                namespace League\\CommonMark\\Parser { class MarkdownParser {} }
                namespace Nette\\Schema { class Processor {} }
                namespace Composer\\Autoload { class ClassLoader {} }
                namespace Composer { class InstalledVersions {} }
                namespace Psr\\EventDispatcher { interface EventDispatcherInterface {} }
                """
                load = "require $argv[1];"
                setup = "eval($argv[2]);" + load if order == "before" else load + "eval($argv[2]);"
                setup += """
                $result = \\MarkBridge\\Probe\\Worker::convert([
                    'mode'=>'markdown','source'=>'# **Isolated**','documentId'=>'isolation'
                ]);
                $foreign = new \\ReflectionClass('League\\CommonMark\\Parser\\MarkdownParser');
                echo json_encode(['ok'=>$result['ok'], 'foreign_retained'=>str_contains($foreign->getFileName(), "eval()'d code")]);
                """
                result = subprocess.run(
                    [
                        os.environ.get("MARKBRIDGE_TEST_PHP", "php"),
                        "-r",
                        setup,
                        str(ROOT / "plugin/includes/php-converter/Worker.php"),
                        foreign,
                    ],
                    text=True,
                    capture_output=True,
                    check=True,
                )
                self.assertEqual(json.loads(result.stdout), {"ok": True, "foreign_retained": True})


if __name__ == "__main__":
    unittest.main()
