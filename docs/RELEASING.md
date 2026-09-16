# 发布流程

1. 审阅 README 支持范围、GPL 许可与 CHANGELOG，确认本轮变更和未验证项。
2. 从待发布提交的干净检出安装锁定依赖，运行 `npm run check`；准备匹配的私有运行环境后执行 `npm test`。
3. 更新 `package.json`、包锁、插件头、`plugin/readme.txt`、README 和 CHANGELOG 中的版本；检查展示资源中使用的版本标识。
4. 执行 `npm run package` 生成 ZIP 与 SHA-256。不要把私有运行环境放进 ZIP，也不要用不同内容覆盖已发布的同版本安装包。
5. 对最终 ZIP 做与变更范围相称的隔离验收，记录结果与限制。核对 Git 提交包含插件入口及构建所需源码。
6. 推送至 [MarkBridge 仓库](https://github.com/wzf2000/MarkBridge)，在对应提交创建版本标签与 GitHub Release，附安装 ZIP 和 SHA-256 文件。候选版本勾选 Pre-release。

GitHub 自动生成的源码归档不包含构建资源，不能直接作为插件安装包。源码仓库提供私有运行环境的准备工具；安装 ZIP 不代替服务器配置。

是否去掉候选标记，取决于声明支持范围内的实际验收结果。仓库推送、GitHub Release 与生产部署是独立操作；本仓库不会自动部署。

上游 GPL 片段、第三方文件头和许可说明继续保留。
