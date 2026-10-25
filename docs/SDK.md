# Trusted extension SDK

This API is for installed, reviewed PHP and JavaScript code. Authored Markdown and parameters cannot name a callback, path, URL or script. Normal article preview, Apply, paired save, revision and source-file guards remain authoritative. The SDK has no separate article save endpoint.

## Indexed exact component definitions (Main 3.4)

Feature-detect `markbridge_teaching_supports_component_catalog()`. Call
`markbridge_register_teaching_component_catalog($id, $index, $resolver)` from installed trusted PHP.
The closed index is `{title, defaultVersion, versions}`; each version is `{version, title, fingerprint}` with optional `activityVersion:1`.
`defaultVersion` must be the first item. Generate portable definition pins with
`markbridge_teaching_component_fingerprint($id, $provider)` from fixed build data, including fixed
resource/manifest SHA-256 values. Never recompute expected resource hashes from mutable installed files
on each request. The resolver receives only an already declared type/exact version and returns the
existing provider shape. Core validates the full provider, its definition pin, title and declared activity capability before use.

The combined legacy/indexed directory admits 256 exact keys, 64 types and 64 versions per type within
128 KiB, with 32 KiB per atomic declaration. Directory pages default to 20, allow at most 50 items and
32 KiB; directory reads never resolve factories. Exact public descriptors are limited to 64 KiB;
request caches hold at most 256 attempted keys / 4 MiB and recheck resources on reuse. Each article
retains a 32-distinct-key / 512 KiB descriptor bound. Publications process chapters separately and
admit at most 256 exact keys / 4 MiB across chapters, alongside the existing publication limits.
The legacy provider, projection renderer and JavaScript author callback registries each keep their
original 32-entry bounds. Defaults follow first successful type registration across both APIs;
existing article versions never change implicitly.

The resolver may register a fixed typed projection for its currently resolving exact key through
`mbb_register_component_projection()`. These indexed renderers use a separate bounded namespace;
renderer files, trees and fingerprints retain their existing validation. Generic schema authoring
works without a dedicated JavaScript author callback. The local runnable 40-version example is
[`sdk/examples/indexed-components`](../sdk/examples/indexed-components/README.md).

Author REST routes are `GET mbb/v2/components/catalog` (`page`, `per_page`, `type`) and
`GET mbb/v2/components/descriptor/{component}/{version}` (required `fingerprint`). Both require editing
capability; a supplied `post_id` also requires permission to edit that article. Responses are private,
no-store, and omit local paths/factories. Descriptor requests bind the directory fingerprint before
and after resolution. Core loads existing block attributes directly and discards late selection
results when article scope, selection, draft attributes or generation changed. Reader delivery
contains only the current page's exact dependencies, never the complete directory.

From 3.4.0-rc.2, the self-check insertion menu intersects trusted author template keys with lightweight
`activityVersion:1` entries. It reads at most six 50-item catalog pages, stopping once all registered
author keys are found; a page-byte overflow falls back to at most thirteen 20-item pages. Opening
the menu never resolves full providers. The selected exact descriptor is fetched only for insertion.
Unregistered author keys and non-activity replay templates are omitted.

## Author candidates

`window.MarkBridgeAuthorTools.register({id,version,slot:"bibliography/v2",Editor})` registers up to 32 exact tools. `Editor` receives a cloned current `draft`, a bounded `change(patch)`, `generation`, `baseline`, `registry`, `clientId` and `session`. Patches may contain only `entries`, `origins`, and `style`, within 256 KiB. A patch is accepted only for the current candidate generation and opening article baseline/source digest. A successful patch invalidates its generation. Core validates the complete candidate and owns Apply/Undo/save. An asynchronous tool must keep its own cancellation token too; a rejected stale patch must preserve current input.

`window.MarkBridgeExtensions.registerComponentAuthor(descriptor)` delegates to the existing exact-version component candidate registry. Its v1/v2 validation, explicit upgrade preview, Apply and Undo contracts remain unchanged. `registerPublicationClient(id,descriptor)` delegates to the existing collection input and final download authorization flow. Neither function creates persistence. The bibliography, activity and Publisher consumers exercise these entries; older core versions retain their original consumer fallback.

