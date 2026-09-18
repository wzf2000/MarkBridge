"""Build a specific local commit in a new checkout; never publish or deploy."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--runtime", type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    commit = subprocess.check_output(
        ["git", "rev-parse", args.commit + "^{commit}"], cwd=root, text=True
    ).strip()
    if args.output.exists():
        parser.error("Output must be a new directory")
    subprocess.run(
        ["git", "clone", "--no-hardlinks", "--no-checkout", str(root), str(args.output)], check=True
    )
    subprocess.run(["git", "checkout", "--detach", commit], cwd=args.output, check=True)
    subprocess.run([sys.executable, "-m", "venv", str(args.output / ".venv")], check=True)
    python = args.output.resolve() / ".venv/bin/python"
    subprocess.run(
        [str(python), "-m", "pip", "install", "-r", "requirements-dev.txt"],
        cwd=args.output,
        check=True,
    )
    import os

    env = dict(
        os.environ,
        MARKBRIDGE_TEST_RUNTIME=str(args.runtime.resolve()),
        MARKBRIDGE_PYTHON=str(python),
    )
    for command in [
        ["npm", "ci", "--ignore-scripts"],
        ["npm", "run", "check"],
        ["npm", "test"],
        ["npm", "run", "package"],
    ]:
        subprocess.run(command, cwd=args.output, env=env, check=True)
        if command == ["npm", "run", "check"]:
            manifest = json.loads((args.runtime / "manifest.json").read_text())
            pairs = [
                (
                    "kernel_sha256",
                    "kernel.js",
                    "site/wp-content/plugins/markdown-block-bridge/kernel.js",
                ),
                ("worker_sha256", "worker.cjs", "worker.cjs"),
            ]
            for field, plugin_file, runtime_file in pairs:
                expected = hashlib.sha256(
                    (args.output / "plugin" / plugin_file).read_bytes()
                ).hexdigest()
                actual = hashlib.sha256((args.runtime / runtime_file).read_bytes()).hexdigest()
                if expected != actual or manifest.get(field) != expected:
                    raise RuntimeError("Test runtime does not match source: " + plugin_file)
            contract = json.loads((args.output / "plugin/runtime-contract.json").read_text())
            if manifest.get("runtime_sha256") != contract:
                raise RuntimeError("Test runtime dependency contract does not match source")
    print("Clean candidate built from", commit)


if __name__ == "__main__":
    main()
