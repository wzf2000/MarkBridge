# 教学扩展接口

本页描述当前 MarkBridge 的扩展结构、教学脚本维护方式，以及 v1 组件与显式 v2 活动合同。作者操作见[教学内容](TEACHING.md)。主插件保存教学结构、引用、参数和静态替代；算法、课程样例、Worker 与播放控制由独立受信插件提供。文章不能自行登记脚本或运行地址。

通用作者工具、权限范围兼容目录和 typed 静态投影见 [SDK](SDK.md)；原组件登记与精确版本合同继续有效。

## 先分清插件、组件与文章实例

扩展目录列出的是已安装受信程序的登记结果，不是在线插件市场。一份 WordPress 插件可以提供多种能力、多个组件类型，以及同一组件的多个兼容版本。

| 层次             | 例子                                           | 含义                                                    |
| ---------------- | ---------------------------------------------- | ------------------------------------------------------- |
| WordPress 插件包 | Teaching Components                            | 管理员安装、启用和更新的一份程序                        |
| 组件类型         | `self-check-choice`、`teaching-replay`         | 这份程序提供的可复用内容形式                            |
| 精确组件版本     | `insertion-sort@0.1.0`、`insertion-sort@0.2.0` | 同一类型的两个运行合同；保留旧版供原文章使用            |
| 文章实例         | 一篇文章中的两道单选题                         | 各自保存稳定 ID、题干、参数和静态解释，复用同一组件程序 |

因此，一篇新教程通常不需要安装新插件，也不需要新建一种组件类型。目录中看到多个算法名称，不表示每篇教程都有一个独立插件；同名不同版本也不表示安装了两份 WordPress 插件。旧登记接口最多容纳 32 个精确类型／版本组合；Main 3.4 起可声明有界轻量索引并按需解析更多精确版本，仍不应按题目逐个登记。

当前配套扩展的职责如下；是否安装仍由站点决定：

| 插件／能力组        | 主要职责                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------- |
| Teaching Components | 插入排序、三角形路径、DP／二分实验、堆与图遍历、排序对照、三种自测、节点图和通用步骤回放 |
| Mermaid             | 图示渲染；旧、新图示合同可由同一插件并存提供                                             |
| Scientific Lab      | 小数据图表与固定求和误差实验                                                             |
| Scholarly Tools     | 作者私有资料库、选定版本快照与主动 DOI 候选查询；不提供算法播放器                        |
| Publisher           | 离线网页书与 EPUB；不提供算法播放器                                                      |
| SDK／研究样例       | 展示接口、静态投影或有限执行的开发夹具，不是每篇教程的依赖                               |

顶层扩展登记与交互组件登记是两个接口：资料库、出版工具可以没有交互组件，Mermaid 等兼容提供者也可能只有组件登记。目录按实际拥有资源的插件分组；状态表示当前兼容性，不会自动安装、启用或升级程序。

## 主插件、教学扩展与主题的边界

| 负责方            | 维护内容                                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| MarkBridge 主插件 | Markdown／区块格式、PHP／Node 一致转换、配对保存和修订、来源绑定、权限、配置校验、候选应用、资源摘要与隔离宿主、活动正文揭示、停止及外层预算 |
| 受信教学扩展      | 题型规则、算法与 Worker、状态模型、播放控件、作者配置界面、参数 schema、实际语言与计数口径、内部资源限制、可选 typed 静态投影                |
| 主题              | 页面宽度、导航、字体、配色、引用与代码等阅读样式，以及与目录／段落评论的布局配合                                                             |
| 文章作者          | 题意、选项、提示、解析、数据、步骤、静态替代与已有组件引用；不在正文放运行脚本                                                               |

Teaching Components 已使用共享的实验模型／Worker／界面、自测框架、堆与遍历框架、排序框架和步骤播放器。构建时将这些源文件与各组件的受控配置组合成固定资源，再登记版本与摘要；文章只保存纯数据。早期插入排序和三角形组件还保留自己的固定资源以维持旧文章兼容。当前实现不是一个可以自动理解任意算法的通用执行器。

## 新教程与脚本如何更新

### 只改题目、数据或讲解：正常编辑文章

已有组件能表达新内容时，直接改参数和静态正文：单选／排序／数值自测复用原题型，数组／表格／节点演示可使用 `teaching-replay@0.1.0`。后者接收作者预制的步骤快照、解释和代码位置，不执行展示代码，也不会对任意输入自动计算。

例如，同一种回放组件可以保存以下参数，不必为这一课新增脚本或登记项：

