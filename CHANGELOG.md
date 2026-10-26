# Changelog

## 3.8.0-rc.1

- 新增受控 `knowledge-map/v1`：概念／阅读／练习节点，文章／阶段／活动目标，以及先了解、解释关系、配套练习三类固定关系；只有前置关系要求无环。
- 复用关系图桌面全图、手机分支、缩放与显式平移，静态替代沿用同一语义。服务端按当前身份、配对和阅读权限过滤节点及关联说明，导出最终重新核对。
- 修复目标全部可读时仍显示不可用提示的问题；实际缺少可读目标时继续保留中性说明。
- 扩展可通过公共 PHP API 解析文档目标、准备文集配置，或在文集页面提出候选；采用前重核，采用结果始终是新的未保存文集，取消保留当前输入和任务。

## 3.7.0

- 修复 WordPress 原生编辑器读取组件时把嵌套空对象改为数组而显示无效区块的问题；保留其他区块钩子和元数据，不改写文章或放宽保存校验。

- 文集可显式采用 schema 2：作者、版次、版本声明、前言／正文／附录角色与可选章节对象编号；schema 1 保持原样读写。
- 编号由服务器基于稳定对象 ID 一次派生，同步本地／跨章自动引用和对象元数据；作者自写链接文本、源正文及修订保持。前言、步骤与活动保留文章编号。
- 出版适配器可声明 collectionSchemas，旧适配器默认只接收 schema 1，新内置快照支持两种格式；元数据和角色均计入冻结摘要。
- 新编排沿用原有准备、静态预览、确认、下载前权限重核与取消流程。

## 3.6.0

- 作者可按用途选择组件，默认查看各类最新版本，历史精确版本按需加载；已保存的组件不自动升级。
- 当前文章可检查所用组件、缺失依赖及已登记的升级候选，沿用准备、应用与撤销流程。
- 管理员可按权限搜索组件使用文章并加入检查范围；查询分页且限制扫描量，翻页状态绑定当前用户和会话。
- 新增原生分栏与列的双向转换子集，保留百分比列宽、垂直对齐、移动端堆叠与内部内容；不支持的样式和属性明确拒绝。
- 为扩展提供用途与作者分组展示元数据接口，保留旧组件定义指纹；修复符号链接开发安装的中文翻译加载路径。

## 3.5.1

- 关系图相邻推荐节点使用短直箭头；分叉按源节点整理左右通道，短支线靠内、长支线靠外，减少交错和绕行。
- 相邻分组直接就近连接，长跨组关系继续绕开卡片；拐角圆滑，箭头按最后一段的实际方向绘制，多条入边的端口保持在卡片边缘内。
- 关系数据、文章链接、手机分支与全图切换、缩放和拖动沿用现有契约，不要求作者新增坐标配置。

## 3.5.0

- 新增可导航关系图：自动布局、多父与跨组关系、三类连线图例和原生文章链接；桌面显示全图，手机默认分支阅读，可切换全图平移、缩放与复位。
- 配合 Teaching Components 1.5.0，作者通过现有参数表单维护分组、稳定节点与关系标识，搜索选择托管文章；应用、取消、撤销／重做及预览沿用原配对保存链。
- 受控关系图 v2 在服务器核对目标身份、配对状态和当前权限，只交付可读节点与关系；无脚本、失败及静态导出保留安全替代，已准备导出在权限变化后重新核对。
- 保留关系图 v1 与所有旧组件精确版本；升级只准备显式候选，不从旧 URL 猜测目标，不放宽作者 HTML、SVG 或 iframe 导航权限。
- 包含下述未单独发行的 3.4.1 整组资源入口；v2 资源读取与 HTTP frame 导航共用最多 15 秒的网络准备期限，随后独立初始化。摘要累计 1 秒、交付 1.5 秒、提供者初始化最多 5 秒及实际执行最多 2 秒；原容量、权限和固定资源身份保持，取消与迟到响应不能刷新期限或复活预览。

## 3.4.1（未单独发行）

- 固定公开资源 v2 改用同源有界整组读取，减少冷启动串行请求；浏览器仍核对清单、每项长度与 SHA-256，整组通过后才写入原有 4 MiB 缓存。旧扩展载荷和文章引用不变，无 bundleUrl 的旧描述继续兼容。
- 将结构化交付的 1.5 秒从发送 init 前计至 ready；该准备方案未单独发行，3.5.0 进一步将有限网络准备与初始化分开。

## 3.4.0

- 修复 Prism 尚未加载或已包装代码时，代码页签初始化反复失败造成页面冻结的问题；语法高亮保留 CRLF 换行、原始代码、行号定位与复制。

- 原生分组支持有界嵌套与布局；代码和预格式化文本保持空白与区块身份，代码中的短代码、嵌入标记和网址按字面显示。
- 代码页签增加起始行号、高亮范围、稳定行链接和复制；组件参数与模板按任务分组，标量数组可逐项编辑。
- 增加轻量版本目录、分页选择和按需精确解析。保留旧登记 32 项上限，索引联合上限 256 个精确键；每篇仍最多 32 个精确版本，旧文章不自动升级。
- 保存、阅读、静态导出与多章出版共用定义和资源摘要校验；阅读仅加载当前文章依赖，迟到请求不能覆盖新选区或草稿。自测菜单只列已登记活动与作者模板的交集。
- 增加固定公开资源协议 v2 与隔离 HTTP frame；默认拒绝网络、Worker 和 WASM。经显式审核的固定 Worker／WASM 扩展可使用独立执行 profile，不能执行作者代码。
- 修复静态 SVG 命名空间及交互／静态重复显示；关闭交互、资源失败、无脚本和打印保留静态内容。
- 新安装默认 PHP 转换器；已验证的 Node 环境仍可选用，最低 Node 24.22.1。配对保存、修订、来源权限及既有精确资源保持。

## 3.4.0-rc.2

- 自测快捷菜单按轻量活动能力与作者模板求精确交集，排除普通回放及未登记版本；打开菜单不加载完整提供者，插入时才解析所选版本。
- 索引版本可声明 activityVersion:1，保存前校对工厂实际能力，保留旧扩展与有界目录预算。

## 3.4.0-rc.1

- 增加有界轻量组件版本索引与本地精确解析器；保留旧登记 32 上限及首次登记默认版本，已有文章不自动升级。
- 作者目录分页选择、按需取得参数描述；已有块直接解析原精确版本，迟到请求保留当前选区与草稿。
- 保存、阅读、静态投影、资源与多章出版共用定义 pin 校验、文章依赖及出版总预算；阅读只交付实际引用版本。
- 提供 40 版本 SDK 样例与新旧接口、定义变更、分页、缓存资源变化及多章投影回归。

## 3.2.0-rc.6

- 优化通用组件参数与模板区域的分组和操作层次；标量数组将输入与删除同行排列，保留候选、应用与撤销流程。
- 实时组件就绪时隐藏直接生成的静态投影，避免出现重复标题和未运行说明；关闭、失败、无脚本与打印仍保留静态投影和作者正文。

## 3.2.0-rc.5

- 新增显式固定审核 `fixed-wasm/v1` 执行 profile：仅 protocol2 受信登记的一份固定 Worker／WASM 在自己的 HTTP frame 获得必要 CSP，默认数据 profile、父页面与整站 CSP 保持。
- 绑定登记、布局桥、最终 raw headers、组件与快照身份；数据读取 API 继续拒绝执行资源。固定 profile 的当前运行预算中止可保留 frame，父级强制截止仍销毁。
- 补齐双 PHP／真实 REST 请求类与 HTTP Worker、严格父页、no-cors 网络、预算／迟到边界；参数表单仅增加 Dataset／Kind 中文显示。

