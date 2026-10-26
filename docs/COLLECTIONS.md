# 文集与不可变快照

在 **工具 → Markdown 编辑桥 → 文集** 管理自己的集合。先搜索有权编辑的已保存文章，加入并排序；再填写标题、语言标签、版权声明和可选封面附件 ID，保存配置。配置只保存文章引用和编排，不是第二份正文，也不会改变文章、源文件、评论、笔记或修订。

默认只允许有编辑权限、公开且无密码的托管文章。勾选“明确包含所选私人草稿”后，可以加入自己有权编辑的草稿、待审、私人或定时文章；不会隐式加入这些文章引用的其他私人目标。本期不接受密码保护文章。普通读者不能因为文章公开就管理或导出集合。

保存配置后依次 **准备快照 → 检查范围 → 确认快照 → 下载 ZIP**。候选 15 分钟后到期；配置、文章、权限、登录会话、附件或渲染资源变化都会使确认或下载失效，需要重新准备。关闭或取消只清理派生产物，不会删除文章。配置删除同样不删除文章。

本期 ZIP 是供出版适配器使用的固定数据快照，**不是已完成的多篇阅读网站**。HTML 网站、跨章目录与打印排版属于后续适配器；不要直接把快照 ZIP 当成完整网站。快照中每章有经过安全投影的静态正文、对象映射、配对摘要、稳定 documentId 和可选逻辑身份；组件记录精确版本、可核验的资源摘要和作者静态替代。组件缺失时不会声称已保存可执行交互。

## 资源、引用与边界

- 初期最多 10 篇；每种正文表示仍为 256 KiB，原单篇导出 32 MiB 约束不变。
- 最多 64 个去重图片资源，总计 16 MiB；单图最多 8 MiB。派生展开快照和最终产物各最多 24 MiB。
- 每账号最多 16 份配置、每份 16 KiB、配置目录总计 256 KiB；每账号 2 个候选，全站 4 个候选。每槽保守预留 64 MiB 私有磁盘预算。不是可无限保存的导出历史。
- 只打包逐篇鉴权且直接属于该篇的本地位图。相同字节只存一份，但仍逐篇核验附件归属和权限。封面需要当前账号可编辑、可读，且未关联文章或关联本次选择的文章。
- 外站图片保留安全链接，不联网抓取。同站未知图片、其他文章附件、危险 URL 或符号链接拒绝。
- 集合内目标使用固定章节键和对象 ID；集合外仅公开且无密码的目标可成为普通链接。未选的私人目标统一 unavailable，不输出其标题或 URL，不复制外部文章正文。
- 最多 256 个跨文档引用、16 个集合外目标文档，避免因引用扇出无限转换。目标变化同样使候选失效。
- 不导出评论、私人笔记、账号、会话、服务器源文件路径、组件参数或启动脚本。只读取已保存配对，不读取绑定源文件中的未保存修改。快照原文摘要不等于原文备份；原始 Markdown 请使用单篇导出。

候选位于 Web 根外、当前进程拥有的 0700 目录，文件 0600。取消、消费下载、进程收尾和后续请求的有界惰性清理回收产物；没有新增 cron。中断遗留候选最多占用原保守槽位，过期后回收。

## Companion 系列一次导入

搜索某篇公开且可编辑的系列文章，选择“导入 Companion 系列”。导入只生成未保存的配置候选，不持续订阅系列、不改 Companion 元数据。先有界枚举最多 200 个公开托管候选，再按当前账号权限、有效系列设置过滤，并沿用 Companion 的 series_order → 数字章序 → 文档标记 → 文章 ID 排序；新设置的空值优先于旧 profile。超过候选或 10 章限制时明确拒绝，请手动选择。私人章节需要随后逐篇明确加入。

## REST 与受信适配接口

所有路由为 `mbb/v1`，需要当前账号 `edit_posts`、WordPress REST nonce／会话；逐文章额外 fresh `edit_post`，每个响应（包括错误）均 private/no-store。其他账号的配置／候选和不存在使用统一 unavailable。客户端不能指定 owner、服务器路径或 callback。

