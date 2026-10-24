# 原生区块与静态适配接口

本页适用于 MarkBridge **3.1.0-rc.2** 候选；原生组和纯文本叶子为本轮新增能力。本页定义原生结构容器、纯文本叶子、折叠、链接按钮和受信静态扩展的内容合同；实际验收范围见[验证说明](VALIDATION.md)。交互教学组件使用独立的[教学扩展接口](TEACHING-EXTENSIONS.md)，不能通过本接口运行脚本。

## 原生纯文本代码和预格式化

`native-code` 对应 `core/code`，`preformatted` 对应 `core/preformatted`，保留原生身份，不转换成围栏代码所用的 `mbb/code`。两种叶子共用闭合 JSON 字段：必填 `text` 和可选 `anchor`、`className`。内部不能另写正文或区块；普通围栏代码的既有语言／高亮功能保持原合同。

```markdown
:::mbb:v1 native-code {"text":" const value = 1;\n\treturn value;\n","anchor":"example-code"}
:::mbb:end

:::mbb:v1 preformatted {"text":"名称\t数值\n甲\t1\n\n","className":"plain-data"}
:::mbb:end
```

`text` 为纯文字，精确保留 LF、制表符、首尾空格、空行、特殊字符和不换行空格（NBSP）；JSON 的 `\n`／`\t` 表示正文字符。拒绝 CR、除 LF／tab 外的 ASCII 控制字符以及超出整篇容量的内容。锚点与类名沿用本页组容器的闭合规则；全篇锚点唯一、字节／节点／深度预算仍适用，也可嵌入组。

本批只接受真实核心解析后 RichTextData 的固定保存形态：文本使用 `&amp;`／`&lt;`／`&gt;`／`&nbsp;`，代码换行写为 LF，预格式化换行写为 `<br>`。代码区块还沿用核心的短代码／自动嵌入保护：`[` 写为 `&#91;`，首个独立 http(s) URL 行的 `//` 写为 `&#47;&#47;`，行边界与空白集合按核心 ECMAScript 规则处理（包括 U+2028／U+2029、FEFF）；这些固定转义仍对应原来的文字。通过核心 DOM 构建的该形态可精确 parse／save；不同实体写法、CR、额外 HTML 或其他不能按此形态精确重存的原始 HTML 会明确拒绝，不能以 DOM 等价放行。原生编辑器／插件产生的 strong、em、链接、样式、语言字段、绑定、锁定和其他未知属性也不在本批范围内，不静默删除。预格式化区块在 WordPress 本身可带 RichText 格式，这一能力尚未接入本合同。

## 原生组容器

使用 WordPress 自带的组区块 `core/group`，不另建组编辑器。Markdown 使用 `:::mbb:v1 group {...}`，内部仍为已支持的普通正文和登记静态适配：

```markdown
:::mbb:v1 group {"tagName":"section","anchor":"overview","ariaLabel":"内容概览","className":"reading-group","layout":{"type":"constrained"}}

这里可以放段落、列表、公式、代码、图片、原生折叠，或继续嵌套一个组。

:::mbb:end
```

闭合字段为 anchor、tagName、ariaLabel、className、layout，均可省略。tagName 默认 div，也可为 section。layout 只接受单字段 `{type:"flow"}` 或 `{type:"constrained"}`，不接收宽度或其他布局设置。ariaLabel 为最多 200 个 Unicode 码点、不含控制字符及换行的文字；className 为最多 200 个 ASCII 字符的类名序列，类名以字母开头，仅含字母、数字、下划线和连字符，以单个空格分隔。明确的空 ariaLabel／className 保留在属性中，核心保存 HTML 不产生空 aria-label 或附加类名。anchor 沿用全文唯一、1–64 位 ASCII 锚点规则。

保存 HTML 遵循实际 WordPress 核心：div 或 section 外壳带 wp-block-group，可携带 id、非空 aria-label 和自定义类；flow/constrained 只保存为注释属性，不凭空添加服务器渲染时的 is-layout 类。原始注释先校验字段和类型，再由核心解析；未知属性、样式、颜色、宽度、排版、metadata（含 bindings）、锁定、allowedBlocks、非支持标签及任意 HTML 外壳差异明确拒绝，不依赖核心归一化后静默删除。

允许空组和嵌套组，沿用每种正文 256 KiB、10,000 节点及 32 层整篇预算。锚点、技术对象编号、文献与逻辑身份仍是全文约束；逻辑身份、文献表和阶段组必须遵守原顶层规则，阶段组放入结构组仍明确拒绝。缺少静态适配提供者时不能转换其嵌套内容。组的外观由当前主题和核心决定，本合同不新增主题样式或任意原生区块支持。新增转换类型时，须同时检查保存／恢复所用的独立服务器区块白名单，并通过真实核心解析器和 KSES 壳测试；转换模型通过不能代替这一层。

## 原生折叠和链接按钮

可视化编辑器使用 WordPress 的详情、按钮组和按钮区块，保存后仍为 `core/details`、`core/buttons` 和 `core/button`。Markdown 使用有版本的闭合容器：

