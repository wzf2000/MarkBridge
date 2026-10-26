# Trusted extension SDK

This API is for installed, reviewed PHP and JavaScript code. Authored Markdown and parameters cannot name a callback, path, URL or script. Normal article preview, Apply, paired save, revision and source-file guards remain authoritative. The SDK has no separate article save endpoint.

## Indexed exact component definitions (Main 3.4)

Feature-detect `markbridge_teaching_supports_component_catalog()`. Call
`markbridge_register_teaching_component_catalog($id, $index, $resolver)` from installed trusted PHP.
Check `function_exists('markbridge_teaching_supports_component_catalog_metadata')` and its `true` return value before declaring the display metadata below. Hosts that only expose the original catalog feature must receive the original fields; do not guess support from package version strings.

The index requires `{title, defaultVersion, versions}` and accepts optional `purposes`; each version is `{version, title, fingerprint}` with optional `activityVersion:1`, `purposes`, and `authoringGroup`.
`purposes` contains 1–6 distinct labels, each up to 120 UTF-8 bytes. A version overrides type purposes. `authoringGroup` is a stable lowercase token (up to 64 characters) within a component ID; it groups compatible authoring variants for discovery only. Without it, distinct titles remain separate. Entries without lightweight purpose or capability data are explicitly unclassified and stay visible in every purpose filter; no provider-name guessing or full descriptor scan is used. Neither field changes the portable definition pin or implies a migration. Legacy provider registrations also accept these two display fields.
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

Frozen legacy registration files can receive display metadata through the trusted `markbridge_teaching_component_catalog_metadata` filter, called with the existing `{purposes?,authoringGroup?}`, component ID, and exact version. Return only those two keys; values use the same closed validation above. Keep callbacks deterministic. Invalid values, exceptions, or an exceeded combined display budget preserve the original catalog. The overlay participates in the catalog fingerprint, never the portable definition pin or registration admission.

The author selector defaults to the latest verified available version per display group and explicitly exposes historical versions. `view=all` retains lazy catalog behavior; `view=latest` filters and paginates display groups before resolving candidates within existing limits. `total` counts groups, so a page without verified entries still permits continuation. Its `unverifiedGroups` count reports this page’s families without a verified available candidate, including budget exhaustion. A saved exact version remains selected even if absent from the filtered catalog. Current-article dependency inspection includes nested blocks and only offers migration through a registered exact-version author `upgrade` callback.

Author REST routes are `GET mbb/v2/components/catalog` (`page`, `per_page`, `type`, `view=all|latest`, `purpose`) and
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

The extension usage form also offers `GET mbb/v1/extensions/articles?q=...&cursor=...` for administrators to choose currently editable managed posts and pages, including legacy articles without logical identities. It scans at most 200 candidate IDs per request and returns at most 20 `{id,title,status}` entries, an opaque session-bound continuation token, and no article body or private totals. The server keeps positions in a 15-minute transient with at most eight tokens per account; tokens carry no article ID, bind to the session and query, and expire without a new scheduled task. Returned permissions and titles are checked again before delivery. Choosing results updates the existing 1–50 ID scope; only the explicit usage-report submission inspects those articles.

### Publication collection schema capability (3.7 candidate)

`markbridge_publication_collection_schemas(): array` returns `[1, 2]`. Check `function_exists` and the returned list before adding `collectionSchemas` to a publication adapter descriptor. The optional list must be a nonempty, unique subset of `[1, 2]`; omitted means `[1]`. Legacy adapters are rejected for schema 2 rather than silently dropping fields. The existing registration contract, resource limits and client authorization routes remain unchanged.

Schema 2 collection configurations add `authors` (0–8 nonblank strings, ≤200 UTF-8 bytes each), `edition` (≤200 bytes), `versionStatement` (≤1000 bytes), `numbering` (`article|chapter`) and a `role` (`preface|body|appendix`) on each chapter reference. All fields are closed and remain under the original 16384-byte configuration limit. Schema 1 is never implicitly rewritten. New Publisher providers omit the optional descriptor field on older hosts and continue to consume schema 1.

Schema 2 immutable manifests carry those fields and chapter `role`, `number`, and `numbering:{mode,applied,retained}`. Native technical objects can have a derived `objects[].number` such as `1.1` or `A.1`; retained objects keep their original integer numbers. Server-side rendering, selected-object projections and generated cross-document labels use the same explicit stable-ID map. This map is internal trusted rendering input, not an article attribute, REST numbering override or alternate save path. Authored anchor text, source IDs and revisions are unchanged. Metadata and role/order changes require a new snapshot and final permission verification.

