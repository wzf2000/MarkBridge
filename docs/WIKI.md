# 用户文档 Wiki 维护

[MarkBridge Wiki](https://github.com/wzf2000/MarkBridge/wiki) 是用户阅读入口，仓库 Markdown 是唯一维护源。Wiki 跟随 `main`，可能早于已发布版本；安装已有 Release 时使用该版本固定源码提交中的文档。每页显示源码提交链接。

## 同步范围

`scripts/wiki_sync.py` 明确选择 `docs/INSTALL.md`、`docs/USAGE.md`、`docs/EMOJI-PACKS.md` 和根目录 `CHANGELOG.md`，生成 `Installation`、`Usage`、`Emoji-Packs`、`Changelog` 四页，以及 `Home`、`_Sidebar`。页面名保持 ASCII，正文沿用中文标题。

架构、开发与发行手册、计划、历史记录不复制；验证范围仅从 Home 链接到固定源码。源码中的相对文档链接指向对应 Wiki 页，其他仓库文件指向同一源码提交，图片使用 raw 地址；外部链接、页内锚点、代码块与行内代码保持原样。新增页面必须修改明确清单并验证链接，不能遍历整个 `docs` 发布。

## 初始化与权限

1. 在仓库 Settings 启用 Wiki，在网页保存首个 Home 页。初始化占位正文应精确为 `初始化`（无末尾换行）。已有人工 Home 应先保存并人工迁移，再采用此占位；同步器不会覆盖任意现存页面。
2. `User documentation Wiki` workflow 可手动运行。默认 `publish=false` 只生成供下载审核的 artifact；在 `main` 选择 `publish=true` 才发布。精选正文或同步代码合并到 `main` 会自动发布。
3. workflow 优先使用仓库 secret `WIKI_TOKEN`，否则尝试本次 `GITHUB_TOKEN`。内置 token 能否写入 Wiki 必须以实际运行结果为准；`contents: write` 不构成成功证据。如失败，应配置具有该仓库 Wiki 写权限的凭据并重新运行。凭据只通过临时 Git askpass 的环境变量读取，不放入远端 URL、提交或日志。

Wiki 未初始化或凭据不足会使 clone/push 明确失败。先检查首个页面已保存，再检查凭据权限；不需要强制推送。同步工作串行运行且不取消已排队工作，发布时读取当前 `main`，推送前再核对源码 SHA，检测更新则失败并要求重新运行。

## 本地审核

从目标源码提交运行以下命令。`--output` 必须是尚不存在的新目录；输出包括可审核页面及 `.markbridge-wiki.json` 管理清单。

```sh
python3 -m unittest discover -s tests -p 'test_wiki_sync.py'
python3 scripts/wiki_sync.py generate --output /tmp/markbridge-wiki-preview \
  --repository wzf2000/MarkBridge --sha "$(git rev-parse HEAD)"
```

仅对已初始化且干净的 Wiki clone 应用生成结果。首次占位 Home 的替换需要显式 `--bootstrap-home`，且只允许精确占位正文；没有其他初次覆盖入口。

```sh
python3 scripts/wiki_sync.py apply --staging /tmp/markbridge-wiki-preview \
  --wiki /tmp/markbridge-wiki-clone --bootstrap-home
```

管理清单保存上次写入内容的 SHA-256。apply 先检查全部页面，再写入；人工修改、删除托管页、与未托管页重名、符号链接或生成内容与清单不符均拒绝。仅删除上次清单记录且此次不再生成的页面，其他 Wiki 页面保留。

发生人工编辑冲突时，将需保留的修改移回仓库源稿。核对 Wiki Git 历史，把托管页恢复为清单对应的自动生成内容，再运行同步。不要删除清单或强推来绕过保护。源码 CI 会运行同步安全测试；发布 artifact 可用于审核首次同步和问题排查。
