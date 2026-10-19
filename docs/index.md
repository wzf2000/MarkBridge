# MarkBridge 文档

README 说明产品范围和最短开发入口；本页按用途区分持续有效的说明、仍在推进的计划和历史证据。

## 使用手册

本文档适用于 **MarkBridge 3.0.0 正式稳定版**，包含使用手册与接口说明；其他版本请查看对应 Release 源码中的文档。第一次使用按“快速开始 → 编辑与发布”阅读，管理员先完成安装与服务器配置。在线阅读入口为 [GitHub Wiki](https://github.com/wzf2000/MarkBridge/wiki)。

| 阅读顺序   | 文档                           | 内容                                                 |
| ---------- | ------------------------------ | ---------------------------------------------------- |
| 开始写作   | [快速开始](GETTING-STARTED.md) | 上传第一篇 Markdown，预览、保存草稿再发布            |
| 日常使用   | [编辑与发布](USAGE.md)         | 编辑原文或区块，添加公式、任务、脚注，处理冲突与恢复 |
| 教学内容   | [教学内容](TEACHING.md)        | 折叠、阶段、代码对照、语言页签与受信组件使用         |
| 遇到问题   | [常见问题](TROUBLESHOOTING.md) | 安装、入口、文件、权限、保存和显示问题               |
| 管理站点   | [安装与升级](INSTALL.md)       | 下载发行 ZIP，后台上传及升级注意事项                 |
| 配置服务器 | [服务器配置](RUNTIME.md)       | 转换环境、诊断、权限、迁移与回退                     |
| 可选资源   | [图片表情](EMOJI-PACKS.md)     | 导入、启用和制作图片表情包                           |
| 查看变化   | [更新记录](../CHANGELOG.md)    | 各版本变化                                           |

- [私有配对备份](PAIRED-BACKUPS.md)：身份、恢复 CAS、私有存储、配额与失败边界。
- [长文编辑与预览定位](SOURCE-NAVIGATION.md)：查找、替换、双向定位、并排预览和插入样例。
- [原生图片与画廊](NATIVE-MEDIA.md)：可保存的图注、媒体关联和明确拒绝的样式。
- [批量准备草稿](BATCH-IMPORT.md)：扫描、逐篇确认、恢复与取消。
- [静态 HTML 导出](STATIC-EXPORT.md)：完整离线阅读、图片限制与打印。
- [编号与技术写作](TECHNICAL-WRITING.md)：对象、同篇与跨文档引用、可携带身份、定义／定理／证明和基础参考文献。

## 开发与维护

- [主题适配](THEME-INTEGRATION.md)：可继承的样式变量与跨包资源句柄。
- [浏览器与性能检查](TESTING.md)：代表引擎、合成夹具、资源探针和可复用测量入口。
- [工作原理](ARCHITECTURE.md)：双格式存储、转换沙箱、公式和文件来源契约。
- [教学扩展接口](TEACHING-EXTENSIONS.md)：v1 登记、资源、参数与执行协议。
- [原生区块与静态适配接口](BLOCK-ADAPTERS.md)：详情、链接按钮及受信静态叶子合同。
- [验证范围](VALIDATION.md)：实际环境、通过检查与保留边界。
- [发布流程](RELEASING.md)：版本、检查、安装包和 GitHub Release 的对应关系。
- [发行渠道](DISTRIBUTION.md)：通用安装包、WordPress.org 提交准备与独立可选 GitHub 更新器。
- [参与开发](../CONTRIBUTING.md)：目录、格式和验证命令。
- [Wiki 维护](WIKI.md)：同步范围、预览、初始化与冲突处理。

## HISTORICAL

- [通用作者工作流与发行渠道完善](plans/completed/AUTHOR-WORKFLOW-2.0.md)：本地恢复、元数据、图片导入、导出、合并、适配、本地化与发行渠道的开发记录，已纳入 2.0.0；阶段验收保留原日期和边界。
- [多语言代码页签](plans/completed/MULTI-LANGUAGE-CODE-TABS.md)：已纳入 2.0.0，保留阶段 3A 的实现与隔离验收记录。
- [交互式教学内容分期开发](plans/completed/INTERACTIVE-TEACHING-1.5-1.9.md)：1.5–1.9 范围已完成本地开发与隔离验收，候选为 1.9.0-rc.1；其能力已纳入 2.0.0；原阶段记录不代表正式包或生产验收，当前行为和验证见手册与验证说明。

- [编辑可靠性与真实 WordPress 自动验收](plans/completed/EDITOR-RELIABILITY-1.4.0.md)：已纳入 1.4.0，覆盖真实核心 CI、转换定位、能力提示和展示资源按需加载；当前行为和验证边界见开发与维护文档。

- [免额外运行环境：PHP 转换架构改进](plans/completed/PORTABLE-CONVERTER.md)：已纳入 1.3.0，保留 PHP 架构、后台配置与双引擎选择的阶段记录；当前契约和验证边界见开发与维护文档。

- [可视化公式输入与原生数学兼容](plans/completed/MATH-AUTHORING-1.2.0.md)：已纳入 1.2.0，操作与验证边界见当前说明。

- [脚注](plans/completed/FOOTNOTES.md)：命名引用、定义编辑与编号跳转已纳入 1.1.0，验证边界见当前说明。

- [正文任务列表](plans/completed/TASK-LISTS.md)：区块状态、Markdown 往返和后台编辑已纳入 1.1.0，验证边界见当前说明。

- [公式阅读工具](plans/completed/MATH-READING.md)：前台复制、放大和键盘交互，已完成隔离验收。

- [浏览器回归与长文差异、冲突处理](plans/completed/EDITOR-REVIEW-REGRESSION.md)：已纳入 1.1.0，验证边界见当前说明。

- [统一发行与正式版原计划](plans/completed/ROADMAP.md)：保留原 R07/R10 完成标准；不作当前状态入口。
- [0.7.0 候选验证记录](archive/VALIDATION-0.7.0-RC.md)：已运行检查及当时未覆盖范围。
- [更新记录](../CHANGELOG.md)：按版本记录已交付变更。

- [公式结构读法与探索](MATH-READING.md)
- [受限 BibTeX 导入](BIBTEX.md)
- [跨站图片携带](CROSS-SITE-MEDIA.md)
- [独立 Mermaid 图示](MERMAID.md)

- [文集与不可变快照](COLLECTIONS.md)：编排文章引用、范围确认、私有快照与受信出版适配接口。

- [Trusted extension SDK](SDK.md): author candidates, typed static projection, catalog/scoped usage and runnable conformance samples.
