# PHP 转换可行性实验

这是“免额外运行环境”架构计划的独立原型，不是可安装插件，不被现有插件加载，也不在发行源码白名单中。当前保存链与正式版本不变。完整阶段见[架构改进计划](../../docs/plans/active/PORTABLE-CONVERTER.md)。

## 复现

需要 PHP 8.2+、DOM、mbstring。Composer 仅用于开发时安装锁定依赖；未来若采用此架构，生产依赖应随发行包附带，安装者不运行 Composer。

```sh
composer install --working-dir=experiments/php-converter --no-interaction --no-plugins --no-scripts
printf '%s' '{"mode":"markdown","source":"# Hello\n\nText **here**.\n"}' \
  | php -d disable_functions=exec,shell_exec,system,passthru,proc_open,popen,pcntl_exec \
    experiments/php-converter/cli.php
python3 -m unittest discover -s experiments/php-converter -p 'test_probe.py'
```

CLI 只从标准输入读取一个 JSON 请求。`mode=markdown` 使用 `source`；`mode=blocks` 使用 `serialized`。成功返回 `ok/source/serialized`，Markdown 导入额外返回 `normalized_source`：`source` 保留原文，规范化结果来自真正的区块逆向解析。区块模式不接收也不缓存原 Markdown。失败返回 `ok=false/code/message`。

与现有引擎对照，需要一个匹配当前构建的隔离测试运行环境（只在测试侧使用 Node，不是 PHP 的依赖）：

```sh
python3 experiments/php-converter/compare.py --runtime /path/to/matching-test-runtime
```

脚本核对转换内核指纹，生成被 Git 忽略的 `results-comparison.json`。每个样例分别检查 PHP 自身往返、Node 接受 PHP 区块、PHP 反转 Node 区块及两边规范区块一致性。双方都接受的内容若出现规范结果差异，脚本失败；未实现样例作为缺口报告，不能据命令退出成功声称全功能兼容。

## 设计选择

- 锁定 `league/commonmark` 2.10.3，以 AST 遍历实现受限区块转换。公式与任务标记在解析器扩展中识别，保留引用/列表容器、代码与转义边界，不用全文正则代替语法解析。
- 服务器原型使用 PHP DOM 做区块逆转，并重新生成检查。DOM 解析错误（包括重复属性）、未知属性/节点、危险 URL 和无法保留的结构直接拒绝。
- 实验使用独立受限区块注释解析器；尚未用 WordPress PHP parser 替换或证明对全部 Gutenberg 合法输入兼容。
- WordPress 区块输出适配当前明确结构；不是任意第三方区块转换器。模板维护、核心升级与规范变更仍是下一阶段工作。
- 输入上限 256 KiB，节点上限 10,000，深度上限 32；JSON 请求另有限额。它们是原型边界，不代表现有插件容量或经过全面拒绝服务审计。部分检查在 AST 解析之后，仍需进一步研究解析阶段的资源上限。

## 已确认的兼容边界

支持子集包括标题、段落、强调、链接、代码、引用、普通与嵌套列表、任务列表、行内公式及引用内行间公式。图片、表格、命名脚注与原生 HTML 明确拒绝；其余未列出的语法不承诺兼容。

未知区块、额外样式、事件属性和不匹配区块结构拒绝，不静默删改。危险 Markdown 链接主动拒绝；现有 Node 引擎可能将相同输入保留为字面文字，属于尚未统一的策略差异。

原始 Markdown 与规范化 Markdown 不是同一承诺：未使用的链接定义、排版空白等可只保留在原始 `source`；从修改后的区块重建时不能恢复全部原文拼写。历史配对恢复、最小改写和旧格式兼容尚未实现。

任务标记必须按原始语法识别。转义/实体编码的 `[x]` 是普通列表；标记后直接软换行的行为以现有引擎为基准，不能把另一解析库的默认行为视为插件契约。正文软换行需要与现有引擎的 `breaks` 策略一致。

## 第一阶段结论

2026-10-08 本地验证结论：**受限子集的真实 PHP 双向转换可行，值得进入完整适配；目前不能替换现有引擎。**

| 检查              | 实际结果                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| 22 个合成源样例   | PHP 接受 15 个、明确拒绝 7 个；现有 Node 接受 19 个                                                                 |
| 15 个共同支持样例 | 输出区块逐字节相同；PHP 自身往返、Node 接受 PHP 区块与 PHP 反转 Node 区块后规范结果均一致                           |
| 9 项专门断言测试  | 全部通过，涵盖真实区块编辑反转、属性/结构拒绝、危险输入、限制、未实现功能、转义任务、续行行为、原文保留与代码字面量 |
| PHP 执行环境      | PHP 8.2.32，测试时禁用 exec/shell_exec/system/passthru/proc_open/popen/pcntl_exec；不加载 WordPress、不访问数据库   |
| 对照环境          | WordPress 7.1 / Node 24.21.0，内核 SHA-256 与当前 1.2.0 构建一致                                                    |
| 依赖检查          | 锁定 CommonMark 2.10.3，Composer audit 无已知公告或废弃包                                                           |

PHP 拒绝而 Node 接受的 4 个源样例分别为脚注、表格、图片和危险链接（Node 将该链接作为字面文本处理）。另外 3 个双方拒绝样例为脚本 HTML、重复脚注定义、缺失脚注定义。不能把 15 个支持样例通过描述为 22 个全部兼容。

本机单次 PHP CLI 启动加转换约 112–140 ms（该批小样例）；额外 256 KiB 未闭合美元前缀约 158 ms，40 层引用及 6,000 个段落分别以结构上限拒绝。额外检查使用 128 MiB PHP 内存上限和测试侧 5 秒超时。这些是局部合成测量，不代表持续负载、所有恶意输入或生产容量。

独立审查发现并修复了转义/实体任务误判、重复 HTML 属性被 DOM 吞掉、美元扫描平方级耗时；最终还对齐了软/硬换行与标记后续行的现有引擎行为。此阶段只证明继续投入有依据，不构成默认后端切换或无 Node WordPress 安装验收。

尚需完整语法覆盖、历史修订恢复、PHP/JS 契约统一、WordPress/PHP 版本矩阵、保存/权限/事务/来源链集成、真实编辑器验证、无 Node 干净安装、性能与资源攻击测试、升级和协调回退。

## 依赖依据

- [CommonMark AST](https://commonmark.thephpleague.com/2.x/customization/abstract-syntax-tree/)
- [解析扩展接口](https://commonmark.thephpleague.com/2.x/customization/environment/)
- [安全与资源限制](https://commonmark.thephpleague.com/2.x/security/)

锁文件包含全部传递依赖；不提交 vendor。初次安装时的 Composer audit 无已知公告或 abandoned 包；这不是对未来公告或原型自身安全性的保证。
