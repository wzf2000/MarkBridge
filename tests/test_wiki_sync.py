import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "wiki_sync", Path(__file__).resolve().parents[1] / "scripts/wiki_sync.py"
)
wiki = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(wiki)
SHA = "a" * 40
REPO = "example/markbridge"


class WikiSyncTests(unittest.TestCase):
    def test_links_and_literals(self):
        source = (
            "[guide](USAGE.md#脚注) ![image](assets/hero.svg) "
            "[repo](../README.md#开始使用) [web](https://example.com/a) [self](#here)\n"
            '[ref]: INSTALL.md "title"\n'
            "[^note]: Footnote prose with [guide](USAGE.md).\n"
            "![reference image][picture]\n[picture]: assets/hero.svg\n"
            "`[literal](USAGE.md)`\n"
            "```markdown\n[example](USAGE.md)\n```\n"
            "~~~\n[example](INSTALL.md)\n~~~\n"
        )
        result = wiki.rewrite_markdown(source, "docs/INSTALL.md", REPO, SHA)
        self.assertIn("/wiki/Usage#脚注", result)
        self.assertIn(
            f"https://raw.githubusercontent.com/{REPO}/{SHA}/docs/assets/hero.svg", result
        )
        self.assertIn(f"/blob/{SHA}/README.md#开始使用", result)
        self.assertIn(
            "[^note]: Footnote prose with [guide](https://github.com/example/markbridge/wiki/Usage).",
            result,
        )
        self.assertIn(
            '[ref]: https://github.com/example/markbridge/wiki/Installation "title"', result
        )
        for literal in (
            "[web](https://example.com/a)",
            "[self](#here)",
            "`[literal](USAGE.md)`",
            "```markdown\n[example](USAGE.md)\n```",
            "~~~\n[example](INSTALL.md)\n~~~",
        ):
            self.assertIn(literal, result)

    def test_code_span_with_embedded_backtick_is_literal(self):
        text = "``code ` [guide](USAGE.md)`` and [real](USAGE.md)"
        result = wiki.rewrite_markdown(text, "docs/USAGE.md", REPO, SHA)
        self.assertTrue(result.startswith("``code ` [guide](USAGE.md)``"))
        self.assertIn("[real](https://github.com/example/markbridge/wiki/Usage)", result)

    def test_indented_code_is_literal(self):
        text = "    [example](USAGE.md)\n\t[example](INSTALL.md)\n"
        self.assertEqual(wiki.rewrite_markdown(text, "docs/USAGE.md", REPO, SHA), text)

    def test_reject_escaping_link(self):
        with self.assertRaises(ValueError):
            wiki.rewrite_markdown("[x](../../private.md)", "docs/USAGE.md", REPO, SHA)

    def prepare(self, root):
        source = root / "source"
        for name in wiki.PAGES:
            file = source / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text("# 用户指南\n", encoding="utf-8")
        # Never selected just because it exists in docs.
        (source / "docs/private.md").write_text("private", encoding="utf-8")
        (source / "package.json").write_text(json.dumps({"version": "1.2.0"}))
        staging = root / "staging"
        wiki.generate(source, staging, REPO, SHA)
        target = root / "wiki"
        target.mkdir()
        (target / ".git").mkdir()
        (target / "Other.md").write_text("Human page\n")
        return staging, target

    def test_quickstart_and_screenshot_links(self):
        result = wiki.rewrite_markdown(
            "[start](GETTING-STARTED.md) [help](TROUBLESHOOTING.md) "
            "![import](assets/user-guide/02-import-dialog.png)",
            "docs/USAGE.md",
            REPO,
            SHA,
        )
        self.assertIn("/wiki/Getting-Started", result)
        self.assertIn("/wiki/Troubleshooting", result)
        self.assertIn(
            f"https://raw.githubusercontent.com/{REPO}/{SHA}/docs/assets/user-guide/02-import-dialog.png",
            result,
        )
        with tempfile.TemporaryDirectory() as tmp:
            staging, _ = self.prepare(Path(tmp))
            home = (staging / "Home.md").read_text()
            self.assertIn("开始第一篇文章", home)
            self.assertIn("适用版本：MarkBridge 1.2.0", home)
            self.assertIn("### 管理站点", home)
            self.assertIn("/wiki/Runtime", home)
            self.assertIn("### 开始使用", (staging / "_Sidebar.md").read_text())

    def test_apply_idempotence_and_unrelated_pages(self):
        with tempfile.TemporaryDirectory() as tmp:
            staging, target = self.prepare(Path(tmp))
            self.assertEqual(
                set(p.name for p in staging.iterdir()),
                {
                    "Getting-Started.md",
                    "Troubleshooting.md",
                    "Installation.md",
                    "Usage.md",
                    "Emoji-Packs.md",
                    "Runtime.md",
                    "Changelog.md",
                    "Home.md",
                    "_Sidebar.md",
                    wiki.MANIFEST,
                },
            )
            wiki.apply(staging, target)
            before = {p.name: p.read_bytes() for p in target.iterdir() if p.is_file()}
            wiki.apply(staging, target)
            self.assertEqual(
                before, {p.name: p.read_bytes() for p in target.iterdir() if p.is_file()}
            )
            self.assertEqual((target / "Other.md").read_text(), "Human page\n")
            with self.assertRaises(ValueError):
                wiki.generate(Path(tmp) / "source", staging, REPO, SHA)

    def test_refuse_manual_changes_before_any_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            staging, target = self.prepare(Path(tmp))
            wiki.apply(staging, target)
            (target / "Usage.md").write_text("human change")
            before = (target / wiki.MANIFEST).read_bytes()
            with self.assertRaisesRegex(ValueError, "edited or removed"):
                wiki.apply(staging, target)
            self.assertEqual((target / "Usage.md").read_text(), "human change")
            self.assertEqual((target / wiki.MANIFEST).read_bytes(), before)

    def test_bootstrap_is_exact_and_explicit(self):
        with tempfile.TemporaryDirectory() as tmp:
            staging, target = self.prepare(Path(tmp))
            home = target / "Home.md"
            home.write_text("# Real human home\n")
            with self.assertRaisesRegex(ValueError, "collision"):
                wiki.apply(staging, target, True)
            home.write_text(wiki.BOOTSTRAP_HOME, encoding="utf-8")
            with self.assertRaises(ValueError):
                wiki.apply(staging, target)
            wiki.apply(staging, target, True)
            self.assertIn("使用手册", home.read_text())

    def test_remove_only_previously_managed_obsolete_page(self):
        with tempfile.TemporaryDirectory() as tmp:
            staging, target = self.prepare(Path(tmp))
            wiki.apply(staging, target)
            old = json.loads((target / wiki.MANIFEST).read_text())
            (target / "Obsolete.md").write_bytes(b"old")
            old["files"]["Obsolete.md"] = wiki.digest(b"old")
            (target / wiki.MANIFEST).write_text(json.dumps(old))
            wiki.apply(staging, target)
            self.assertFalse((target / "Obsolete.md").exists())
            self.assertTrue((target / "Other.md").exists())

    def test_tampered_stage_and_symlink_are_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            staging, target = self.prepare(Path(tmp))
            (target / "Usage.md").symlink_to(target / "Other.md")
            with self.assertRaisesRegex(ValueError, "symlink"):
                wiki.apply(staging, target)
            (target / "Usage.md").unlink()
            (staging / "Usage.md").write_text("tampered")
            with self.assertRaisesRegex(ValueError, "manifest"):
                wiki.apply(staging, target)
            self.assertFalse((target / "Home.md").exists())


if __name__ == "__main__":
    unittest.main()
