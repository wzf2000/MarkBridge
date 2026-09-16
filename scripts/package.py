"""Build the plugin ZIP from an explicit allowlist; never include runtime or site files."""

import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    subprocess.run(["python3", str(ROOT / "scripts/check_release.py")], check=True)
    if subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT, text=True).strip():
        raise RuntimeError("Package only from a clean source commit")
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    version = json.loads((ROOT / "package.json").read_text())["version"]
    output = ROOT / "dist"
    output.mkdir(exist_ok=True)
    archive = output / ("markbridge-" + version + ".zip")
    tracked = set(subprocess.check_output(["git", "ls-files"], cwd=ROOT, text=True).splitlines())
    assets = json.loads((ROOT / "plugin/assets.json").read_text())
    vendor = json.loads((ROOT / "plugin/vendor-manifest.json").read_text())
    generated = (
        {"assets.json", "runtime-contract.json", "vendor-manifest.json", "kernel.js", "emoji.js"}
        | set(assets.values())
        | set(vendor)
    )
    for name in generated:
        path = Path(name)
        if (
            path.is_absolute()
            or ".." in path.parts
            or not (ROOT / "plugin" / path).is_file()
            or (ROOT / "plugin" / path).is_symlink()
        ):
            raise RuntimeError("Invalid generated package path: " + name)
    for name, digest in vendor.items():
        if (
            not name.startswith(("vendor/mathjax-4.1.3/", "vendor/mathjax-newcm-font/"))
            or hashlib.sha256((ROOT / "plugin" / name).read_bytes()).hexdigest() != digest
        ):
            raise RuntimeError("Vendor build manifest mismatch: " + name)
    allowed = {name for name in tracked if name.startswith(("plugin/", "docs/"))}
    allowed |= {"plugin/" + name for name in generated}
    allowed |= {"LICENSE", "NOTICE.md", "README.md", "CHANGELOG.md", "CONTRIBUTING.md"}
    for directory in ["plugin", "docs"]:
        for path in (ROOT / directory).rglob("*"):
            name = str(path.relative_to(ROOT))
            if path.is_symlink():
                raise RuntimeError("Symlinks are not release files: " + name)
            if path.is_file() and name not in allowed:
                # Old content-hashed UI outputs are never part of the current package.
                if (
                    directory == "plugin"
                    and path.parent == ROOT / "plugin"
                    and __import__("re").search(r"-[a-f0-9]{12}\.", path.name)
                ):
                    continue
                raise RuntimeError("Unexpected untracked release file: " + name)
    files = {
        (
            "markbridge/" + name[len("plugin/") :]
            if name.startswith("plugin/")
            else "markbridge/" + name
        ): ROOT
        / name
        for name in sorted(allowed)
    }
    manifest = {
        "schema": 1,
        "version": version,
        "source_commit": commit,
        "files": {
            name[len("markbridge/") :]: hashlib.sha256(path.read_bytes()).hexdigest()
            for name, path in sorted(files.items())
        },
    }
    manifest_bytes = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode()
    candidate = archive.with_suffix(".zip.tmp")
    with zipfile.ZipFile(candidate, "w", zipfile.ZIP_DEFLATED) as bundle:
        info = zipfile.ZipInfo("markbridge/release-manifest.json", (2026, 1, 1, 0, 0, 0))
        info.external_attr = 0o100644 << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        bundle.writestr(info, manifest_bytes)
        for name, path in sorted(files.items()):
            info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            bundle.writestr(info, path.read_bytes())
    if archive.exists() and archive.read_bytes() != candidate.read_bytes():
        candidate.unlink()
        raise RuntimeError("Refusing to replace a different package with the same version")
    candidate.replace(archive)
    with zipfile.ZipFile(archive) as bundle:
        if bundle.testzip() is not None:
            raise RuntimeError("Archive CRC failed")
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_suffix(".zip.sha256").write_text(digest + "  " + archive.name + "\n")
    archive.with_suffix(".manifest.json").write_bytes(manifest_bytes)
    print("Created and CRC-verified:", archive.name, len(files), "files")


if __name__ == "__main__":
    main()
