# Technical writing formats

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

## Bibliography v2 and bounded CSL-JSON

The existing `mbb/bibliography` block also accepts `version: 2`. Only this
container gains a v2 Markdown opening; `:::mbb:end` and the v1 cite markers stay
unchanged. The exact header is `{id,entries,style}`, with `style` equal to
`author-year` or `numeric`. Native attributes add only `version: 2`. Other v2
teaching containers, extra fields, mixed v1/v2 records and arbitrary style names
are rejected. The same one-bibliography, top-level, before-footnotes rule and
1–64 entries / 64 KiB JSON budget apply.

Every v2 entry has exactly these fields:

| Field                             | Closed value / limit                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `key`                             | Existing stable citation key grammar                                                                                       |
| `type`                            | `article-journal`, `book`, `chapter`, `paper-conference`, `report`, `thesis`, `webpage`, `dataset`, `software`, `document` |
| `authors`                         | 0–8 names, each at most 120 displayed Unicode characters                                                                   |
| `issued`                          | `{literal}` with 0–64 single-line characters, or `{"date-parts":[[year,month?,day?], optionalEnd]}`                        |
| `title`                           | Required single-line text, 1–512 characters                                                                                |
| `containerTitle,publisher,source` | Single-line text, 0–512 characters each                                                                                    |
| `volume,issue,page`               | Single-line text, 0–128 characters each                                                                                    |
| `doi`                             | Empty or `10.` + 4–9 digits + `/` + bounded ASCII letters/digits/`-._;()/:`, at most 512 characters; no URL prefix         |
| `url`                             | Empty or credential-free absolute HTTP(S), at most 2048 characters; v2 authority rules below                               |
| `identifiers`                     | Exactly `{ISBN,ISSN,PMID,PMCID}`, each 0–128 single-line characters                                                        |

A name is exactly `{literal}` (person text or institution) or
`{family,given,droppingParticle,nonDroppingParticle,suffix}`. All person fields
are strings; `family` is required and nonempty. Their displayed joined text must
fit the existing 120-character name budget. Dates use Gregorian-valid integers:
year 1–9999, optional month 1–12 and a valid day; a date range contains two such
parts. Missing information is not guessed.

V2 URL admission is the same finite lexical check in PHP and Node. It preserves
the supplied URL exactly and makes no DNS request, IDNA conversion or URL rewrite.
The scheme is HTTP(S); whitespace, controls, backslashes and credentials are
rejected. A non-bracketed host is checked after one valid UTF-8 percent decode:
it must be nonempty and cannot contain whitespace, controls or `#/:<>?@[]\^|%`.
A host consisting only of digits and dots must have four decimal IPv4 octets
(0–255, no leading zeros; one final dot is allowed). A bracketed host must be
IPv6: eight hexadecimal groups, or one `::` replacing at least one group; a final
strict IPv4 address may occupy two groups. Zone identifiers are unsupported.
An optional port is decimal 0–65535; an empty port is rejected. Path, query and
fragment remain literal bounded text. Admission does not establish that a host
exists or is reachable. Existing v1 URL admission and historical bytes are
unchanged; an old URL outside the v2 rules blocks the upgrade candidate, leaving
the v1 body intact for explicit author correction.

**Prepare bibliography v2 candidate** copies every old author string to
`{literal: original}`, keeps the old year as `issued.literal`, retains title,
source, URL and keys, and sets the unknown type to `document`. It creates an
unapplied candidate. The normal Apply action makes one block attribute change;
Discard keeps the v1 block, and native Undo can restore the prior block state.
Existing v1 source, attributes and historical pairs do not upgrade automatically.
Restoring a v1 revision restores its exact original format. Document identity
and source-file protections continue to apply independently.

