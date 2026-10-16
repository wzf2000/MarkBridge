# Technical writing v1

This document defines the paired Markdown/block format for article-local objects,
statements and bibliography entries. Numbering and actual reference links belong
to the presentation layer. They are never written into source or block attributes.

## Markdown and block attributes

The existing closed `:::mbb:v1` grammar adds three containers. Their block names
are `mbb/object`, `mbb/statement` and `mbb/bibliography`; block attributes contain
exactly the header fields plus `version: 1`.

```markdown
:::mbb:v1 object {"id":"eq-loss","kind":"equation","caption":"Loss function"}

$$
L = x^2
$$

:::mbb:end

See <span class="mbb-xref" data-mbb-target="eq-loss" data-mbb-version="1">[eq-loss]</span>.

:::mbb:v1 statement {"id":"proof-loss","kind":"proof","title":"Proof","open":false}

The result follows by substitution.

:::mbb:end

A source <span class="mbb-cite" data-mbb-keys="paper-a" data-mbb-version="1">[paper-a]</span>.

:::mbb:v1 bibliography {"id":"references","entries":[{"key":"paper-a","authors":["A. Author"],"title":"An example","year":"2026","source":"Example journal","url":"https://example.invalid/paper"}]}

:::mbb:end
```

Example attributes:

```json
{ "id": "eq-loss", "kind": "equation", "caption": "Loss function", "version": 1 }
```

Object kinds are `equation`, `figure`, `table`, `listing`. The body has exactly
one direct child, respectively `mbb/math`, `core/image`, `core/table`, `mbb/code`.
Code tabs, code comparisons and arbitrary HTML are not listing bodies in v1.
Captions are single-line plain text, 1–512 Unicode characters.

Statement kinds are `definition`, `theorem`, `proof`. Titles are single-line
plain text, 1–200 Unicode characters. Their body is nonempty and uses existing
supported blocks. Only proof may have `open:false`; other statements use
`open:true`. Object and statement containers may be inside ordinary teaching
containers; neither is allowed inside a footnote definition.

IDs and bibliography keys begin with an ASCII letter and have 1–64 ASCII letters,
digits, underscores or hyphens. All stable document IDs, including existing
teaching IDs and HTML anchors, share one namespace. References resolve only to
object/statement IDs; bibliography citations resolve only to entry keys.

There is at most one bibliography, at document top level, before the footnote
section. It has no child blocks and contains 1–64 entries, encoded within 64 KiB
of JSON. Each entry has exactly `key,authors,title,year,source,url`. Authors contain
at most eight single-line names of at most 120 Unicode characters; title is
nonempty, at most 512 characters; source is at most 512 and year at most 32.
URL is empty or an absolute HTTP(S) URL of at most 2048 characters; no URL is
fetched. Text fields are plain text, escaped when saved as HTML.

## Canonical saved HTML

The HTML below is the block's content, surrounded by ordinary WordPress block
comments and its exact attributes. No generated number, reference `href`,
session marker or source text attribute is present.

```html
<figure id="eq-loss" class="mbb-technical-object" data-mbb-object-kind="equation">
  <div class="mbb-technical-body"><!-- the one existing child block --></div>
  <figcaption class="mbb-technical-caption">Loss function</figcaption>
</figure>
<section id="def-loss" class="mbb-technical-statement" data-mbb-statement-kind="definition">
  <p class="mbb-technical-heading">Definition</p>
  <div class="mbb-technical-body"><!-- existing child blocks --></div>
</section>
<details id="proof-loss" class="mbb-technical-statement" data-mbb-statement-kind="proof">
  <summary class="mbb-technical-heading">Proof</summary>
  <div class="mbb-technical-body"><!-- existing child blocks --></div>
</details>
<section id="references" class="mbb-bibliography">
  <p class="mbb-bibliography-title">Bibliography</p>
  <ol>
    <li data-mbb-bib-key="paper-a">
      <span class="mbb-bib-authors">A. Author</span><span class="mbb-bib-title">An example</span
      ><span class="mbb-bib-year">2026</span><span class="mbb-bib-source">Example journal</span
      ><span class="mbb-bib-url">https://example.invalid/paper</span>
    </li>
  </ol>
</section>
```

A proof with `open:true` has the boolean `open` HTML attribute. Definition and
theorem always use `section`. Bibliography spans are always present, including
empty fields; authors are joined with `, `. Actual bibliography links and
punctuation are presentation output, not saved HTML. Entries retain author order.

## Atomic inline references

The exact versioned span forms in the example are atomic parser tokens. Their
attribute set is closed; attribute order is not semantic (WordPress RichText
serializes identity/version before class); target/keys and bracketed text must match exactly.
Duplicate raw attributes are rejected before any DOM parser can discard them.
Nested spans, references in links/images, missing targets and duplicate keys are
rejected. One cite contains at most eight distinct keys. Code and escaped
examples remain literal; ordinary `@text` is unchanged. A Markdown link definition
with the same name must never consume the bracketed text inside a valid span.
Inline references are allowed inside footnotes.

