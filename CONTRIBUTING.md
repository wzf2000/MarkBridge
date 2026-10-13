# 参与开发

先阅读 README 的支持范围，再决定变更落在哪一层。涉及转换规则时，需要同时考虑 Markdown → 区块、反向导出、源码保留和明确拒绝行为。

## 代码风格

| 文件                              | 工具                              | 约定                         |
| --------------------------------- | --------------------------------- | ---------------------------- |
| PHP                               | Prettier + `@prettier/plugin-php` | 4 空格、`braceStyle: per-cs` |
| JS / CSS / JSON / Markdown / YAML | Prettier                          | 2 空格                       |
| HTML（含混合标记）                | js-beautify                       | 2 空格，保留内容             |
| Python                            | Black                             | 4 空格                       |

中文说明中的汉字与英文、数字及行内代码之间留一个半角空格；代码、路径与 URL 内部保持原样。Prettier 不会自动补齐这些间距，文档审阅时需单独检查。SVG 使用 Prettier 的 HTML 解析器排版。

所有语言目标 100 列。长 URL、不可拆分正则或语义敏感字符串可以超过该目标；这不是逐行硬截断。Prettier PHP 参考 PER/PSR，但不宣称完全符合 PER-CS。第三方源码、许可证和生成的资源不格式化。

```sh
npm ci
npm run build:php
npm run format
npm run format:check
npm run build
npm run check
MARKBRIDGE_TEST_RUNTIME=/srv/markbridge-runtime-v1 npm test
```

PHP 转换器的依赖与隔离构建需要 Composer；`build:php` 按两份锁文件安装运行库与构建工具，并用固定 PHP-Scoper 生成私有命名空间。运行包携带生成物，安装者不运行 Composer。修改 `plugin/includes/php-converter/src/`、共享 `block-capabilities.json` 或构建配置后必须重跑 `build:php`；普通 `build` 会拒绝过期隔离产物。原始 vendor、src 和构建工具不进入安装 ZIP。

Black 默认位于 `.venv`；可用 `MARKBRIDGE_PYTHON` 指定另一个已安装 Black 的 Python。运行环境准备见安装指南。

## 双引擎维护契约

后续转换规则和涉及转换的新功能必须同时维护 PHP 与 Node。共同支持的合成样例应检查两引擎的 Markdown 导入、区块反转、严格配对恢复、真实编辑与修订保存链，以及明确拒绝的安全边界。为双方补充可复用回归；已有明确列出的拒绝差异可以保留，但应更新实验与用户支持范围，不把单引擎通过称为完整兼容。

后端由显式配置决定，环境不可用、内容不兼容或资源超限均明确拒绝，不能通过静默切换引擎解决。选择器、诊断和持久化测试与转换回归一起维护；模拟诊断只用于后台保存控制，不能代替实际 WordPress／PHP 进程的 Node 隔离转换验收。

CI 使用固定 Node 24.15.0 基线及 PHP 8.2／8.3／8.4／8.5 转换、Worker／后端选择和管理员设置契约矩阵。主检查在 WordPress 7.1.3 合成站安装最终 ZIP，用 PHP 8.2 执行 PHP／Node 原生 REST 保存链、PHP 文件写回和禁子进程保存，并在真实核心资源上运行浏览器套件，拒绝跳过、失败及重试通过。四 PHP 契约版本不等同四版本真实保存链；内部 REST 保存检查和浏览器模拟不等同实际 HTTP 认证。

## 本地化维护

候选的界面消息使用英文 msgid，中文翻译统一维护于 `plugin/languages/messages.json`。构建需要 gettext 的 `msgfmt`；`npm run build:localization` 生成 POT、PO、MO、稳定脚本句柄对应的 JSON 和摘要清单，`python3 scripts/build-localization.py --check` 检查生成物是否与源目录一致。固定时间元数据用于可重复构建，不能从本机日期生成翻译时间。可选 WP-CLI 检查必须显式指定独立 phar 和 PHP，不调用站点命令包装器。

新增或修改面向用户的消息时同步维护翻译、位置和占位符。保留编号占位符，不把作者正文、TeX、代码、语法标记、属性键或错误码作为界面文案。HTML 标签、属性和半开片段保持固定；优先把结构留在源码，仅翻译并转义文字。翻译安全边界不能因当前中文目录可信而取消。

保存模板、默认保存属性和扩展登记摘要不能依赖语言。既有固定 HTML 文案的兼容保留与显示层翻译分别处理；测试须证明中英文切换不会改变原文、区块序列化或旧配对恢复。真实 WordPress 用户／站点语言检查与模拟 gettext 模型分别记录，后者不能冒充实际后台和前台验收。

## 浏览器回归

```sh
npx playwright install --with-deps --only-shell chromium
npm run test:browser
```

测试在本机回环地址启动合成页面，加载本次构建的编辑器、MathJax 和 Prism 资源；需要 Node.js 与 PHP。桌面和手机尺寸均运行 Chromium，手机项目并不代表 Safari 验收。`MARKBRIDGE_CHROMIUM_PATH` 可指定已安装的 Chromium；默认使用锁定 Playwright 对应的浏览器。

公式和代码测试检查实际排版、字体请求及控制台告警。编辑流程测试使用模拟 REST 响应，不能代替真实 WordPress 权限、数据库和源文件写回验收。失败截图与 trace 存入忽略目录 `test-results/`，CI 失败时上传诊断附件。测试只使用合成内容，禁止加入生产凭据或真实文章。

真实区块编辑器任务列表与脚注用例需要额外的已脱敏核心脚本运行环境，并把同一 WordPress 版本的 `wp-includes/css` 和 `wp-includes/fonts` 复制到该运行环境的 `site/wp-includes/`。设置 `MARKBRIDGE_TEST_RUNTIME` 后运行 Playwright；用例加载候选内核，覆盖真实区块控件与序列化，不登录站点或写数据库。未设置时本地用例明确跳过；公共 CI 会准备完整核心运行环境并把任何跳过视为失败。`prepare_runtime.py` 已自动复制同版本 CSS／字体；可用 `--plugin` 与 `MARKBRIDGE_TEST_PLUGIN_ROOT` 指向已核验的最终包，避免仅安装 ZIP 却仍测试工作树资源。

设置 `MARKBRIDGE_WORDPRESS_SOURCE` 指向干净 WordPress 源码树后，`npm test` 额外使用真实 PHP KSES/区块解析库检查任务列表与脚注存储 HTML；不会加载 wp-config 或数据库。

## 目录

- `src/`：转换内核与 Unicode 表情的可读源码。
- `plugin/`：WordPress、修订、预览和展示代码；生成文件已忽略。
- `runtime/`：服务端依赖的锁定清单。
- `scripts/`：格式、构建、运行环境准备及打包工具。
- `tests/`：可复用的小型转换与边界检查。
- `deploy/`：插件停用时的只读保护。
- `tools/`：显式计划驱动的迁移辅助工具。

不要提交生产域名配置、登录材料、文章副本、源文件映射、数据库或运维快照。外部专用同步器不属于插件源码。

Markdown 中同一组简单列表项之间不插入空行，避免意外渲染为松散列表；列表与标题、正文之间保留必要空行。列表项包含多个段落、代码块或其他块级内容时，按其结构保留空行，不做全局删除。

## 提交变更

说明触发场景、最终行为、兼容影响与实际验证。更新 CHANGELOG；不要把未运行的测试写成通过。格式改动与行为改动尽量分开，涉及存储时明确恢复路径。
