# Optional Mermaid diagrams

The separate `mermaid-extension` plugin candidate **0.2.0-rc.1** registers both
`mermaid@0.1.0` and `mermaid@0.2.0` with separate source admission. It is not
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

## Component versions and appearance

The two complete examples above intentionally retain `0.1.0`. That version still
accepts only `source` and its existing rectangular, rounded and diamond nodes,
limited arrows and declared sequence participants. Installing the new extension
does not opt an old component into new grammar or add parameters to its saved
configuration. Use an explicit component version change for the expanded subset.

For `mermaid@0.2.0`, this is an example parameter object:

```json
{
  "source": "flowchart LR\nsubgraph Input[输入阶段]\ndirection TB\nA([开始]) --> B[(数据)]\nend\nsubgraph Work[处理阶段]\nC((计算)) <--> D{判断}\nend\nB -.-> C\nInput ==> Work",
  "curve": "step",
  "palette": "paper",
  "font": "serif"
}
```

Version `0.2.0` adds bounded `subgraph ID[Title]` / `end`: at most eight unique
subgraphs and three nesting levels, with one local `direction TD|TB|BT|LR|RL`
per group. Bare node references may connect across groups; group IDs may also be
edge endpoints. Node/group ID collisions, unclosed groups, duplicate ownership
and conflicting labels or shapes are rejected. Mermaid's own Dagre layout may
ignore a group's local direction when its nodes link outside the group.

Additional node forms are circle `A((Label))`, stadium `A([Label])` and cylinder
`A[(Label)]`. Additional edge forms are `<-->`, `<==>`, `<-.->`, `===` and `-.-`,
alongside the original `-->`, `---`, `==>` and `-.->`. Labels remain bounded
plain text; use one declaration or edge per line and spaces around edge arrows.
Chained edges, arbitrary shapes and unrestricted Mermaid syntax are not enabled.

Optional appearance parameters are `curve`: `linear`, `basis` (default), `step`,
`stepBefore`, `stepAfter`; `palette`: `paper` (default), `forest`, `slate`; and
`font`: `serif` (default) or `sans`. These are fixed mappings to the official
`base` theme's `themeVariables` and flowchart curve configuration, with local
Chinese/Latin font fallbacks. Initial system color scheme selects light/dark
colors; an already rendered frame needs reloading to pick up a later scheme
change. No article-provided CSS, `themeCSS`, font URLs, HTML, links, `init`,
`style`, `click` or external resources are accepted. The extension README is the
exact grammar and parameter reference.

## Reading and limitations

On the current host, a provider registered with the trusted `readerMode: diagram`
capability starts when its article component approaches the viewport. Only the
front-end reading path sends `presentation: diagram`; the frame requests a run
grant after ready. Successful output keeps a quiet figure presentation and small
zoom controls. **Collapse diagram** records the reader's choice for that mounted
component, so scrolling away and back does not reopen it; **Show diagram** opens
it again. Offscreen diagrams unload to reuse iframe slots while retaining their
layout height. The host keeps the four-iframe/two-execution limits and does not
automatically start algorithm demonstrations.

Editor previews and hosts without the reader capability keep explicit startup
and **Render diagram**. Both component versions still require protocol/run
grants. A BUSY response may quietly retry three times at 150/400/900 ms; exhausted
retries or failures offer recovery, without increasing the execution budget.
Stop/cancel clears pending retries and ignores late results. The author-written
static explanation remains available throughout and is used for print/static
export; rendered Mermaid SVG is not embedded into that explanation.

The real official Mermaid 12.2.0 flowchart/sequence engine remains bounded to
8,192 UTF-8 bytes, 24 nodes/participants, 48 edges/messages and 80 code points per
label. Version `0.1.0` permits 96 nonblank lines; `0.2.0` counts all physical lines
against its 96-line limit, with the group limits above enforced separately.
HTML, directives, styles, comments and other diagram types remain outside the
subset. Sequence control constructs are not enabled by the flowchart expansion.

On narrow screens, initial zoom preserves at least 75% of native diagram size
and permits focusable horizontal scrolling. **Fit width** shows the whole graph,
possibly making text smaller; +/- controls restore detail and support keyboard
activation. The static explanation is the textual reading path. Streaming gzip
decompression and Web Crypto are required; failures retain fallback rather than
claiming success. Desktop/narrow browser fixtures do not establish real-phone,
Safari or assistive-technology acceptance.

The single fixed local HTML stays within the existing 512 KiB resource cap. It
contains a compressed selected official bundle, verified against a second fixed
SHA-256 after streaming decompression capped at 1,100,000 decoded bytes. The
opaque iframe keeps `allow-scripts` only and its existing
`script-src 'unsafe-inline' blob:` policy, with no same-origin access, network or
`unsafe-eval`. Output passes the closed SVG audit, 256 KiB output cap and geometry
bounds. Accepted graphs may still exceed the five-second startup or two-second
execution deadline. Stop cannot preempt synchronous library work already running
on the iframe thread; host termination remains the outer bound.

## Maintainer validation

From the separate extension directory, explicitly populate the pinned source cache
with `npm run fetch` when needed. `npm run build` reads/verifies that cache without
writing it. `npm test` and
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
