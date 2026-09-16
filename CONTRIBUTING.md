# 参与开发

先阅读 README 的支持范围，再决定变更落在哪一层。涉及转换规则时，需要同时考虑 Markdown → 区块、反向导出、源码保留和明确拒绝行为。

## 代码风格

| 文件                              | 工具                              | 约定                        |
| --------------------------------- | --------------------------------- | --------------------------- |
| PHP                               | Prettier + `@prettier/plugin-php` | 4空格、`braceStyle: per-cs` |
| JS / CSS / JSON / Markdown / YAML | Prettier                          | 2空格                       |
| HTML（含混合标记）                | js-beautify                       | 2空格，保留内容             |
| Python                            | Black                             | 4空格                       |

所有语言目标100列。长URL、不可拆分正则或语义敏感字符串可以超过该目标；这不是逐行硬截断。Prettier PHP参考PER/PSR，但不宣称完全符合PER-CS。第三方源码、许可证和生成的资源不格式化。

```sh
npm run format
npm run format:check
npm run build
npm run check
MARKBRIDGE_TEST_RUNTIME=/srv/markbridge-runtime-v1 npm test
```

Black默认位于`.venv`；可用`MARKBRIDGE_PYTHON`指定另一个已安装Black的Python。运行环境准备见安装指南。

## 目录

- `src/`：转换内核与Unicode表情的可读源码。
- `plugin/`：WordPress、修订、预览和展示代码；生成文件已忽略。
- `runtime/`：服务端依赖的锁定清单。
- `scripts/`：格式、构建、运行环境准备及打包工具。
- `tests/`：可复用的小型转换与边界检查。
- `deploy/`：插件停用时的只读保护。
- `tools/`：显式计划驱动的迁移辅助工具。

不要提交生产域名配置、登录材料、文章副本、源文件映射、数据库或运维快照。本站专用同步器不属于公开插件源码。

## 提交变更

说明触发场景、最终行为、兼容影响与实际验证。更新CHANGELOG；不要把未运行的测试写成通过。格式改动与行为改动尽量分开，涉及存储时明确恢复路径。
