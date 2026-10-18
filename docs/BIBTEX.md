# 受限 BibTeX 导入

文献侧栏的“导入 BibTeX”用于把本地纯数据映射到既有 bibliography 六字段，不新增正文格式，
不查询 DOI、下载 URL 或写数据库。支持粘贴或选择 UTF-8 `.bib` 文件，输入至多 64 KiB，
1–64 个条目，每项至多 8 位作者，花括号嵌套至多 16 层。文件可带 UTF-8 BOM。

## 明确支持的子集

条目类型只接受 `@article`、`@book`、`@inproceedings`、`@misc`，类型与字段名不区分大小写。
条目可用花括号或圆括号包裹；字段值使用花括号或双引号，可嵌套分组。只有 `year` 可直接
写裸数字；年份为 1–4 位 ASCII 数字。条目键以 ASCII 字母开头，至多 64 位字母、数字、
下划线或连字符。`title` 必填，提供的字段均不得为空。条目及字段重复都拒绝。

字段闭集及映射：

| BibTeX 字段                                       | bibliography 字段                                                |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| 条目键                                            | `key`                                                            |
| `author`                                          | `authors[]`，按最外层的 `and` 分隔，保留姓名顺序与逗号写法       |
| `title`                                           | `title`                                                          |
| `year`                                            | `year`                                                           |
| `journal/booktitle/publisher/volume/number/pages` | 按字段名简洁标注并组合到 `source`                                |
| `url`                                             | `url`，仅不含凭据或空白的绝对 HTTP(S) 地址                       |
| `doi`                                             | 无 URL 时映射为 `https://doi.org/标识`；有 URL 时标注在 `source` |

例如：

```bibtex
@article{Godel1931,
  author = {G\"odel, Kurt and {Research and Development}},
  title = {A {Unicode 中文} title},
  year = 1931,
  journal = {Journal},
  volume = {1},
  pages = {10--20},
  doi = {10.1234/example}
}
```

导入预览逐项展示映射结果。条目类型只参与选择解析规则，不写入 `source`；原始 BibTeX、
分组花括号、字段次序和原始排版也不单独保存。这是作者明确确认的六字段映射，**不是完整
BibTeX 的无损导入或归档**；需保留原 `.bib` 文件。

Unicode 文字原样保留；普通值内空白折为单空格，`~` 转为空格。作者分隔符使用 ASCII
空白包围的 `and`；`{Research and Development}` 中的 `and` 不拆分。
支持 `\& \% \$ \# \_ \{ \}`、`\TeX \LaTeX \ae \AE \oe \OE \aa \AA \o \O \ss`，
以及单字母上的重音 `\' \` \" \^ \~ \= \.`和`\c \v \u \H`（字母命令须有分组或空格）。
重音按 NFC 归一，PHP 此路径要求现有 Unicode Normalizer。数学和未知控制命令明确拒绝，
不执行或猜测 TeX。最外层 `%`行注释可忽略，值中的`%` 作为文字保留。

宏、`#` 值拼接、`crossref/xdata`、`@preamble/@string/@comment`、未知类型或字段一律拒绝，
不会忽略它们再声称导入完成。页码等扩展仍以纯文字保存，不解析外部文件、附件或链接。DOI 限定为 `10.` 加 4–9 位数字及斜杠开头，后缀只接受
ASCII 字母、数字和 `-._;()/:`；拒绝有歧义的百分号编码、查询或片段，避免把标识误改为 URL 语义。
最后必须通过原有 `technicalAttributes/Technical::attrs`：作者名 120 字符、标题及来源
512 字符、URL 2048 字符、entries JSON 合计 64 KiB 等限制保持不变。

## 编辑器操作与草稿

1. 在现有 bibliography 侧栏打开导入弹窗，粘贴或选择 `.bib` 文件。
2. 明确选择合并或替换，再预览六字段映射。合并出现 key 冲突会拒绝，不覆盖既有条目；
   替换不能移除当前被引用的 key。
3. “使用文献候选”只更新现有未应用文献草稿，并沿用共享保存锁。
4. 返回侧栏检查，使用既有“应用文献修改”或“放弃文献修改”完成操作。

输入或模式变化会使旧预览失效；使用候选时重新检查当前条目及引用。弹窗取消不会修改
原文献或已有未应用草稿。粘贴内容在当前区块编辑会话中保留，侧栏重挂载不会因此覆盖草稿；
切换区块后必须回到同一 bibliography 才能使用候选。上传异步完成晚于取消、输入变化或卸载
时不会修改新状态。此会话缓存不写入文章、浏览器持久存储或服务器。

## 纯数据接口与验证

- JS：`parseBibTeX(source, fail?) → entries[]`；
  `bibtexCandidate(existing, incoming, mode, referencedKeys, fail?) → entries[]`。
- PHP：`mbb_bibtex_parse(string): array`；
  `mbb_bibtex_candidate(array, array, string, array): array`。
- `mode` 仅为 `merge/replace`。成功返回新数组，不修改输入；错误明确中止整个候选。
- PHP 解析错误携带 `MBB_BibTeX_Error.errorCode`；既有字段校验仍使用转换器自己的错误类。
  HTTP 鉴权、区块归属、最终保存和翻译由宿主入口负责。

运行 `node tests/bibtex.cjs` 与 `php tests/bibtex.php`。共享正反夹具位于
`tests/fixtures/bibtex.json`，覆盖 Unicode、重音、引号/嵌套、作者、重复、危险 URL、未知数据
及双端结果一致；额外测试输入、条数、深度和合并/替换预算。新树尚未生成 scoped 转换器时，
可仅在测试进程显式设置 `MARKBRIDGE_TEST_PHP_CONVERTER=/绝对路径/固定转换器/Worker.php`，
只读复用未改变的六字段校验器；不将此替代最终新包或 WordPress 验收。