```json
{
  "title": "交换两个数",
  "code": { "language": "pseudocode", "source": "交换第 1、2 项\n" },
  "steps": [
    {
      "id": "before",
      "title": "交换前",
      "explanation": "先观察两项的位置。",
      "line": 1,
      "view": { "kind": "array", "values": [2, 1], "active": 0 }
    },
    {
      "id": "after",
      "title": "交换后",
      "explanation": "位置改变，元素保持不变。这是预制回放。",
      "line": 1,
      "view": { "kind": "array", "values": [1, 2], "active": 1 }
    }
  ]
}
```

在组件作者面板编辑，核对候选并点击 Apply，再正常保存文章；Markdown 同样保存类型、精确版本、参数及内部静态正文。自测的题干、选项、提示和解析由活动关系引用原文块，不另存第二份可写题目。新教程应包含完整静态说明，不将随机输出、播放进度或读者答案写回正文。

回放当前最多 32 步，数组最多 64 项、表格最多 16×16、节点图最多 32 节点／64 条连线；仍先受总参数 16 KiB 限制。较大课程资源不能直接塞入参数。详细字段见 Teaching Components 源码包的 `docs/REPLAY.md`。

### 新增算法执行或展示形式：更新受信扩展

如果要让读者输入新数据并实际计算一种尚未支持的算法，或增加新状态图形，需要开发扩展代码。可以在同一教学插件增加一个组件，或按独立维护需要建立课程扩展；无需为每篇课文建立 WordPress 插件。

1. 定义可复用类型、参数 schema、输入／输出／轨迹上限、实际执行语言和静态替代；尽量复用已有模型、Worker 协议、播放器与作者表单。
2. 在扩展源码中实现并审阅算法、展示和停止逻辑。Teaching Components 的 `assets/experiments-*`、`self-tests-*`、`structures-*`、`sorting-*`、`replay-*` 分别维护对应共享能力；`scripts/*-resources.cjs` 与 `scripts/build.cjs` 生成运行资源。
3. 在 PHP 提供者与作者界面登记精确类型／版本，维护构建映射、`assets/manifest.json` 和 `scripts/package.cjs` 的明确包清单。摘要来自确定性构建，不能手改已生成资源或在请求时重算“期望值”。
4. 运行扩展的模型、资源完整性、PHP／Node 格式和浏览器检查，再在独立 WordPress 验证保存重开、修订、来源、缺失提供者、停止及失败。主插件的联合测试入口见[参与开发](../CONTRIBUTING.md)。
5. 从干净提交生成新的插件安装 ZIP 和可读源码 ZIP，在隔离站安装，确认目录及既有文章兼容后再安排站点升级。文章仍明确引用所需组件版本。

Teaching Components 的常用开发命令如下，`MARKBRIDGE_TEST_MAIN_ROOT` 指向匹配的主插件源码；浏览器运行时按扩展 README 配置。构建包不会自行安装或发布：

```sh
npm ci --ignore-scripts
npm run check
MARKBRIDGE_TEST_MAIN_ROOT=/absolute/path/to/markbridge npm run test:formats
npm run test:browser
npm run package
npm run package:source
```

### 升级保留已保存文章的精确版本

插件包版本和组件版本分开维护。Teaching Components 构建对既有运行资源保留固定摘要，旧逻辑资源还受 `legacyDigests` 检查；直接修改后重写摘要会破坏已验证的兼容基线。改变已有组件的运行资源、算法或配置合同时，应登记新的组件版本，保留旧资源与旧登记，并更新构建映射及包白名单；不能为了通过构建而删除冻结检查。

安装新插件包不会自动把旧文章改成新组件版本。迁移需要受信作者工具提供转换，作者核对未应用候选后 Apply，再正常保存；旧修订仍应能找到原版本。文章参数更新则沿用同一合同，不必每改一次题目就增加组件版本。主插件宿主自身的样式或尺寸修复可以独立维护，不等同于重写提供者固定资源。

开发后退回插件前，先核对仍在使用的新类型／版本，保留旧、新包和数据备份。提供者暂时缺失时原配置和作者静态正文必须保留，不自动降级或删除内容。

## 内容与提供者

`mbb/component` 的持久属性为 `version:1`、文章内稳定 `id`、`component`、`componentVersion` 和 `params`；其 InnerBlocks 是不依赖运行组件的静态题意与解释。Markdown 使用封闭的 `:::mbb:v1 component {...}` 容器。PHP 与 Node 都能独立于提供者转换该格式；是否允许新增或修改配置，由保存服务器的登记表决定。

配置不是第二份正文。配对保存、原生区块保存、修订与文件来源更新继续共用权限、指纹与事务链。保存前先验证完整历史配对，再判断配置是否保持原样；不能仅凭客户端声称存在旧配置而绕过登记校验。扩展停用时，已经核验的原配置可保留，静态替代可编辑；新配置或参数变化会拒绝。精确的已验证配对修订仍可恢复，不能借恢复许可接受任意修改。

## 轻量版本目录与按需解析（Main 3.4）

