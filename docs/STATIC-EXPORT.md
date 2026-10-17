# 离线阅读与静态 HTML 导出

在编辑桥列表或文章工具栏选择 **导出已保存文章**，格式选 **静态 HTML**。准备后先在对话框内检查真正的静态阅读预览，再确认下载。外站图片转为可辨认的链接，系统不抓取；同站未知图片或其他文章附件仍拒绝导出。下载完成后可在断网浏览器中打开，用浏览器打印菜单打印或另存为PDF。此文件用于阅读，不是可完整还原媒体关联、评论和修订的站点备份。

## 实现与数据边界

静态 HTML 导出沿用已有已保存文章的 context → prepare → download 流程。每次准备与下载都
复核同一文章/账号/站点、配对快照、资源摘要与有效期；最终下载仍领取原有 CAS 候选。
不新增客户端 HTML 上传或绕过配对保存的接口，不修改文章、源稿、live reader DOM。

## 固定描述 v1

HTML 模式 prepare 的 `projectedSource` 是下面完整描述的 JSON 字符串，供前端构建阅读预览，
不再只是正文 HTML，也不直接显示为 JSON 文本框。最终 download 响应仍为 application/json
描述字符串；其闭合字段为：

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
body 中实际图片仅用 `mbb-static:SHA256` 引用本描述图片；不得携带媒体 ID、站点路径或外部图片资源。
仅打包已核验为本篇文章直接关联、当前可读的本地位图。单图最多 8 MiB，描述与最终 HTML
分别最多 32 MiB；重复图片在最终 data URI HTML 中重复占用的体积也计预算。
只有无凭据的绝对 HTTP(S) URL，且其 hostname 与 `home_url('/')` 的 hostname 不同，才可
转成普通外图链接；不同端口但相同 hostname 不算外站。链接文字优先保留 alt，完整 URL 放在
链接和 title 中；已有包裹链接保留，并在旁边补独立图片链接，避免嵌套 `<a>`。
不下载、不嵌入外站图片，也不以此放行同站未知、其他文章关联或不可核验的本地图片。
危险协议、凭据、控制字符和反斜杠 URL 均拒绝。

服务端仅从已保存且通过配对验证的 canonical block HTML 生成正文，不调用任意动态区块
渲染器。去掉区块注释、Front Matter carrier、组件参数/启动配置；交互组件只保留作者静态
fallback。所有阶段、折叠、证明和代码语言版本完整可读。编号/引用按现有技术写作规则派生，
脚注标识在本导出内确定，避免多次摘要核验受全局渲染实例计数影响。描述、固定 CSS、正文、
每张图片的 MIME/字节/摘要都进入既有 plan digest 与下载前双次核验。

## 对话框阅读预览

prepare 成功后，前端用 `MarkBridgeStaticExport.build(descriptor, {cancelled})` 构建与下载相同
样式和内容的静态 HTML，再展示只读 iframe。HTML 模式隐藏原 JSON 输入；Markdown/ZIP 的
原稿或资源清单展示保持原有用途。预览构建或加载失败时不能确认下载。

预览 iframe 使用空 sandbox、`referrerpolicy="no-referrer"` 和禁止脚本的 CSP，不授予
`allow-scripts` 或 `allow-same-origin`。预览副本删除所有非 `#内部锚点` 的 href，保留文字与
已有 title；再加入唯一受控的 `<base href="about:srcdoc">`，使空沙箱中页内跳转可用。
现代浏览器使用 srcdoc，Blob URL 是不支持 srcdoc 时的兼容来源；预览额外限制
`base-uri about:; form-action 'none'`，其余脚本、连接和资源限制与静态文件一致。
预览不允许打开外链，也不为点击外图链接发出请求。最终下载保留审查过的外链，不带这个
预览专用 base 元素。

确认下载仍重新调用受 nonce、receipt、预期快照和候选领取保护的 download，再用返回描述
重新 build；不会把预览 Blob 当作最终授权结果。关闭、取消、换格式、重新准备或失败会清除
候选与 iframe，并撤销预览 object URL；迟到的构建结果不能重新显示或触发下载。

