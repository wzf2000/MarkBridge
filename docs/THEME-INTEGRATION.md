# Theme integration

MarkBridge owns formula, code, teaching-control and footnote geometry. Themes can
adapt their presentation through inherited CSS custom properties. Defaults live
in `plugin/math.css` on `:where(:root)`; code and teaching styles also have local
fallbacks. The plugin remains usable without PageNest. These variables affect
presentation only; they do not change saved content or author display settings.

Set overrides on the article or preview container. A dialog appended outside the
article inherits from the document root, so set document-level font/focus tokens
there if the dialog should share them. Do not reset tokens on every code block:
that prevents the article's theme or reader preferences from reaching it.

| Public token             | Default                                             | Purpose                                                                    |
| ------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------- |
| `--mbb-font-body`        | `inherit`                                           | Document font family                                                       |
| `--mbb-font-ui`          | `system-ui, sans-serif`                             | Reader dialogs and small code hints; use a font-family list, not `inherit` |
| `--mbb-font-code`        | `ui-monospace, SFMono-Regular, Consolas, monospace` | Code and source textareas                                                  |
| `--mbb-code-size`        | `0.85em`                                            | Managed code font size                                                     |
| `--mbb-code-line-height` | `1.7`                                               | Managed code line height                                                   |
| `--mbb-code-surface`     | `#f5f6f8`                                           | Code panel and scroll hint background                                      |
| `--mbb-code-text`        | `#293630`                                           | Base code foreground; syntax tokens retain highlighting                    |
| `--mbb-code-muted`       | `#526577`                                           | Comments, line numbers and scroll hint text                                |
| `--mbb-quote-surface`    | `#f2f3ed`                                           | Document quotation background                                              |
| `--mbb-quote-text`       | `inherit`                                           | Quotation foreground                                                       |
| `--mbb-quote-border`     | `#93a58f`                                           | Quotation start border                                                     |
| `--mbb-block-space`      | `1.25rem`                                           | Teaching groups and quotation vertical margins                             |
| `--mbb-panel-padding`    | `1rem`                                              | Code panel and quotation horizontal spacing                                |
| `--mbb-border-color`     | `#8884`                                             | Teaching panels and footnote separator                                     |
| `--mbb-border-radius`    | `8px`                                               | Base teaching panel radius                                                 |
| `--mbb-focus-color`      | `#2271b1`                                           | Keyboard focus and selected code tab indicator                             |

Keep foreground, muted text and surface colors readable together, including in
reader-selected dark palettes. CSS variables do not replace a syntax-highlighting
palette. PageNest retains its explicit reader-palette syntax overrides.

Existing sticky integration remains supported: `--mbb-teaching-sticky-offset`
reserves space above stage controls and `--mbb-teaching-sticky-background` supplies
their opaque background (`Canvas` by default). The runtime combines the requested
offset with measured fixed headers and administration bars. `--mbb-teaching-measured-offset`,
`--mbb-teaching-effective-offset`, control heights, toolbar gaps and code gutters
are implementation details, not additional theme settings. Do not force a fixed
stage-control top position or replace the runtime's measured values.

## PageNest adapter and resource ownership

PageNest maps its font, palette, spacing and border values in `assets/content.css`
on article and editor-preview roots. Theme-wide article CSS excludes
`.mbb-code-display` from generic `pre` rules: font metrics, padding, line-number
gutters and full-width diff rows remain under MarkBridge's control even when the
theme content sheet loads after plugin styles. Themes using similar generic
selectors should apply the same exclusion. Avoid broad `!important` code resets.

The theme owns the `pagenest-content` style and script handles, depending on its
base `pagenest` style. Companion content pages own separate
`pagenest-companion-content` style and script handles. They have no hard dependency
on PageNest, so they continue to load with another theme. WordPress may enqueue
Companion content during `the_content`; distinct handles allow both resources to
survive either registration order. Existing theme alias localization continues to
target `pagenest-content` and `pagenest-content-preview` only.

Edit original assets and rebuild each package through its own build entry point.
Do not patch generated hashes or copy a theme-specific selector into MarkBridge.
The source browser test `theme-contract.spec.cjs` verifies standalone defaults and
token overrides. PageNest's `markbridge-code-cascade.spec.cjs` checks late theme CSS
with `MARKBRIDGE_TEST_PLUGIN_ROOT` pointing at MarkBridge's `plugin/` directory.