## 3.2.0-rc.4

- 修复 PHP typed 静态投影在 HTML 中序列化为 `default:svg`、浏览器无法绘图的问题：逐节点接入已连接的父节点后再创建子节点，保留真实 SVG 命名空间、局部 ID、标题与说明引用。
- 保留单项／整篇输出预算及失败清空、原作者说明与旧纯文本投影；补齐双 PHP 与真实浏览器离线静态图回归。文章保存、转换、资源协议与 JavaScript 均保持。

## 3.2.0-rc.3

- 固定 frame 端点将真实 `WP_REST_Request` 未设置正文时的 null 与显式空串同视为空正文，继续拒绝非空正文；补齐真实核心请求类与单元模型的对应回归，避免 HTTP 与内部 REST 调用语义分歧。文章合同、JavaScript 与运行资源保持。

## 3.2.0-rc.2

- 修复资源 v2 模块与既有媒体导入全局函数重名导致完整插件入口无法加载；新内部助手统一使用 `mbb_component_resource_*`，旧媒体 API 保持。
- 构建与发行检查先扫描全部第一方 PHP 全局函数／类；CI 在安装候选前使用真实核心库加载完整插件入口，补足分模块模型未覆盖的集成边界。rc.1 的实际安装失败记录保留，未宣称可用。

## 3.2.0-rc.1

- 新增显式组件资源协议 v2：固定公开清单、JS／JSON／二进制数据 pin、有界加载与原始字节 LRU；运行时通过独立 HTTP opaque frame 接收 ArrayBuffer 副本。v1 srcdoc、文章参数与配对保存合同保持。
- frame 使用独立响应 CSP，默认拒绝网络、Worker 与 WASM；静态投影和文集快照绑定引导、数据组与 Main 桥／校验代码摘要，末次重新检查固定文件。
- 补齐代码字面量模块的直接 HTTP guard，并为扩展页的 CLI 请求方法提供默认值。

## 3.1.0-rc.2

- 修复 WordPress 前置嵌入处理仍会展开代码中的 `[embed]` 和独立 http(s) 网址；在嵌入前与区块渲染后保护代码文字，普通正文嵌入保持可用。保存源、原生区块合同及旧配对不变。

## 3.1.0-rc.1

- 新增基础原生 `core/group` 容器的 PHP／Node 双向转换，支持空组、嵌套、锚点及明确的布局子集。
- 新增原生 `core/code`／`core/preformatted` 纯文本转换，保留块身份、换行、制表符和空白；无法无损表达的富文本、样式或未知属性明确拒绝。
- 修复托管文章代码文本及语言页签派生配置中的字面短代码被 WordPress 执行的问题，保留正常段落短代码与保存源。
- 可选 Node 转换环境的最低版本对齐至 24.22.1，补齐 PHP／准备脚本的一致校验；新安装继续默认使用 PHP。
- 更新安装、日常编辑、代码展示和扩展维护文档，保留现有配对保存、修订、来源和冲突保护。

## 3.0.1

- 去除代码块自动插入的可见横向滚动提示，修复仅一侧溢出时的代码对照顶部错位。
- 保留溢出检测、键盘聚焦与方向键、默认联动横滚和 Prism；尊重作者已有的 ARIA 与 tabindex 属性。
- CI 官方 Action 改用 Node 24，运行器固定为 Ubuntu 24.04，保留既有版本矩阵、用例和发行／Wiki 保护。

## 3.0.0

- Release the reviewed 2.1–3.0 feature set: paired Markdown/block recovery and private backups, local drafts and three-way merge, source navigation, writing tools, Front Matter and bounded media import/export.
- Add logical identities, cross-article references, bibliography v2 with BibTeX/CSL snapshots, technical theorem/proof writing and native-media projections while retaining legacy articles and IDs.
- Add permission-checked collections and immutable publication snapshots, static HTML projections, MathML publication support and the independent Publisher web-book/EPUB integration.
- Provide the trusted extension/author SDK, bounded typed static projections, explicit component upgrades and independent Teaching, Scholarly, Publisher, Scientific and Mermaid providers.
- Include the reviewed reading refinements, verified teaching-frame sizing and localized controls. New installations default to PHP; administrators explicitly choose PHP or validated Node, and existing Node settings remain unchanged.
- Preserve exact component versions, immutable resource payloads and registered compatibility floors. Historical prerelease notes and validation limits remain documented.

## 3.0.0-rc.9

- Show proof bars as a single semibold localized number. Retain original title nodes, place descriptive titles at the start of the proof body, and omit duplicate default labels visually without changing source, anchors or reference numbering.
- Align activity hint, feedback and explanation spacing with the existing panel tokens. Keep normal closed controls limited to starting the activity; a complete static-reading entry is offered after an explicit resource, compatibility or budget failure. Native folding, full text, printing and no-script/static content remain readable.
- Clarify provider/type/version and maintenance paths in the teaching-extension guide; add an explicit fixed-Teacher reading integration profile without weakening the standalone CI suite.

## 3.0.0-rc.8

- Include the natural body box, padding and collapsed final margins when measuring verified component frames; retain shrinking, session validation and the 4096 px cap. Provider payloads and teaching parameters are unchanged.

## 3.0.0-rc.7

- Keep theorem and proof text upright in the article reading font; remove only the first/last edge gaps in quotes and component explanations.
- Default the optional formula reader to off while preserving explicit display preferences and normal formula typesetting.
- Replace failed reading images with original-image links without a proxy, retries or background fetch; remove reader-facing raw configuration from derived fallback views while preserving saved parameters and authored content.
- Present complete self-check questions/options together, automatically check radio choices through the existing grant, show only the current feedback, and reveal explanations explicitly; reset clears transient disclosures and failure retains a complete static reading path.
- Apply a fixed host reading layout only after resource verification, with current-window/session checked dynamic height up to 4096 px, native scroll chaining and unchanged opaque sandbox/CSP. Immutable component payloads are unchanged.
- Group the compatibility catalog by actual provider plugin, component type and exact version.

## 3.0.0-rc.6

- 修复 WebKit 中旧空预览导航偶发覆盖新内容：每次验证完成后以独立 iframe 交接，保留沙箱、来源与会话校验，并拒绝退役窗口的消息。
- Reuse the existing trusted teaching stylesheet in scriptless revision previews so internal parameter carriers stay hidden, preserving exact HTML, authored fallback, formula content and restoration payloads.

## 3.0.0-rc.5

- Strip bounded generated CHTML collapse bookkeeping on the pinned `mjx-msubsup` node as well as `mjx-math`, preserving subscript/superscript formulas in static HTML and publication clients.
- Keep authored attributes, other node types, invalid metadata syntax and over-budget values rejected; retain the candidate documentation alignment.

## 3.0.0-rc.4

- Align current candidate documentation and validation scope without changing application behavior or client assets.

## 3.0.0-rc.3

- Plan collection image resources separately from Markdown ZIP admission, supporting native images and galleries with local attachment IDs while preserving external-image links.
- Retain attachment ownership, current permissions, file/path/digest checks and unchanged ZIP/portable ZIP safety boundaries; do not alter saved source or media relationships.

## 3.0.0-rc.2

- Treat inherited JavaScript object method names as unknown display labels, preserving readable fallback for valid schema keys such as `toString` and all original parameter data.

## 3.0.0-rc.1

