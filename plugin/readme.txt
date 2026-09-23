=== MarkBridge ===
Tags: markdown, blocks, editor, mathjax, revisions
Requires at least: 7.1
Tested up to: 7.1
Requires PHP: 8.2
Stable tag: 1.0.9
License: GPLv3 or later
License URI: https://www.gnu.org/licenses/gpl-3.0.html

Markdown and WordPress blocks, saved and restored together.

== Description ==
MarkBridge provides paired Markdown/block editing, previews, revisions, local MathJax rendering and Markdown comments.

This release requires Linux, Node.js 24 LTS, bubblewrap and a configured private conversion runtime. Uploading this ZIP alone does not complete installation. See the repository installation guide.

== Installation ==
1. Build a private, site-matched runtime using scripts/prepare_runtime.py from the source repository.
2. Validate the private runtime in Settings, or define the overriding MARKBRIDGE_RUNTIME server constant.
3. Upload the built plugin, enable MarkBridge and verify isolated drafts before adopting existing content.

== Changelog ==
= 1.0.9 =
Uses a block formatting context for numbered code to prevent cumulative line-number drift across fonts.

= 1.0.8 =
Aligns inline math with the text baseline without nested scrolling; enlarges display math by 15%.

= 1.0.7 =
Mounts the CHTML stylesheet and transfers dynamic CSSOM rules to prevent collapsed formulas.

= 1.0.6 =
Waits for asynchronous CHTML stylesheet font data and clears recovered math error indicators.

= 1.0.5 =
Uses CommonHTML math output with local fonts and transferred output styles.

= 1.0.4 =
Centers display formulas and restores code line-number spacing and consistent line height.

= 1.0.3 =
Preserves quoted display math, including nested quotes, and removes code-box styling from math blocks.

= 1.0.2 =
Restores bound-file CLI synchronization with locked source and article conflict checks.

= 1.0.1 =
Show the saved Markdown when a bound source file cannot be read, and keep the editor read-only until the source is available.

= 1.0.0 =
Adds administrator runtime diagnostics, optional image data packs, the new-post Markdown import action and commit-linked release manifests.
