# 教学扩展接口

本页描述 MarkBridge 2.6.0-rc.4 的 v1 组件合同。作者操作见[教学内容](TEACHING.md)。主插件保存教学结构、引用、参数和静态替代；算法、课程样例、Worker 与播放控制由独立受信插件提供。文章不能自行登记脚本或运行地址。

## 内容与提供者

`mbb/component` 的持久属性为 `version:1`、文章内稳定 `id`、`component`、`componentVersion` 和 `params`；其 InnerBlocks 是不依赖运行组件的静态题意与解释。Markdown 使用封闭的 `:::mbb:v1 component {...}` 容器。PHP 与 Node 都能独立于提供者转换该格式；是否允许新增或修改配置，由保存服务器的登记表决定。

配置不是第二份正文。配对保存、原生区块保存、修订与文件来源更新继续共用权限、指纹与事务链。保存前先验证完整历史配对，再判断配置是否保持原样；不能仅凭客户端声称存在旧配置而绕过登记校验。扩展停用时，已经核验的原配置可保留，静态替代可编辑；新配置或参数变化会拒绝。精确的已验证配对修订仍可恢复，不能借恢复许可接受任意修改。

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

每个提供者必须声明全部上述字段，未知字段拒绝。类型标识为 1–64 个小写 ASCII 字母、数字或连字符，以字母开头；最多登记 32 个精确类型／版本组合；同类型可同时登记多个不同版本，精确版本重复仍拒绝。首个登记是新插入的默认项，已有文章按类型和版本精确查找。组件版本为 `X.Y.Z`；协议当前为 `1`，最低主插件版本可为 `X.Y.Z` 或本地 `X.Y.Z-dev.N`。升级不自动改写文章的组件版本；扩展须先检测 `markbridge_teaching_supports_component_versions()` 存在且返回 true，才登记同类型的额外版本。旧主插件只登记原版本，避免占用类型导致旧文章失去提供者。

资源必须是插件目录内的固定本地 `.html` 或（2.0.3 起）`.html.txt`，URL 与其 WordPress 插件地址一致。登记检查真实路径、可读性、大小及固定 SHA-256；浏览器在加载前再次有界读取并核对摘要。资源不写入正文，不从参数取得地址，不下载或自动安装远端提供者。缺失、超限或摘要错误时显示静态替代，管理员可修复对应扩展后重新启动。

推荐构建时生成带内容摘要的 `.html.txt` 文件名，并让固定构建清单将逻辑 HTML 名映射到该文件。浏览器仍校验原始响应字节，再通过 `srcdoc` 加载 HTML；不会去除注入代码、归一化响应或放宽摘要检查。使用该格式的提供者须声明 `minMarkBridge: '2.0.3'`，其他 `.txt` 文件不被接受。

2.0 增加可选的布尔字段 `supportsUiLocale`，省略或 `false` 时维持原 v1 初始化字段。提供者明确设置 `true` 后，`init` 才增加 `uiLocale:'en_US'|'zh_CN'`，供扩展翻译固定界面文字；不能借此翻译算法、输入、作者静态正文或写回参数。未知语言回到英文。需要兼容旧主插件的扩展，应先检查 `function_exists('markbridge_teaching_supports_ui_locale')` 并调用能力探测，再添加此字段；旧版本仍会拒绝陌生登记字段。提供者自身维护目录和无译文回退，不共享主插件鉴权材料。

## 参数 schema 的受支持范围

这是一组封闭校验规则，不是完整 JSON Schema 实现。类型支持 `object`、`array`、`string`、`number`、`integer`、`boolean` 与 `null`，所有类型可声明非空 `enum`。对象必须声明 `properties`、`additionalProperties:false`，可声明 `required`；数组使用 `items`、`minItems`、`maxItems`；字符串使用 `minLength`、`maxLength`；数值使用 `minimum`、`maximum`。未知关键字、相反上下界、错误类型及不满足自身类型的枚举值拒绝。

参数根必须是 JSON 对象；对象与数组、空对象与空数组保持区别。总量最多 16 KiB、1,024 个节点、八层深度，拒绝危险属性名、无效 UTF-8 和非有限数。数值采用 JavaScript 有限双精度语义，精确的大整数应使用受 schema 约束的字符串。不要使用 JSON 编码文本是否相同来比较复合枚举，也不要依赖宿主 `serialize_precision` 截断数值。默认参数必须通过相同纯数据和 schema 校验。

作者的参数输入暂存在编辑器内存中；明确应用后更新区块，未应用或无效时阻止保存与导出，撤销恢复原配置。切换选区不能静默丢弃候选。应用仍不取代服务端 schema 校验。播放位置、读者输入与执行输出永不写回参数或正文。

## 隔离加载与消息协议