先检测 `markbridge_teaching_supports_component_catalog()`。受信扩展调用
`markbridge_register_teaching_component_catalog($id, $index, $resolver)`，每类型只声明一次。
`$index` 是闭合的 `title`、`defaultVersion`、`versions`；每版本项仅含 `version`、`title`、
`fingerprint`。默认版本必须是版本列表首项。同类型跨新旧接口的第一次成功登记决定默认值；
目录翻页、安装新版本、重开文章不会升级已有精确版本。

每项 `fingerprint` 由 `markbridge_teaching_component_fingerprint($id, $provider)` 生成。
它递归规范化 provider 数据，包含 schema、defaults、协议、预算、可选 flags、固定 HTML SHA-256
及 v2 manifest SHA-256，排除本地路径、部署 URL、运行状态和派生资源计划。
发布构建应将资源摘要及索引固定到包内；请求中不能重新计算“期望摘要”来接受变更后的资源。

本地 `$resolver($id, $version)` 只能接到已登记的精确键，返回原 v1/v2 provider 数组。
主包重新执行原 schema、默认值、资源路径／摘要／组校验，再核对定义 pin 和标题。
异常、递归、未登记版本或 pin 不符均解析失败。作者配置及静态正文保留。
保存准入、阅读、静态投影、出版、资源路由和启动共用此入口；客户端选过版本不是服务器准入条件。
可运行的 40 版本样例位于 `sdk/examples/indexed-components/provider.php`，详见其 README。

| 范围         | 预算与超额行为                                                                                |
| ------------ | --------------------------------------------------------------------------------------------- |
| 新旧联合目录 | 256 精确键、64 类型、每类型 64 版本；总索引 128 KiB；单声明 32 KiB；整笔拒绝，不部分登记      |
| 目录响应     | 默认每页 20、最多 50 项、32 KiB；只交付轻量项，不执行 resolver                                |
| 按需描述     | 单个公开描述 64 KiB；请求内最多 256 个解析键及 4 MiB 描述缓存，失败也记忆；复用时复核实际资源 |
| 每篇文章     | 最多 32 个不同精确键、公开描述合计 512 KiB；重复实例复用版本；原活动／预览／参数预算保持      |
| 多章出版     | 每章沿文章预算，总计最多 256 键／4 MiB；沿原章节、投影、资源及快照总预算                      |
| 阅读归档页   | 只交付页面实际文章引用项，聚合最多 256 键／4 MiB；实例静态替代仍独立存在                      |
| 旧接口       | 原提供者、静态 renderer、作者 callback 分别保留原 32 上限，不因索引扩大                       |

索引 resolver 可以按需调用 `mbb_register_component_projection()` 为当前正在解析的同一精确键
登记固定 renderer，使用独立的 256 项请求内空间；其他键不借此绕过旧 32 上限。
renderer 文件、返回树及出版指纹仍执行原校验。新索引没有专用作者 callback 时可使用通用 schema 表单。

后台使用 WordPress 原有选择与翻页控件；打开已有块会直接按其属性解析，无需先打开选择器。
精确描述通过有编辑权限的私有 REST 请求获取：`GET mbb/v2/components/catalog` 与
`GET mbb/v2/components/descriptor/{component}/{version}`。前者支持 `page`、`per_page`、`type`；
后者必须携带目录的 `fingerprint`。可带 `post_id`，服务器另查文章编辑权限。
响应不包含文件路径或工厂，且 `private, no-store`；目录变更须刷新。
作者异步选择同时核对当前文章、选区、块属性／草稿代次与目录指纹，迟到结果不能应用到新草稿。

## 登记 v1 提供者

独立插件订阅 `markbridge_register_teaching_components`，调用 `markbridge_register_teaching_component($id, $provider)`。返回 `true` 表示登记成功，不代表资源可运行；查询 `mbb_component_registry()` 中的状态。协议、最低版本或资源不兼容时保留诊断条目；结构非法及重复登记返回 `false`，拒绝原因进入只读报告。

示例只展示通用配置，不定义具体课程或算法：

```php
add_action('markbridge_register_teaching_components', static function () {
  $manifestFile = __DIR__ . '/assets/manifest.json';
  if (!is_readable($manifestFile)) {
    return;
  }
  $fixedBuildManifest = json_decode(file_get_contents($manifestFile), true);
  if (!is_string($fixedBuildManifest['resources']['array-frame.html'] ?? null)) {
    return;
  }
  markbridge_register_teaching_component('array-demo', [
    'version' => '0.1.0',
    'title' => '数组演示',
    'protocolVersion' => 1,
    'minMarkBridge' => '2.0.0',
    'schema' => [
      'type' => 'object',
      'properties' => [
        'values' => [
          'type' => 'array',
          'minItems' => 1,
          'maxItems' => 64,
          'items' => ['type' => 'number'],
        ],
      ],
      'required' => ['values'],
      'additionalProperties' => false,
    ],
    'defaults' => ['values' => [3, 1, 2]],
    'resource' => [
      'file' => __DIR__ . '/assets/array-frame.html',
      'url' => plugins_url('assets/array-frame.html', __FILE__),
      'sha256' => $fixedBuildManifest['resources']['array-frame.html'],
    ],
    'budgets' => [
      'resourceBytes' => 524288,
      'startupMs' => 5000,
      'wallMs' => 2000,
      'traceFrames' => 8192,
      'traceBytes' => 524288,
    ],
  ]);
});
```

