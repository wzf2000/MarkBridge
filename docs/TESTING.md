# Browser compatibility and performance checks

Run `npm run build` before browser checks. The suite serves synthetic fixtures on
loopback port 8765 by default; `MARKBRIDGE_TEST_BROWSER_PORT` selects another free
unprivileged port. Never point the test runtime at production or seed over a shared
reviewer's drafts. Core-script editor checks require a sanitized runtime prepared
by `scripts/prepare_runtime.py` and `MARKBRIDGE_TEST_RUNTIME` pointing to it.

The default Playwright projects remain desktop Chromium and mobile Chromium.
`MARKBRIDGE_CHROMIUM_PATH` changes only those projects' executable. With the pinned
Playwright dependencies installed, run:

```sh
npx playwright test
MARKBRIDGE_CROSS_BROWSER=1 npx playwright test \
  --project=desktop-firefox --project=mobile-firefox \
  --project=desktop-webkit --project=mobile-webkit
```

The additional projects collect only `theme-contract.spec.cjs`,
`compatibility.spec.cjs` and `diagnostics.spec.cjs`. They cover source CSS tokens,
real CHTML formula output, keyboard formula-reader control, denied clipboard
fallback, wide math, highlighted long code, staged reading, collapse controls,
printing visibility and diagnostics. Clipboard denial is injected explicitly;
these paths do not request Chromium-only clipboard permissions. The compatibility
editor check uses real core block scripts, toggles a task, exports Markdown and
serializes/reparses block state. Without a runtime that check is explicitly skipped;
a skip is a missing check, not an editor pass. CI prepares the real runtime and
rejects skips, retries and failures in both browser reports.

CI runs the full Chromium suite first, installs Firefox/WebKit matching the locked
Playwright release with their system dependencies, then runs the targeted matrix.
These are browser-engine checks: WebKit does not establish Safari support on Apple
hardware, and narrow/touch viewports do not establish physical mobile-device support.
Screenshots still require human inspection. Synthetic loopback checks do not verify
public edge behavior, production themes, authentication or actual WordPress database
save/reopen; those need the separately prepared isolated WordPress integration.

## Optional reproducible browser observations

Performance is excluded from normal collection. After building, run:

```sh
MARKBRIDGE_BENCHMARK=1 npx playwright test tests/browser/performance.spec.cjs \
  --project=desktop-chromium --workers=1 --retries=0
```

Each fixed small (2 formulas / 20 code lines) and long (24 formulas / 400 lines)
fixture records five independent contexts and a second navigation in each context.
Reports preserve raw samples, medians and min/max for formula typesetting, explicit
Prism highlighting, navigation plus work, request count, resource entries and
transfer/encoded/decoded bytes. They identify the browser/version, viewport, source
bytes and total built asset bytes. JSON reports are attached to Playwright results.
No latency threshold converts a random network fluctuation into a regression.

"Cold" means an empty browser context; OS, server and filesystem caches are not
cleared. "Warm" means a second navigation in that context, subject to actual server
cache headers. Both use the same existing `/front` bootstrap before timing the fixed
extra formula/code workload, so formula/highlight measurements concern incremental
work after renderer startup, not renderer download. The overall navigation timing
and resource totals include initial renderer startup and the bootstrap fixture.
Resource Timing totals cover the top document; iframe-only renderer requests can
appear in the request counter without corresponding top-document size entries.
Cache hits may report zero transferred bytes. These quantities must not be described
as full network bytes or a production first-input budget. Run Node/PHP conversion
measurements separately and compare only like fixtures and conditions.

## Explicit anonymous origin/edge resource probe

For an authorized synthetic site, `scripts/probe_delivery.py` compares one fixed
HTML resource at two explicitly supplied endpoints. Obtain the expected SHA-256
from the local fixed resource, then run (replace the example endpoints):

```sh
python3 scripts/probe_delivery.py \
  --origin https://origin.synthetic.example/component.html.txt \
  --edge https://edge.synthetic.example/component.html.txt \
  --sha256 EXPECTED_64_HEX_DIGEST --max-bytes 524288
```

The operator supplies both URLs directly. Do not use article-provided URLs. The
probe accepts only HTTP(S), rejects credentials, query strings and fragments, sends
no authentication/cookies/referrer, bypasses environment proxies and does not follow
redirects. It does not create a web endpoint, write to WordPress, save response
bodies, or retry failures. A request timeout and byte budget bound each probe;
the default budget is 512 KiB and the hard maximum is 16 MiB. Loopback URLs are
permitted for local synthetic tests.

The default component carrier MIME types are `text/html` and `text/plain`;
`--mime text/plain` or `--mime text/html` requires one. Responses must contain UTF-8
HTML with an opening `html` element (optionally preceded by a doctype) in the first
4096 decoded characters. Invalid UTF-8, binary control bytes, compressed bodies,
unexpected types, HTTP failures, redirects, truncation, excessive size and digest
mismatch fail with a nonzero exit code. This intentionally checks component HTML
payloads; it is not a generic JavaScript, font or image probe.

JSON reports contain only `origin`/`edge` target labels, safe MIME names, HTTP
status, byte count, SHA-256, elapsed milliseconds, bounded error codes and comparison
results. They omit hosts, paths, full URLs, response content and exception text.
`equalBytes` alone is insufficient: both targets must also pass MIME, HTML, size and
expected-digest checks for overall success. Partial/oversized results omit a complete
digest. CLI arguments themselves remain subject to the operator's shell history.
Only actually probing an authorized public synthetic origin/edge pair constitutes
public delivery evidence; passing local unit tests does not establish public reachability.

