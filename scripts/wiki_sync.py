"""Generate curated user documentation and safely apply it to an initialized Wiki."""

import argparse
import hashlib
import json
import posixpath
import re
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

PAGES = {
    "docs/INSTALL.md": ("Installation", "安装与升级"),
    "docs/USAGE.md": ("Usage", "内容编辑指南"),
    "docs/EMOJI-PACKS.md": ("Emoji-Packs", "图片表情数据包"),
    "CHANGELOG.md": ("Changelog", "更新记录"),
}
MANIFEST = ".markbridge-wiki.json"
BOOTSTRAP_HOME = "初始化"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def rewrite_markdown(text, source, repository, sha):
    """Rewrite destinations, leaving fenced/inline code and absolute URLs intact."""
    wiki = f"https://github.com/{repository}/wiki"

    def destination(target, image=False):
        parsed = urlsplit(target)
        if parsed.scheme or parsed.netloc or not parsed.path:
            return target
        path = posixpath.normpath(posixpath.join(posixpath.dirname(source), unquote(parsed.path)))
        if path == ".." or path.startswith("../") or path.startswith("/"):
            raise ValueError(f"Link escapes repository in {source}: {target}")
        suffix = (f"?{parsed.query}" if parsed.query else "") + (
            f"#{parsed.fragment}" if parsed.fragment else ""
        )
        if path in PAGES and not image:
            return f"{wiki}/{PAGES[path][0]}{suffix}"
        if image:
            return f"https://raw.githubusercontent.com/{repository}/{sha}/{quote(path)}{suffix}"
        return f"https://github.com/{repository}/blob/{sha}/{quote(path)}{suffix}"

    image_refs = {
        match[1].strip().lower() for match in re.finditer(r"!\[[^\]]*\]\[([^\]]+)\]", text)
    }

    def rewrite_line(line):
        # Reference definitions and inline links support <dest> and optional titles.
        line = re.sub(
            r"^( {0,3}\[(?!\^)[^\]]+\]:\s*)(<?)([^\s>]+)(>?)(.*)$",
            lambda m: m[1]
            + m[2]
            + destination(m[3], re.search(r"\[([^\]]+)\]", m[1])[1].strip().lower() in image_refs)
            + m[4]
            + m[5],
            line,
        )
        return re.sub(
            r"(!?\[[^\]\n]*\]\(\s*)(<?)([^\s)>]+)(>?)([^)\n]*\))",
            lambda m: m[1] + m[2] + destination(m[3], m[1].startswith("!")) + m[4] + m[5],
            line,
        )

    output = []
    fence = None
    for line in text.splitlines(keepends=True):
        marker = re.match(r"^ {0,3}(`{3,}|~{3,})(.*)$", line)
        if fence:
            output.append(line)
            if (
                marker
                and marker[1][0] == fence[0]
                and len(marker[1]) >= len(fence)
                and not marker[2].strip()
            ):
                fence = None
            continue
        if marker:
            fence = marker[1]
            output.append(line)
            continue
        # Code spans are literals, even when they contain Markdown-looking links.
        parts = re.split(r"(`+[^`]*`+)", line)
        output.append(
            "".join(part if i % 2 else rewrite_line(part) for i, part in enumerate(parts))
        )
    return "".join(output)