`$fixedBuildManifest` 来自扩展构建产物，不是用户输入。资源摘要必须由已审阅构建生成；不要每次请求对当前资源重新计算“期望摘要”，那会失去检查构建内容的意义。

每个提供者必须声明全部上述字段，未知字段拒绝。类型标识为 1–64 个小写 ASCII 字母、数字或连字符，以字母开头；此旧接口最多登记 32 个精确类型／版本组合；同类型可同时登记多个不同版本，精确版本重复仍拒绝。首个登记是新插入的默认项，已有文章按类型和版本精确查找。组件版本为 `X.Y.Z`；协议当前为 `1`，最低主插件版本可为 `X.Y.Z` 或本地 `X.Y.Z-dev.N`。升级不自动改写文章的组件版本；扩展须先检测 `markbridge_teaching_supports_component_versions()` 存在且返回 true，才登记同类型的额外版本。旧主插件只登记原版本，避免占用类型导致旧文章失去提供者。

资源必须是插件目录内的固定本地 `.html` 或（2.0.3 起）`.html.txt`，URL 与其 WordPress 插件地址一致。登记检查真实路径、可读性、大小及固定 SHA-256；浏览器在加载前再次有界读取并核对摘要。资源不写入正文，不从参数取得地址，不下载或自动安装远端提供者。缺失、超限或摘要错误时显示静态替代，管理员可修复对应扩展后重新启动。

推荐构建时生成带内容摘要的 `.html.txt` 文件名，并让固定构建清单将逻辑 HTML 名映射到该文件。浏览器仍校验原始响应字节，再通过 `srcdoc` 加载 HTML；不会去除注入代码、归一化响应或放宽摘要检查。使用该格式的提供者须声明 `minMarkBridge: '2.0.3'`，其他 `.txt` 文件不被接受。

2.0 增加可选的布尔字段 `supportsUiLocale`，省略或 `false` 时维持原 v1 初始化字段。提供者明确设置 `true` 后，`init` 才增加 `uiLocale:'en_US'|'zh_CN'`，供扩展翻译固定界面文字；不能借此翻译算法、输入、作者静态正文或写回参数。未知语言回到英文。需要兼容旧主插件的扩展，应先检查 `function_exists('markbridge_teaching_supports_ui_locale')` 并调用能力探测，再添加此字段；旧版本仍会拒绝陌生登记字段。提供者自身维护目录和无译文回退，不共享主插件鉴权材料。

## 参数 schema 的受支持范围

这是一组封闭校验规则，不是完整 JSON Schema 实现。类型支持 `object`、`array`、`string`、`number`、`integer`、`boolean` 与 `null`，所有类型可声明非空 `enum`。对象必须声明 `properties`、`additionalProperties:false`，可声明 `required`；数组使用 `items`、`minItems`、`maxItems`；字符串使用 `minLength`、`maxLength`；数值使用 `minimum`、`maximum`。未知关键字、相反上下界、错误类型及不满足自身类型的枚举值拒绝。

参数根必须是 JSON 对象；对象与数组、空对象与空数组保持区别。总量最多 16 KiB、1,024 个节点、八层深度，拒绝危险属性名、无效 UTF-8 和非有限数。数值采用 JavaScript 有限双精度语义，精确的大整数应使用受 schema 约束的字符串。不要使用 JSON 编码文本是否相同来比较复合枚举，也不要依赖宿主 `serialize_precision` 截断数值。默认参数必须通过相同纯数据和 schema 校验。

作者的参数输入暂存在编辑器内存中；明确应用后更新区块，未应用或无效时阻止保存与导出，撤销恢复原配置。切换选区不能静默丢弃候选。应用仍不取代服务端 schema 校验。播放位置、读者输入与执行输出永不写回参数或正文。

## 固定公开资源 v2（3.2.0-rc.3）

这是显式选择的另一种资源交付协议，与“活动关系 v2”及作者工具合同分别编号。文章仍保存原 `component`、精确版本、`params` 与可选 `activity`，不保存协议、URL、清单或运行结果。原 v1 的资源及 srcdoc 加载保留。

提供者先检查 `markbridge_teaching_supports_resource_groups()`，将 `protocolVersion` 设为 `2`、`minMarkBridge` 设为 `3.2.0-rc.3` 或以后，再增加闭合登记字段：

