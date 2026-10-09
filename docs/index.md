# MarkBridge 文档

README 说明产品范围和最短开发入口；本页按用途区分持续有效的说明、仍在推进的计划和历史证据。

## 使用手册

适用于 MarkBridge **1.3.0-rc.4**。第一次使用按“快速开始 → 编辑与发布”阅读，管理员先完成安装与服务器配置。在线阅读入口为 [GitHub Wiki](https://github.com/wzf2000/MarkBridge/wiki)。

| 阅读顺序   | 文档                           | 内容                                                 |
| ---------- | ------------------------------ | ---------------------------------------------------- |
| 开始写作   | [快速开始](GETTING-STARTED.md) | 上传第一篇 Markdown，预览、保存草稿再发布            |
| 日常使用   | [编辑与发布](USAGE.md)         | 编辑原文或区块，添加公式、任务、脚注，处理冲突与恢复 |
| 遇到问题   | [常见问题](TROUBLESHOOTING.md) | 安装、入口、文件、权限、保存和显示问题               |
| 管理站点   | [安装与升级](INSTALL.md)       | 下载发行 ZIP，后台上传及升级注意事项                 |
| 配置服务器 | [服务器配置](RUNTIME.md)       | 转换环境、诊断、权限、迁移与回退                     |
| 可选资源   | [图片表情](EMOJI-PACKS.md)     | 导入、启用和制作图片表情包                           |
| 查看变化   | [更新记录](../CHANGELOG.md)    | 各版本变化                                           |

## 开发与维护

- [工作原理](ARCHITECTURE.md)：双格式存储、转换沙箱、公式和文件来源契约。
- [验证范围](VALIDATION.md)：实际环境、通过检查与保留边界。
- [发布流程](RELEASING.md)：版本、检查、安装包和 GitHub Release 的对应关系。
- [参与开发](../CONTRIBUTING.md)：目录、格式和验证命令。
- [Wiki 维护](WIKI.md)：同步范围、预览、初始化与冲突处理。

## ACTIVE

- [免额外运行环境：PHP 转换架构改进](plans/active/PORTABLE-CONVERTER.md)：独立架构版本，内容契约、保存链、干净安装及限定灰度／回退已验收；后台配置与宿主升级回归正在定稿，全局切换与独立发行待准备。

## DEFERRED

- 更多区块适配尚未启动。

## HISTORICAL

- [可视化公式输入与原生数学兼容](plans/completed/MATH-AUTHORING-1.2.0.md)：已纳入 1.2.0，操作与验证边界见当前说明。

- [脚注](plans/completed/FOOTNOTES.md)：命名引用、定义编辑与编号跳转已纳入 1.1.0，验证边界见当前说明。

- [正文任务列表](plans/completed/TASK-LISTS.md)：区块状态、Markdown 往返和后台编辑已纳入 1.1.0，验证边界见当前说明。

- [公式阅读工具](plans/completed/MATH-READING.md)：前台复制、放大和键盘交互，已完成隔离验收。

- [浏览器回归与长文差异、冲突处理](plans/completed/EDITOR-REVIEW-REGRESSION.md)：已纳入 1.1.0，验证边界见当前说明。

- [统一发行与正式版原计划](plans/completed/ROADMAP.md)：保留原 R07/R10 完成标准；不作当前状态入口。
- [0.7.0 候选验证记录](archive/VALIDATION-0.7.0-RC.md)：已运行检查及当时未覆盖范围。
- [更新记录](../CHANGELOG.md)：按版本记录已交付变更。