**Import CSL-JSON** accepts a UTF-8 JSON array of 1–64 records within 64 KiB,
16 nesting levels and 16384 data nodes. Duplicate JSON properties and record IDs,
unknown record types, invalid known values and data beyond the budgets are
rejected. This is an explicit finite subset of the
[CSL input schema](https://raw.githubusercontent.com/citation-style-language/schema/master/schemas/input/csl-data.json),
not a full CSL processor.

Supported fields are `id,type,author,issued,title,container-title,publisher,volume,issue,page,DOI,URL,ISBN,ISSN,PMID,PMCID,source`.
Safe-integer JSON numbers accepted for `id`, `volume`, `issue` and `page` use
the same plain decimal text in both backends, including exponent notation input;
negative zero becomes `0`. String values remain literal.
CSL name fields use `family,given,dropping-particle,non-dropping-particle,suffix`
or `literal`; supported dates use `literal` or `date-parts`. Safe integer IDs,
volume/issue/page values and numeric date strings are normalized explicitly.
The preview lists every unsupported field, including nested name/date fields;
more than 256 losses is rejected. Losses require explicit acknowledgement.
`raw`, `season`, `circa`, name flags, additional roles, abstracts, language and
all other unsupported metadata are not stored. A raw-only issue date becomes
an empty literal only after its displayed losses are accepted.

A valid `id` becomes the stable key; other IDs propose `reference-N` in input
order. The preview displays old → new key mappings and permits explicit key edits,
followed by another preview and acknowledgement. Duplicate keys block adoption;
merge never overwrites existing entries. Replace cannot remove currently cited
keys. Changed input, mode, keys or bibliography invalidates the previous candidate.
Reading a file is cancelable; a late file cannot replace newer pasted input.
Adoption enters the same unapplied bibliography draft and never saves an article.
The v1 BibTeX workflow remains available on v1 blocks.

**Download CSL-JSON subset** exports the applied/current bibliography candidate
as the same finite subset. A v1 export uses literal author/year conversion in
memory and leaves the original block unchanged. Original imported JSON and
unsupported fields are not archived or claimed to be lossless. The Markdown
and resource exports carry the complete v2 entry data; static HTML carries its
readable projection and uses the same fixed renderer as preview/front display.
Existing whole-document, media and trace budgets are unchanged. No remote lookup,
background refresh, library or server Node installation is required.

The two fixed styles use existing first-citation order and stable entry anchors.
`author-year` retains the current authored-name/year labels and collision suffixes;
`numeric` uses `[1, 2]` with the same links and does not add year suffixes. Its bibliography entries receive matching generated `[n]` labels; v1 entries do not.
Publication, volume/issue/pages, full dates, identifiers, DOI and authored source
text are visible in the fallback entry. The saved section adds only
`data-mbb-bibliography-version="2" data-mbb-citation-style="..."`; full structured
data remains in block attributes. Rendering cannot mutate entry data. The static
export interface shares this renderer; EPUB output is not implemented here.

Pure APIs, with no database or network effects:

- Browser/kernel: `MBB.parseCSL(source,keyMap={}) → {entries,losses,keyMappings}`;
  `MBB.cslCandidate(existing,report,mode,referencedKeys,ackLoss=false,ackKeys=false) → entries`;
  `MBB.exportCSL(entries) → CSL array`; `MBB.migrateBibliography(v1Entries) → v2Entries`.
- PHP: `mbb_csl_parse`, `mbb_csl_candidate`, `mbb_csl_export` use the same argument
  order and values. The bundled isolated PHP converter validates both formats.
  `keyMap` maps zero-based record indices to valid explicit keys. Reports should
  come from the parser; the candidate helper validates resulting entries and
  acknowledgement/key safety again. No new REST mutation route is added.

`tests/fixtures/csl.json`, `tests/csl.cjs`, `tests/csl.php`,
`tests/bibliography-v2.cjs` and `tests/technical-render.php` cover shared data,
conversion and fixed/static rendering. `tests/bibliography-v2-save.php` is the
explicit disposable WordPress save/native/history/source integration entry.

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
The v1 and v2 `author-year` reader-facing citation uses author/year labels rather than numeric brackets,
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

## 跨文档引用与可携带身份

管理员在“设置 → MarkBridge → 文档引用”初始化派生索引；每次最多处理十篇，继续至就绪。激活会执行有界初始化，重复初始化已就绪的索引不会启动重建。重建可继续或显式重新开始，不安排 cron，不改文章正文、原文或现有表引擎。索引仅存标识与配对指纹，不存正文、私文标题或转换输出。需要核心 WordPress 数据库连接和 InnoDB；不支持的定制数据库只影响此项新功能，原编辑流程保留。

作者在“更多 → 内容导航与检查 → 文档引用”显式启用。启用只准备候选，预览差异后仍需明确保存。身份是正文里的空顶层结构；有 FrontMatter 时放在完整头部之后，因此下载 Markdown 时会一并携带。旧文不会因打开、重建或升级而自动加入身份；原 `documentId`、文章 ID 和对象／评论锚点保持原值。

```text
:::mbb:v1 identity {"namespace":"S_11111111111111111111111111111111","document":"D_22222222222222222222222222222222"}

:::mbb:end
```

`namespace` 是随机来源标识，不是域名，绝不据此联网。原生形式为仅含 `namespace`、`document`、`version:1` 的空 `mbb/identity`，不能嵌套、重复或含内块；前台输出为空。账号／文章元数据中的旧 ID 不等同于可携带逻辑身份。

搜索仅显示当前可读取的文章及对象，优先显示作者标题。插入的 v2 标记是独立闭合格式，以下六个属性缺一不可，不接受额外属性、任意文本或链接：

```html
<span
  data-mbb-target="eq-one"
  data-mbb-version="2"
  data-mbb-namespace="S_11111111111111111111111111111111"
  data-mbb-document="D_22222222222222222222222222222222"
  data-mbb-kind="equation"
  class="mbb-xref"
  >[eq-one]</span
>
```

目标类型为 `equation`、`figure`、`table`、`listing`、`statement` 或 `step`；对象 ID 沿用原有 1–64 位规则。同篇 v1 标记和编号规则不变。v2 目标暂时不可读取或不存在时仍可保存，前台缓存 HTML 始终只留中性标记。浏览器向同站无缓存接口核验当前权限后才显示编号和链接；点击、页面返回及重新可见时再核验。不可读取、已删除、身份冲突和不存在均显示相同的不可用状态，不披露私文标题、数量或入链来源。

“准备使用新身份的副本”会产生新草稿候选和新的逻辑文档标识；单篇复制仅重映射自身 tuple 的 v2 引用，保留外部目标及全部 v1 引用。跨站普通复制分配目标站 namespace 与新 document；“显式保留身份的迁移候选”保留携带 tuple，但正式保存时必须原子取得唯一占用，不能覆盖已占用身份。批量导入在扫描时一次生成所选集合的 old→new tuple 映射，各篇预览显示该映射，并在重试和恢复状态时复用；仅改写所选集合内部的 v2 目标，外部目标和代码原义保留。所选文件重复同一旧身份时拒绝歧义，不猜测所属文章。每篇仍独立预览确认、独立事务保存，不提供多篇原子正文提交。

重建发现重复身份会停在冲突状态，不选择任意一篇作为可解析目标。管理员进入可编辑的冲突文章，准备新身份修复候选，经差异确认保存后显式重启重建。修复要求管理员权限、文章编辑权限、当前配对 CAS 和短期会话收据；正常编辑不允许更换已有身份。

历史版本保存原始配对。启用身份前的 revision 可准确比较，但不能把无身份历史正文直接写回并抹去当前身份。“将历史正文复制为保留当前身份的候选”是独立操作：保留历史原件，在 FrontMatter 后加入当前身份，经正常预览与确认保存，并以 `_mbb_copied_from_revision` 区别于精确恢复来源。

启用前的本机／服务端配对备份也保留原候选，不会自动添加或移除当前身份。可先查看差异；直接保存缺少当前身份的候选会明确拒绝且保留输入。若要沿用当前文章，打开“文档引用 → 身份元数据”，明确把当前 tuple 的空 identity 结构放到候选 FrontMatter 之后，再预览确认；这属于作者明确复制旧内容，不冒称精确历史恢复。也可把该旧正文作为新草稿，选择默认复制以分配新身份。同一 tuple 的备份继续走普通候选恢复流程。

导出的 Markdown／ZIP 保留正文里的身份与 v2 标记，不读取目标正文；普通 Markdown、ZIP 和批量导入在原预览链中提供“复制并分配新身份（默认）／显式迁移并保留身份”选择，不增加第二次保存。已有逻辑身份不能被上传内容替换；请新建副本候选。静态 HTML 固定当前已授权的目标映射及配对指纹，下载前重新核验；权限或目标内容变化需重新准备。不联网 namespace，也不会把未选择的目标正文打包进文章。

### 服务端接口

全部路径位于 `/mbb/v1/references/`；编辑操作沿用 REST nonce 和文章权限，管理操作另需 `manage_options`。响应均为 `private, no-store`。`resolve` 可供公开读者使用，私文仍按实时账号／会话、角色、密码与文章权限检查。

| 路径           | 请求与结果                                                                                                                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET status`   | `state`，管理员另见代号、游标及自己可编辑的冲突文章                                                                                                                                                                                                                            |
| `POST manage`  | `action: initialize/rebuild/resume/restart`；有界批处理                                                                                                                                                                                                                        |
| `POST prepare` | `action: enable/copy/import-copy/migrate/adopt-history/repair-copy`、`post_id`、`expected`、可选 `source`；来源绑定还需 `source_sha256`。历史操作另需 `revision_id/expected_revision`。返回 `document`、`post_id/expected`、`identity_receipt`、标题／状态／来源指纹，不写正文 |
| `GET search`   | `q`、可选会话 `cursor`。最多扫描 1000 篇派生条目、返回 20 篇可读文章各至多 100 个目标；只有发现额外可读结果才返回下一页，不返回隐藏数量                                                                                                                                        |
| `POST resolve` | `targets` 最多 32 个四字段 `{namespace,document,target,kind}`，响应同序 `items`；不可用项只有 `{state:"unavailable"}`                                                                                                                                                          |
| `GET incoming` | 目标四字段；最多检查 100 个来源，输出当前可读取且仍含该引用的来源，无隐藏总数                                                                                                                                                                                                  |
| `POST impact`  | `post_id/expected/source`，比较当前对象删除／类型变化的可读取入链，不改其他文章                                                                                                                                                                                                |

候选正常调用 `preview`、`save` 或受保护的来源保存，携带 `identity_receipt`；原生保存可用 `mbb_identity_receipt`。收据绑定账号会话、文章、基线、目标身份与 15 分钟期限。服务端 `mbb_sync_write` 的可选第六参数接受该收据；它不放宽绑定路径、来源摘要或保存 CAS。正文、索引和唯一占用通过同一不自动重连的数据库事务提交，连接丢失或提交结果不明不会报告成功。数据库事务不能使文件系统原子化；来源恢复仍采用已有摘要和补偿验证规则。

## 可选资料库来源

独立 Scholarly Tools 可将本人库的固定版本复制到当前未应用文献候选。完整字段与引用键冲突先预览，采用后仍须“应用文献修改”及原有保存；不会自动更新文章。来源不存在、无权或停用扩展时，已保存的文章快照继续阅读。

文献 v2 可显式带 `origins: [{key,namespace,item,version,hash}]`：最多64条、key必须是本块现有且不重复的引用键，namespace=`L_`+32位小写hex，item=`I_`+32位小写hex，version为正安全整数，hash为64位小写SHA256。字段闭合，没有账户、姓名、路径或抓取URL。声明不是权限或真实性证明，命名空间不联网解析。旧v1／无字段v2保持不补空字段。

摘要取完整合法v2条目去掉文章key，递归按ASCII字段排序；数组顺序保留，UTF-8 JSON无缩进，不转义Unicode、斜线、U+2028／U+2029，不作Unicode归一化。PHP `mbb_bibliography_entry_hash($entry)`、JS `MBB.bibliographyEntryCanonical(entry)`／异步 `MBB.bibliographyEntryHash(entry)`共享规范。手改造成失配保留声明、显示本地修改，不阻保存；删除引用键删对应来源，显式rename同步来源key且hash不变。正常配对、修订、来源同步和移植携带该字段，无旁路postmeta提交。

主编辑器供该扩展使用的最小可信hook为 `window.MBBScholarlyTool` React组件，参数 `{draft,change,registry,clientId,session}`。draft是当前未应用文献候选，change只准备候选；不得直接setAttributes或另行保存文章。异步结果须绑定当前候选、选择块与opening文章expected/source_sha256，最终Apply仍走原有全篇校验和基线保护。该入口仅供安装的受信插件，不接受文章提供任意脚本或HTTP地址。