```markdown
:::mbb:v1 details {"summary":"查看解释","showContent":false,"anchor":"explanation"}

这里可以继续写段落、列表、公式和代码。

:::mbb:v1 buttons {"anchor":"references"}

:::mbb:v1 button {"url":"https://example.com/guide","title":"参考文档","linkTarget":"_blank","rel":"noopener noreferrer","anchor":"guide-link"}

**阅读** `guide`

:::mbb:end

:::mbb:end

:::mbb:end
```

详情标题为非空、单行纯文字，最多 200 个 Unicode 码点；展开状态为布尔值。内部使用已有支持的正文结构，嵌套仍受整篇文章的节点、深度和容量预算约束。内部深链接可展开所属详情，键盘使用原生 summary；无脚本时仍可手动展开，打印控制不改变已保存展开状态。

按钮组包含 1–32 个链接按钮。文字为一个受控段落，可使用普通文字、加粗、强调、删除线和行内代码，最多 4 KiB、256 个节点及 16 层；不能在按钮中再放链接、图片、公式或交互组件。链接经过安全协议检查，`_blank` 必须含 `noopener`。`rel` 只接受不重复的 `noopener`、`noreferrer`、`nofollow`、`ugc` 和 `sponsored`。

锚点为字母开头、1–64 位 ASCII 字母、数字、下划线或连字符，不能与全文已有教学标识和显式锚点重复。按钮组可省略布局，也可精确保留默认 `layout:{"type":"flex"}`。非空 `details name` 互斥分组、自定义样式、任意布局、动作按钮和未知属性无法表达时明确拒绝，不静默丢弃。核心解析前还会检查保存注释中的属性类型，避免核心归一化掩盖损失。

## 受信静态叶子

管理员安装的受信 PHP 扩展可通过 `mbb_register_block_adapter($descriptor)` 登记静态区块。正文只引用已登记的名称、版本和参数；不能登记新描述、HTML、脚本或转换回调。静态适配块没有内部正文，使用空的闭合容器：

```text
:::mbb:v1 adapter {"name":"plain-card","version":"1.0.0","attrs":{"text":"Example","count":1,"enabled":false,"tone":"note"}}
:::mbb:end
```

描述的闭合字段为 `schema:1`、`name`、`version`、`blockName`、`attributes` 和 `template`。名称和区块名不得冲突，不能覆盖 `core/*`、`mbb/*` 或已有登记类型。描述须与站点和请求用户的语言无关；固定模板文字和参数都是内容，不随界面翻译重写。改变内容合同应增加适配版本。

所有参数都必须明确提供，没有隐式默认值。支持以下字段声明：

| 类型   | 声明                                           | 要求                                                 |
| ------ | ---------------------------------------------- | ---------------------------------------------------- |
| 纯文字 | `{"type":"plainText","maxLength":4096}`        | Unicode 纯文字，声明上限不超过 4096 码点；渲染时转义 |
| 整数   | `{"type":"integer","minimum":-5,"maximum":20}` | 有限整数，范围须在 JavaScript 安全整数内             |
| 布尔   | `{"type":"boolean"}`                           | 真正的布尔值，不能用字符串代替                       |
| 枚举   | `{"type":"enum","values":["plain","note"]}`    | 严格属于声明集合                                     |

数字 `1.0`、`1e0` 可规范为整数 1，`-0` 规范为 0；不得丢失精度。参数名不能占用 `mbbAdapterVersion`、样式、布局、元数据、原型等保留字段。保存区块属性包含合同版本及已校验参数，PHP、Node 和浏览器使用同一描述快照。

模板是有限安全节点树：节点可为固定文字 `{"text":"..."}`、字段引用 `{"field":"text"}`，或带 `tag`、可选固定 `class` 和 `children` 的元素。只接受 `div`、`p`、`span`、`strong`、`em`、`del`、`code`；嵌套须符合实际 HTML 保存结构。没有 HTML 字符串、动态 URL、样式、事件处理器或脚本。参数中类似 Markdown、TeX 或 HTML 的文字仍为纯文字，布尔值显示为 `true`／`false`。

每站最多 16 个适配，每个 1–16 个字段、16 KiB 描述；模板最多 64 节点、深度 8。区块展开后的原文和保存 HTML 继续遵守每种正文 256 KiB 的限制。大型资源和算法实现不适合此接口。

## 编辑、保存与缺包

编辑器提供参数 JSON 输入；在正常差异与预览中检查生成的静态内容。准备初始参数是显式操作；未应用或无效的参数输入会锁住保存，须选择应用或撤销。输入只是候选，不能直接改变已保存文章。

登记的规范摘要进入原有文章版本指纹。预览返回 `adapter_digest`，含适配块的确认保存必须携带该预览摘要；新文章也适用。登记消失、版本或模板改变会使旧确认失效。服务端转换及提交前再次核验，仍使用原有权限、配对、来源写回、修订和失败回退链；没有第二条写正文入口。

缺包或版本不符时，保留已保存参数和静态内容，并显示不可用提示。不能建立可信配对时，转换、新保存、配对恢复及依赖转换的导出会拒绝；重新安装兼容版本后再修复。不要把缺包区块转换成普通段落来绕过校验，也不要把未登记的第三方区块当作可兼容内容。

此接口只提供经过审核的静态表达，不宣称任意第三方区块兼容。PHP 扩展本身属于受信代码，登记校验不是对任意已安装插件的安全沙箱承诺。