- Freeze the integrated paired-writing, references, bibliography, collection and trusted SDK candidate without adopting resource-v2/WASM research.
- Show registered component titles, readable field labels and one-based array items; retain exact configuration in closed advanced details and improve narrow numeric controls.
- Correct SDK sample bar groups to equal row spacing for sparse numeric x, preserving numerical line/scatter coordinates and the original params.
- Keep completion announcements available to assistive technology without repeating a visible result paragraph; wrap catalog resource digests.
- Align current user documentation, supported dependency floors and upgrade/downgrade guidance.

## 2.9.0-rc.6

- Keep component author callbacks live after same-value changes/consumption and repeated clicks on the active editor mode. Preserve explicit clean Apply/Discard session rotation.

## 2.9.0-rc.5

- Let trusted component authors retain bounded local table/CSV input in the existing in-memory candidate and Save lock, with explicit atomic preparation or discard. Preserve mode/remount drafts and reject obsolete tool sessions/baselines.

## 2.9.0-rc.4

- Accept `-rc.N` minimum-core declarations for trusted components and extension manifests, alongside existing stable and `-dev.N` floors. Keep PHP version comparison and plain exact component versions unchanged.

## 2.9.0-rc.3

- Add a queued, bounded Presentation MathML projection API using the existing MathJax 4.1.3 engine, without accepting authored MathML or requiring a server renderer.
- Bind exported formulas to validated engine nodes; retain generated-view markers for publication navigation filtering.
- Let trusted publication clients describe their download filename and concise format controls; keep the existing snapshot/final authorization chain.

## 2.9.0-rc.2

- Compare front-end derived views with a fresh persisted baseline, accounting only for WordPress’s authorized draft/pending preview date projection. Keep all other field, metadata, session and final permission checks.
- Add real core preview-date, mutation/revocation and password-form regressions; no provider resources or extension APIs change.

## 2.9.0-rc.1

- Add bounded generic author-tool registration and consolidated exact-version extension diagnostics with permission-scoped usage.
- Add trusted typed-tree static projections for default PHP reading, no-script single HTML and collection publication; retain canonical params and quiet legacy fallback.
- Guard all legacy/activity grants and terminal messages with monotonic deadlines, preserving ready reader interaction and immutable provider resources.
- Ship runnable SDK provider/conformance and a separate static bridge for the frozen chart research sample.

## 2.8.0-rc.8

- 原生托管保存仅在原始组件与预备组件的实际 core 投影完整一致时恢复原块注释字节，兼容小数指数写法与空对象投影；不恢复 HTML、真正配置或结构变化，不放宽转换器规范和最终 256 KiB 上限。
- 新增真实 core parser／serializer／KSES 的 PHP／Node 对照、嵌套、拒绝路径和临界大小回归；旧候选包保留。

## 2.8.0-rc.7

- 新增显式 v2 活动关系：题意、选项、分层提示、反馈和完整解释只保存在静态子块中；缺扩展时核心仍校验同实例关系，保留未变配置和普通正文编辑。旧 v1 不补字段、不自动升级。
- 作者规则与关系共用未应用候选，一次 Apply／原生撤销；文章内课程工作台支持插入、定位和带新身份复制，内部 DOM 锚点与对象引用分别映射，代码和外部引用意图保留。
- 读者仅获得当前会话准许的静态目标句柄；初始化与授权终态同步检查期限，ready 思考不设五秒寿命，关闭／销毁后的迟到消息失效。全文、静态 HTML 和打印保留完整题意与解释，不输出临时作答。
- 补齐中文网页书下载按钮翻译；原有内容、资源、运行与导出预算保持。

## 2.8.0-rc.6

- 静态 HTML 保留固定 MathJax CHTML 为操作符字形生成的 `mjx-c noic="true"`，使含 `\operatorname{KL}` 的公式标题与正文可完成离线导出。仅允许排版后该精确节点／值，不放行作者原始标记或任意同名属性。
- 增加真实数学配置、错误值／节点和保留合成快照的完整 Publisher 投影回归；不修改服务端出流或最终授权业务。

## 2.8.0-rc.5

- 文集流与作者端最终 JSON 授权在核心 CORS 头过滤器之后输出，避免带 Origin 的真实 REST 请求触发已发送正文后的 header 警告。
- 新鲜权限／会话／数据核验仍在实际输出前；增加同一 filter 链顺序模型与真实 Origin 保存测试入口。

## 2.8.0-rc.4

- 文集支持受信作者端导出适配器：不消费的输入流、静态预览及绑定快照／精确代码资源／产物摘要的最终下载授权。
- 授权在真实 JSON 输出前、消费 CAS 后再次复核会话、权限、文章、资源和外部公开目标；不上传 HTML，不更改文章配对。
- 静态表格保留安全的 headers／scope，供整本标识关联重写；已有单章及集合预算保持。

## 2.8.0-rc.3

- 修正真实文集测试的标题变动夹具：通过现有 preview／配对 save 及其票据修改与恢复标题，先确认实际变动再断言旧快照失效。此前裸 wp_update_post 被配对 guard 拒绝，不能作为失效证据；产品保护与断言未放宽。rc.2 包保持不变。

## 2.8.0-rc.2

- 文集正式候选前补核 Companion 系列导入的全部章节末尾权限与数据指纹，阻断后章转换期间前章失权仍返回配置候选；模型覆盖原排序、空系列、禁用与候选上限。rc.1 固定包保留，未交付安装或标记实际验收通过。

## 2.8.0-rc.1

- 新增作者文集引用配置、Companion 系列一次导入与闭合不可变快照；配置不复制正文。
- 逐篇编辑权限和会话、数据、资源、渲染器指纹保护 prepare/confirm/流式 download；限定引用范围，未选私人目标不进入输出。
- 私有有界槽、惰性回收和受信出版适配器 v1；本期 ZIP 是快照接口，尚不是完整网站或打印排版。

## 2.7.0-rc.7

- 文献 v2 增加显式可选的来源版本声明，双后端使用同一内容摘要规范；旧文献不补空字段，删除与引用键重命名同步处理来源。
- 为独立 Scholarly Tools 提供当前未应用文献候选入口；库版本与 DOI 查询不会旁路正文保存，来源失配保留文章快照并提示本地修改。

## 2.7.0-rc.6

- 文献 v2 的稳定键必须为字符串，拒绝 JavaScript 正则曾隐式接受的数组／布尔值；补充原始条目及显式 CSL 键映射的双后端负夹具。
- 统一受限 CSL 安全整数的十进制文本及负零规范，避免 PHP 科学计数法与 Node 的键映射／卷期页不一致；不扩大允许类型。
- 修正真实保存测试夹具的原生区块边界换行、历史恢复票据及现有来源同步入口；未放宽产品的往返或资源保护。

## 2.7.0-rc.5

- 收敛新文献 v2 的 HTTP(S) URL authority、IPv4／IPv6 与端口校验，PHP／Node 使用同一有界规则；保留原始 URL，不进行 DNS／IDNA 改写或网络请求。旧 v1 原文及历史不变，不能安全升级的 URL 明确拒绝候选。

## 2.7.0-rc.4

- 新增闭合文献 v2：有界类型、明确人名／机构、出版日期、刊物、卷期页、DOI／URL／标识符；原 v1 六字段和引用标记保持，升级只生成显式候选。
- CSL-JSON 采用有限子集，预览字段损失与键映射，明确确认后进入共享文献候选；重复键、已引用键删除和旧预览均拒绝，支持子集导出。无联网查询、资料库或完整 CSL 引擎。
- 作者—年份与数字两种固定样式复用前台／预览／静态 HTML 渲染，完整字段参与正常双格式、原生、修订与来源保存链。

