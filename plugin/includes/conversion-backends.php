<?php
// Explicit backend selection. Node remains the default; there is no fallback.

function mbb_converter_backend()
{
    return defined('MARKBRIDGE_CONVERTER_BACKEND') ? MARKBRIDGE_CONVERTER_BACKEND : 'node';
}

function mbb_php_converter_diagnostics($smoke = false)
{
    $directory = __DIR__ . '/php-converter';
    $checks = [];
    $add = static function ($code, $label, $ok, $message) use (&$checks) {
        $checks[] = ['code' => $code, 'label' => $label, 'ok' => (bool) $ok, 'message' => $message];
    };
    $php = PHP_VERSION_ID >= 80200;
    $extensions = extension_loaded('dom') && extension_loaded('mbstring');
    $add('php', 'PHP 版本', $php, $php ? 'PHP 8.2 或更新版本。' : 'PHP 转换候选需要 PHP 8.2。');
    $add(
        'extensions',
        'PHP 扩展',
        $extensions,
        $extensions ? 'DOM 与 mbstring 可用。' : '缺少 DOM 或 mbstring。',
    );
    $wordpress = preg_match('/^7\.1(?:\.|$)/', (string) get_bloginfo('version')) === 1;
    $add(
        'wordpress',
        'WordPress 版本',
        $wordpress,
        $wordpress ? '匹配已验证的 WordPress 7.1 模板。' : 'PHP 候选尚未验证此 WordPress 版本。',
    );
    $manifest = json_decode(@file_get_contents(__DIR__ . '/../php-converter-manifest.json'), true);
    $manifestOk =
        is_array($manifest) &&
        ($manifest['schema'] ?? null) === 1 &&
        is_array($manifest['files'] ?? null) &&
        !empty($manifest['files']);
    $required = [
        'Converter.php',
        'Worker.php',
        'MathExtension.php',
        'Footnotes.php',
        'DisplayBoundaries.php',
        'composer.json',
        'composer.lock',
        'vendor/autoload.php',
        'vendor/composer/installed.json',
    ];
    foreach ($required as $name) {
        $manifestOk = $manifestOk && isset($manifest['files']['includes/php-converter/' . $name]);
    }
    if ($manifestOk) {
        foreach ($manifest['files'] as $name => $digest) {
            if (
                !is_string($name) ||
                !str_starts_with($name, 'includes/php-converter/') ||
                str_contains($name, '..') ||
                str_contains($name, '\\') ||
                !is_string($digest) ||
                !preg_match('/^[a-f0-9]{64}$/D', $digest) ||
                is_link(__DIR__ . '/../' . $name) ||
                !is_readable(__DIR__ . '/../' . $name) ||
                !hash_equals($digest, hash_file('sha256', __DIR__ . '/../' . $name))
            ) {
                $manifestOk = false;
                break;
            }
        }
    }
    $add(
        'php_dependencies',
        'PHP 转换依赖',
        $manifestOk,
        $manifestOk ? '转换库与锁定依赖清单匹配。' : 'PHP 转换依赖未构建、缺失或与清单不匹配。',
    );
    $limits = ['max_bytes' => 262144, 'max_nodes' => 10000, 'max_depth' => 32];
    $add(
        'limits',
        '候选容量',
        true,
        '原文、规范原文与区块分别最多 256 KiB；最多 10,000 节点、32 层。超限拒绝，不切换其他后端。',
    );
    $add(
        'policy',
        '候选内容策略',
        true,
        '危险链接、重复 HTML 属性及会丢失替代文字的图片输入明确拒绝。',
    );
    if (!$php || !$extensions || !$wordpress || !$manifestOk) {
        return [
            'ok' => false,
            'backend' => 'php',
            'path' => '',
            'checks' => $checks,
            'limits' => $limits,
        ];
    }
    $compatible = true;
    try {
        $prefixes = array_keys(require $directory . '/vendor/composer/autoload_psr4.php');
        foreach (
            array_merge(get_declared_classes(), get_declared_interfaces(), get_declared_traits())
            as $class
        ) {
            if (strncasecmp($class, 'MarkBridge\\Probe\\', strlen('MarkBridge\\Probe\\')) === 0) {
                $path = (new ReflectionClass($class))->getFileName();
                if (
                    !is_string($path) ||
                    dirname((string) realpath($path)) !== realpath($directory)
                ) {
                    $compatible = false;
                }
                continue;
            }
            foreach ($prefixes as $prefix) {
                if (strncasecmp($class, $prefix, strlen($prefix)) === 0) {
                    $path = (new ReflectionClass($class))->getFileName();
                    if (
                        !is_string($path) ||
                        !str_starts_with(
                            (string) realpath($path),
                            realpath($directory . '/vendor') . DIRECTORY_SEPARATOR,
                        )
                    ) {
                        $compatible = false;
                    }
                    break;
                }
            }
        }
        if ($compatible) {
            require_once $directory . '/Worker.php';
            $parser = (new ReflectionClass(
                \League\CommonMark\Parser\MarkdownParser::class,
            ))->getFileName();
            $worker = (new ReflectionClass(\MarkBridge\Probe\Worker::class))->getFileName();
            $compatible =
                realpath($parser) ===
                    realpath(
                        $directory . '/vendor/league/commonmark/src/Parser/MarkdownParser.php',
                    ) && realpath($worker) === realpath($directory . '/Worker.php');
        }
    } catch (Throwable $error) {
        $compatible = false;
    }
    $add(
        'php_autoload',
        '依赖加载',
        $compatible,
        $compatible
            ? '已加载匹配的独立依赖目录。'
            : 'PHP 依赖无法加载或存在同名依赖冲突；未改用 Node。',
    );
    if ($compatible && $smoke) {
        $result = \MarkBridge\Probe\Worker::convert([
            'mode' => 'markdown',
            'source' => "# PHP check\n\nHello **blocks**.\n",
            'documentId' => 'php-check',
        ]);
        $compatible = !empty($result['ok']);
        $add(
            'conversion',
            'PHP 转换',
            $compatible,
            $compatible ? 'PHP 配对转换通过。' : 'PHP 转换失败，未改用 Node。',
        );
    }
    return [
        'ok' => $compatible,
        'backend' => 'php',
        'path' => '',
        'checks' => $checks,
        'limits' => $limits,
    ];
}

function mbb_converter_dispatch($input)
{
    $backend = mbb_converter_backend();
    if ($backend === 'node') {
        return mbb_run_worker($input);
    }
    if ($backend !== 'php') {
        return mbb_error('conversion_backend', '转换后端设置无效，原内容未写入。', 503);
    }
    if (!is_array($input)) {
        return ['ok' => false, 'code' => 'REQUEST', 'message' => 'Invalid conversion request'];
    }
    if (!mbb_php_converter_diagnostics()['ok']) {
        return mbb_error('conversion_backend', 'PHP 转换依赖不可用或存在冲突，原内容未写入。', 503);
    }
    $lock = mbb_runtime_lock();
    if (!$lock) {
        return mbb_error(
            'busy',
            '转换服务正在处理另一请求，或共享锁不可读，请稍后重试并检查权限。',
            409,
        );
    }
    try {
        return \MarkBridge\Probe\Worker::convert($input);
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
