=== MarkBridge ===
Tags: markdown, blocks, editor, mathjax, revisions
Requires at least: 7.1
Tested up to: 7.1
Requires PHP: 8.2
Stable tag: 1.3.0-rc.3
License: GPLv3 or later
License URI: https://www.gnu.org/licenses/gpl-3.0.html

Markdown and WordPress blocks, saved and restored together.

== Description ==
MarkBridge provides paired Markdown/block editing, previews, revisions, local MathJax rendering and Markdown comments.

New installations use the bundled PHP converter with PHP 8.2+, DOM and mbstring on WordPress 7.1.x. No Node.js runtime or subprocess is required for supported content. Existing non-empty runtime settings retain Node until an administrator explicitly switches; unsupported environments or content are rejected without fallback. This is a pre-release.

== Installation ==
1. Confirm WordPress 7.1.x, PHP 8.2+, DOM and mbstring.
2. Upload the Release plugin ZIP, activate MarkBridge and open Settings > MarkBridge to inspect diagnostics.
3. Import a test Markdown draft, preview, save and reopen. Existing Node installations should review the upgrade guide before changing their backend.

== Changelog ==
= 1.3.0-rc.3 =
Fixes saved Markdown font preferences in real WordPress pages, whose localized scalar values arrive as strings. Remains a pre-release.

= 1.3.0-rc.2 =
Adds administrator display preferences, setup/help links and plugin metadata. Preserves default rendering and configured conversion backends; validates HTML before DOM parsing consistently across libxml versions. Remains a pre-release.

= 1.3.0-rc.1 =
Adds a bundled, namespaced PHP converter for new installations; retains configured Node on upgrade. Covers paired saves, historical snapshots, source writeback and explicit rejection without fallback. Pre-release validation and limits are documented.

= 1.2.0 =
Adds MathJax formula authoring, conservative inline dollar input, display-math shortcuts and explicit native math conversion. Fixes dynamic CHTML styles in the editor canvas. Rebuild the private conversion runtime when upgrading from 1.1.1.

= 1.1.1 =
Native block-editor saves keep Markdown and blocks paired, with conflict and conversion protection. Inline formulas render in place with focused TeX editing; sandboxed previews embed their trusted math fonts. Rebuild the private conversion runtime when upgrading from 1.1.0.

= 1.1.0 =
Long-document review and conflict comparison, formula reading tools, editable task lists and named footnotes. Rebuild the private conversion runtime when upgrading.

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
