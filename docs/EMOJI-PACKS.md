# 可选图片表情数据包

在 **设置 → MarkBridge 图片表情** 导入 ZIP，再选择启用。默认 Unicode；没有自动下载、远程 URL 导入或第三方图片服务。当前内置下载目录为空，管理员应自行确认导入资源的来源与使用许可。

包只包含根目录的 `manifest.json` 和清单列出的图片，不接受子目录、链接、额外文件或可执行内容。格式示例：

```json
{
  "schema": 1,
  "id": "my-pack",
  "version": "1.0.0",
  "name": "Example",
  "source": "Original artwork",
  "license": "CC0-1.0",
  "emoji": {
    "smile": {
      "file": "smile.png",
      "sha256": "replace-with-the-image-sha256"
    }
  }
}
```

ID 和版本使用小写字母、数字、点及连字符；短代码允许字母、数字、下划线、加号及连字符。图片仅支持 PNG、GIF、WebP，每张不超过 256 KiB、512 × 512；至多 128 张，ZIP 与展开总量均不超过 8 MiB。清单也不能超过 256 KiB。插件验证实际图片类型和 SHA-256，不执行 ZIP 解压命令。

先完整验证，在上传目录 `markbridge/emoji/` 下暂存，再原子移动；数据库保存清单与启用选择。导入不会自动启用，失败保留旧选择。升级插件不会覆盖资源；删除前必须切回 Unicode 或其他包。备份时同时保存上传资源和数据库设置。

正文、评论继续存储 `:smile:`；前端显示图片并提供短代码替代文本。缺失或校验失败的图片退回 Unicode，未知短代码保留原文；代码、预格式化区域、公式和编辑区不替换。切换资源不会批量重写正文。

可生成具有明确许可的合成示例：

```sh
python3 scripts/example_emoji_pack.py /tmp/synthetic-smile.zip
```

示例脚本生成的原始栅格图片以 CC0-1.0 提供；该示例不包含第三方表情素材。
