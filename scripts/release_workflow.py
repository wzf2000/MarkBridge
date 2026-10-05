"""Validate manual release inputs and prepare a reviewed, immutable artifact bundle."""

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import zipfile

VERSION = re.compile(
    r"(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:alpha|beta|rc)\.[1-9]\d*)?"
)
SHA = re.compile(r"[0-9a-f]{40}")


def validate_source(root, version, sha):
    if not VERSION.fullmatch(version):
        raise ValueError("Use X.Y.Z or X.Y.Z-{alpha,beta,rc}.N without a v prefix")
    if not SHA.fullmatch(sha):
        raise ValueError("Source must be a full commit SHA")
    actual = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
    if actual != sha:
        raise ValueError("Checkout does not match the pinned source SHA")
    package = json.loads((root / "package.json").read_text())
    lock = json.loads((root / "package-lock.json").read_text())
    versions = [package["version"], lock["version"], lock["packages"][""]["version"]]
    for filename, pattern in [
        ("plugin/markdown-block-bridge.php", r"^\s*(?:\*\s*)?Version:\s*(\S+)\s*$"),
        ("plugin/readme.txt", r"^Stable tag:\s*(\S+)\s*$"),
    ]:
        matches = re.findall(pattern, (root / filename).read_text(), re.MULTILINE)
        if len(matches) != 1:
            raise ValueError("Missing or ambiguous version in " + filename)
        versions.extend(matches)
    if any(value != version for value in versions):
        raise ValueError("Requested version differs from package, lock, plugin or stable tag")
    return changelog_section((root / "CHANGELOG.md").read_text(), version)


def changelog_section(text, version):
    sections = list(re.finditer(r"^## (\S+)(?:[^\n]*)$", text, re.MULTILINE))
    matches = [index for index, section in enumerate(sections) if section[1] == version]
    if len(matches) != 1 or matches[0] != 0:
        raise ValueError("Requested version must have one current CHANGELOG section")
    end = sections[1].start() if len(sections) > 1 else len(text)
    body = text[sections[0].end() : end].strip()
    if not body or not re.search(r"^- \S", body, re.MULTILINE):
        raise ValueError("Current CHANGELOG must describe the release changes")
    # Repository-relative links must work from the GitHub Release page.
    return re.sub(r"\]\((docs/[^)]+)\)", r"]({docs_base}/\1)", body)


def release_notes(section, version, repository):
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
        raise ValueError("Invalid GitHub repository")
    base = f"https://github.com/{repository}/blob/v{version}"
    section = section.replace("{docs_base}", base)
    return f"""MarkBridge 将 Markdown 写作与 WordPress 区块编辑连接起来，保存时同步两种格式。

## ✨ 主要功能

- Markdown 与区块双向编辑、差异预览与双格式修订恢复。
- 公式、代码展示与保存冲突保护。

## 🔧 {version} 更新

{section}

## ✅ 验证情况

本次发行包通过仓库 CI 的格式、源码、转换、浏览器、写回保护和包清单检查。转换测试使用公开最小运行环境；CI 未运行完整 WordPress 端到端验收，也不代表生产部署已验收。

支持范围与既有验收记录见[验证说明]({base}/docs/VALIDATION.md)。尚未覆盖所有浏览器与第三方主题／插件组合。

## 📦 安装说明

请下载附件中的 `markbridge-{version}.zip`，核对 SHA-256，并按[安装说明]({base}/docs/INSTALL.md)配置匹配的私有转换运行环境。升级时核对运行依赖契约，必要时重建环境并协调切换；已打开的编辑器请刷新后继续使用。

GitHub 自动生成的 Source code 压缩包是源码归档，不能直接作为完整插件安装包。发行不会自动部署或修改已有文章。

## 📄 开源许可

GPL-3.0-or-later。第三方组件许可见仓库声明。
"""


def verify_bundle(directory, version, sha):
    archive = directory / f"markbridge-{version}.zip"
    manifest_path = directory / f"markbridge-{version}.manifest.json"
    checksum = directory / f"markbridge-{version}.zip.sha256"
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    if checksum.read_text() != f"{digest}  {archive.name}\n":
        raise ValueError("ZIP checksum mismatch")
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes)
    if (
        manifest.get("schema") != 1
        or manifest.get("version") != version
        or manifest.get("source_commit") != sha
    ):
        raise ValueError("Artifact manifest version/source mismatch")
    expected = {"markbridge/" + name for name in manifest["files"]}
    expected.add("markbridge/release-manifest.json")
    with zipfile.ZipFile(archive) as bundle:
        if len(bundle.namelist()) != len(expected) or set(bundle.namelist()) != expected:
            raise ValueError("ZIP file inventory mismatch")
        if bundle.read("markbridge/release-manifest.json") != manifest_bytes:
            raise ValueError("External and embedded manifests differ")
        for name, file_digest in manifest["files"].items():
            if hashlib.sha256(bundle.read("markbridge/" + name)).hexdigest() != file_digest:
                raise ValueError("ZIP file checksum mismatch: " + name)
    return digest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", required=True)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--bundle", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    section = validate_source(root, args.version, args.sha)
    notes = release_notes(section, args.version, args.repository)
    if args.bundle:
        verify_bundle(args.bundle, args.version, args.sha)
        (args.bundle / "release-notes.md").write_text(notes)
        files = [
            f"markbridge-{args.version}.zip",
            f"markbridge-{args.version}.zip.sha256",
            f"markbridge-{args.version}.manifest.json",
            "release-notes.md",
        ]
        validation = {
            "version": args.version,
            "source_commit": args.sha,
            "files": {
                name: hashlib.sha256((args.bundle / name).read_bytes()).hexdigest()
                for name in files
            },
        }
        (args.bundle / "release-validation.json").write_text(
            json.dumps(validation, indent=2) + "\n"
        )
    print("Validated v" + args.version + " from " + args.sha)


if __name__ == "__main__":
    main()