```php
'resources' => [
    'file' => __DIR__ . '/assets/0.1.0/manifest.json',
    'url' => plugins_url('assets/0.1.0/manifest.json', __FILE__),
    'sha256' => $reviewedBuildPins['manifest.json'],
],
```

原 `resource:{file,url,sha256}` 仍指向该提供者固定 HTML 引导，单项最多 512 KiB；它不进入额外资源列表。摘要应来自审阅构建的固定 pin，不从文章、网络响应或每次请求动态计算为新信任值。所有文件必须位于同一插件真实目录，清单和条目不允许 symlink、路径逃逸、查询或外部 URL。

清单最多 16 KiB，严格拒绝重复 JSON 键、无效 Unicode、非有限数与未知字段，结构如下：

```json
{
  "schema": "mbb-resources/v2",
  "version": "0.1.0",
  "resources": [
    {
      "id": "data",
      "path": "assets/0.1.0/data.json",
      "type": "json",
      "bytes": 12,
      "sha256": "<64 lowercase hexadecimal characters>",
      "deps": [],
      "license": "CC0-1.0",
      "version": "0.1.0"
    }
  ]
}
```

`version` 为无前导零的稳定 `x.y.z`，须同时等于精确组件版本及路径版本。条目 ID 为最多 24 个小写字母／数字／连字符，首字符为字母；路径只接受 `assets/<version>/<小写字母开头的字母数字连字符文件名>.<json|js|bin>`。类型与后缀一一对应：`json`、`javascript`、`public-data`。许可枚举为 `CC0-1.0`、`GPL-3.0-or-later`、`Apache-2.0`。依赖为本组已登记 ID，无重复、缺失或环；交付按稳定拓扑顺序。最多八项，每项 1 MiB，资源条目原始字节合计 2 MiB；清单的 16 KiB 与 HTML 引导的 512 KiB 分别计量，不扣入该资源合计；不接受 WASM、Worker 或任意附加类型。清单不能列入自身。

父窗每次启动都以 `credentials:'omit'`、`redirect:'error'` 重新读取并校验固定清单；缓存命中也不省略此步。只有整组下载、字节数、SHA 和当前 generation 均有效后才提交原始字节 LRU，页面内最多 4 MiB。交付副本可 transfer，缓存原件不被 detach；取消或晚 SHA 结果不能提交半组或复活旧实例，并发实例各有上下文。

v2 iframe 的 `src` 指向公开固定 REST HTML 路由 `/mbb/v2/component-frame/<id>/<version>/<bootstrap-sha256>`，采用 `sandbox="allow-scripts"`、无同源权限。端点只接受登记元组，拒绝额外查询／正文／nonce／任意文件或脚本（WordPress 的 `rest_route` 路由参数除外）。响应为原始 HTML，不是 JSON；发送前重读本地引导及整组摘要，返回 `no-store`、`nosniff` 与独立 CSP：只允许本站嵌入、固定内联／blob 脚本与内联样式，`connect-src 'none'`、`worker-src 'none'`，不授予 WASM 编译权限。不会调整编辑器或整站 CSP。iframe 导航可能携带浏览器 Cookie；端点不读取账户／文章身份来生成正文，opaque 子文档也不能读取 Cookie。不要把父窗 fetch 的 omit 误写成导航 omit。

端点 URL 的摘要只绑定提供者固定 HTML；最终响应另附 Main 固定布局桥。完整组件身份同时绑定 ID、精确版本、协议、引导 SHA、资源组及 Main 桥／CSP／校验代码摘要。布局桥只负责有界自然高度和活动布局，不替提供者验证资源消息或计算。

每实例 wire 为 `mbb-component/v2`，会话、来源、runId 及已有 `ready`／`run-request`／`grant`／`complete`／`cancel` 控制保持。v2 `init.resourceGroup` 为 `{version,sha256,identity,resources:[{spec,buffer}]}`；`buffer` 是 ArrayBuffer，元数据中的 spec 与固定清单一致。提供者须先拒绝 `parent===window`，再检查 `event.source===parent`、协议、固定会话、条目身份、长度与摘要；资源交付不是运行许可，计算仍需 `grant`。v2 初始化 JSON 元数据单独限制 40 KiB（v1 仍 20 KiB），参数仍 16 KiB，控制／结果仍 8 KiB；ArrayBuffer 另按八项／每项 1 MiB／合计 2 MiB 核对，不以 JSON 中的 `{}` 绕过预算。

启动总期限最多五秒，覆盖加载、摘要、HTTP frame、交付和 ready；累计下载最多 2.5 秒、摘要最多一秒、frame 导航至 ready 最多 1.5 秒，任一先到即失败。ready 后的读者思考不消耗启动期限；每次 grant 仍独立最多两秒。父窗的移除与 deadline 是兜底，不是任意恶意程序的硬实时 CPU 隔离证明。

