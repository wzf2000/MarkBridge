"""Build a private, site-matched conversion runtime without copying editor sessions."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wordpress", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--wp-cli", default="wp")
    parser.add_argument("--node", default=shutil.which("node"))
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    wordpress = args.wordpress.resolve()
    output = args.output.resolve()
    if output == Path("/") or output == wordpress or wordpress in output.parents:
        parser.error("Runtime must be outside the public WordPress directory")
    if output.exists():
        parser.error("Output already exists; use a new directory and switch after verification")
    if not args.node or not (root / "plugin/kernel.js").is_file():
        parser.error("Node.js and npm run build are required")
    node = Path(args.node).resolve()
    version = subprocess.check_output([str(node), "--version"], text=True).strip()
    if tuple(int(part) for part in version.lstrip("v").split(".")[:3]) < (24, 15, 0):
        parser.error("Use Node.js 24 LTS (24.15.0 or newer)")
    command = [
        args.wp_cli,
        "--path=" + str(wordpress),
        "--skip-plugins",
        "--skip-themes",
        "eval-file",
        str(root / "scripts/runtime-manifest.php"),
    ]
    manifest = json.loads(subprocess.check_output(command, text=True))
    if manifest.get("format") != 1 or not manifest.get("scripts"):
        raise RuntimeError("Unsupported or empty WordPress runtime manifest")
    for public_root in manifest.get("public_roots", []):
        public = Path(public_root).resolve()
        if output == public or public in output.parents:
            parser.error("Runtime must be outside every public content and upload directory")
    output.parent.mkdir(mode=0o750, parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix="." + output.name + ".building-", dir=output.parent))
    try:
        staging.chmod(0o750)
        (staging / "run").mkdir()
        (staging / "node/bin").mkdir(parents=True)
        shutil.copy2(node, staging / "node/bin/node")
        runtime_hashes = {}
        for name in ["package.json", "package-lock.json"]:
            source = root / "runtime" / name
            shutil.copy2(source, staging / name)
            runtime_hashes[name] = hashlib.sha256(source.read_bytes()).hexdigest()
        worker = root / "plugin/worker.cjs"
        shutil.copy2(worker, staging / "worker.cjs")
        scripts = []
        hashes = {}
        for name in manifest["scripts"]:
            source = (wordpress / name.lstrip("/")).resolve()
            if wordpress not in source.parents:
                raise RuntimeError("Core source escapes WordPress root")
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            if manifest.get("core_sha256", {}).get(name) != digest:
                raise RuntimeError("Core source changed while preparing runtime: " + name)
            target = staging / "site" / name.lstrip("/")
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            hashes[name] = digest
            scripts.append('<script src="http://markbridge.invalid' + name + '"></script>')
        scripts.append("<script>wp.blockLibrary.registerCoreBlocks();</script>")
        kernel = "wp-content/plugins/markdown-block-bridge/kernel.js"
        target = staging / "site" / kernel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(root / "plugin/kernel.js", target)
        scripts.append('<script src="http://markbridge.invalid/' + kernel + '"></script>')
        (staging / "run/worker-bootstrap.html").write_text(
            '<!doctype html><html><head><meta charset="utf-8"></head><body>'
            + "\n".join(scripts)
            + "</body></html>",
            encoding="utf-8",
        )
        (staging / "manifest.json").write_text(
            json.dumps(
                {
                    "format": 1,
                    "wordpress": manifest["wordpress"],
                    "node": version,
                    "core_sha256": hashes,
                    "kernel_sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
                    "worker_sha256": hashlib.sha256(worker.read_bytes()).hexdigest(),
                    "bootstrap_sha256": hashlib.sha256(
                        (staging / "run/worker-bootstrap.html").read_bytes()
                    ).hexdigest(),
                    "runtime_sha256": runtime_hashes,
                },
                indent=2,
            )
            + "\n"
        )
        # npm installs jsdom only. No lifecycle scripts are needed by this runtime.
        env = dict(os.environ)
        env["PATH"] = str(node.parent) + os.pathsep + env.get("PATH", "")
        subprocess.run(
            ["npm", "ci", "--omit=dev", "--ignore-scripts"],
            cwd=staging,
            env=env,
            check=True,
        )
        sample = json.dumps(
            {
                "mode": "markdown",
                "source": "# Runtime check\n\nHello **blocks**.\n",
                "documentId": "runtime-check",
            }
        )
        result = subprocess.run(
            [str(staging / "node/bin/node"), str(staging / "worker.cjs"), str(staging)],
            input=sample,
            text=True,
            capture_output=True,
            check=True,
        )
        document = json.loads(result.stdout)
        if not document.get("ok"):
            raise RuntimeError("Runtime smoke test failed: " + str(document))
        if output.exists():
            raise RuntimeError("Output appeared during build; refusing to replace it")
        staging.replace(output)
    except BaseException:
        shutil.rmtree(staging, ignore_errors=True)
        raise
    print("Prepared and smoke-tested private runtime:", output)
    print("Assign it to your PHP-FPM user, then configure MARKBRIDGE_RUNTIME.")


if __name__ == "__main__":
    main()