Each object kind and each statement kind has a separate derived counter,
including proofs. Bibliography ordering follows first citation in reading order,
after footnote order is established; uncited entries follow in their original
entry order. Stored keys and entry order never change for display purposes.
The reader-facing citation uses author/year labels rather than numeric brackets,
with multiple entries separated by semicolons, for example
`(A. Author, 2026a; A. Author, 2026b)`. Links still resolve through the stable
bibliography keys to the matching derived entry anchors.

The author label uses the authored joined author text, falling back to the title
when no author was supplied; it does not guess family names, split Chinese names
or infer an `et al.` convention. Labels longer than 64 Unicode characters visibly
abbreviate to 63 characters plus an ellipsis. Missing years display `Undated`.
Entries with matching displayed author text and year gain `a`, `b`, … suffixes in
the derived citation order, also shown beside their bibliography years. This is a
bounded presentation convention, not a full CSL/APA/BibTeX style processor.

Generated citation labels sit in a `data-mbb-generated` descendant. A hidden
`mbb-technical-source` span retains the original `[key-a,key-b]` marker, so
paragraph/comment adapters that ignore generated descendants keep the authored
paragraph identity. Author-year text, disambiguation suffixes, numbered headings
and links are never saved back into author fields, source or paired blocks.

## Reading presentation

Definition, theorem and proof containers use an academic serif stack, overridable
with `--mbb-font-academic`, with spacing and heading weight instead of a generic
shaded panel or vertical quote rule. Definitions remain upright; theorem prose
and proof headings request italic. `font-synthesis: none` uses a real italic face
when one is installed and prevents fabricated oblique CJK glyphs when it is not.
The plugin does not download an academic font, and the actual font/italic face
therefore depends on local availability. Code, tables and math inside statements
keep their own upright presentation.

Proofs retain native `details`/`summary` and their authored open state in ordinary
reading. Their body receives a quiet right-aligned `□` end mark, generated and
hidden from duplicate accessibility exposure; it is not an extra authored
paragraph. Print/static-export behavior opens the complete proof without changing
the saved `open` attribute. Bibliography display uses hanging entries, emphasized
authors and italic titles; a safe source URL displays a compact host label while
retaining the complete href/title. These are reading-layer changes, not a rewrite
of the structured six bibliography fields or the stable key namespace.

## Shared conversion acceptance cases

`tests/fixtures/technical-writing.json` is the shared Node/PHP input contract.
Positive cases must import, serialize equally, reopen as valid editor blocks,
and restore the original source in a paired round trip. Negative cases must be
rejected by both backends; unsupported data must never be silently repaired.

## Editor workflow

The canvas keeps unselected objects/statements in reading form: a derived kind
and number, caption/title and real body blocks. Stable IDs, kinds and rename
controls live in the selected block's sidebar. Caption/title edits use a local
candidate there: **Apply text edits** validates and commits it, while **Discard
text edits** restores the applied text. Unapplied candidates retain the shared
save/export lock and survive selection changes. Changing an object kind preserves its existing body; an
incompatible body is reported and cannot be saved until the author replaces it
with exactly one matching block.

Bibliography entries have separate collapsible sidebar forms. Text changes,
adding and removing entries produce one local candidate. **Apply bibliography
edits** validates and applies that candidate; **Discard bibliography edits**
restores the applied entries. Saving/export stays locked while it is unapplied.
Switching selection preserves the candidate; deleting the block clears it.
Apply/discard this candidate before renaming entry keys. Cited entries cannot be
deleted through the structured form until their citations have been removed.

Use the RichText toolbar's cross-reference/citation picker to choose existing
valid targets. Its target preview is separate from the reading label; inline author text remains
`[stable-label]` or `[key-a,key-b]`. No generated number is inserted into the
editable author marker. Invalid or duplicate targets are omitted and diagnosed;
backend conversion independently rejects missing, malformed and duplicate data.

A label/key rename first reports the affected marker count. Explicitly applying
it rechecks the current tree and commits the identity and all affected inline
fields in one block-store action. It does not perform rendered-text searches or
rewrite code examples. An identity change invalidates the old preflight plan.

Technical structures are limited to 2048 object/statement/bibliography blocks
and 4096 reference markers, within the existing whole-document depth/node/source
limits. Editor diagnostics are capped at 32 distinct issues. `referenceHTML`
independently validates kind and 1–8 distinct legal keys (exactly one for xref),
even if invoked with an incomplete author draft.

## Math semantics and access

The existing local MathJax engine emits English semantic speech labels along
with CHTML. Those labels survive the isolated preview serialization and formula
reader clone; the visual math remains hidden from duplicate accessibility
exposure. Keyboard opening, closing and return focus are covered in browser
regressions. Source TeX and stored blocks remain unchanged.

Semantic preservation is not a complete screen-reader certification. The bounded
Chinese structural guidance, expression exploration and English fallback are
described in [Math reading](MATH-READING.md); they do not establish real
assistive-technology acceptance. Math rendering failure keeps source and retry
tools available.
