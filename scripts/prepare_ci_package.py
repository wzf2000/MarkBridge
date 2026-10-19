"""Verify internal CI ZIP inputs before restoring only generated source-tree assets."""

import argparse
import json
from pathlib import Path
import subprocess
import zipfile

from release_workflow import validate_source, verify_bundle

ROOT = Path(__file__).resolve().parents[1]


def hydrate(bundle, version):
    """Retain tracked source files; restore the exact generated assets from the ZIP."""
    tracked = set(subprocess.check_output(["git", "ls-files"], cwd=ROOT, text=True).splitlines())
    with zipfile.ZipFile(bundle / f"markbridge-{version}.zip") as archive:

        def data(name):
            return json.loads(archive.read("markbridge/" + name))

        names = {
            "assets.json",
            "runtime-contract.json",
            "vendor-manifest.json",
            "php-converter-manifest.json",
            "kernel.js",
            "emoji.js",
        }
        names.update(data("assets.json").values())
        names.update(data("vendor-manifest.json"))
        names.update(data("php-converter-manifest.json")["files"])
        for name in sorted(names):
            relative = Path(name)
            if relative.is_absolute() or ".." in relative.parts:
                raise ValueError("Generated asset escapes plugin root")
            target = ROOT / "plugin" / relative
            if target.is_symlink() or any(parent.is_symlink() for parent in target.parents):
                raise ValueError("Generated asset target is a symlink")
            body = archive.read("markbridge/" + name)
            if "plugin/" + name in tracked:
                if not target.is_file() or target.read_bytes() != body:
                    raise ValueError("ZIP would replace tracked source: " + name)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(body)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", required=True, type=Path)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--hydrate", action="store_true")
    args = parser.parse_args()
    version = json.loads((ROOT / "package.json").read_text())["version"]
    validate_source(ROOT, version, args.sha)
    verify_bundle(args.bundle, version, args.sha)
    if args.hydrate:
        hydrate(args.bundle, version)
    print("Verified same-source ZIP and external manifest:", args.sha)


if __name__ == "__main__":
    main()