| 路由                                   | 请求／响应                                                                                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `collections`                      | `{schema,revision,items,limits,adapters}`；revision 为本人配置目录原字节 SHA-256 或 null                                                            |
| POST `collections`                     | `{schema:1,revision,collection_id:null\|B_32hex,config}`；精确字节 CAS；返回 ID、新 revision、config、只读新鲜 chapterSummaries                     |
| GET `collections/B_32hex`              | `{schema,collection_id,revision,config,chapterSummaries}`；不可读章节摘要仅 key/state，不回显旧标题                                                 |
| DELETE `collections/B_32hex`           | `{schema:1,revision}`；只删除配置                                                                                                                   |
| GET `collections/search?q=...&page=1`  | 有界、仅可编辑结果；每页最多 20 条，不给隐藏结果总数                                                                                                |
| POST `collections/import-companion`    | `{schema:1,post_id}` → `{schema,config,importedOnce:true}`，尚未保存                                                                                |
| POST `collections/prepare`             | `{schema:1,collection_id,revision,adapter:"snapshot-v1"}` → token/expires/receipt/snapshot_sha256/artifact/scope/resourceCount/resourceBytes/limits |
| POST `collections/jobs/64hex/confirm`  | `{schema:1,receipt}` → confirmed/snapshot_sha256/expires                                                                                            |
| POST `collections/jobs/64hex/download` | `{schema:1,receipt}`；确认后新鲜核验，通过才开始流式二进制响应，消费一次                                                                            |
| DELETE `collections/jobs/64hex`        | 取消本账号、本会话候选                                                                                                                              |

配置是闭合 JSON：

```json
{
  "schema": 1,
  "title": "示例文集",
  "lang": "zh-CN",
  "rights": "作者版权声明",
  "cover": null,
  "privateOptIn": false,
  "chapters": [{ "key": "C_0123456789abcdef0123456789abcdef", "post_id": 123 }]
}
```

B_/C_ 后均为 32 位小写随机十六进制；job token 为 64 位，路由不重叠。章键在配置内稳定，不能重复文章或键。配置并发冲突保留本地字段，需要显式重新加载；不能通过一次新 GET 暗中接纳别人的配置基线。

ZIP 的 `manifest.json` 为 `schema:1,kind:"markbridge-publication-snapshot"`，包含标题、语言、声明、privateOptIn、cover、renderer、styles、chapters、resources；没有 owner 或 WordPress post_id。`chapters` 条目包含 key/path/title/scope/documentId/identity/sourceSha256/serializedSha256/bodyBytes/bodySha256/objects/references/components；references 沿用 `{target,resolved}` 列表，组件固定 id/component/version/paramsSha256/resourceSha256/status/representation/projectionFingerprint。新增 `projectionPlan` 为闭合 `{schema:1,encoding:"json-utf8",bytes,sha256,data}`，data 为规范 UTF-8 JSON wire；它携带受检 typed tree 与只读组件参数，不持有第二份可写正文。逐章生成后释放 PHP AST，整本成功派生树额外限 256 KiB，超限组件明确回退到原解释与配置；全部 wire 仍算原 24 MiB。参见 [SDK](SDK.md)。`chapters/*.html` 是**以快照根目录为基准的阅读投影片段**，不是独立网页；相对资源和跨章逻辑路径由后续适配器处理。清单、CSS、每章片段和每份图片均有字节／摘要，ZIP 不携带来源路径、保存票据或评论笔记；被选组件的公开参数作为只读配置随快照携带。

受信 PHP 扩展在 `markbridge_register_publication_adapters` action（init 12）调用：

```php
mbb_register_publication_adapter('publisher-html', [
  'contract' => 'mbb-publication-adapter/v1',
  'version' => '1.0.0',
  'fingerprint' => hash_file('sha256', __FILE__),
  'title' => 'Publication HTML',
  'extension' => 'zip',
  'mime' => 'application/zip',
  'build' => 'my_trusted_publication_builder',
]);
// function my_trusted_publication_builder(array $manifest, callable $read, string $output): void
```

最多 8 个固定登记；fingerprint 必须覆盖构建器全部代码／资源，不可只用版本号。`$read($logicalPath)` 只允许本快照清单列出的只读服务器输入路径；`$output` 是核心给定的私有输出文件。它不是不受信插件的沙箱，不允许正文或客户端登记。构建器不得改输入，应自行执行其格式的闭集／预算校验；核心随后执行 24 MiB 输出上限、文件所有权、摘要和全部新鲜性核验。当前内建 `snapshot-v1` 只封装固定清单，不执行文章组件。后续 Publisher 复用此合同，不另存正文或绕过下载授权。

## 验证入口