def generate(root, output, repository, sha):
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
        raise ValueError("Expected repository owner/name")
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("Expected full 40-character source commit SHA")
    if output.exists():
        raise ValueError("Output must be a fresh staging directory")
    pages = {}
    for source, (page, _) in PAGES.items():
        text = (root / source).read_text(encoding="utf-8")
        banner = f"> 自动同步自 [源码 `{sha[:12]}`](https://github.com/{repository}/blob/{sha}/{source})；请在仓库修改本文。\n\n"
        pages[f"{page}.md"] = banner + rewrite_markdown(text, source, repository, sha)
    wiki = f"https://github.com/{repository}/wiki"
    links = "".join(f"- [{title}]({wiki}/{page})\n" for page, title in PAGES.values())
    pages["Home.md"] = (
        "# MarkBridge 使用文档\n\n"
        "本 Wiki 由仓库文档自动生成，介绍 `main` 的当前行为，可能包含尚未发布的变更。"
        "安装已发布版本时，请以该版本 Release 中固定源码提交的文档为准。\n\n"
        + links
        + f"\n[下载与版本说明](https://github.com/{repository}/releases) · "
        + f"[本次源码 `{sha[:12]}`](https://github.com/{repository}/tree/{sha}) · "
        + f"[验证范围](https://github.com/{repository}/blob/{sha}/docs/VALIDATION.md)\n"
    )
    pages["_Sidebar.md"] = f"[使用文档首页]({wiki}/Home)\n\n" + links
    output.mkdir(parents=True)
    hashes = {}
    for name, text in pages.items():
        data = text.encode("utf-8")
        (output / name).write_bytes(data)
        hashes[name] = digest(data)
    (output / MANIFEST).write_text(
        json.dumps({"schema": 1, "source_sha": sha, "files": hashes}, indent=2) + "\n",
        encoding="utf-8",
    )


def manifest(directory):
    if (directory / MANIFEST).is_symlink():
        raise ValueError("Refusing Wiki manifest symlink")
    data = json.loads((directory / MANIFEST).read_text(encoding="utf-8"))
    if data.get("schema") != 1 or not isinstance(data.get("files"), dict):
        raise ValueError("Unsupported Wiki manifest")
    for name, checksum in data["files"].items():
        if not re.fullmatch(r"[A-Za-z0-9_-]+\.md", name) or not re.fullmatch(
            r"[0-9a-f]{64}", checksum
        ):
            raise ValueError("Invalid managed file entry")
    return data


def apply(staging, wiki, bootstrap=False):
    if not wiki.is_dir() or not (wiki / ".git").exists():
        raise ValueError("Target must be an initialized Wiki Git clone")
    new = manifest(staging)
    old = manifest(wiki) if (wiki / MANIFEST).exists() else {"files": {}}
    for name, checksum in new["files"].items():
        file = staging / name
        if file.is_symlink() or not file.is_file() or digest(file.read_bytes()) != checksum:
            raise ValueError(f"Staging content does not match manifest: {name}")
    # Validate everything before writing anything. Missing/edited managed files also conflict.
    for name in set(old["files"]) | set(new["files"]):
        file = wiki / name
        if file.is_symlink():
            raise ValueError(f"Refusing Wiki symlink: {name}")
        if name in old["files"]:
            if not file.is_file() or digest(file.read_bytes()) != old["files"][name]:
                raise ValueError(
                    f"Managed Wiki page was edited or removed: {name}; reconcile in source first"
                )
        elif file.exists():
            if not (
                bootstrap and name == "Home.md" and file.read_bytes() == BOOTSTRAP_HOME.encode()
            ):
                raise ValueError(f"Unmanaged Wiki page collision: {name}")
    for name in set(old["files"]) - set(new["files"]):
        (wiki / name).unlink()
    for name in new["files"]:
        (wiki / name).write_bytes((staging / name).read_bytes())
    (wiki / MANIFEST).write_bytes((staging / MANIFEST).read_bytes())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    gen = sub.add_parser("generate")
    gen.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    gen.add_argument("--output", type=Path, required=True)
    gen.add_argument("--repository", required=True)
    gen.add_argument("--sha", required=True)
    sync = sub.add_parser("apply")
    sync.add_argument("--staging", type=Path, required=True)
    sync.add_argument("--wiki", type=Path, required=True)
    sync.add_argument("--bootstrap-home", action="store_true")
    args = parser.parse_args()
    try:
        if args.command == "generate":
            generate(args.root, args.output, args.repository, args.sha)
        else:
            apply(args.staging, args.wiki, args.bootstrap_home)
    except (ValueError, OSError) as error:
        parser.exit(1, f"Wiki sync failed: {error}\n")


if __name__ == "__main__":
    main()