静态文章预览继续使用不允许脚本的沙箱。交互组件必须显式启动，运行在单独 `sandbox="allow-scripts"` 的无同源权限 iframe 中。主插件前置 CSP，禁止网络连接、表单、外部资源和基准 URL；只允许登记资源中的内联脚本／样式及 blob Worker。资源请求不带凭据、禁止重定向；运行 iframe 不取得编辑器 REST nonce、Cookie、私人正文或服务器执行接口。

每次启动生成新的会话标识。消息携带 `protocol:'mbb-component/v1'`、`session` 和 `type`，父窗同时检查消息来源是当前 iframe。opaque origin 下发送使用 `'*'`，不能省略来源与会话检查。扩展只接受来自父窗的消息，固定会话后拒绝其他会话；完成／停止还必须匹配本次 `runId`。扩展发往父窗的控制／摘要消息最多 8 KiB；`init` 的参数仍最多 16 KiB，含元数据的完整信封最多 20 KiB。

| 方向          | 类型               | 作用                                                                                              |
| ------------- | ------------------ | ------------------------------------------------------------------------------------------------- |
| 主插件 → 扩展 | `init`             | 公共参数、执行是否开放、类型与版本及实际预算；不含鉴权材料                                        |
| 扩展 → 主插件 | `ready`            | 初始化完成，解除启动计时                                                                          |
| 扩展 → 主插件 | `resize`           | 请求高度；主插件限制在 280–1,200 px                                                               |
| 扩展 → 主插件 | `run-request`      | 提交新的 32 位小写十六进制 `runId`，申请活动运行槽                                                |
| 主插件 → 扩展 | `grant`／`denied`  | 授权该 `runId`，或以 `BUSY`／`UNAVAILABLE` 拒绝                                                   |
| 扩展 → 主插件 | `complete`         | 同一 `runId` 的完成摘要，包含 `frameCount`、`outputBytes`；可含 `comparisons`、`moves`、`matches` |
| 扩展 → 主插件 | `error`／`stopped` | 初始化或运行失败，或同一运行明确停止                                                              |
| 主插件 → 扩展 | `cancel`           | 停止 Worker、播放、计时器与迟到更新                                                               |

必须先获得 `grant` 再创建实际 Worker；拒绝不是一次运行成功。完成摘要的轨迹帧数和输出字节数为非负安全整数且不得超过本次预算，计数也须为非负安全整数，参照匹配值为布尔。主插件不接收全轨迹；扩展在 iframe 内限制并保留轨迹。独立数组样例的 `outputBytes` 是完整结果 JSON 的 UTF-8 字节数，包含轨迹、最终数组与比较／移动计数，并非仅最终数组长度。计数名称不是统一复杂度模型，扩展必须解释每次操作的计数口径。

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

管理员从“工具 → MarkBridge 教学扩展”查看只读状态、协议、最低版本、预算与登记拒绝原因。诊断不展示本地绝对路径、正文或凭据，也不会自动安装、启用或修复扩展。作者只选择已登记且兼容的类型；组件失效时保持原配置和静态替代，不能静默删除。

独立扩展需要自己的许可证、锁定依赖、确定性构建、资源摘要、包文件清单和测试入口，不依赖主插件工作区外的私有目录。主插件 CI 使用仓库自己的通用协议夹具；具体算法正确性与 Worker 生命周期由扩展测试。联合验收还必须覆盖真实 WordPress 过滤、保存重开、修订恢复、文件来源、权限与冲突；不能用注册表 mock 或静态截图代替真实后台交互。

主题可调用 `MarkBridgeTeaching.revealTarget(target)`，监听 `mbb:teaching-change`；作者隐藏正文仍参与目录与段落身份，临时控件与结果使用 `data-mbb-generated` 排除。全文、打印、无脚本、手机、键盘与减少动画下题意仍可读，交互出错不能阻止继续阅读整篇文章。

> [工作原理](ARCHITECTURE.md) · [验证范围](VALIDATION.md) · [参与开发](../CONTRIBUTING.md)

## 作者界面扩展

2.2 的参数表单从当前服务器登记的精确类型／版本 schema 生成，只支持封闭对象、有限文本／数字／布尔／枚举与有界数组。未知字段或超出可编辑范围时保留全部 JSON，不静默丢值。字段校验为即时辅助，服务器仍是最终准入依据。

已安装的受信扩展可在依赖 `mbb-kernel` 的固定脚本中调用 `MarkBridgeComponentAuthors.register({apiVersion:1,component,componentVersion,Editor,supports,upgrade?})`。32 项上限，精确键不能覆盖。`Editor` 是受信 React 组件，收到候选参数 `value`、`onChange` 和会话状态；只能更新同一草稿。`upgrade` 可声明目标 `componentVersion` 和纯 `migrate`，仅作者明确点击后产生未应用候选，Apply 原子更新参数与版本，Discard 保留旧版。正文不能登记这些回调。读者播放、选中与作者撤销记录都不持久化；服务端登记、配对校验和保存锁不变。
