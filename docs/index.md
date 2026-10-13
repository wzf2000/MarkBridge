# MarkBridge 文档

README 说明产品范围和最短开发入口；本页按用途区分持续有效的说明、仍在推进的计划和历史证据。

## 使用手册

适用于 MarkBridge **1.4.0** 源码与安装包。第一次使用按“快速开始 → 编辑与发布”阅读，管理员先完成安装与服务器配置。在线阅读入口为 [GitHub Wiki](https://github.com/wzf2000/MarkBridge/wiki)。

| 阅读顺序   | 文档                           | 内容                                                 |
| ---------- | ------------------------------ | ---------------------------------------------------- |
| 开始写作   | [快速开始](GETTING-STARTED.md) | 上传第一篇 Markdown，预览、保存草稿再发布            |
| 日常使用   | [编辑与发布](USAGE.md)         | 编辑原文或区块，添加公式、任务、脚注，处理冲突与恢复 |
| 教学候选   | [教学内容](TEACHING.md)        | 未发行候选的折叠、阶段、代码对照与受信组件使用       |
| 遇到问题   | [常见问题](TROUBLESHOOTING.md) | 安装、入口、文件、权限、保存和显示问题               |
| 管理站点   | [安装与升级](INSTALL.md)       | 下载发行 ZIP，后台上传及升级注意事项                 |
| 配置服务器 | [服务器配置](RUNTIME.md)       | 转换环境、诊断、权限、迁移与回退                     |
| 可选资源   | [图片表情](EMOJI-PACKS.md)     | 导入、启用和制作图片表情包                           |
| 查看变化   | [更新记录](../CHANGELOG.md)    | 各版本变化                                           |

## 开发与维护

- [工作原理](ARCHITECTURE.md)：双格式存储、转换沙箱、公式和文件来源契约。
- [教学扩展接口](TEACHING-EXTENSIONS.md)：未发行候选的 v1 登记、资源、参数与执行协议。
- [验证范围](VALIDATION.md)：实际环境、通过检查与保留边界。
- [发布流程](RELEASING.md)：版本、检查、安装包和 GitHub Release 的对应关系。
- [参与开发](../CONTRIBUTING.md)：目录、格式和验证命令。
- [Wiki 维护](WIKI.md)：同步范围、预览、初始化与冲突处理。

## ACTIVE

- [通用作者工作流与发行渠道完善](plans/active/AUTHOR-WORKFLOW-2.0.md)：按顺序实施八个旧候选，本地恢复、Front Matter 与图片导入已完成，当前插入多语言代码页签；仅本地和隔离验收。

- [多语言代码页签](plans/active/MULTI-LANGUAGE-CODE-TABS.md)：资源导入之后立即实施的阶段 3A；尚未完成，仅隔离验收。

1.5–1.9 教学综合候选已完成本地开发与隔离验收，等待统一审查。

## DEFERRED

- 八个旧候选已转入上述活动计划；额外范围按后续明确需求排期。

## HISTORICAL

- [交互式教学内容分期开发](plans/completed/INTERACTIVE-TEACHING-1.5-1.9.md)：1.5–1.9 范围已完成本地开发与隔离验收，候选为 1.9.0-rc.1；未公开发行或部署，当前行为和实际验证见手册与验证说明。

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
