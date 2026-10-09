"""Backend selection is configuration-based, never a conversion-error fallback."""

import json
import os
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]


class BackendSelectionTests(unittest.TestCase):
    def select(self, path="", constant=None, runtime_constant=None):
        setup = "function get_option($key, $default = '') { return " + json.dumps(path) + "; }"
        setup += "function add_action(...$args) {} function add_filter(...$args) {}"
        if constant is not None:
            setup += "define('MARKBRIDGE_CONVERTER_BACKEND', " + json.dumps(constant) + ");"
        if runtime_constant is not None:
            setup += "define('MARKBRIDGE_RUNTIME', " + json.dumps(runtime_constant) + ");"
        setup += "require $argv[1]; echo json_encode(mbb_converter_backend());"
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
        return json.loads(result.stdout)

    def test_new_install_is_php_without_config(self):
        self.assertEqual(self.select(), "php")

    def test_existing_runtime_keeps_node_even_if_path_is_missing(self):
        self.assertEqual(self.select(path="/missing/synthetic-runtime"), "node")
        self.assertEqual(self.select(runtime_constant="/missing/constant-runtime"), "node")

    def test_explicit_backend_wins(self):
        self.assertEqual(self.select(path="/old/runtime", constant="php"), "php")
        self.assertEqual(self.select(constant="node"), "node")
        self.assertEqual(self.select(constant="invalid"), "invalid")

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
