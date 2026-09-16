"""Verify an installed plugin against an externally supplied release manifest."""

import argparse
import hashlib
import json
from pathlib import Path


def verify(root, manifest):
    expected = manifest["files"]
    actual = {}
    for path in root.rglob("*"):
        if path.is_symlink():
            actual[str(path.relative_to(root))] = "symlink"
        elif path.is_file() and path != root / "release-manifest.json":
            actual[str(path.relative_to(root))] = hashlib.sha256(path.read_bytes()).hexdigest()
    return {
        "missing": sorted(set(expected) - set(actual)),
        "extra": sorted(set(actual) - set(expected)),
        "modified": sorted(
            name for name in set(expected) & set(actual) if expected[name] != actual[name]
        ),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument(
        "--manifest",
        required=True,
        type=Path,
        help="Trusted manifest extracted from the release ZIP",
    )
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text())
    result = verify(args.directory.resolve(), manifest)
    installed = args.directory / "release-manifest.json"
    if (
        not installed.is_file()
        or installed.is_symlink()
        or installed.read_bytes() != args.manifest.read_bytes()
    ):
        result["modified"].append("release-manifest.json")
    print(json.dumps(result, indent=2))
    raise SystemExit(1 if any(result.values()) else 0)


if __name__ == "__main__":
    main()