受信 typed 投影可通过 `markbridge_teaching_resource_bytes($component,$version,$resourceId)` 读取固定 JSON／bin 数据；该接口不读文章 URL、不返回脚本，且重新校验全部登记文件。投影指纹及文集快照同时绑定数据身份，末次变更拒绝。静态输出保留投影和作者替代，不自动打包 HTML／JS 运行代码；不会因为启用了 v2 就把整个资源组作为离线运行程序导出。

本地 HTTP 合成提供者位于 `tests/fixtures/resource-v2-provider`，含固定 HTML、JSON、JS、bin、字面 pin 与 typed 表格；只在 `WP_ENVIRONMENT_TYPE=local`、loopback home、`MARKBRIDGE_TEST_RESOURCE_V2=true` 时登记。它是测试夹具，不是已发行扩展或生产数据源。

## 隔离加载与消息协议（v1）

静态文章预览继续使用不允许脚本的沙箱。交互组件必须显式启动，运行在单独 `sandbox="allow-scripts"` 的无同源权限 iframe 中。主插件前置 CSP，禁止网络连接、表单、外部资源和基准 URL；只允许登记资源中的内联脚本／样式及 blob Worker。资源请求不带凭据、禁止重定向；运行 iframe 不取得编辑器 REST nonce、Cookie、私人正文或服务器执行接口。

每次启动生成新的会话标识。消息携带 `protocol:'mbb-component/v1'`、`session` 和 `type`，父窗同时检查消息来源是当前 iframe。opaque origin 下发送使用 `'*'`，不能省略来源与会话检查。扩展只接受来自父窗的消息，固定会话后拒绝其他会话；完成／停止还必须匹配本次 `runId`。扩展发往父窗的控制／摘要消息最多 8 KiB；`init` 的参数仍最多 16 KiB，含元数据的完整信封最多 20 KiB。

| 方向          | 类型               | 作用                                                                                              |
| ------------- | ------------------ | ------------------------------------------------------------------------------------------------- |
| 主插件 → 扩展 | `init`             | 公共参数、执行是否开放、类型与版本及实际预算；不含鉴权材料                                        |
| 扩展 → 主插件 | `ready`            | 初始化完成，解除启动计时                                                                          |
| 扩展 → 主插件 | `resize`           | 请求高度；常规组件限制在 280–4,096 px，登记图示的最小高度为 160 px                                |
| 扩展 → 主插件 | `run-request`      | 提交新的 32 位小写十六进制 `runId`，申请活动运行槽                                                |
| 主插件 → 扩展 | `grant`／`denied`  | 授权该 `runId`，或以 `BUSY`／`UNAVAILABLE` 拒绝                                                   |
| 扩展 → 主插件 | `complete`         | 同一 `runId` 的完成摘要，包含 `frameCount`、`outputBytes`；可含 `comparisons`、`moves`、`matches` |
| 扩展 → 主插件 | `error`／`stopped` | 初始化或运行失败，或同一运行明确停止                                                              |
| 主插件 → 扩展 | `cancel`           | 停止 Worker、播放、计时器与迟到更新                                                               |

必须先获得 `grant` 再创建实际 Worker；拒绝不是一次运行成功。完成摘要的轨迹帧数和输出字节数为非负安全整数且不得超过本次预算，计数也须为非负安全整数，参照匹配值为布尔。主插件不接收全轨迹；扩展在 iframe 内限制并保留轨迹。独立数组样例的 `outputBytes` 是完整结果 JSON 的 UTF-8 字节数，包含轨迹、最终数组与比较／移动计数，并非仅最终数组长度。计数名称不是统一复杂度模型，扩展必须解释每次操作的计数口径。

摘要核验后，宿主注入固定的自然高度观察桥接，包含 body 边距及少量舍入余量；高度仍受 4,096 px 上限约束。文章参数不能注入该桥接或提高上限。较长内容仍需由组件合理分页／分步，不能承诺无限增高。

## 预算、停止与状态

提供者预算必须为正整数，可比主插件硬上限更小；不能声明更大的值。当前硬上限如下：

| 项目                   |   硬上限 |
| ---------------------- | -------: |
| 单个运行资源           |  512 KiB |
| 启动／资源读取         | 5,000 ms |
| 单次授权运行           | 2,000 ms |
| 单次轨迹               | 8,192 帧 |
| 单次输出／轨迹字节预算 |  512 KiB |
| 同页打开的交互预览     |        4 |
| 同页活动执行           |        2 |