From Main 2.9.0-rc.5, `MarkBridgeComponentAuthors.localDraftVersion === 1` supplies component Editors with cloned `localDraft` (object or null), `onLocalDraftChange(object|null)`, `generation`, and `baseline` alongside the existing `value`, `onChange`, and `session`. Local drafts are pure JSON records within the unchanged 16 KiB / 1024 nodes / depth 8 bound, retained only in the current editor session, not persisted or backed up. Mode switches and Inspector remounts keep them in the same core drafts map and Save lock. Apply refuses while local input remains; core Discard clears it and rotates the session.

Prepare with `onChange(completeParams, {consumeLocalDraft:true})`: core validates pure params/current schema (and the existing v2 validator where applicable), then atomically replaces local input with the normal unapplied candidate. Provider-specific semantic validation still belongs to the trusted tool and normal preview/save admission. A failed preparation or over-budget local update preserves the prior draft. Legacy one-argument `onChange` remains supported and never implicitly consumes local input. `onLocalDraftChange(null)` clears only current local input, preserving any other unapplied params. All tool callbacks reject stale session, generation, instance identity and article baseline/source scope. Async tools must also cancel their own pending work and must not claim refresh-surviving storage. No API here owns Apply/Undo or article saving. Main 2.9.0-rc.6 also keeps a live callback after same-value changes/consumption and repeated active-mode clicks.

## Data-only static projection

Trusted PHP registers `mbb_register_component_projection($component,$componentVersion,$descriptor)` with the closed descriptor:

```php
[
  'contract' => 'mbb-component-projection/v1',
  'version' => '0.1.0',
  'render' => 'my_renderer',
  'files' => [['file' => __FILE__, 'sha256' => hash_file('sha256', __FILE__)]],
];
```

List every callback/model file (1–8 real, nonsymlink files, at most 2 MiB total); the callback's actual reflection source file is mandatory. Fingerprints rehash those files and the core serializer/profile/styles. Registration does not grant content access. The callback receives a cloned canonical params object and `{locale}`; it returns `['schema'=>1,'tree'=>[...]]`. It must be deterministic, bounded, data-only and perform no network or content writes. PHP is the default; no server Node/TeX is needed.

Each node has exactly `tag`, `attrs`, `children`, optionally `key`. Children are nodes or safe Unicode text. Empty attrs serialize as `{}`, children as `[]`. `key` is a unique local token, never an actual DOM ID. `attrs.labelledby` lists local keys; core allocates collision-free real IDs against the document and other projections. Publisher subsequently rewrites all IDs/IDREFs with the chapter namespace. No hardcoded prefix is reserved from authors.

The shared, closed allowlist is `plugin/projections-profile.json`. Ordinary semantic HTML/tables and only `svg,g,line,polyline,polygon,rect,circle,text,title,desc` are admitted. SVG attributes have per-tag numeric/color bounds; points have at most 256 coordinate pairs. URLs, CSS strings, events, `path`, `use`, `defs`, animation and foreign content are rejected. This **does not enable SVG in authored Markdown/HTML**. There is no extension CSS-string interface; use core classes/tokens.

A tree is limited to 128 KiB of its normalized UTF-8 JSON, 4096 nodes and 16 nesting levels. JSON uses JavaScript-compatible finite-number spelling, unescaped Unicode/slashes/U+2028, empty-object/list distinction, and no whitespace. Serialized derived HTML is also limited to 128 KiB per component, 512 KiB per document. Document budgets reset on each render; they are not global counters. Original 256 KiB body, 16 KiB params, 32 MiB single export and collection budgets remain unchanged. Repeated instances reuse a descriptor within the 32-distinct-exact-dependency bound; the SDK adds no separate instance-count cap.