## 2.7.0-rc.3

- 批量确认资源 ZIP 时转交同次预览的 FrontMatter 收据，使未采纳的元数据提案也保持资源绑定一致；不自动采纳发布提案。
- 收紧手机工具栏说明文字的隐藏规则，保留嵌套引用选择器的目标／文章名称。
- 逻辑身份复制映射默认折叠，先说明文章数量、批内引用指向与批外引用保留；完整 ID 可展开并在面板内横向滚动。

## 2.7.0-rc.2

- 修复迁移新文章遇到已占用逻辑身份时，在确认事务及来源／媒体补偿成功后返回明确的 409 冲突；回滚不确定或补偿失败仍保留更强错误。原生保存同样保留引用校验错误，不将其泛化为 500。

## 2.7.0-rc.1

- 新增正文可携带的闭合逻辑身份与 v2 跨文档引用，双转换后端和原生区块共用格式，旧 ID 与同篇引用保持。
- 显式启用、复制、迁移、冲突修复与启用前历史候选均经正常差异确认；唯一占用、正文和派生索引共用事务。
- 新增实时鉴权解析、搜索、入链／改名影响检查及固定授权导出；前台缓存 HTML 保持中性。
- 索引初始化和有界重建纳入现有 MarkBridge 设置分组；不迁移核心表引擎、不安排 cron。
- 内容导航优先显示标题，稳定 ID 作为次级标识。此为隔离开发候选，未公开发行或部署生产。

## 2.6.0-rc.4

- 为原生样板瞬态入口补齐 PHP 类型登记，使托管文章由服务端类型生成的允许列表可接受插入；显式作者允许列表与禁用策略保持，转换器仍拒绝未展开的瞬态块。

## 2.6.0-rc.3

- 修复服务端恢复候选自身变更通知导致后续比较失败；保留请求期间编辑／会话取消保护，关闭后可再次恢复。
- 教学样板使用同一 JSON 实例化为折叠问题、提示、推导与实验，分配独立稳定 ID、嵌套公式和内部引用；原生空占位段落由样板替换。
- 补齐新增导航与粘贴预览的分组、间距、滚动源码和触摸控件样式，导航可定位编辑器 iframe 内嵌套对象。

## 2.6.0-rc.2

- 修复独立 CLI／模型加载时尚无 WordPress 数据库类导致的致命错误；真实 WordPress 备份行为保持。

## 2.6.0-rc.1

- 服务端私有配对备份、明确恢复与当前版本比较；备份不保存正文或写来源文件。每账号／文章最多 10 份、7 天，全站 32 MiB；编辑请求惰性清理，无新增定时任务。
- 统一内容导航、分级保存前检查与稳定标签重命名预检；技术教程／论文笔记／教学样板采用原生入口与受管 Markdown 同源内容。
- 仅对明确完整的独立公式、封闭代码围栏和多行列表提供粘贴预览，保留价格、转义及代码原义，插入可单次撤销。
- 对齐候选文档、版本与本地化；实际验证范围仍见验证说明。

## 2.5.0-rc.2 — 2026-10-17（隔离候选）

- 📖 技术正文采用学术衬线层次、真实字体斜体与证明结束标记；读者引用改为作者／年份及 a/b 消歧，保留稳定键和原段落身份。
- 🧩 Mermaid 阅读图在接近视口时自动启动，支持轻量收起、离屏卸载及高度保留；编辑预览和算法仍明确手动启动，原沙箱与资源预算不变。
- 🌿 独立 Mermaid 0.2.0-rc.1 并存旧 0.1.0 与新 0.2.0 组件；新增有界子图、形状、箭头、曲线及固定配色／字体，旧语法不静默扩展。
- 📄 静态 HTML 准备后显示真实只读阅读预览，最终下载仍重校验和重建；符合条件的外站图片转链接且不抓取，同站不可核验图片仍拒绝。
- 💻 静态代码增加本地有界高亮、代码外行号与长行滚动，表格和打印改善；图片与画廊共用下置图注样式，不覆盖或截断说明。

## 2.5.0-rc.1 — 2026-10-17（隔离候选）

- ♿ 公式阅读器增加有限中文结构读法和子表达式键盘探索；未覆盖时明确保留英文语义，阅读状态不回写文章。
- 📚 支持受限 BibTeX 粘贴／上传、六字段映射预览及明确合并／替换，保护已引用键和未应用草稿。
- 🖼️ 新增明确的跨站图片 ZIP：解除旧站附件 ID，导入时创建新本地附件关系；保留原稿与既有导出方式。
- 🩹 修复跨站副本中的行内／HTML图片投影与双端规范化；公式失败占位沿用界面语言，通用组件完成提示不再假定存在回放轨迹。
- 🧩 增加独立 Mermaid 扩展接入说明与真实示例检查；官方流程图／时序图受限渲染由可选扩展提供，主插件沙箱及资源上限不变。

## 2.4.0-rc.1 — 2026-10-16（隔离候选）

- 🖼️ 支持有界的原生图片图注和简单画廊双向编辑；附件权限和URL在保存时复核，不能表达的媒体链接、样式、布局及原生外置脚注明确拒绝。
- 📥 增加多文稿扫描和逐篇预览、确认创建草稿；支持重复提醒、媒体公开确认、部分成功、重新鉴权恢复与保守的中断处理，不覆盖或自动发布旧文章。
- 📄 增加已保存配对的静态HTML导出：完整阶段、折叠、代码语言、引用、内嵌图片、公式字体及打印样式；不携带站点身份、评论、私人笔记或组件执行权限。
- 🔒 为整批上传、解压、图像处理及私有暂存建立预算；失败项也计处理量。不确定的保存结果保留核验依据，禁止盲目重复创建。

## 2.3.0-rc.1 — 2026-10-16（隔离候选）

- 📖 新增公式、图表、代码清单的稳定标签与派生编号，交叉引用支持重命名预检及隐藏内容跳转。
- 📝 新增可引用的定义、定理、证明和有界参考文献，文献引用按首次阅读顺序编号；作者数据与显示编号分开保存。
- ♿ 补充 MathJax 英文语义在隔离预览与公式阅读器中的保真、键盘及焦点回归。未声明真实屏幕阅读器或中文语音验收。

## 2.2.0-rc.1 — 2026-10-16（隔离候选）

- 📝 新增长文搜索、保留未触及换行的替换、撤销、源码／预览双向定位和可选并排视图。
- 🧩 受信组件以表单或 JSON 编辑同一候选；支持精确版本并存和明确应用的版本升级。
- 🧭 提供教学结构插入样例及独立节点图作者编辑接口；图示实现仍由扩展提供。

## 2.1.0-rc.1 — 2026-10-16

- 🎨 集中正文样式接口，供独立主题适配公式、代码、引用与教学控件。
- 🩺 区分教学资源与公式故障阶段；管理员可明确复制不含正文、地址或凭据的诊断摘要，公式失败可单独重试。
- 🧪 增加跨浏览器代表路径、主题合同和可选性能测量；具体实际运行范围见验证文档。

## 2.0.3 — 2026-10-16

- 🧩 允许受信组件使用固定 `.html.txt` 资源，避免 HTML 传输层注入导致摘要校验失败；保留 `.html` 兼容、原始字节 SHA-256、路径、URL 与大小限制。

## 2.0.2 — 2026-10-15