资源和初始化共享启动时限，不因重试重新计时。仅第一次资源 GET 在响应头到达前等待超过 `min(1500, max(1, floor(startupMs / 3)))` ms 时，取消该请求并最多重试一次；关闭或页面生命周期取消、HTTP／重定向错误、正文读取失败、资源大小或摘要错误不重试。每次请求仍不带凭据、禁止重定向，并受同一启动时限及资源校验约束；不会重建已启动 iframe 或重新执行算法。执行计时从授权开始，包含初始化与传输，不包含之后的动画回放。扩展还须分别限制输入、计算、输出和轨迹，在执行和生成轨迹时主动检查预算。父窗的计时器、摘要检查和 iframe 销毁是外层保护，不能从纯客户端摘要独立证明内部没有超量分配。

关闭、页面离开、所属阶段隐藏、配置变化及正文移除会释放预览与活动槽，终止旧会话；重新打开创建新会话。停止、重置、资源失败和迟到结果必须保持一致状态，不能让停止后的消息改成成功。缺失资源、404、错误摘要、超时、协议不兼容均保留可读静态正文与明确重试入口。

界面必须分别说明真实执行、预制回放、预计结果、主动停止、超预算中止和执行失败。超预算不能称为平台判题超时；动画耗时不计入算法耗时，实测运行时间也不代替复杂度证明。Worker 不是通用安全沙箱，扩展依然属于经过审核的受信程序；本接口不开放任意用户代码执行。

## 维护与验收

管理员从“设置 → MarkBridge → 扩展”查看只读状态、协议、最低版本、资源摘要与登记拒绝原因；旧工具页地址会转到该子页。运行预算见上表。诊断不展示本地绝对路径、正文或凭据，也不会自动安装、启用或修复扩展。作者只选择已登记且兼容的类型；组件失效时保持原配置和静态替代，不能静默删除。

独立扩展需要自己的许可证、锁定依赖、确定性构建、资源摘要、包文件清单和测试入口，不依赖主插件工作区外的私有目录。主插件 CI 使用仓库自己的通用协议夹具；具体算法正确性与 Worker 生命周期由扩展测试。联合验收还必须覆盖真实 WordPress 过滤、保存重开、修订恢复、文件来源、权限与冲突；不能用注册表 mock 或静态截图代替真实后台交互。

主题可调用 `MarkBridgeTeaching.revealTarget(target)`，监听 `mbb:teaching-change`；作者隐藏正文仍参与目录与段落身份，临时控件与结果使用 `data-mbb-generated` 排除。全文、打印、无脚本、手机、键盘与减少动画下题意仍可读，交互出错不能阻止继续阅读整篇文章。

> [工作原理](ARCHITECTURE.md) · [验证范围](VALIDATION.md) · [参与开发](../CONTRIBUTING.md)

## 作者界面扩展

2.2 的参数表单从当前服务器登记的精确类型／版本 schema 生成，只支持封闭对象、有限文本／数字／布尔／枚举与有界数组。未知字段或超出可编辑范围时保留全部 JSON，不静默丢值。字段校验为即时辅助，服务器仍是最终准入依据。

已安装的受信扩展可在依赖 `mbb-kernel` 的固定脚本中调用 `MarkBridgeComponentAuthors.register({apiVersion:1,component,componentVersion,Editor,supports,upgrade?})`。32 项上限，精确键不能覆盖。`Editor` 是受信 React 组件，收到候选参数 `value`、`onChange` 和会话状态；只能更新同一草稿。`upgrade` 可声明目标 `componentVersion` 和纯 `migrate`，仅作者明确点击后产生未应用候选，Apply 原子更新参数与版本，Discard 保留旧版。正文不能登记这些回调。读者播放、选中与作者撤销记录都不持久化；服务端登记、配对校验和保存锁不变。

## 显式 v2 活动关系与作者候选

`markbridge_teaching_supports_activities()` 探测活动能力。提供者在原协议登记中显式添加 `activityVersion:1`，最低主插件为 `2.8.0-dev.1`；旧主插件应只跳过新类型，不移除旧版本。v2 组件沿用原属性并要求 `activity`，Markdown 为 `:::mbb:v2 component`。旧 v1 省略该字段且不注册空默认值。

```json
{
  "schema": 1,
  "prompt": "question",
  "options": [
    { "key": "a", "target": "option-a" },
    { "key": "b", "target": "option-b" }
  ],
  "hints": ["hint-1"],
  "feedback": { "correct": "correct", "incorrect": "incorrect" },
  "explanation": "explanation"
}
```

闭合映射最多八个选项、三个提示；选项键为 1–16 位小写 ASCII 字母起始标识，目标为 1–64 位既有块 ID，全部目标唯一。目标必须是当前组件拥有的折叠部件，不穿过嵌套组件；题意与选项须是直接、`open:true` 的子部件。其他角色可有界嵌套。核心在两后端、原生和静态转换中始终校验结构；具体题型和答案规则仍由提供者校验。`markbridge_validate_component_params` 增加第五参数 `$activity`，原四参数回调兼容。参数或活动关系任一变化都触发准入，不能用参数相同跳过关系语义检查。缺提供者可编辑静态文字，原配置须保持。