`php tests/collections.php` 是可重复的配置／CAS／权限／限定引用／私有槽／实际 ZIP 与流句柄模型；不是生产数据库或 HTTP 权限证据。`tests/collections-save.php` 通过 `wp eval-file` 在明确环境变量、回环 home、`local` 环境的独立合成 WordPress 中执行真实 REST、owner 隔离、保存正文不变和失效检查。两后端分别运行；不可用于生产。标题失效夹具通过正常 preview／配对 save 改动并恢复元数据，先断言真实变动；不能用被配对保护拒绝的裸 `wp_update_post` 充当外部变更。浏览器 fixture 使用真实产品 UI 与合成 REST，分别留 1440／390 截图，不能代替独立实际站点、两账号与近上限内存验收。预算在不同宿主上的峰值仍以实际请求测量为准，不提高宿主全局内存或上传限制。

## 已测容量与内存含义

独立合成站用 10 篇每篇约 238 KiB 的正文和 15,740,880 B 有效图片，完成真实 prepare／confirm／serve 流式下载；`WP_MEMORY_LIMIT` 与 `WP_MAX_MEMORY_LIMIT` 均固定为 `128M`。PHP8.2 的 PHP peak 为 63,766,528 B，PHP8.5 为 113,577,984 B；对应进程 RSS 为 264,200,192 B／186,736,640 B。PHP 的内存计量不覆盖所有图像等本机分配，因此这不是“总进程占用低于 128 MiB”的承诺。实际峰值取决于内容、图片解码器和宿主，应为本机分配保留额外容量；不提高全局内存限制来掩盖失败。上面的 10 篇／16 MiB／24 MiB 保守预算保持不变。

## 作者浏览器导出适配器

Publisher 的“离线网页书”格式在作者浏览器顺序复用 `MarkBridgeStaticExport.build`，生成真正含 CHTML／内嵌字体、代码高亮和本地图片的无脚本阅读 ZIP。服务器仍默认 PHP，不要求 Node 或 TeX。准备快照、生成静态预览、明确确认和最终下载是分开的动作；文章仍由原配对编辑入口保存。

受信 PHP 可用 `mbb_register_publication_client_adapter($id,$descriptor,$resources)`，其中 descriptor 沿上面的闭合合同；resources 为 1–8 个本地 `{file,sha256}`，每份 ≤512 KiB、合计 ≤2 MiB。核心固定实际加载的 content-hashed 客户端与 MathJax／字体／Prism 全部资源，合并 provider 的准确代码资源指纹写入 renderer。客户端只登记 `window.MarkBridgeCollections.registerClient(id,{schema:1,version,fingerprint,label,build})`；build 接收输入 Blob 和 `{prepared,cancelled,progress}`，返回 `{blob,previewHTML,dispose}`，没有保存正文的能力。

`prepare` 响应附 adapter/client。`POST /collections/jobs/{token}/inputs` 仍只收 `{schema:1,receipt}`；在实际首字节之前复核，不消费候选。`confirm` 沿原合同。客户端不得通过普通 `/download` 下载输入冒充完整书。最终 `POST /collections/jobs/{token}/client-download` 闭合收 `{schema:1,receipt,snapshot_sha256,provider_fingerprint,projection_sha256,projection_bytes}`，projection_bytes 为 1–24 MiB 整数。真正 JSON 输出前核验 owner/session/TTL/catalog/所有数据、资源、外部目标及渲染器，消费 CAS 后再做一次终态检查，成功只回 `{schema:1,authorized:true,snapshot_sha256,provider_fingerprint,projection_sha256,projection_bytes,expires}`。失败可已消费，请重新准备；无二进制正文或 HTML 上传。

已经交付浏览器的输入字节不能撤回。最终 gate 约束本插件触发的最终下载，不能阻止作者另存已获数据，也不证明任意客户端 HTML 的真实性。扩展不是不受信插件沙箱。取消／输入变化／迟到结果均废弃本地候选与预览；不改变保存的文章。集合预算、原有 256 KiB 正文及 32 MiB 单章导出限制不变。

## 3.7 候选：采用出版编排

已有配置及新建配置默认仍为 schema 1，不补字段、不自动迁移。点击“采用出版编排”后，本地候选才成为 schema 2；填写出版信息、指定每篇文章角色，再保存配置。作者最多 8 位，每位最多 200 个 UTF-8 字节；版次最多 200 字节、版本声明最多 1000 字节。作者不是从文章账户自动推断，空作者列表合法。字段控制字符与 UTF-8 校验沿用原文本规则。

