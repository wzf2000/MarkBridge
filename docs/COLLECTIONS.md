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

ZIP 的 `manifest.json` 为 `schema:1,kind:"markbridge-publication-snapshot"`，包含标题、语言、声明、privateOptIn、cover、renderer、styles、chapters、resources；没有 owner 或 WordPress post_id。`chapters` 条目包含 key/path/title/scope/documentId/identity/sourceSha256/serializedSha256/bodyBytes/bodySha256/objects/references/components；references 沿用 `{target,resolved}` 列表，组件只固定 id/component/version/paramsSha256/resourceSha256/status/representation。`chapters/*.html` 是**以快照根目录为基准的阅读投影片段**，不是独立网页；相对资源和跨章逻辑路径由后续适配器处理。清单、CSS、每章片段和每份图片均有字节／摘要，ZIP 不携带来源路径或正文参数。

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
