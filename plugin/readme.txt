=== MarkBridge ===
Tags: markdown, blocks, editor, mathjax, revisions
Requires at least: 7.1
Tested up to: 7.1
Requires PHP: 8.2
Stable tag: 0.7.0-rc.4
License: GPLv3 or later
License URI: https://www.gnu.org/licenses/gpl-3.0.html

Markdown and WordPress blocks, saved and restored together.

== Description ==
MarkBridge provides paired Markdown/block editing, previews, revisions, local MathJax rendering and Markdown comments.

This release candidate requires Linux, Node.js 24 LTS, bubblewrap and a configured private conversion runtime. Uploading this ZIP alone does not complete installation. See the repository installation guide.

== Installation ==
1. Build a private, site-matched runtime using scripts/prepare_runtime.py from the source repository.
2. Validate the private runtime in Settings, or define the overriding MARKBRIDGE_RUNTIME server constant.
3. Upload the built plugin, enable MarkBridge and verify isolated drafts before adopting existing content.

== Changelog ==
= 0.7.0-rc.4 =
Adds administrator runtime diagnostics, optional image data packs and commit-linked release manifests.
