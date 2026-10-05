# MarkBridge 文档

README 说明产品范围和最短开发入口；本页按用途区分持续有效的说明、仍在推进的计划和历史证据。

## CURRENT

- [使用文档 Wiki](https://github.com/wzf2000/MarkBridge/wiki)：由本仓库精选用户文档自动生成，跟随 `main`；已发布版本文档见对应 Release 的源码。
- [Wiki 维护](WIKI.md)：同步范围、预览、初始化与冲突处理。

- [安装与升级](INSTALL.md)：环境、构建、私有运行环境和升级边界。
- [内容编辑指南](USAGE.md)：任务列表、脚注的操作方法与转换边界。
- [工作原理](ARCHITECTURE.md)：双格式存储、转换沙箱、公式和文件来源契约。
- [验证范围](VALIDATION.md)：实际环境、通过检查与保留边界。
- [发布流程](RELEASING.md)：版本、检查、安装包和 GitHub Release 的对应关系。
- [图片表情数据包](EMOJI-PACKS.md)：可选资源格式、导入和显示边界。
- [参与开发](../CONTRIBUTING.md)：目录、格式和验证命令。

原生区块编辑器双格式保存与行内公式编辑已纳入 1.1.1；操作见[内容编辑指南](USAGE.md#在可视化编辑器保存)，保存契约见[工作原理](ARCHITECTURE.md#原生区块保存)。

## ACTIVE

当前无进行中的实现计划。

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
