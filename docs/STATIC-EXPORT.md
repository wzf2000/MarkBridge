# 离线阅读与静态 HTML 导出

在编辑桥列表或文章工具栏选择 **导出已保存文章**，格式选 **静态 HTML**。先准备并检查资源，再确认下载；带外部图片的文章须先处理图片，系统不会抓取或省略它们。下载完成后可在断网浏览器中打开，用浏览器打印菜单打印或另存为PDF。此文件用于阅读，不是可完整还原媒体关联、评论和修订的站点备份。

## 实现与数据边界

静态 HTML 导出沿用已有已保存文章的 context → prepare → download 流程。每次准备与下载都
复核同一文章/账号/站点、配对快照、资源摘要与有效期；最终下载仍领取原有 CAS 候选。
不新增客户端 HTML 上传或绕过配对保存的接口，不修改文章、源稿、live reader DOM。

## 固定描述 v1

下载响应为 application/json 的描述字符串，闭合字段为：

```json
{
  "schema": 1,
  "kind": "markbridge-static",
  "title": "Article title",
  "lang": "en-US",
  "body": "<p>Saved content</p>",
  "css": "/* fixed package CSS */",
  "images": []
}
```

images 最多 32 项，每项仅 `key,mime,bytes,data`：key 为文件 SHA-256，mime 只接受
image/png、image/jpeg、image/gif、image/webp，bytes 为实际字节数，data 为规范 base64。
body 中图片仅用 `mbb-static:SHA256` 引用本描述图片；不得携带媒体 ID、站点路径或外部图片。
仅打包已核验为本篇文章直接关联、当前可读的本地位图。单图最多 8 MiB，描述与最终 HTML
分别最多 32 MiB；重复图片在最终 data URI HTML 中重复占用的体积也计预算。
外部/其他文章/不可核验图片在准备时明确拒绝，不抓取、不悄悄省略。

服务端仅从已保存且通过配对验证的 canonical block HTML 生成正文，不调用任意动态区块
渲染器。去掉区块注释、Front Matter carrier、组件参数/启动配置；交互组件只保留作者静态
fallback。所有阶段、折叠、证明和代码语言版本完整可读。编号/引用按现有技术写作规则派生，
脚注标识在本导出内确定，避免多次摘要核验受全局渲染实例计数影响。描述、固定 CSS、正文、
每张图片的 MIME/字节/摘要都进入既有 plan digest 与下载前双次核验。

## 浏览器完成与安全

新全局 `MarkBridgeStaticExport.build(descriptor, {cancelled})` 验证闭集和资源摘要，调用
现有 `MBB_MATH.preview` 处理脱离 live DOM 的副本，保留 CHTML、内嵌 WOFF2 和数学语义。
公式失败、残留原始公式或超预算均拒绝，不生成声称完整的文件；取消/迟到完成不触发下载。
客户端生成的 HTML 不提交服务端。构建结果是单文件 Blob，可在断网状态重新打开。

文件只包含固定样式与可信公式排版后通过审查的静态正文。禁止 script、事件属性、iframe、
Worker、form、srcdoc、srcset、站点配置和危险 URL；只保留安全外链和页内链接。
CSP 固定为 `default-src 'none'; script-src 'none'; connect-src 'none'; img-src data:;
font-src data:; style-src 'unsafe-inline'`。没有远程字体、站点 CSS、评论、私人笔记、修订、
nonce、作者身份或源文件路径。固定排版支持窄屏与打印；长公式/代码保守换页和横向阅读，
不承诺与站点主题或浏览器打印器逐像素相同。

Markdown 仍保留原始站点关联；便携 ZIP 在图片投影前拒绝本地附件 ID。HTML 可在严格验证
关联后将图片转为 data URI，最终文件不带可写附件身份，也不是可恢复全部媒体关系的备份。