每篇引用增加 `role=preface|body|appendix`。正文单独按 1、2 编号，附录单独按 A、B 编号，前言不占正文或附录编号；实际阅读顺序始终是作者排定的顺序，不自动移动章节。Publisher 用角色和章号生成书名页后的目录与章标题，并将作者、版次和声明带入网页书／EPUB。前言和附录仍引用已有文章，不新增第二份可写正文。

对象编号可选 `article`（保留原文章编号）或 `chapter`。后者仅为正文／附录中的原生公式、图、表、程序清单、定义、定理、证明生成 `1.1`／`A.1` 形式，按对象种类分别计数。前言以及步骤、活动等其他对象保留文章编号，出版报告明确记录适用范围。没有按普通文字匹配或猜测编号；服务器通过稳定对象 ID 将同一映射传入既有技术渲染和静态导出，同时更新选中文章的对象元数据及自动引用 label。作者自写的普通链接文本不变，源正文、对象 ID、配对和修订不变；Publisher 仍沿原规则将派生产物中的 ID 加章节作用域以避免冲突。

采用新编排或修改任何字段、角色及排序，都会丢弃旧候选；保存后须重新准备、生成、核对并确认。取消生成／快照保留当前编排输入。“撤销采用出版编排”会将本地候选切回 schema 1，出版字段与角色暂留本页，重新采用可恢复；不会声称这些未保存字段能在关闭页面后继续恢复。不支持 schema 2 的旧适配器明确不可准备，不能忽略新字段后继续下载。新内置 `snapshot-v1` 和新版 Publisher 支持 schema 1、2；旧 Publisher 在新 Main 中仍能处理 schema 1。

## Schema 2 与适配器能力

配置 schema 2 保留原七个字段，增加闭合字段 `authors:string[]`、`edition:string`、`versionStatement:string`、`numbering:"article"|"chapter"`；每章为闭合 `{key,post_id,role}`。未知字段／角色／编号值拒绝。16 KiB 配置、10 章、16 MiB 去重图片及 24 MiB 产物预算均不扩大。REST 请求封套仍为 schema 1；配置和 manifest 的 schema 分别明确标为 2。

快照 manifest schema 2 增加上述四个出版字段；每章增加 `role`、`number`（正文数字字符串／附录字母／前言 null）及 `numbering:{mode,applied,retained}`（稳定对象 ID 列表）。`objects[].number` 对适用对象为带章号的字符串，其余仍为文章整数编号。全部字段和实际派生正文一起计入 manifest SHA-256。下载仍重新核对配置目录 revision、文章／资源／渲染器和权限，不提供客户端 HTML 上传入口。

受信适配器 descriptor 可选 `collectionSchemas`，须为不重复、非空的 `[1,2]` 子集，缺省为 `[1]`，未知值、null、空数组和重复声明拒绝。能力进入 renderer 与客户端指纹。`markbridge_publication_collection_schemas(): array` 是公开能力探测，新 Main 返回 `[1,2]`；扩展应先 `function_exists` 并检查包含 2，才向旧闭合登记合同传入此可选字段。没有探测接口的宿主沿原 descriptor 形状继续支持 schema 1，不按包版本猜测。

`tests/collections-schema.php` 是无需构建／数据库的闭合字段、能力和实际服务端编号模型；既有 `tests/collections.php` 增补 schema 2 冻结摘要、旧适配器拒绝及 schema 1 回归。文集浏览器用例验证显式采用、旧格式限制、修改时迟到响应失效与取消保留输入。`tests/publication-numbering.php` 仅为 CLI 只读合成投影，供 Publisher 浏览器复用实际服务器编号，不是真实 WordPress 鉴权验收。

## 扩展提出编排候选

Main 3.8 允许已安装受信扩展在文集页面提出配置候选。先显示编排变化和文章状态；取消保留当前配置、字段和任务。
“采用为新合辑”会再次核对权限、身份和当前输入，采用结果始终是新的未保存合辑。继续修改当前字段会使候选失效，
避免覆盖后来输入。保存和准备快照仍需按原流程操作，不自动执行。

扩展通过 `markbridge_collections_configuration_sources` action 提供来源表单，通过
`MarkBridgeCollections.proposeConfiguration(config)` 提出已有 schema 1／2 配置。
`POST collections/configuration-candidate` 接收 closed `{schema:1,config}`，请求最多 16 KiB，
复用既有 nonce、会话、private/no-store 与逐目标编辑权限；不保存配置，也不写入课程字段。
PHP 公共解析与准备接口详见 [SDK](SDK.md#controlled-knowledge-maps-and-course-integration-main-38)。
