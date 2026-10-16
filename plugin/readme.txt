=== MarkBridge ===
Tags: markdown, blocks, editor, mathjax, revisions
Requires at least: 7.1
Tested up to: 7.1
Requires PHP: 8.2
Stable tag: 2.5.0-rc.2
License: GPLv3 or later
License URI: https://www.gnu.org/licenses/gpl-3.0.html

Markdown and WordPress blocks, saved and restored together.

== Description ==
MarkBridge provides paired Markdown/block editing, previews, revisions, local MathJax rendering and Markdown comments.

New installations use the bundled PHP converter with PHP 8.2+, DOM and mbstring on WordPress 7.1.x. No Node.js runtime or subprocess is required for supported content. Existing non-empty runtime settings retain Node until an administrator explicitly switches; unsupported environments or content are rejected without fallback.

This readme applies to the MarkBridge 2.5.0-rc.2 isolated candidate. WordPress.org submission and approval are separate from a GitHub release. Download reviewed installation packages from GitHub Releases; source archives are not installation packages. Chinese and English interface text follows the WordPress user language in the editor and the site language for readers.

Core Markdown editing does not call an external service. Local recovery is off until an author explicitly enables browser storage; it is not encrypted or a server backup. Optional ZIP images use normal WordPress media storage: a draft or private article does not make the media URL private. Bound-file writeback requires separate trusted server configuration. A GitHub updater, if chosen, is a separate plugin requiring explicit consent; it is not included in this package.

== Installation ==
1. Confirm WordPress 7.1.x, PHP 8.2+, DOM and mbstring.
2. Upload the Release plugin ZIP, activate MarkBridge and open Settings > MarkBridge to inspect diagnostics.
3. Import a test Markdown draft, preview, save and reopen. Existing Node installations should review the upgrade guide before changing their backend.

== Changelog ==

= 2.5.0-rc.2 =
Formula structural exploration, bounded BibTeX import, explicit cross-site media copies and optional Mermaid integration. Candidate validation is isolated; this is not a production release.

= 2.0.3 =
* Accept trusted .html.txt component payloads with unchanged byte integrity and resource limits.

= 2.0.2 =
* Refine stage navigation, restore code-tab line numbers, preserve full-width diff highlights and synchronize horizontal scrolling.
* Use disclosure controls for interactive previews without persistent ready or closed messages.

= 2.0.1 =
* Keep stage navigation sticky within its group, with offsets for the admin bar and marked theme headers.
* Allow English reading-mode buttons to wrap on phones; preserve static reading and explicit disclosure state.

= 2.0.0 =
* Adds structured teaching content: folds, staged reading, code comparison and multilingual code tabs, with complete static and print content.
* Provides trusted teaching component and static block adapter interfaces; independent extensions supply algorithms and resources.
* Adds opt-in browser recovery, explicitly selected Front Matter metadata, safe image ZIP import, saved Markdown/ZIP export and reviewed three-way merge.
* Supports native details and link buttons, English/Chinese interfaces, clearer author tools and responsive reading controls.
* Maintains paired saves, revisions, permissions, source writeback and explicit PHP/Node selection. Optional image workflows and independent extensions need their own configuration.

= 2.0.0-rc.8 =
* Recovers a stalled initial component resource request once within the unchanged startup deadline.
* Preserves cancellation, resource verification, isolated execution and static fallback.

= 2.0.0-rc.7 =
* Refines native select arrows, author dialog controls, compact revision previews and touch-friendly reading navigation.
* Keeps revision confirmation disabled if the content preview fails.

= 2.0.0-rc.6 =
* Unpublished review candidate: compact author tools, dedicated preview layout, readable code scrolling, and clearer teaching and settings controls.
* Full reading retains the selected code language; printing still includes every version.
* Fixes new-document previews on the Tools screen and excess mobile code-scroll hint spacing.

= 2.0.0-rc.4 =
Local recovery, bounded Front Matter proposals, safe image ZIP import, multilingual code tabs, saved Markdown/ZIP export, signed-baseline three-way merge, native details/link buttons, trusted static block adapters and English/Chinese interfaces. Includes the earlier fold/stage/code comparison and trusted teaching component candidates. Unpublished candidate; review the validation guide before considering an upgrade.

= 1.9.0-rc.1 =
Local teaching candidate: structured reading, code comparison, trusted component interfaces and lifecycle/budget protection. Not a published release.

= 1.4.0 =
Actionable conversion locations, managed-editor compatibility hints, content-scoped presentation assets and real WordPress CI for both converters.
= 1.3.0 =
Bundled PHP conversion for new installations, retained Node configuration on upgrade, verified PHP/Node administrator selection, display preferences and consistent HTML validation. Preserves paired saves, revisions, permissions and conflict protection. For installation packages, see GitHub Releases. See the validation and upgrade guides for tested environments and content limits.

= 1.3.0-rc.4 =
Preserves boolean math configuration through inline JSON so the administrator reader switch works in real WordPress pages. Typesetting remains enabled. Remains a pre-release.

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
