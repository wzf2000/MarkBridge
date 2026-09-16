"""Check source syntax and keep operational material out of a public release."""

import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SKIP = {".git", ".venv", "node_modules", "vendor", "dist", ".runtime", "__pycache__"}


def main():
    checked = 0
    for path in ROOT.rglob("*"):
        if not path.is_file() or SKIP.intersection(path.relative_to(ROOT).parts):
            continue
        if path.suffix == ".php":
            subprocess.run(["php", "-l", str(path)], check=True, capture_output=True)
        if path.suffix in {".php", ".js", ".cjs", ".py", ".json", ".md", ".html", ".yml"}:
            text = path.read_text(encoding="utf-8")
            patterns = [
                r"/home/(?:ubuntu|root)/",
                r"/www/" + r"wwwroot/",
                r"https?://wzf[0-9]+\.top",
                r"-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----",
            ]
            if any(re.search(pattern, text) for pattern in patterns):
                raise RuntimeError("Private deployment reference in " + str(path.relative_to(ROOT)))
            checked += 1
    package = json.loads((ROOT / "package.json").read_text())
    header = (ROOT / "plugin/markdown-block-bridge.php").read_text()
    if "Version: " + package["version"] not in header:
        raise RuntimeError("Plugin/package version mismatch")
    if package["license"] != "GPL-3.0-or-later" or not (ROOT / "LICENSE").is_file():
        raise RuntimeError("Missing license")
    assets = json.loads((ROOT / "plugin/assets.json").read_text())
    for target in assets.values():
        if not (ROOT / "plugin" / target).is_file():
            raise RuntimeError("Missing browser build asset")
    math = (ROOT / "plugin" / assets["math.js"]).read_text()
    if assets["math-engine.html"] not in math:
        raise RuntimeError("Formula loader does not reference the hashed engine")
    for required in ["clipboard-LICENSE.txt", "emojilib-LICENSE.txt", "wp-editormd-GPL-3.0.txt"]:
        if not (ROOT / "plugin/licenses" / required).is_file():
            raise RuntimeError("Missing third-party license: " + required)
    print("Release source, PHP syntax, version and asset checks passed:", checked, "files")


if __name__ == "__main__":
    main()
