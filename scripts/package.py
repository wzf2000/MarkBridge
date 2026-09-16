"""Build the plugin ZIP from an explicit allowlist; never include runtime or site files."""

import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    subprocess.run(["python3", str(ROOT / "scripts/check_release.py")], check=True)
    version = json.loads((ROOT / "package.json").read_text())["version"]
    output = ROOT / "dist"
    output.mkdir(exist_ok=True)
    archive = output / ("markbridge-" + version + ".zip")
    files = {
        "markbridge/" + str(path.relative_to(ROOT / "plugin")): path
        for path in (ROOT / "plugin").rglob("*")
        if path.is_file()
        and (
            not __import__("re").search(r"-[a-f0-9]{12}\.", path.name)
            or path.name in json.loads((ROOT / "plugin/assets.json").read_text()).values()
        )
    }
    for name in ["LICENSE", "NOTICE.md", "README.md", "CHANGELOG.md", "CONTRIBUTING.md"]:
        files["markbridge/" + name] = ROOT / name
    for path in (ROOT / "docs").rglob("*"):
        if path.is_file():
            files["markbridge/docs/" + str(path.relative_to(ROOT / "docs"))] = path
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for name, path in sorted(files.items()):
            info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            bundle.writestr(info, path.read_bytes())
    with zipfile.ZipFile(archive) as bundle:
        if bundle.testzip() is not None:
            raise RuntimeError("Archive CRC failed")
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_suffix(".zip.sha256").write_text(digest + "  " + archive.name + "\n")
    print("Created and CRC-verified:", archive.name, len(files), "files")


if __name__ == "__main__":
    main()
