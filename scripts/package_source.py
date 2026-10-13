"""Prepare readable, versioned sources and locked build inputs separately from the install ZIP."""

import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def source_file(name, directory=ROOT):
    """Archive names and every input path component remain inside the reviewed tree."""
    if (
        not isinstance(name, str)
        or not name
        or "\\" in name
        or any(ord(character) < 32 or ord(character) == 127 for character in name)
        or PurePosixPath(name).is_absolute()
        or any(part in ("", ".", "..") for part in name.split("/"))
    ):
        raise RuntimeError("Unexpected source archive path")
    directory = Path(directory).resolve()
    source = directory
    for part in name.split("/"):
        source = source / part
        if source.is_symlink():
            raise RuntimeError("Source archive inputs cannot contain symbolic links")
    try:
        source.resolve().relative_to(directory)
    except ValueError as error:
        raise RuntimeError("Source archive input escapes the reviewed tree") from error
    if not source.is_file():
        raise RuntimeError("Source archive input is not a regular file in the reviewed tree")
    return source


def main():
    if subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT, text=True).strip():
        raise RuntimeError("Source archive requires a clean reviewed commit")
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    version = json.loads((ROOT / "package.json").read_text())["version"]
    tracked = subprocess.check_output(["git", "ls-files"], cwd=ROOT, text=True).splitlines()
    files = {}
    for name in tracked:
        if name in ("SOURCE-README.md", "source-manifest.json"):
            raise RuntimeError("Tracked source conflicts with reserved archive metadata")
        files[name] = source_file(name, ROOT)
    vendor = json.loads((ROOT / "plugin/vendor-manifest.json").read_text())
    for name, expected in vendor.items():
        source = source_file(name, ROOT / "plugin")
        if not isinstance(expected, str) or not re.fullmatch(r"[a-f0-9]{64}", expected):
            raise RuntimeError("Unexpected third-party source digest")
        if name.startswith(("vendor/mathjax-newcm-font/mjs/", "vendor/mathjax-newcm-font/def/")):
            if hashlib.sha256(source.read_bytes()).hexdigest() != expected:
                raise RuntimeError("Readable font module does not match the build manifest")
            destination = "third-party/" + name[len("vendor/") :]
            if destination in files:
                raise RuntimeError("Readable third-party source conflicts with a tracked file")
            files[destination] = source
    instructions = (
        "# Readable source archive\n\n"
        f"MarkBridge {version}, reviewed source commit `{commit}`.\n\n"
        "This is not an installable plugin. It contains project source, locks, build scripts, "
        "tests, licenses and readable CHTML/common font modules. No runtime, credentials or site data.\n\n"
        "Use the documented developer prerequisites, run `npm ci`, install the Python format tools "
        "from `requirements-dev.txt`, then `npm run build:php` and `npm run build`. "
        "Dependencies resolve from the exact npm/Composer lockfiles; these commands require "
        "access to their public registries. `gettext` supplies `msgfmt`.\n\n"
        "Building the official installation ZIP additionally requires a clean Git checkout "
        "of the exact source commit, because the packaging guard records and verifies Git identity. "
        "Do not disable that guard or treat a newly initialized repository as the original commit.\n\n"
        "See NOTICE.md for original third-party sources. The font npm package's declared repository "
        "was unavailable at preparation time; supplied readable modules are not claimed to be its "
        "unavailable original TypeScript tree. The manifest verifies integrity, not publisher identity.\n"
    ).encode()
    payload = {name: source.read_bytes() for name, source in files.items()}
    payload["SOURCE-README.md"] = instructions
    manifest = {
        "schema": 1,
        "kind": "source",
        "version": version,
        "source_commit": commit,
        "files": {name: hashlib.sha256(body).hexdigest() for name, body in sorted(payload.items())},
    }
    raw = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode()
    payload["source-manifest.json"] = raw
    output = ROOT / "dist"
    output.mkdir(exist_ok=True)
    archive = output / f"markbridge-{version}-source.zip"
    candidate = archive.with_suffix(".zip.tmp")
    try:
        with zipfile.ZipFile(candidate, "w", zipfile.ZIP_DEFLATED) as bundle:
            for name, body in sorted(payload.items()):
                info = zipfile.ZipInfo("markbridge-source/" + name, (2026, 1, 1, 0, 0, 0))
                info.external_attr = 0o100644 << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                bundle.writestr(info, body)
        with zipfile.ZipFile(candidate) as bundle:
            if bundle.testzip() is not None:
                raise RuntimeError("Source archive CRC failed")
        if archive.exists() and archive.read_bytes() != candidate.read_bytes():
            raise RuntimeError("Refusing to overwrite a different source archive with this version")
        candidate.replace(archive)
    finally:
        if candidate.exists():
            candidate.unlink()
    archive.with_suffix(".manifest.json").write_bytes(raw)
    archive.with_suffix(".zip.sha256").write_text(
        hashlib.sha256(archive.read_bytes()).hexdigest() + "  " + archive.name + "\n"
    )
    print("Created readable source archive:", archive.name, len(payload), "files")


if __name__ == "__main__":
    main()
