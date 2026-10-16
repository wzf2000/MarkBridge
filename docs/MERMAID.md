# Optional Mermaid diagrams

The separate `mermaid-extension` plugin registers `mermaid@0.1.0`. It is not
required to read or save an article's static explanation. The main plugin keeps
its existing format, permissions, resource limit and opaque component sandbox.
See the extension README for the exact limited grammar, official source pin,
license texts, build commands and independent package manifest.

## Authoring

Install the independent extension in the same WordPress site. Insert the
registered **Mermaid flowchart / sequence** component and edit its `source`
parameter with the existing component parameter editor. Apply or Discard changes
through the usual draft workflow. Keep a complete static explanation inside the
component, including information that readers need when the interactive diagram
is unavailable or in print/static exports. Mermaid output is never saved as
article HTML and does not replace that explanation.

An example Markdown component is:

```markdown
:::mbb:v1 component {"id":"mermaid-flow","component":"mermaid","componentVersion":"0.1.0","params":{"source":"flowchart LR\nA[中文开始] --> B{Choose}\nB -->|Yes| C[Finish]"}}

从开始节点进入判断；选择 Yes 后进入完成节点。

:::mbb:end
```

A sequence example uses an independent stable component instance:

```markdown
:::mbb:v1 component {"id":"mermaid-sequence","component":"mermaid","componentVersion":"0.1.0","params":{"source":"sequenceDiagram\nparticipant Alice as Alice\nparticipant Bob as Bob\nAlice->>Bob: Hello\nBob-->>Alice: Response"}}

Alice 向 Bob 发送 Hello，Bob 返回 Response。

:::mbb:end
```

The component `id` remains stable when editing source. Missing providers retain
configuration and the static fallback. Existing node-diagram components are not
converted into Mermaid. No external Mermaid services, URLs or article scripts
are fetched.

## Reading and limitations

Start the component explicitly, then choose **Render diagram**. This runs the
real official Mermaid 12.2.0 flowchart or sequence renderer with a strict source
subset. The source is limited to 8 KiB, 96 nonblank lines, 24 nodes/participants,
48 edges/messages and 80 code points per label. It excludes HTML, links, click
handlers, configuration directives, comments, styles, subgraphs and all other
diagram types. See the extension README for supported arrows and label syntax.
Stop ignores any late result. On narrow screens the focusable diagram can scroll
horizontally; author fallback is the accessible textual reading path. Browser
support requires streaming gzip decompression and Web Crypto; failures retain
fallback and do not claim success. Automated desktop/narrow Chromium coverage is
not a claim of real phone, Safari or assistive-technology acceptance.

The single fixed local HTML remains below the existing 512 KiB host cap. It
contains a compressed selected official bundle verified against a second fixed
SHA-256 after bounded streaming decompression (1,100,000 decoded bytes). Existing
`script-src 'unsafe-inline' blob:` allows loading that verified local code; no
host CSP change or `unsafe-eval` is needed. Output passes a closed SVG audit,
256 KiB output budget and geometry bounds. Large accepted graphs may still hit
the host's existing execution deadline; no automatic retry expands it.

## Maintainer validation

From the separate extension directory, `npm run build`, `npm test` and
`npm run test:browser` exercise fixed resource integrity, matching Node/PHP source
admission, actual official rendering inside the host's unchanged opaque CSP,
invalid input, corrupted code hash, canceled/denied execution and lack of
network requests. Set `MARKBRIDGE_CHROMIUM_PATH` to an already installed Chromium
when needed. The main repository can additionally run
`node tests/mermaid-extension.cjs`, with optional
`MARKBRIDGE_TEST_MERMAID_ROOT` pointing to the built extension. These tests do not
write WordPress articles or install the plugin. With `MARKBRIDGE_TEST_RUNTIME`
set to an existing prepared runtime, the same test additionally imports both
complete documentation examples through the current Node real-core and PHP
converters and checks exact paired restoration; without it, that coverage is
explicitly reported as not run.
