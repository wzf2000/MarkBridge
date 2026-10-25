=== MarkBridge ===
Tags: markdown, blocks, editor, mathjax, revisions
Requires at least: 7.1
Tested up to: 7.1
Requires PHP: 8.2
Stable tag: 3.5.0
License: GPLv3 or later
License URI: https://www.gnu.org/licenses/gpl-3.0.html

Markdown and WordPress blocks, saved and restored together.

== Description ==
MarkBridge provides paired Markdown/block editing, previews, revisions, local MathJax rendering and Markdown comments.

New installations use the bundled PHP converter with PHP 8.2+, DOM and mbstring on WordPress 7.1.x. No Node.js runtime or subprocess is required for supported content. Existing non-empty runtime settings retain Node until an administrator explicitly switches; unsupported environments or content are rejected without fallback.

This readme applies to MarkBridge 3.5.0. Teaching Components 1.5.0 adds configurable navigation maps with controlled document targets, native article links and mobile branch/full-map views. WordPress.org submission and approval are separate from a GitHub release. Download reviewed installation packages from GitHub Releases; source archives are not installation packages. Chinese and English interface text follows the WordPress user language in the editor and the site language for readers.

Private paired candidate backups for existing managed articles are stored in non-autoloaded database options, up to 10 per account/article for 7 days within a 32 MiB site quota. They never save a post or write a source file. Core Markdown editing does not call an external service. Local recovery is off until an author explicitly enables browser storage; it is not encrypted or a server backup. Optional ZIP images use normal WordPress media storage: a draft or private article does not make the media URL private. Bound-file writeback requires separate trusted server configuration. A GitHub updater, if chosen, is a separate plugin requiring explicit consent; it is not included in this package.

== Installation ==
1. Confirm WordPress 7.1.x, PHP 8.2+, DOM and mbstring.
2. Upload the Release plugin ZIP, activate MarkBridge and open Settings > MarkBridge to inspect diagnostics.
3. Import a test Markdown draft, preview, save and reopen. Existing Node installations should review the upgrade guide before changing their backend.

== Changelog ==

= 3.5.0 =
* v2 资源读取与 HTTP frame 导航共用最多 15 秒的网络准备期限，再独立初始化；摘要 1 秒、交付 1.5 秒及实际执行 2 秒保持，取消与迟到响应不会复活预览。
* 新增原生可导航关系图，支持分组、多父与跨组关系、原生文章链接及手机分支／全图阅读。
* 配合 Teaching Components 1.5.0，通过现有表单维护稳定节点和关系标识，搜索选择文章，沿用预览、撤销与配对保存。
* 受控目标由服务器按当前权限派生；不可读或删除的目标与相关关系不会出现在公开图、无脚本替代或静态导出中。旧精确版本和隔离权限保持。

= 3.4.1 =
Fixed public resource groups use a bounded single-request delivery path. The 1.5-second structured delivery budget starts immediately before init. The unissued preparation design is superseded by the separate bounded preparation in 3.5.0.

= 3.4.0 =
* 支持有界原生分组、代码与预格式化文本往返，保护代码中的短代码与嵌入字面量。
* 代码页签增加行号、高亮、行链接；新增有界组件目录、分页选择和按需精确解析，旧文章不自动升级。
* 增加固定公开资源协议与显式审核的固定 Worker/WASM profile；保留静态阅读、打印和出版。
* 新安装默认 PHP；可选 Node 须先验证，最低版本为 24.22.1。

= 3.2.0-rc.5 =
* Add an explicit audited fixed Worker/WASM HTTP frame profile; default data, article source and parent CSP remain unchanged.

= 3.2.0-rc.4 =
* Preserve canonical SVG namespaces in PHP typed static views; retain output budgets, local IDs and original author fallback.

= 3.2.0-rc.3 =
* Add opt-in fixed public resource groups and independent HTTP opaque component frames. v1 srcdoc and authored source contracts are retained. No WASM or network access is granted to v2 frames.

= 3.1.0-rc.2 =
* Protect literal embed shortcodes and standalone http(s) URLs in managed code before early WordPress embed processing; preserve ordinary paragraph embeds.

= 3.1.0-rc.1 =
* Add reversible native groups, plain native code and preformatted text, retaining block identity and whitespace.
* Keep literal shortcode text in managed code and code-tab configuration unchanged during reading.
* Align the optional Node runtime minimum to 24.22.1 and refresh usage documentation.

= 3.0.0 =
* Keep proof bars consistently numbered and move descriptive authored titles into the body. Pad activity disclosures and offer static reading only after an explicit failed start.