## Controlled knowledge maps and course integration (Main 3.8)

Feature-detect `markbridge_teaching_supports_knowledge_maps(): bool` before registering
`readerMode: knowledge-map/v1`. The closed author format is
`{format:'knowledge-map/v1',title,groups,nodes,edges}`. Groups use `{id,title}` (1–8);
nodes use `{id,group,title,role,target,description?}` (1–32), with role
`concept|reading|practice` and title at most 96 Unicode codepoints. Edges use
`{id,from,to,kind,why?}` (at most 32), with kind `prerequisite|explains|practises`.
IDs use the existing ASCII identifier contract. Every group must be used. Self edges,
duplicate edge IDs and duplicate `(from,to,kind)` tuples fail. Only the prerequisite
subgraph must be acyclic; explanation/practice cycles and multiple incoming/cross-group
edges are supported. Fixed reader labels describe prior understanding, explanation and
practice; prior understanding never restricts access. Existing text, 16 KiB/1024-value/depth-8
parameter and 120 KiB combined static budgets remain in force.

Targets are a closed union of `{kind:'document',namespace,document}`,
`{kind:'local-document',site,documentId}`, and portable
`{kind:'step'|'activity',namespace,document,target}`. Namespace/document use `S_32hex` and
`D_32hex`; local document IDs use at most 512 UTF-8 bytes without controls. A local ID
never becomes a portable identity by inference. Stage/activity targets must match the
current reference index's exact kind; activities must be genuine envelope-v2 components.
Author target selection uses the existing permission-checked article and reference searches.
Maintain missing logical identities through the existing identity tools before selecting
stages or activities.

Core `mbb_knowledge_map_valid($params)` and JS `MBBKnowledgeMap.validate(params)` share
the model. Trusted providers use the existing `markbridge_validate_component_params`
filter for domain validation. Author params stay server-side. Core resolves targets and
rechecks current identity, pair and read permission before emitting opaque IDs and safe
links; unreadable nodes, their relationships/explanations and empty groups are omitted.
Controlled-map responses are private/no-store and vary on Cookie. Missing providers keep
filtered static relationships and the author's body. Export/publication preparation and
final permission stamps include the same filtered view.

Installed PHP extensions may call these trusted server APIs; none is an anonymous REST API:

- `markbridge_resolve_document_target(stdClass $target, bool $edit=false): array` accepts
  only document/local-document targets. Success is
  `{state:'available',post_id:int,title:string,url:string,hash:string,expected:string}`;
  every failure is `{state:'unavailable'}`. It rechecks unique current identity, paired
  content and read access; `edit=true` additionally requires current `edit_post`.
- `markbridge_document_target_for_post(int $id, bool $edit=false): ?stdClass` derives a
  target from the current indexed identity or proven local site/document ID and verifies
  it through the resolver. It never guesses an identity from a post ID or course ID.
- `markbridge_supports_collection_candidates(): bool` advertises the following narrow API.
- `markbridge_prepare_collection_configuration(array $config): array|WP_Error` validates
  the existing closed collection schema 1/2, at most ten chapters, explicit `privateOptIn`,
  current edit/read access, pairs, unique identities and cover scope, then rechecks them.
  Success is `{config,chapterSummaries}`. Any unavailable/conflicting target rejects the
  whole candidate. It writes no catalog, article, job or hidden course fields.

The `markbridge_collections_configuration_sources` action runs immediately before the
collection workspace. Extensions may render their own small source form there. Keep course
metadata in its own owner-controlled record; a graph and collection do not become a second
copy of it. Once the collection UI is ready, call
`window.MarkBridgeCollections.proposeConfiguration(config): Promise<boolean>`. It sends
closed `{schema:1,config}` (at most 16 KiB) to authenticated nonce-protected
`POST /mbb/v1/collections/configuration-candidate`, shows the arrangement and chapter
states, and waits for explicit Adopt/Cancel. Cancel resolves false and preserves current
fields, collection and job. Adopt revalidates server permissions and the opening serial;
current edits or another operation invalidate the candidate. Successful adoption resolves
true and creates a new dirty, unsaved collection with `id=null`. It never saves or prepares
publication automatically. Callers must wait for the API to exist and must not manipulate
input DOM, popup windows or session storage.

## Document body tools (Main 3.9, API 1)

`window.MarkBridgeDocumentTools` is the Core-owned body-candidate interface. It is separate from
`MarkBridgeAuthorTools` (whose bibliography contract is unchanged). Register trusted local JavaScript
with `registerTool(id, {label, render(host, api)})`. IDs are unique lowercase ASCII tokens, at most
64 characters; labels are plain text up to 100 characters, with at most 32 tools. `render` mounts
only inside `host` and may return a synchronous disposal function. Core owns the dialog, focus,
closing and disposal. Tools appear under **More** in the native editor and Markdown dialog.