- 🧭 细化悬浮阶段导航间距与阴影，修复代码页签行号与主题样式覆盖。
- 💻 保留重复高亮时的差异标记，让连续差异底色覆盖长行，并默认联动横向滚动。
- 🧩 交互预览采用展开／收起入口，正常就绪与关闭后不保留状态段落。

版本按时间倒序排列。具体发行版本与安装包以 [GitHub Releases](https://github.com/wzf2000/MarkBridge/releases) 为准。

## 2.0.1 — 2026-10-15

- 🧭 阶段导航到达视口顶部后在所属阶段组内吸附，避让 WordPress 管理栏及主题标记的固定顶栏；按实际控件高度为阶段切换和深链接留白，并提供通用主题偏移与背景变量。
- 📱 修复手机英文模式按钮的换行，保留阶段选择与前后导航；全文、打印和无脚本场景继续完整阅读。
- 📚 更新教学手册与主题接入说明。折叠未指定展开状态时关闭、作者显式 `open:true` 展开的既有行为保持。

## 2.0.0 — 2026-10-14

- 📚 新增折叠内容、单篇阶段阅读、左右代码对照和多语言代码页签；支持稳定标识、键盘、深链接与原码复制，全文、打印和无脚本场景保留完整静态正文。代码仅展示，不开放任意代码执行。
- 🧩 提供受信教学组件 v1 接口：严格参数、固定本地资源与摘要、隔离 iframe／Worker、输入与执行预算、取消和迟到消息保护、静态替代及管理员诊断。独立扩展提供具体算法和回放；首次资源请求无响应时可在原启动时限内恢复一次，不自动重复执行算法。
- 💾 增加默认关闭的浏览器草稿恢复；作者明确启用后才保存有界本机候选，按账号、文章、来源与标签页隔离，重新鉴权并检查差异后恢复。成功保存只清理匹配记录，保留继续输入；记录未加密，不代替服务器保存或备份。
- 📝 支持版本化 Front Matter 元数据提案；标题、摘要、slug、状态、已有分类／标签与特色图片须逐项选择、预览后确认。升级、原生保存和历史恢复不自动应用提案，不创建分类或绕过发布权限。
- 🖼️ 支持 Markdown 与本地位图的 ZIP 导入：私有暂存、路径／类型／容量校验、预览不创建附件，明确接受媒体 URL 公开提示后协调图片和双格式保存。不下载外部 URL；文件来源图片仍由原来源维护。
- 📤 增加已保存 Markdown／图片 ZIP 导出；保留原文与头部，附经过验证的关联图片和便携清单，下载前重查权限、版本与摘要。不包含未保存输入、私人记录、修订、凭据或服务器源文件绑定，不是整站备份。
- 🔀 增加基于签名打开基线的三方合并；独立修改可组合，重叠正文和标题／状态／封面须明确选择。采用结果只准备候选，仍须重新预览与保存；基线缺失、过期、来源不同或超预算时保留手动比较与下载。
- 🧱 支持原生详情、按钮组内链接按钮，以及受信静态叶子适配；保留核心区块身份，限定属性与安全模板，参数须明确应用。缺扩展保留静态内容与配置，不能核验时拒绝转换，不把任意第三方区块视为兼容。
- 🌐 提供中英文界面与诊断；后台遵循用户语言、前台遵循站点语言，正文、代码、TeX 与旧配对不随语言变化。PHP／Node 两引擎同步维护新增转换与保存合同，升级保留已有后端，不静默切换。
- 🎛️ 改进作者工具栏、预览与修订窗口、手机表单、长代码滚动和阶段导航；修复迟到读取覆盖新输入、工具页新文档预览、修订预览失败仍可确认及教学组件冷启动等问题，保持权限、冲突、来源写回和配对修订保护。
- 📦 主安装包保持通用、可重复构建与精确文件清单，ZIP 强制小于 10,000,000 字节。GitHub 稳定更新器为独立、默认关闭的可选插件；WordPress.org 尚未提交或批准，GitHub 发行与生产部署独立。安装条件、验证方法与限制见[安装与升级](docs/INSTALL.md)、[教学内容](docs/TEACHING.md)和[验证说明](docs/VALIDATION.md)。

## 2.0.0-rc.8 — 教学组件冷启动恢复，未发行

- 首次资源请求未及时返回响应头时，在原有共享启动时限内取消并自动补一次请求，减少手动重试。已收到响应、HTTP 失败、重定向、摘要错误和超限不自动重试。
- 关闭、阶段隐藏、配置变化和超时仍终止加载；迟到 iframe 加载回调不能初始化或干扰新会话。
- 保留 5 秒启动／资源读取、2 秒实际执行及原有容量、来源、摘要、沙箱和静态回退边界，不自动重复运行算法。

## 2.0.0-rc.7 — 控件与界面细节优化，未发行

- 统一后台弹窗与工具栏的按钮、焦点、禁用状态和文件选择样式，收紧常用设置分组。
- 历史版本窗口在完成预览前保持紧凑；切换版本收起旧预览，渲染失败时禁止确认恢复。
- 压缩手机代码标题的多余留白，阶段阅读与折叠控件采用更合适的触摸尺寸。
- 调整下拉菜单箭头的内缩与垂直居中，为选项文字保留间距，兼容从右到左及系统高对比度显示。

## 2.0.0-rc.6（未发行）

- 修复从工具页新建 Markdown 时误读不存在的区块编辑器状态，预览与明确保存不再因此中断。
- 收紧代码对照标题样式，避免手机横向滚动提示继承标题高度和留白。
- 窄屏侧栏遮挡工具栏时单独保留草稿恢复入口；恢复授权异常仍明确显示。

## 2.0.0-rc.5 — 阅读与常用后台界面改进，未发行

- 收紧手机编辑工具栏，次要操作归入“更多”，保留保存说明；无候选时收起草稿恢复提示。
- Markdown 窗口固定操作与状态区域，区分源码／差异和正文预览；空元数据提案默认收起，预览沙箱和保存校验保持。
- 长代码提供溢出提示和键盘滚动，手机代码对照支持联动横向查看；提高注释和行号可读性。
- 网页全文阅读保留当前语言页签；无脚本与打印继续完整展示所有代码版本。
- 教学演示区分执行结果和当前回放状态，调整手机图表、代码和详细说明布局。
- 常规设置优先展示常用选项，按需展开 Node 目录与诊断；整理手机阶段状态与导航。

## 2.0.0-rc.4 — 手机设置表单兼容修正，未发行

- 解除 WordPress 转换设置 fieldset 的最小内容宽度，确保 Node 路径输入和整个设置页在手机宽度内正常换行。

## 2.0.0-rc.3 — 代码面板主题兼容修正，未发行

- 补齐设置页的响应式导航、长文本换行与表单宽度，修复手机诊断表格横向溢出。
- 修正 Prism 包装代码块后，语言页签面板底色、间距和标题为空时的复制按钮留白未生效；并列对照与代码页签使用统一浅灰代码面板。

## 2.0.0-rc.2 — 阅读界面审阅改进，未发行

- 调整阶段导航、进度与模式切换，折叠提示使用展开方向箭头。
- 多语言代码页签仅显示语言，实现说明移至代码面板标题；简化为右上角复制，去掉前台下载和显示全部按钮，保留全文／打印／无脚本完整阅读。
- 代码对照使用轻量工具栏；补齐整段语法高亮，保留逐行差异、作者重点和原码复制。
- 设置入口统一为 MarkBridge 子页签，可选更新器仍由独立插件提供；旧直接入口和多站点网络权限保留。
- 独立教学扩展调整输入、执行与播放布局；算法、预算、协议和保存格式不变。

## 2.0.0-rc.1 — 通用作者工作流候选，未发行

- 增加默认关闭的浏览器草稿恢复：有界本地记录、账号／文章／来源与标签页隔离，重新鉴权后显式预览与恢复；认证过期、旧基线和继续输入保留候选。普通新文章的原生保存保持原流程，成功后仅清匹配记录。

已按顺序完成本地草稿恢复、Front Matter、图片导入、多语言代码页签、文章导出、三方合并、区块适配、本地化与发行渠道代码准备；本地及隔离验收不代表生产部署、公开发行或插件市场批准。

- Front Matter 使用显式版本头和单行 JSON，完整保留原头部；预览逐项选择后才应用标题、摘要、slug、状态、已有分类／标签和特色图片。元数据、正文和来源写回共用现有权限、版本保护及失败回退；原生保存与历史恢复不自动应用头部提案。
- 修复手机新文章导入入口被核心工具栏遮挡，以及头部移除后公式错误报告不可信行号的问题。

- 新增可选资源 ZIP 图片导入：受鉴权的私有暂存、路径／格式／容量校验、预览不创建附件，明确确认后通过 WordPress 媒体 API 上传并协调双格式保存。失败仅清理本次可证明属于失败事务的资源，提交不确定保留审阅日志；不下载任意 URL，不改变既有媒体或来源映射。
- 修复真实 WordPress 图片上传参数兼容，以及保存响应后切换编辑对象可能受到迟到本地恢复清理影响的问题。

- 新增多语言代码页签：有界版本、稳定标识、默认项、顺序和逐字代码；读者切换、键盘、深链接、独立复制与原字节下载，全文／打印／无脚本完整可读。PHP／Node 沿已有配对、修订、来源和权限链同步维护，不执行代码。
- 修复未编辑上传／读取原文的换行保真、组合 HTML 保护，以及迟到恢复或文件读取覆盖新输入／重开候选的边界。

- 新增只读的已保存 Markdown／图片 ZIP 导出：原字节文稿、经过验证的直属本地图片及便携清单，确认前重查权限、配对、版本与资源摘要。ZIP 可从资源入口重新导入；不读取绑定源文件，不携带私有记录，不自动应用元数据。
- 修复工具栏换行时遮挡浏览器恢复面板的问题，并保留桌面顶部导入按钮与手机底部按钮的位置差异。

- 新增会话内三方合并：服务端签名打开基线与最新版，有界保留原始换行的候选比较，重叠正文和元数据明确选择；采用仅准备候选，仍须重新预览与保存。缺少可信基线、来源不同、过期或超预算时保留手动比较和下载。
- 修复旧预览／保存失败返回后可能锁住新输入，以及来源重读后沿用旧签名基线的问题；成功保存响应后的清理失败也保留已保存事实与后续未保存输入。

- 新增原生详情、链接按钮组／按钮的双向转换，保留核心区块身份；不支持的分组、样式和属性明确拒绝。新增受信静态叶子登记、必填参数、安全模板与缺包保内容，沿用配对、修订、权限和来源保存链。
- 静态登记摘要与预览／版本指纹绑定，解析、渲染和提交前变化拒绝；修复孤 CR 下原生容器后的真实图片投影，保留头部与静态文字。

- 新增中英文界面与诊断目录：后台采用用户语言、前台采用站点语言，稳定脚本翻译及独立隔离组件语言能力；正文、代码、TeX、作者标题和旧配对不随语言变化。翻译检查保留 HTML 属性、占位符和错误码，未知诊断安全回退。

- 准备同一通用主包的目录提交材料，裁减 CHTML 所需运行资源并保留许可／可读模块；安装包、发行校验和发布 job 强制 ZIP 小于 10,000,000 字节。源码附件单独生成，保护路径与同版本内容身份。
- GitHub 稳定版更新通过独立、默认关闭的可选更新器提供，不进入主插件包；固定仓库、受限流式下载、逐文件与清单核验后交给 WordPress 核心升级。未提交插件市场或公开发行，静态检查仍需人工审阅。
- 修复代码展示加载器缺少翻译函数、原生公式检查漏译及缺少 mbstring 时界面诊断启动的问题；直接 Web 访问保护兼容独立 CLI 转换。完整验证和限制见[验证说明](docs/VALIDATION.md)。

## 1.9.0-rc.1 — 本地综合候选，未发行

以下汇总 1.5.0 至 1.9.0 的连续开发阶段，最终候选供统一审阅；没有对应正式 Release，也未部署生产。验证方法和范围见[验证说明](docs/VALIDATION.md)。

- **1.5.0：组织教学正文。** 新增有标题、稳定标识和默认展开状态的折叠内容，以及单篇文章的阶段阅读；支持全文、深链接、浏览器返回、键盘与打印。新增独立正文代码对照，两份原代码、语言、标题、重点行与解释分别保存；差异展示与复制保留原空白。
- **1.6.0：接入受信教学组件。** 主插件提供版本化纯数据外壳、严格参数校验和静态替代；具体算法和资源属于独立扩展。交互预览显式启动，在无同源权限的 iframe 中运行；缺包、版本不兼容或资源失败保留配置与静态正文。
- **1.7.0：固定算法受控运行。** 独立数组样例提供回放、播放／暂停、单步／后退、重置、速度与代码位置联动；允许限定输入的固定 JavaScript 实现执行，展示参照结果与计数，分别限制输入、时间、输出及轨迹，不开放任意代码执行。
- **1.8.0：生命周期与降级。** 补齐取消、迟到消息、销毁／重建、资源失败与重试、共享活动预算、键盘和减少动画；修复真实 WordPress 区块前导换行导致前台增强遗漏，以及编辑画布中交互预览入口缺失。纯 JSON 对象、数组和字面文本经过保存过滤仍保持类型与精度。
- **1.9.0：扩展契约与维护。** 固化兼容版本、协议、最低主插件版本、参数 schema、固定本地资源摘要与预算声明；新增管理员只读诊断、扩展 SDK 文档及独立包验证。主插件 CI 使用自己的通用夹具，具体算法测试由独立扩展维护。

教学区块沿用 PHP／Node 双向转换、双格式保存、权限、来源绑定、版本冲突与配对修订；读者输入、播放进度和输出不回写文章。每种正文仍最多 256 KiB。使用方式见[教学内容](docs/TEACHING.md)。

## 1.4.0 — 2026-10-13

- PHP／Node 转换错误提供原文行、区块路径或属性定位与处理建议；无法确定位置时不推断，不包含正文片段或服务器路径。
- 托管编辑器增加“转换支持与当前内容”提示及当前区块检查；不支持的区块保持原样，保存仍经过服务器权限、指纹和双格式校验。
- 代码高亮、复制、表情和脚注展示资源按正文、评论或后来插入的内容加载；保留代码行号与复制显示偏好。
- CI 在固定 WordPress 7.1.3 合成数据库中安装最终 ZIP，验证 PHP／Node 原生 REST 保存链与真实核心浏览器用例，并拒绝跳过或重试掩盖失败。PHP 8.2／8.3／8.4／8.5 的转换契约矩阵保留。

## 1.3.0

- 📦 新安装默认使用随包附带的 PHP 双向转换器，受支持内容无需 Node、Composer、Linux 沙箱或子进程。已有非空 Node 运行配置升级后继续使用原后端，切换须由管理员显式配置，失败不会自动改用另一引擎。
- 🔒 Markdown 导入、原生区块保存、配对修订恢复、受信来源写回和 CLI 共用转换接口；第三方 PHP 依赖与类加载隔离并核对构建摘要，缺依赖、内容不兼容或超限时拒绝写入。原有权限、内容过滤、双端冲突与双格式保存保护继续生效。
- 🛠️ 新增统一管理员概览、开始写作与帮助入口，以及插件列表的设置、文档和反馈链接。源码字号可选 14／16／18 px；公式阅读工具、代码行号与复制按钮默认开启。关闭阅读工具保留排版与编辑预览，关闭代码工具保留高亮和语言标签；新增 PHP／Node 转换方案，目标引擎通过服务端完整诊断后原子保存，失败保持原设置；常量后端锁定选择，常量路径只管理 Node 目录，旧接口留在兼容／高级区域，图片包管理继续复用。
- 🧮 修复 WordPress 配置标量类型转换导致已保存字号和公式阅读开关未生效的问题；显示设置不改变正文、修订、来源绑定或转换后端。
- 🔧 补齐合法历史配对的有限兼容，保留固定旧实体表示、已包装公式、列表代码空白及区块属性转义；未编辑快照严格核验后原样保留，实际编辑仍须独立反转与重建。HTML 解析前稳定拒绝裸小于号，避免 libxml 版本差异静默修补；正常 Markdown 比较公式、代码、合法实体和引号内属性继续支持。
- ✅ 候选准入已通过 PHP 8.2／8.3／8.4／8.5 的合成 CI、桌面／手机完整 108 项浏览器检查及 WordPress 7.1.3 隔离安装、设置、保存链和升级／回退验收。公共 CI 浏览器为 50 项通过、58 项明确跳过，完整矩阵来自匹配核心资源的本地环境；方法与边界见[验证说明](docs/VALIDATION.md)。新增双引擎选择器已通过 PHP 8.2／8.5 的目标契约及 WordPress 7.1.3 实际浏览器 18 项切换／保存／拒绝场景；禁用进程执行时 PHP 保存通过、Node 切换拒绝。新的干净安装包构建与清单检查通过；正式附件的来源、摘要和完整性由发行流程独立核验，既有候选包不覆盖。
- 📏 当前 PHP 支持范围为 WordPress 7.1.x、PHP 8.2+、DOM／mbstring；原文、规范原文和区块分别最多 256 KiB，节点最多 10,000、深度最多 32。危险 URL、重复 HTML 属性、不支持的结构及部分 raw HTML 公式明确拒绝，不承诺任意第三方区块、历史修订或宿主组合兼容，详见[安装与升级](docs/INSTALL.md)和[服务器配置](docs/RUNTIME.md)。

## 1.3.0-rc.4 — 2026-10-09

- 公式脚本配置改用保留布尔值的 JSON，修复 WordPress 本地化把关闭值转换为空字符串后阅读工具仍开启的问题；不关闭公式排版与编辑预览。
- 前台浏览器夹具直接使用同一 PHP 配置生成函数，避免手写配置掩盖序列化问题。
- 仍为内部候选，保留前一候选包，不执行全局后端切换或公开发行。

## 1.3.0-rc.3 — 2026-10-09

- 修复实际 WordPress 将前端配置标量转换为字符串后，已保存的 Markdown 字号未生效；按限定枚举读取数值，保留默认行为与内容保护。
- 浏览器夹具采用真实本地化类型，防止数值模拟掩盖实际问题；保留 rc.2 冻结包与失败记录，不覆盖同版本产物。
- 仍为内部候选，未执行生产插件更新、全局后端切换或公开发行。

## 1.3.0-rc.2 — 2026-10-09

- 新增管理员设置概览及插件列表的设置、文档、反馈入口，补齐作者与项目主页信息。
- 可调整 Markdown 源码字号、前台公式阅读工具、代码行号和复制按钮；默认保持原显示，关闭阅读工具仍正常排版公式，关闭代码工具仍保留高亮与语言标签。
- 旧运行目录移入兼容／高级区域，保留现有后端选择、常量优先级与图片资源管理；显示设置不改写正文或改变保存保护。
- PHP 转换在 DOM 解析前明确校验 HTML 中的裸小于号，避免 libxml 版本差异静默修补；普通 Markdown 比较公式、代码、合法实体及引号内属性继续支持。
- 增加设置权限、nonce、参数校验、持久化与实际展示回归，并接入 CI。本版仍为内部候选，未执行全局后端切换或公开发行。

## 1.3.0-rc.1 — 2026-10-08

- 新安装使用随包附带的 PHP 双向转换器，受支持内容无需 Node、Linux 沙箱或子进程；已有非空 Node 运行配置升级后保留原后端。
- 统一 Markdown 导入、可视化保存、配对修订、服务器来源写回和 CLI 的转换接口；缺依赖、内容不兼容或超限时明确拒绝，不自动切换引擎。
- 隔离第三方 PHP 依赖与类加载，校验构建摘要；PHP 8.2+、DOM／mbstring 与 WordPress 7.1.x 为当前限定范围。
- 保留完整历史配对快照，适配固定旧文本实体表示、已有公式标记、列表代码空白与属性转义；实际编辑继续独立反转和重建，不放宽客户端快照准入。
- 原文、规范原文及区块分别限制 256 KiB，节点最多 10,000、深度最多 32；危险链接、重复 HTML 属性及会丢失图片替代文字的输入明确拒绝。
- 本版为内部候选；当前验证及未覆盖范围见验证文档，启用不会自动改写既有文章或历史修订。

## 1.2.0 — 2026-09-28

- 托管可视化编辑器新增“数学（MathJax）”工具栏入口，支持空光标新建及纯文本选区转公式；新建公式需预览排版成功后应用。
- 正文逐字键入短 `$…$` 表达式可创建行内公式，撤销恢复字面文字；保留金额、转义美元、粘贴、输入法组合和代码边界。
- 空段落键入 `$$` 后回车可创建“行间公式”并聚焦源码；未选中时显示公式预览。
- 原生 WordPress 数学提供显式转换：核对 TeX、MathML 显示结构、可保留属性及异步期间内容变化；不自动迁移历史文章，不放宽双格式保存和来源保护。
- 修复编辑画布 iframe 中 CHTML 动态样式不同步，避免新增分式分母、横线和符号缺失。
- 原生公式的显式转换入口放在选中公式附近，保留校验与失败时原内容。
- 核心行内数学入口继续保留并与 MathJax 入口区分；托管文章使用插件行间公式插入入口，普通文章不受影响。

操作和边界见[内容编辑指南](docs/USAGE.md)。

## 1.1.1 — 2026-09-28

- 普通托管文章支持原生区块编辑器保存／更新：自动校验并成对保存 Markdown 与区块，保留原生分类与元数据；转换失败或版本冲突时拒绝写入。文件来源仍需预览确认，自动保存仍关闭。

- 修复无脚本差异预览因字体跨来源加载失败导致的公式缺字或裁切，保持预览 sandbox 隔离。
- 行内公式在区块编辑器中默认渲染，点击后编辑 TeX 并查看小型预览；移除整段重复预览，避免与区块插入提示线重叠。保留原有 Markdown 与区块保存格式。

## 1.1.0 — 2026-09-27

任务列表与脚注的操作方法、语法和兼容边界见 [内容编辑指南](docs/USAGE.md)。

- 新增命名脚注：正文重复引用、多段定义、富文本引用编辑与前台编号/返回跳转；拒绝缺失、重复、孤儿及不受支持的嵌套引用，保留历史配对的精确恢复。
- 修复无脚本编辑预览中的片段链接会加载父页面的问题，脚注预览保持在当前文档内导航。

- 新增正文任务列表：Markdown 与区块完成状态双向转换，支持混合、嵌套、多段落；后台可编辑，前台只读。保留旧复杂列表配对快照的精确恢复，并避免误识别转义或代码中的任务标记。

- 前台公式新增阅读弹窗：复制 TeX、放大/缩小和重置，支持键盘关闭与焦点恢复；复制失败可手动选取源码。

- 长文差异按修改片段展示上下文和旧/新行号，大段改动按需展开。
- 冲突时保留候选 Markdown，支持下载与服务器最新版对比；采用新基线后必须重新预览并确认保存。
- 增加使用实际构建资源的 Chromium 回归，并接入 CI；覆盖公式、代码行号和编辑冲突交互。

## 1.0.9 — 2026-09-23

- 将带行号的代码内容改为块级排版，避免外层与代码字体度量不同导致行盒增高、行号累计错位。

## 1.0.8 — 未公开候选

- 行内公式使用正常行内盒与文字基线，移除公式外层的独立滚动区域。
- 行间公式字号放大 15%，保留居中和超宽公式的横向滚动。

## 1.0.7 — 2026-09-23

- 在转换 iframe 中挂载 CHTML 样式表，确保后续字形的动态 CSS 可以插入。
- 从 CSSOM 提取完整样式传给正文与预览，修复公式字符重叠及 insertRule 警告。

## 1.0.6 — 2026-09-23

- 等待 CHTML 样式生成期间的异步字体数据，避免将 MathJax retry 当作公式语法错误。
- 使用按需 CHTML 样式，将转换和样式提取串行执行，给整页公式队列保留加载时间；重试成功后清除旧错误标记。

## 1.0.5 — 2026-09-23

- 将数学输出改为 CHTML（HTML/CSS），保留 mathjax-newcm 字体及独立转换 iframe。
- 将 CHTML 样式同步到正文与预览文档，字体使用本地资源。
- 包含公式居中和代码行号修复；本版按部署方要求未追加浏览器或回归验收。

## 1.0.4 — 未公开候选

- 块级公式在内容区居中；超宽公式保持可横向查看，行内公式布局不变。
- 修复代码行号留白和行高，避免行号被裁剪、分隔线短于代码内容。
- 保持 MathJax 4.1.3 SVG 与 mathjax-newcm 字体；本次未增加用户渲染器切换菜单。

## 1.0.3 — 候选

- 修复引用中独占行 `$$` 被错误拆出引用块、引用标记混入 TeX 的问题，保留嵌套引用和公式中的比较符。
- 为公式块提供透明、无边框的基础样式，不改变普通代码块。
- 增加引用、嵌套引用、列表内引用和引用代码边界回归。
- 转换规则更新需要配套重建私有运行环境。已保存的错误区块需从原 Markdown 重新导入或同步；升级不会自动改写已有文章。

## 1.0.2 — 2026-09-22

- 恢复已有文件来源文章的 CLI 同步，不要求配置网页写回目标。
- 在保存锁内再次核验来源路径、源内容和文章指纹，保持网页写回权限与冲突保护。
- 增加 CLI 成功保存、错误来源、转换期间冲突与普通 REST 保存拒绝回归。

## 1.0.1 — 2026-09-22

- 绑定源文件读取失败时显示 WordPress 已保存的 Markdown，并明确提示可能不是源文件最新版本；继续禁止写回。
- 每次打开编辑窗口先清空旧内容，避免读取失败时显示上次打开的文章；成功读取时同步最新正文指纹。

## 1.0.0 — 2026-09-19

- 完成新建文章 Markdown 导入与未保存内容保护。
- 提供已有绑定 Markdown 源文件的受权限、指纹和原子写入保护的网页写回。
- 增加并发冲突拒绝、失败恢复、配对保存、审计接口和 CI 自动验证。
- 默认启用网页写回能力；未配置受信来源映射的文章继续保持只读。

## 0.7.0-rc.3 — 2026-09-17

- 统一发行：管理员配置私有运行目录，常量优先；设置和诊断不依赖运行环境可用。
- 候选目录通过同一沙箱转换后才切换；核对内核、worker、核心脚本和依赖清单，失配阻止保存。
- 可选数据型图片表情包，校验后安装到上传目录；Unicode 默认，显示切换不改正文。
- 从干净源码提交构建，提供文件清单、源码标识与 SHA-256，检测缺失、改动和额外文件。
- 提供合成表情示例、配置迁移与协调回退说明；生产部署与公开发布仍独立批准。
- 修复真实匿名评论链中任务标记过滤过早的问题，在 WordPress 恢复段落后显示复选框。

## 0.7.0 — 2026-09-18

- 将统一发行候选定为正式版本，完成固定提交、安装包清单和 CRC 校验。
- 新建文章编辑页提供 Markdown 导入入口，保留未保存内容保护并改善工具栏位置与可访问样式。
- 生产站点针对插件 PHP 入口增加精确 Nginx 拦截，静态资源继续正常提供。

## Unreleased

- 记录 0.7.0 正式发布验收与 1.0.0 开发路线，补充任务编号、完成标准和交接边界。
- 补齐中文文档中的中英文、数字及行内代码间距，整理 SVG 源码排版。
- 修正格式工具的资源忽略规则，更新发布流程与验收记录。

## 0.7.0-rc.2 — 2026-09-17

- 修复双格式保存保护误拦截 WordPress 回收站/还原；只允许正文不变的状态切换。
- 编辑桥列表排除回收站和自动草稿，补充删除与恢复说明。
- 将已验收的修复纳入唯一的新候选包，避免与旧 rc.1 内容混淆。

## 0.7.0-rc.1 — 发布候选

### Added

- MarkBridge 最终名称、公开仓库 README、安装/架构/贡献说明和 GPL-3.0-or-later 许可。
- 固定格式工具与 100 列目标，可重复的检查、构建和 ZIP 打包命令。
- 从目标 WordPress 核心脚本生成私有运行环境；不复制后台会话。
- 可复用的往返、内容策略和 Unicode/代码边界检查。

### Changed

- 自有 PHP、JS、CSS、JSON、HTML 和 Python 统一排版；生成文件与第三方组件保持独立。
- 采用明确的运行环境配置，CLI 不内置 sudo 账号切换。
- 表情短代码采用 Unicode，不分发表情图片包。
- 公开仓库不携带生产运维历史、站点内容或专用同步映射。

### Compatibility

- 保留 `mbb/*` 区块名、REST 命名空间与存储键。
- Linux、WordPress 7.1、PHP 8.2、Node 24 为本轮验证环境；仍需在目标站点先行隔离验收。

## 0.6.2 — 2026-09-15

- 接管评论 Markdown、代码高亮/复制/行号与前台展示依赖。
- 页面类型支持与文件来源同步适配，完成旧编辑器退役。

## 0.6.1 — 2026-09-15

- 文件来源通过配对保存同步，保留来源路径校验和冲突检测。
- 扩展旧文迁移及锚点保护。

## 0.6.0 — 2026-09-15

- 转换内核 0.2.0 支持复杂列表、删除线、图片 alt、more、旧公式边界和受限 HTML。

## 0.5.0–0.5.2 — 2026-09-15

- 普通作者权限、发布状态、特色图片与旧文迁移。
- 原生区块入口和作者代码/TeX 源码保护。

## 0.4.0–0.4.3 — 2026-09-15

- 自托管 MathJax、跨 iframe 通信修复、工具栏避让与整段公式预览。

## 0.1.0–0.3.0 — 早期原型

- 隔离转换内核、编辑闭环及双格式修订恢复。