Run the loopback-only fake-server tests with:

```sh
python3 -m unittest discover -s tests -p test_delivery_probe.py
```

The optional component observation uses the same benchmark switch:

```sh
MARKBRIDGE_BENCHMARK=1 npx playwright test tests/browser/performance.spec.cjs \
  --grep='fixed component' --project=desktop-chromium --workers=1 --retries=0
```

It loads the fixed `fixtures/component.html` through the existing anonymous loopback
HTTP route with its correct SHA-256 and the real `components.js` isolation/protocol.
Five independent contexts each perform a cold navigation and a second navigation in
the same context. No request interception disables browser caching; actual reuse
still depends on the fixture server's headers. The host script is preloaded from
source before timing. This is not a whole-page script-download measurement.

`performance-component.json` preserves samples and median/min/max for launch-click
to ready, Resource Timing request start to download end, download end to ready,
explicit run-request to matching complete, requests and response bytes. Download
end to ready mixes digest verification, iframe creation/loading and handshake;
it cannot be described as pure SHA or initialization cost. The explicit execution
measurement includes the grant and Worker startup. Each sample performs exactly
one user-requested fixed Worker run after ready; it never automatically reruns an
algorithm. Actual response-body byte length is separate from network transfer and
encoded/decoded Resource Timing sizes. Only real ready/complete behavior is asserted;
there are no hard latency thresholds. Results are loopback/browser observations,
not production-edge, Safari or physical-phone measurements.

## Reproducible conversion observations

```sh
python3 scripts/benchmark_conversion.py --runtime /srv/markbridge-synthetic-runtime \
  --php php --output /tmp/markbridge-conversion-samples.json
```

The output path must be new. The command converts the same fixed small/long
synthetic sources five times per backend and verifies exact source preservation.
It records engine versions, byte counts, fixture hashes, all durations and
median/min/max. Durations include fresh process startup; they are not HTTP save
latency. OS/filesystem caches are uncontrolled. To compare PHP versions choose
`--php` explicitly and a different output file. Runtime preparation, database saves
and frontend work are measured separately.

## Knowledge maps and collection configuration candidates

After the ordinary build, run `node tests/knowledge-map.cjs`,
`node tests/knowledge-map-native.cjs`, `php tests/knowledge-map-copy.php`,
`php tests/knowledge-map-privacy.php` and `php tests/collections.php`. The shared
knowledge-map corpus covers the closed target union, roles, title budgets, stable IDs,
self/duplicate edges and prerequisite-only DAG rule. Native tests compare actual PHP/JS
Markdown/block bytes and verify that saved HTML has no parameter carrier. Privacy tests
recheck final static output and prepared permission stamps, including escaped JSON formats.

`tests/browser/knowledge-map.spec.cjs` covers fixed semantics and existing reader controls
at 1440/390/320. `collection-configuration-candidate.spec.cjs` covers cancel, new unsaved
adoption and edits while validation is pending. The controlled knowledge-map case in
`component-parameters.spec.cjs` uses the real sanitized editor runtime and checks stable
node selection and late search cancellation. Reuse the old relation routing/author tests
for unchanged reader and Apply/Undo behavior.

Run `tests/knowledge-map-save.php` through WP-CLI only in a disposable local WordPress,
with `MARKBRIDGE_TEST_WORDPRESS_ROOT` and `MARKBRIDGE_TEST_HOME` identifying that lab.
Activate the matching Teaching provider first. Run once per supported conversion backend.
It creates and removes only its own author/posts, exercises paired save/reopen, real
logical-identity target resolution, kind rejection, candidate validation without catalog
writes, anonymous draft filtering and final export re-resolution after target deletion.
This fixture never authorizes production writes or seeding a retained review database.

## Document candidate SDK

The 3.9 source adds `node tests/document-tools.cjs` (pure client contract),
`php tests/document-candidates.php` (receipt and baseline model), and
`tests/browser/document-tools.spec.cjs` (Core dialog flow with synthetic REST).
These check stale generations/late responses, cancellation, separate tool draft lifetime, explicit
application without save, bounded File[] handoff and read-only receipt tamper/session/expiry checks.
The PHP model additionally supplies raw JSON requests for closed fields, top-level duplicate keys,
escaped duplicate names, query override isolation and maximum-size JSON escaping. Defensive callback
parser errors are 422 in that direct model; real WordPress parses syntactically invalid JSON/UTF-8
first and returns its native HTTP 400. The real REST entry checks that distinction alongside valid
JSON shape errors (422), original permission denial (403) and stale/receipt rejection (409).

For real WordPress authority and saved-pair checks, use an explicitly owned **local** synthetic site
with the current built package installed; the entry rejects other environments:

```sh
export MARKBRIDGE_TEST_WORDPRESS_ROOT=/path/to/owned/local-wordpress
export MARKBRIDGE_TEST_HOME=http://127.0.0.1:18800
wp --path="$MARKBRIDGE_TEST_WORDPRESS_ROOT" eval-file tests/integration/document-candidates.php
```

Repeat under each configured PHP/Node conversion backend. This creates and removes only its own
synthetic author/draft; it does not initialize the reference index or touch other articles. Run the
browser suite after building, with one worker, and inspect desktop/mobile screenshots separately.
The 3.9 initial source preparation has only syntax/model validation: build, real database integration
and browser/visual acceptance are pending and must not be inferred from those model checks.