`mbb_component_projection_plan($serialized,$locale)` returns items `{target,component,version,fingerprint,state,params,projection}`. States are `available`, `unavailable`, and quiet `author-fallback` for an installed legacy component without a renderer. Missing/broken renderers retain the author's innerBlocks plus a clear message and closed, escaped read-only configuration. Normal legacy fallback gets no new error paragraph. Derived output is never stored as a second writable body.

`mbb_component_static_document($html,$serialized,$locale)` is a pure projection helper; it grants no content access. The containing default-PHP `the_content` integration checks the article/session again after callbacks, and export callers retain their own final fresh authorization. Single-article static descriptor schema 2 and collection chapter `projectionPlan` carries the same plan as closed `{schema:1,encoding:"json-utf8",bytes,sha256,data}`. The data is normalized UTF-8 JSON wire (at most 1 MiB per chapter), avoiding resident PHP ASTs across chapters. Publisher verifies its byte count/SHA and parses it one chapter at a time. The collection additionally bounds all successful derived trees to 256 KiB; later excess components clearly retain original explanation/configuration. All wire and final output still count against the original 24 MiB artifact limit. Single-article descriptors carry the same tree. Browser building validates it independently, then produces no-script HTML. Schema 1 remains accepted. Input source still enters the original sanitizer before any projection; Publisher shares the finite SVG validator. Renderer changes invalidate prepared export fingerprints, and existing final permission/session/data gates still apply.

Minimum-core declarations accept `x.y.z`, `x.y.z-dev.N`, and (from Main 2.9.0-rc.4) `x.y.z-rc.N`. Compatibility uses PHP `version_compare`: a candidate can meet the same or an earlier RC floor, but cannot claim a later RC or its unreleased stable version. Component implementation versions remain plain `x.y.z`; other minimum suffixes are rejected.

## Catalog and scoped usage

Settings → MarkBridge → Extensions combines the compatibility catalog with explicitly scoped usage. The former Tools teaching URL redirects there. Trusted plugins can register `mbb_register_extension_manifest($id,['version'=>...,'title'=>...,'minMarkBridge'=>...,'capabilities'=>[...]])` on `markbridge_register_extensions` (32 registrations max).

`GET /mbb/v1/extensions` requires current `manage_options` and pages lightweight versions with `page` / `per_page` (20 by default, at most 50, within 32 KiB); it does not resolve indexed factories. `POST /mbb/v1/extensions/usage` additionally checks current editing permission for every requested article, with raw JSON exactly `{"post_ids":[1,2]}`. The field must be a real array of 1–50 distinct positive integer IDs. Duplicate/unknown fields, numeric-key objects, empty scopes and coercion are rejected. Usage responses cover only that scope (up to 64 groups/128 KiB); overflow explicitly requests a smaller scope. There is no hidden scan, global total, cursor or bulk mutation. Every included article/session is checked again before output; losing permission fails the whole report. Both routes are private/no-store, and expose no server paths or article bodies.

## Scaffold and conformance

`sdk/template` is a self-contained GPL sample provider, with its own package/lock, build script and exact content-addressed resource. Run `npm ci --ignore-scripts`, `npm run build`, `npm test` there. It demonstrates a grant-only bounded sum Worker, cancellation/session matching, monotonic checks before/after validation and before complete. `sdk/conformance/provider.cjs <directory>` checks real resource hashes and executes the real provider handler under deterministic clocks, including successful/late/cancelled results. This complements the core host's backstop; it is not a security proof for arbitrary provider code.

The core host guards **all** legacy v1 and activity v2 startup/grant/terminal deadlines synchronously as well as with timers. A ready reader with no active run has no five-second thinking limit. Old immutable provider payloads are not modified to add checks.

`sdk/examples/chart-static` is an installable source-directory bridge for the frozen `small-data-chart@0.0.1` research provider. It derives SVG, a complete semantic data table and text from canonical params, without changing the research repository or saving the table. Install both source directories into a development WordPress; enable them and use normal editor JSON/Apply/save. Without the bridge, innerBlocks and read-only params remain available. This sample proves the SDK seam; it does not claim the later formal scientific chart workbench.

