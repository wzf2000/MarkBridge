# 原生图片与简单画廊

原生媒体使用封闭的 v1 源语法，直接保存 WordPress 原生 `core/image`、`core/gallery`。
普通 `![alt](url "title")` 的解析和历史配对字节不变。原文、区块快照仍通过原配对保存链；
转换本身不访问网络、数据库或媒体库，也不授予附件权限。

```markdown
:::mbb:v1 image {"caption":"说明 <strong>重点</strong>","id":42,"sizeSlug":"large","linkDestination":"none"}

![替代文字](https://example.invalid/image.png '图片标题')

:::mbb:end

:::mbb:v1 gallery {"columns":2,"imageCrop":false}

![第一张](https://example.invalid/a.png)

:::mbb:v1 image {"caption":"第二张"}

![第二张](https://example.invalid/b.png)

:::mbb:end

:::mbb:end
```

图片容器主体恰好一个普通独立 Markdown 图片。可选 caption 最多 4 KiB、单行，支持文本和
无属性的 `strong/em/del/code/br`；HTML 须平衡且规范。链接、图片、引用标记、任意属性、
样式及嵌套块明确拒绝。可选附件 id 为正安全整数；sizeSlug 只接受 thumbnail、medium、
large、full。**本子集只接受 linkDestination:none**；media、custom、附件页面链接、
href、target、rel、lightbox、宽高、裁切、装饰性选项及任意样式均拒绝，不静默删除。

画廊含 1–32 个直接 core/image 子块；columns 可省略或为 1–8 整数，imageCrop 可省略或为
布尔值。核心缺省裁切为 true，保存时遵守真实核心的缺省省略规则。首期不接受画廊总图注、
旧 images/ids 数组、动态内容、随机顺序、显式布局、嵌套画廊或其他子块。

附件数字 ID 仅表示当前站点的媒体关系，不属于稳定标签，同一附件可重复使用。
保存宿主必须调用 `mbb_native_media_validate_candidate($serialized)`：返回 true 或 WP_Error。
该守卫重新验证 image 附件、作者 edit_post 权限、父文章读取/密码权限，以及 URL 与 full、
original 或指定 sizeSlug 的本地附件 URL 相符；没有媒体搜索、URL 抓取或自动关联。
没有 ID 的外部图片只保留已准入 URL，不会因同名文件或相似 URL 关联站内附件。

便携 ZIP 宿主先调用 `mbb_native_media_portable_admission($serialized)`。任何深度的本地
附件 ID 均明确拒绝；Node/PHP `portable_images` 也执行同一拒绝。普通 Markdown 原稿仍可
带走，但其中附件 ID 不能作为跨站身份使用。首期没有静默解除关联或宣称无损迁移；导入到
其他站点须先明确处理站点关系，再由已有鉴权上传/资源票据流程建立新媒体。
无本地 ID 的图片/画廊继续复用原 src 精确资源映射及完整快照校验，不改普通链接、图注、
代码和 JSON 字符串。

原生 core/footnotes 的正文依赖独立 postmeta，只有 post_content 的孤立区块不能无损转换，
故明确以 NATIVE_FOOTNOTES 拒绝。已有 mbb 脚注保持原样；有限分组和布局仍不在本子集中。

专用验收使用共享正反夹具、匹配的真实 WordPress 核心脚本、Node/PHP 字节对照、核心有效性、
配对恢复及资源映射敏感反例。纯转换测试不是数据库保存或附件权限的真实 WordPress 验收。

独立预览与离线HTML使用包内有限画廊样式保留列与图注；窄屏至多两列。站点前台仍由WordPress核心和主题负责原生画廊外观。

## 跨站关联

需要解除旧站附件 ID 并在新站创建新关系时，使用明确的[跨站 ZIP 导出](CROSS-SITE-MEDIA.md)。普通 Markdown 和原有 ZIP 的语义保持不变。
