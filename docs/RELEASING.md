# 发布流程

1. 审阅 README 支持范围、GPL 许可与 CHANGELOG，确认本轮变更和未验证项。
2. 从待发布提交的干净检出安装锁定依赖，运行 `npm run check`；执行 PHP 转换合成矩阵与接口测试；准备 Node 对照运行环境后执行 `npm test`。
3. 更新 `package.json`、包锁、插件头、`plugin/readme.txt`、README 和 CHANGELOG 中的版本；检查展示资源中使用的版本标识。
4. 执行 `npm run package` 生成 ZIP 与 SHA-256。不要把私有运行环境放进 ZIP，也不要用不同内容覆盖已发布的同版本安装包。
5. 对最终 ZIP 做与变更范围相称的隔离验收，记录结果与限制。核对 Git 提交包含插件入口及构建所需源码。
6. 推送至 [MarkBridge 仓库](https://github.com/wzf2000/MarkBridge)，在对应提交创建版本标签与 GitHub Release，附安装 ZIP 和 SHA-256 文件。候选版本勾选 Pre-release。

GitHub 自动生成的源码归档不包含构建资源，不能直接作为插件安装包。新安装的基础 PHP 转换依赖随 ZIP 附带；源码仓库的私有运行环境工具用于保留 Node 的兼容安装。文件来源写回等可选功能仍需独立配置。

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

## 手动 GitHub Release 工作流

先将审阅过的版本更新、CHANGELOG 和发行流程合并至 `main`。打开 GitHub Actions 的 **Manual GitHub Release**，选择 `main`，填写不带 `v` 的版本号，保持 `publish=false` 执行试跑。仅接受 `X.Y.Z` 或 `X.Y.Z-alpha.N` / `beta.N` / `rc.N`（N 从 1 开始）；版本必须与 package、包锁、插件头、Stable tag 和当前唯一 CHANGELOG 节一致。

工作流固定为触发时的 `main` 提交 SHA，通过可复用 CI 运行已有检查，并生成 `markbridge-release-<SHA>` artifact，包含安装 ZIP、SHA-256、外部文件清单、中文发行说明和校验记录。CI 的最小转换运行环境放在忽略目录 `.runtime/ci/`，打包必须保持源码工作树干净，不使用跳过脏工作树检查的环境变量。普通 push / PR CI 也生成相同结构的安装 artifact。

下载试跑 artifact 后审阅 `release-notes.md` 与 ZIP。确认该提交可发行后，对同一 `main` 提交重新运行工作流并选择 `publish=true`；若 `main` 已变化，应先对新提交重新试跑。发布运行会重新执行 CI，不直接复用前一次 artifact。工作流不支持从其他分支或标签发行；新流程合并前无法在特性分支进行手动试跑，可先用 PR CI 核验共享检查。

仅发布 job 获得 `contents: write`。它不检出或执行仓库代码，从同一次运行下载 artifact，独立核对版本、源码 SHA、ZIP 与文件清单、摘要和说明完整性。发布前后置的存在检查会拒绝同名标签或 Release（包括草稿）；同版本运行串行，不取消正在执行的发行。随后原子创建固定 SHA 的标签（同名竞争会失败），使用该标签创建草稿并上传 ZIP、SHA-256 和外部清单，全部成功且再次核对标签 SHA 后才公开；候选版本自动标记 Pre-release。已有 Release 永不覆盖。

GitHub 远端创建并非原子事务：创建标签后的附件上传或公开步骤失败可能留下草稿／标签。检查 Actions 日志和远端状态后，由维护者处理残留并决定如何重试；工作流不会自动删除、替换或继续修改已有发行。Artifact 及其校验记录来自同一可信 CI 运行，摘要用于完整性校验，不是独立签名。流程的信任边界是已审阅的 `main` 源码和工作流。

自动发行说明沿用中文与 emoji 风格，更新内容取自对应 CHANGELOG 节，文档链接固定到发行标签。CI 的公开最小转换环境及 Chromium 回归不等于完整 WordPress 端到端测试或生产验收；若需要声明额外人工验收，应先在当前版本的仓库文档中记录并审阅。GitHub Release 与生产部署互相独立，工作流不会部署生产。