```js
MarkBridgeDocumentTools.registerTool('example-review', {
  label: 'Review a document',
  render(host, api) {
    // Keep the plugin's selection and imported suggestions in its own memory.
    // Use explicit buttons to capture and propose; render() does not grant save authority.
    const button = document.createElement('button');
    button.textContent = 'Prepare candidate';
    button.onclick = async () => {
      const opening = await api.capture();
      const source = opening.source; // Synthesize a candidate from this immutable original.
      if (api.isCurrent(opening.openingToken)) {
        const result = await api.propose({ openingToken: opening.openingToken, source });
        // result.applied reports a local application, never a save.
      }
    };
    host.append(button);
    return () => {
      button.onclick = null;
    };
  },
});
```

`capture()` requires an existing, saved managed article and clean native/Markdown editing state,
including title/metadata, component parameters and resource imports. Authors save pending edits
before opening a candidate. A native file-source entry opens the existing source editor first;
unavailable/unwritable bindings remain unavailable. Capture never normalizes BOM/newlines. It returns
a deeply frozen clone of `{source, serialized, documentId, identity, sourceSha256,
serializedSha256, openingToken}`; `identity` is null or `{namespace, document}`. Each original and
candidate format is bounded to 256 KiB. It does not return WordPress post IDs as portable identity.

The opaque local `openingToken` binds the current tool session, native metadata/body and Main input
generation. Editing then undoing, closing, switching articles or recapturing invalidates it.
`isCurrent(token)` checks local state only. Asynchronous tools must discard their own late work.
`propose({openingToken, source})` rechecks server authority and opens a **separate Core dialog** with
escaped differences and a sandboxed static preview. **Cancel** returns `{applied:false}` and leaves
the tool and its draft mounted. **Apply to editor** rechecks the server again, consumes the token,
and returns `{applied:true}` after changing only the existing unsaved editor state. Native and source
Undo/Redo remain available; the author uses the ordinary preview/save flow afterward. Candidate-input HTTP 422 errors leave the opening token available so the author can reject a bad
suggestion, adjust the candidate and preview again; errors naming the saved `component_base` or
`identity`, permissions, receipts and baseline conflicts invalidate it. No SDK call
saves an article or writes a source file. A changed portable identity is rejected; use a new draft
instead of stripping it silently.

The private `POST /mbb/v1/document-tools/capture` and `/preview` routes are read-only.
Requests must use an `application/json` object with exactly `{post_id, expected}` for capture and
`{post_id, expected, receipt, source}` for preview. Extra/missing fields, non-scalar field types,
invalid Unicode and duplicate top-level keys (including escaped spellings) are rejected. Only the
raw JSON body supplies these values; form and query parameters never override them. The raw preview
budget accounts for the maximum 256 KiB source and 8192-byte receipt with worst-case JSON escaping.
WordPress rejects syntactically invalid JSON (including invalid UTF-8) with its native HTTP 400 before
the endpoint callback. Valid JSON with a non-object root, unknown/missing/duplicate keys or invalid
field types or source/raw-byte budgets receives HTTP 422. Existing permission callbacks retain HTTP 403 for unauthorized
valid requests; native JSON parse errors can occur first. Stale baselines and invalid/expired receipts
retain HTTP 409. The direct callback model also tests its defensive JSON parser, whose rejection is
422; that is separate from WordPress's earlier HTTP 400.

Their 15-minute,
domain-separated HMAC receipt contains only claims/digests and expiry, never private body text. Each
request freshly verifies the account/session, site/blog, expected pair, identity ownership, source
binding, actual bounded file bytes/fingerprint, adapters and exact original provider/resource pins.
Preview never extends expiry or adopts a newer baseline. Original pins changing invalidates the
whole candidate even if it explicitly requests a different component version. Receipts and file
hashes are not permission grants. There is no fuzzy relocation, extra body store or task queue.

`api.importFiles(files)` accepts a real `File[]` of 1–10 items and hands them to
`MarkBridgeBatch.open(files)`. The existing scan, loss warnings, per-item preview and explicit draft
confirmation remain mandatory. Default identity handling is **copy**, including the existing intra-batch
mapping; Markdown and single-document resource ZIP restrictions and upload limits remain unchanged.
It does not edit the file input, start scanning automatically, replace an existing batch, or replace
an article. Explicit replacement of the current article uses `propose`.
