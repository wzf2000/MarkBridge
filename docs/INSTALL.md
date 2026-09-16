# 安装与升级

## 环境

- Linux；PHP 8.2+，启用 DOM、JSON、`proc_open`。
- WordPress 7.1。当前最小验收基于此版本；未声明更早版本兼容。
- Node.js 24 LTS（24.15.0+）、npm、Python、WP-CLI。
- `/usr/bin/bwrap`（bubblewrap）、`/usr/bin/timeout`；服务器允许非特权用户使用所需命名空间。
- PHP-FPM 用户能读取私有运行环境；CLI 同步使用相同系统用户，保证共享转换锁可访问。

共享主机、Windows 和禁用进程创建的 PHP 环境没有经过验证。

## 1. 构建插件

```sh
npm ci
npm run build
```

构建从锁定的 npm 包复制 MathJax 与字体，并生成内容哈希资源地址。上传 ZIP 前可运行 `npm run package`；开发格式检查还需要按 README 安装 Black。

## 2. 准备私有运行环境

在运行目标 WordPress 的服务器上执行，替换示例路径：

```sh
python3 scripts/prepare_runtime.py \
  --wordpress /srv/wordpress \
  --output /srv/markbridge-runtime-v1
```

该工具只读取 WordPress 核心脚本注册信息与文件，不读取文章、后台 HTML、cookie 或 nonce。它复制本机 Node 二进制，安装锁定的 jsdom 依赖，生成最小离线页面并实际执行一次转换。输出目录必须不存在且不能位于 WordPress 公共目录内。

脚本应在目标服务器上运行；复制出的 Node 二进制依赖该系统环境，不是跨平台运行包。构建完成后，由管理员将目录所有权/读取权限交给 PHP-FPM 的实际系统用户；目录不能通过 Web 访问。

WordPress 升级或插件转换内核改变后，需要用新的输出目录重新构建，验证后再切换。不要直接覆盖使用中的运行环境。

## 3. 配置并启用

在服务器的 `wp-config.php` 中，WordPress 引导完成之前加入：

```php
define('MARKBRIDGE_RUNTIME', '/srv/markbridge-runtime-v1');
```

将构建后的 `plugin/` 内容复制到 `wp-content/plugins/markbridge/`，或上传生成的插件 ZIP。启用 **MarkBridge**。

建议另将 `deploy/rollback-guard.php` 安装到 `wp-content/mu-plugins/markbridge-rollback-guard.php`。它在主插件停用时保护已托管文档，防止只写入一种格式；只有完成协调回退后才移除该保护。

缺少运行环境时，插件显示管理员提示，不启动编辑功能。转换沙箱失败时不会退回不受隔离的执行方式；请检查 bubblewrap、系统权限与路径配置。

## 4. 最小验收

```sh
MARKBRIDGE_TEST_RUNTIME=/srv/markbridge-runtime-v1 npm test
```

再在隔离草稿中检查一次导入 → 预览 → 保存 → 重开 → 区块修改 → 配对保存，以及修订恢复。检查含公式/代码的实际前台页，并以普通作者验证权限。

当前公开候选已完成新运行环境构建、PHP 沙箱转换、内核往返/拒绝策略及 Unicode 边界检查；不要把这些检查理解为所有主题/插件组合都已通过。

## 升级与历史迁移

备份数据库、插件、源文件与同步映射；检测后台修改后再处理既有文章。`tools/migrate-legacy.php` 是供维护者使用的显式计划执行工具，没有自动扫描后批量迁移的默认入口，也没有 HTTP 写入接口。

`mbb/*` 区块名、元数据键和 REST 命名空间保持稳定；MarkBridge 更名不会重命名既有文档身份。不要同时启用旧维护版本与公开候选，否则会重复定义函数。

文件来源的 CLI 写入入口是 `mbb_sync_write()`，它要求文章已被明确迁移并绑定源文件路径哈希。调用方继续负责来源白名单、同步映射、远端修改冲突检查、备份与回退。后台回写源文件尚未实现。