= 3.0.0-rc.8 =
* Include natural body padding and collapsed end margins in verified component height measurements while retaining shrinking and the existing height cap.

= 3.0.0-rc.7 =
* Improve reading typography, complete self-check feedback, verified component height/scroll presentation and provider-grouped catalog; default the optional formula reader off. Preserve immutable component resources and saved source.

= 3.0.0-rc.6 =
* Reuse trusted teaching styles in opaque revision previews; hide internal parameter carriers while preserving the exact content and restoration payload.

= 3.0.0-rc.5 =
* Remove only finite generated CHTML collapse metadata on pinned math/subsup nodes; preserve formula rendering and strict authored-attribute admission.

= 3.0.0-rc.4 =
* Align candidate documentation and validation scope; application code and client assets are unchanged.

= 3.0.0-rc.3 =
* Plan collection image resources without applying Markdown ZIP admission; retain native media relationships and external-image links.

= 3.0.0-rc.2 =
* Keep inherited JavaScript method names out of generic field display labels; preserve registered keys and values.

= 3.0.0-rc.1 =
* Consolidate paired writing, logical references, bibliography, collections and trusted extension SDK.
* Improve generic author labels and narrow controls; correct the SDK sparse-x bar example.

= 2.9.0-rc.6 =
* Keep same-value local draft preparation and active editor mode clicks usable.

= 2.9.0-rc.5 =
* Retain bounded local component-author input in the existing unapplied draft/save-lock flow; require explicit prepare or discard and reject stale tool callbacks.

= 2.9.0-rc.4 =
* Accept exact rc.N minimum-core declarations alongside stable and dev.N floors, preserving PHP version comparison and component-version rules.

= 2.9.0-rc.3 =
* Preserve exact original component comments only when their complete core projection matches the native REST candidate. Retain strict configuration, HTML and final body limits.

= 2.8.0-rc.7 =
* Add explicit v2 activities, local static role validation and joint rule/relation author candidates. Preserve all v1 component data.
* Add article course workbench templates and copy with fresh owned anchors; reader answers remain temporary.

= 2.8.0-rc.6 =
* Preserve the pinned CHTML glyph noic="true" marker for operator formulas in static exports; reject other nodes or values.

= 2.8.0-rc.5 =
* Serve collection ZIP streams and client JSON grants after core CORS headers, keeping fresh authorization immediately before output.

= 2.8.0-rc.4 =
* Add authenticated non-consuming publication inputs, author-client projection registration and one-shot fresh JSON download authorization. Publisher provides the separate offline web book format.
* Preserve safe table headers/scope for complete book ID reference rewriting; keep existing budgets.

= 2.8.0-rc.3 =
* Add bounded author collection reference configuration, one-time Companion series import, immutable publication snapshots and trusted adapter v1. This candidate provides snapshot ZIPs, not a complete offline book.
* Recheck session, edit permissions, collection CAS, article/resource/renderer fingerprints at preparation, confirmation and the streaming boundary. Private unselected targets remain unavailable.

= 2.7.0-rc.5 =
Use matching bounded URL authority, IPv4/IPv6 and port admission in both bibliography v2 converters. Keep original v1 URLs and historical pairs unchanged.

= 2.7.0-rc.4 =
Add explicitly adopted bibliography v2, a bounded CSL-JSON subset with field-loss/key review, and two fixed citation styles across PHP, Node and static HTML. Original v1 records remain unchanged.

= 2.7.0-rc.3 =
Retain the exact previewed FrontMatter receipt when confirming resource ZIP batches; keep logical identity mappings collapsed with a concise explanation.

= 2.7.0-rc.2 =
Preserve explicit reference conflicts after confirmed database rollback and source/media compensation, including duplicate identity migrations into new articles.

= 2.7.0-rc.1 =
Explicit portable logical identities, permission-aware cross-document references and bounded derived index management.

= 2.6.0-rc.4 =
Register the editor-only writing-pattern factory in PHP so managed native inserters can instantiate it under the existing exact block allowlist.

= 2.6.0-rc.3 =
Restore adoption survives its own editor notification; repeatable structured lesson patterns and focused navigation/paste panel styling.

= 2.6.0-rc.2 =
Restore standalone CLI/model loading without a WordPress database class. WordPress backup behavior is unchanged.

= 2.6.0-rc.1 =
Private paired backups and explicit recovery, unified content navigation and checks, same-source writing patterns, and reviewed complete Markdown snippets. Isolated candidate only.

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