受信作者登记 `apiVersion:2`，另提供 `validate(params,activity)` 和 `create({id})`。Editor 收到 `activity`、只读 `parts`（id/title/open/direct）与 `onActivityChange`，通过共享未应用候选一次 Apply 更新参数和关系；不直接保存文章。`MarkBridgeComponentAuthors.activityVersion` 为 1，原 `apiVersion` 能力仍为 1 以兼容旧脚本。`templates()` 返回受信类型/精确版本，`MBB.createActivity` 校验厂商模板；`MBB.copyActivity` 仅复制所选子树，重分配全局 DOM 锚点并映射其内部引用。code-tabs 的默认页签和 href 同步，代码字面量及外部引用保留。

主宿主在新 init 的 activity 中派生有界短标签和随机句柄，不发送可写富文本副本。`reveal-target` 只含 protocol/session/type/handle，验证当前 frame、会话、实例配置和准许目标；展开同实例必要祖先。ready 状态可持续思考；五秒只约束初始化和待授权，不限制阅读寿命。活动授权期间完成消息也同步检查两秒期限；关闭、隐藏、销毁、替换后的旧句柄失效。不会写分数、完成记录或第二正文。全部静态角色在无脚本、全文、打印与静态导出中可读，运行标记和临时作答不导出。

### 原生保存的 core 注释投影

WordPress REST 的块钩子可能把 JSON `1e-8` 写为 `1.0e-8`、把空对象投影为空数组。托管原生保存仅在唯一实例 ID、对应位置与祖先身份、完整组件子树的实际 core 投影精确一致，且预备内容已是 core 序列化定点时恢复浏览器原始组件开注释。所有资格比较先于替换；不恢复 HTML，也不覆盖真正属性、metadata、类型或结构变化。恢复后仍经原严格转换及权限／基线保存链。源码、CLI 和转换器 canonical 不变。

临时 core 投影工作串最多 1,500,000 B、10,000 个块、32 层；这不是可保存预算。作者源稿和最终配对仍各最多 256 KiB，接近上限的指数拼写膨胀仅在临时阶段容纳。

## 固定审核执行 profile（3.2.0-rc.5）

资源 v2 的默认行为保持拒绝 WASM／Worker。受信插件可先检查 `markbridge_teaching_supports_execution_profile('fixed-wasm/v1')`，再在 protocolVersion2 的登记上显式增加 `executionProfile: 'fixed-wasm/v1'`，最低 Main 不得早于3.2.0-rc.5。v1、未知／null profile、旧最低版本均拒绝登记；文章 attrs、参数、活动与源语法不新增执行权限字段。

该首版 profile 的固定清单必须恰有一项 `javascript`（固定 Worker JS）和一项 `webassembly`（`.wasm`）；其余仅可为已有 JSON／bin 数据。原16KiB清单、8项、单项1MiB、组2MiB、HTML512KiB、4MiB原始 LRU、startup5s／grant2s预算保持。PHP 与 JS 都按受信登记的 profile 验证类型／数量，默认 `.wasm` 仍拒绝。`markbridge_teaching_resource_bytes` 明确只允许 `json`／`public-data`，不返回 JS 或 WASM；静态出版不自动附运行程序。

只有该登记元组的 HTTP frame 响应 CSP 增加 `script-src` 的 `'wasm-unsafe-eval'` 和 `worker-src blob:`；不增加 `'unsafe-eval'`、`allow-same-origin`，不放宽父页面、编辑器或整站 CSP，connect-src 仍为none。固定引导与新增资源都由注册 pin 控制；Main 只提供这种受信固定载荷的运行环境，不能据此宣称任意 WASM／Worker 是安全沙箱。提供者仍须独立固定 Worker／模块预期 pin、输入／输出、imports 与内存，不能只相信父消息声称的摘要。

profile 出现在公开 provider 和 init 元数据中，并参与完整组件 identity、快照、CSP／桥代码指纹。HTTP body 的 Main 桥内嵌服务端登记 profile，不能由 init、query 或文章选择；桥只控制布局，不能替代提供者对资源交付的自验。最终 raw serve 再核对 body 与实际响应 headers，拒绝中途变化。

只有该 profile 的已 ready、当前 grant 的 `RUN_LIMIT`／`COMPILE_LIMIT` error 映射为 RUN_BUDGET／现有本实验预算文案，并释放 grant、保留 frame；提供者可先终止自己的 Worker 并保留先前结果。v1／默认v2 的同名任意 code 仍是普通执行失败。父级2s超时会销毁 frame，届时仅保证原静态解释可读；不承诺保留临时读者结果。迟到或不同 runId 的结果仍不采纳。
