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

## 固定源码与安装目录核验

`npm run package` 要求 Git 工作树干净。ZIP 内 `release-manifest.json` 记录版本、源码提交和所有其他文件的 SHA-256；旁边另输出独立清单和 ZIP 校验值。相同版本已有不同 ZIP 时命令拒绝覆盖。包只接收 Git 跟踪文件及明确列出的生成物，MathJax 资源按构建生成的逐文件清单核对；插件/文档目录中的额外忽略文件会使打包失败。

下面命令从指定本地提交创建全新检出，安装固定 npm 依赖与开发格式器，执行格式、源码、构建、转换和打包检查，不推送或部署：

```sh
python3 scripts/check_clean_release.py \
  --commit <source-commit> \
  --output /tmp/markbridge-clean-candidate \
  --runtime /srv/markbridge-runtime-candidate
```

准备工作站须安装 Python venv、Node.js 24.15.0+、PHP、Git；运行环境按安装说明提前准备。运行配置测试：

```sh
php tests/runtime-settings.php
php tests/runtime-settings.php constant
```

使用从可信 ZIP 提取的清单核验安装，而不是只相信安装目录自己的清单：

```sh
python3 scripts/verify_package.py /srv/wordpress/wp-content/plugins/markbridge \
  --manifest /srv/release/markbridge.manifest.json
```

返回非零表示缺失、额外或修改的文件，输出具体路径。上传目录资源、数据库设置和私有运行环境不在主插件清单内。清单不含自身哈希，核验工具会单独比较安装清单与外部清单的原始字节。