Local tests: `tests/projections.{php,cjs}`, `tests/projection-plan.php`, `tests/extensions.php`, `tests/author-tools.cjs`, `tests/activity-host.cjs`, `tests/projection-plan.php --memory` independently measures 10 chapters × 4 charts × 64 rows × 4 series under 128M (a pure model, not a WordPress process), and browser `sdk-projections.spec.cjs` / `sdk-author.spec.cjs`. Browser fixtures use real WordPress core scripts but no lab DB. Actual WordPress save/revision/source and permission-revocation integration must be run separately against an explicitly owned test site using the existing save interfaces.

## Publication math projection

`MBB_MATH.presentationMathML(tex, display=false)` joins the existing isolated MathJax 4.1.3 engine queue and returns `{mathml:string|null, reason:string|null}`. TeX remains limited to 20,000 UTF-16 code units as in the existing engine. Generated XML is independently parsed, limited to 128 KiB / 4,096 nodes / 32 levels and a closed Presentation MathML tag/typed-attribute subset. No URLs, events, style, resources, action, foreign namespace, or annotation-xml enter output. Only fixed engine auxiliary data annotations are removed; mathematical content is preserved or explicitly falls back to escaped TeX. The output adds plain application/x-tex annotation and alttext. Unsupported output or a formula error is reported as a fallback, never a successful merror; malformed/unsafe structure fails the candidate. Startup/session/request timeout behavior is unchanged.

The ordinary source sanitizer still refuses MathML/SVG. StaticExport alone marks verified generated math wrappers with `data-mbb-math-projection="chtml/v1"`; Publisher uses only those exact nodes and their checked original TeX labels, never ordinary authored aria-label text. Publication client registration may additionally carry closed `output:{filename,downloadLabel,generateLabel,previewLabel,description}` for format-specific controls. Core still owns candidate inspection, confirmation, artifact digest and final download authorization.

## Generic author presentation

The schema stays data-only. Core uses display-only field labels and one-based array item numbers, with registered localized component titles. Unknown keys are humanized without deleting or remapping data; exact keys/implementation version remain in advanced configuration details. No component-specific algorithm is dispatched by these labels. Sparse-x bars in the chart-static sample follow row order with equal group spacing; line/scatter retain numeric x. The research provider and its immutable resources are not changed by the sample bridge.

## Fixed public resource protocol v2

Main 3.2.0-rc.3 adds opt-in `protocolVersion:2`, `mbb-component/v2`, a pinned public manifest and an independent HTTP opaque frame. v1 stays on srcdoc; authored component/activity attributes are unchanged. From Main 3.5.0, resource-group downloads and HTTP frame navigation share one bounded 15-second preparation; initialization then starts independently, keeping the cumulative one-second hash limit, 1.5-second init-to-ready transfer and two-second grant limit. Fixed bootstrap scripts may run before frame load, but algorithm execution still requires a host grant after ready. The closed registration, resource types, transport/deadline budgets, Cookie/navigation distinction, static data reader and complete identity contract are specified in [教学扩展接口](TEACHING-EXTENSIONS.md#固定公开资源-v2320-rc3). `markbridge_teaching_resource_bytes(component,version,resourceId)` supplies only registered fixed JSON/bin bytes to trusted typed projections; it never returns JavaScript or accepts article URLs. No WASM/Worker/network permission is granted by v2. The local-only synthetic provider is `tests/fixtures/resource-v2-provider`; it exercises JSON/bin delivery and a pinned JavaScript blob under the frame's own CSP.

Main 3.2.0-rc.5 adds the explicit trusted `fixed-wasm/v1` execution profile to protocol v2; the default profile still rejects WASM and Workers. See [the exact profile contract](TEACHING-EXTENSIONS.md#固定审核执行-profile320-rc5). It permits one pinned Worker JavaScript and one WebAssembly resource only in its own HTTP frame CSP, with the byte limits and bounded preparation, initialization and grant stages described above, and no editor/site CSP change. Article source and attrs remain unchanged; the fixed-data reader never returns executable resources. Providers must independently pin, validate and terminate their audited program; this is not a general sandbox.