## 浏览器完成与安全

新全局 `MarkBridgeStaticExport.build(descriptor, {cancelled})` 验证闭集和资源摘要，调用
现有 `MBB_MATH.preview` 处理脱离 live DOM 的副本，保留 CHTML、内嵌 WOFF2 和数学语义。
公式失败、残留原始公式或超预算均拒绝，不生成声称完整的文件；取消/迟到完成不触发下载。
固定 MathJax 4.1.3 CHTML 的无 italic-correction 字形标记仅允许排版后的
`mjx-c noic="true"`；其他节点／值以及作者原始同名属性仍拒绝，不开放任意数学属性。
客户端生成的 HTML 不提交服务端。构建结果是单文件 Blob，可在断网状态重新打开。

文件只包含固定样式与公式/代码呈现后通过审查的静态正文。禁止 script、事件属性、iframe、
Worker、form、srcdoc、srcset、站点配置和危险 URL；只保留安全外链和页内链接。
CSP 固定为 `default-src 'none'; script-src 'none'; connect-src 'none'; img-src data:;
font-src data:; style-src 'unsafe-inline'`。没有远程字体、站点 CSS、评论、私人笔记、修订、
nonce、作者身份或源文件路径。固定排版支持窄屏与打印，不承诺与站点主题或浏览器打印器逐像素相同。

## 静态代码、表格与媒体

导出时可选调用 `MarkBridgeStaticCode.render(root, {cancelled})`，仅处理脱离 live DOM 的
`pre > code`，排除数学块。它复用已加载 Prism，或只从可信 `MBB_STATIC_CODE` 配置中的同源
固定 vendor 路径加载 core/autoloader 和已知语言；不读取正文中的语法路径、依赖或任意脚本。
不会重设现有页面的 autoloader 路径。没有 helper、语言未知、资源失败、配置不匹配或超过
预算时，代码保留为纯文本；没有复制按钮或运行代码能力，最终文件仍完全不依赖 JavaScript。

高亮直接把 Prism token 转成受限 span/text 节点，核对 `code.textContent` 精确一致，包括
CRLF、空白和不换行空格。序列化用 `&#13;` 保存回车。行号是 code 外的空 span 与 CSS counter，
`aria-hidden` 且不能选中，不混入代码正文。屏幕上保持等宽代码、语法色、完整行号和分隔线，
长行横向滚动；超出行号装饰预算时不生成部分行号。HTML 是阅读投影，Markdown 下载才是
原始稿字节备份。

当前高亮每块最多 32 KiB、合计 192 KiB；行号每块最多 2,048 行、合计 10,000 行。
每块 token/节点遍历最多 50,000 项、深度 32；累计同步高亮时间 1.5 秒及本轮 6 秒加载/高亮
准入窗口用于限制后续块，单个资源等待最多 4 秒。Prism 的单次同步 tokenize 无法中途抢占，
这些时间门槛不是单块硬 CPU 截止。取消后不再向脱离文档写入迟到结果。

表格提供表头、轻边框、留白与隔行色，保留短列最小宽度，窄屏在表格内横向滚动。
打印时长代码换行并隐藏会因换行而错位的行号栏，表格可换行和跨页，避免屏幕滚动容器裁切。
公式字体与既有 CHTML 语义继续保留。

图片与画廊共用受 `data-mbb-content-view` 限定的媒体样式：图注在图片下方正常流中展示，
清除核心覆盖式渐变/模糊背景，不裁切长图注；保留作者裁切选择，手机改为易读列宽。
静态导出保留全部阶段、展开的证明和全部代码版本；这些样式不写回保存属性或正文源。

Markdown 仍保留原始站点关联；便携 ZIP 在图片投影前拒绝本地附件 ID。HTML 可在严格验证
关联后将图片转为 data URI，最终文件不带可写附件身份，也不是可恢复全部媒体关系的备份。
