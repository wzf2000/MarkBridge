<?php

// Standalone CLI conversion and model tests remain supported; direct web access requires WordPress.
if (!defined('ABSPATH')) {
    if (PHP_SAPI !== 'cli') {
        exit();
    }
}

require_once __DIR__ . '/i18n.php';
// Configuration chooses the backend; readiness never triggers a fallback.
require_once __DIR__ . '/converter-settings.php';

function mbb_converter_backend()
{
    if (defined('MARKBRIDGE_CONVERTER_BACKEND')) {
        return MARKBRIDGE_CONVERTER_BACKEND;
    }
    $settings = mbb_converter_settings();
    if ($settings !== null) {
        return $settings === false ? 'invalid' : $settings['backend'];
    }
    // Preserve the configured engine on upgrade. New installations need no runtime directory.
    $configured = defined('MARKBRIDGE_RUNTIME')
        ? MARKBRIDGE_RUNTIME
        : get_option('mbb_runtime_path', '');
    return is_string($configured) && trim($configured) !== '' ? 'node' : 'php';
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
    $add(
        'php',
        mbb_t('PHP version'),
        $php,
        $php ? mbb_t('PHP 8.2 or newer.') : mbb_t('The PHP converter requires PHP 8.2.'),
    );
    $add(
        'extensions',
        mbb_t('PHP extensions'),
        $extensions,
        $extensions
            ? mbb_t('DOM and mbstring are available.')
            : mbb_t('DOM or mbstring is missing.'),
    );
    $wordpress = preg_match('/^7\.1(?:\.|$)/', (string) get_bloginfo('version')) === 1;
    $add(
        'wordpress',
        mbb_t('WordPress version'),
        $wordpress,
        $wordpress
            ? mbb_t('Matches the verified WordPress 7.1 templates.')
            : mbb_t('The PHP converter has not been verified with this WordPress version.'),
    );
    $manifest = json_decode(@file_get_contents(__DIR__ . '/../php-converter-manifest.json'), true);
    $manifestOk =
        is_array($manifest) &&
        ($manifest['schema'] ?? null) === 2 &&
        ($manifest['prefix'] ?? null) === 'MarkBridge\\Vendor\\ConverterV1' &&
        is_array($manifest['files'] ?? null) &&
        !empty($manifest['files']);
    $required = [
        'Converter.php',
        'Worker.php',
        'MathExtension.php',
        'Footnotes.php',
        'DisplayBoundaries.php',
        'CodeWhitespace.php',
        'BlockAdapters.php',
        'composer.json',
        'composer.lock',
        'scoped/autoload.php',
        'scoped/src/Converter.php',
        'scoped/src/Worker.php',
        'scoped/src/MathExtension.php',
        'scoped/src/Footnotes.php',
        'scoped/src/DisplayBoundaries.php',
        'scoped/src/CodeWhitespace.php',
        'scoped/src/BlockAdapters.php',
        'scoped/vendor/composer/installed.json',
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
        mbb_t('PHP conversion dependencies'),
        $manifestOk,
        $manifestOk
            ? mbb_t('The conversion library matches its locked dependency manifest.')
            : mbb_t(
                'PHP conversion dependencies are unbuilt, missing, or differ from their manifest.',
            ),
    );
    $limits = ['max_bytes' => 262144, 'max_nodes' => 10000, 'max_depth' => 32];
    $add(
        'limits',
        mbb_t('Candidate budgets'),
        true,
        mbb_t(
            'Source, canonical source, and blocks are each limited to 256 KiB, with at most 10,000 nodes and 32 levels. Exceeding a budget is rejected without switching backends.',
        ),
    );
    $add(
        'policy',
        mbb_t('Candidate content policy'),
        true,
        mbb_t(
            'Unsafe links, duplicate HTML attributes, and image inputs that would lose alternative text are explicitly rejected.',
        ),
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
        $prefixes = ['MarkBridge\\Vendor\\ConverterV1\\'];
        foreach (
            array_merge(get_declared_classes(), get_declared_interfaces(), get_declared_traits())
            as $class
        ) {
            if (strncasecmp($class, 'MarkBridge\\Probe\\', strlen('MarkBridge\\Probe\\')) === 0) {
                $path = (new ReflectionClass($class))->getFileName();
                if (
                    !is_string($path) ||
                    dirname((string) realpath($path)) !== realpath($directory . '/scoped/src')
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
                            realpath($directory . '/scoped/vendor') . DIRECTORY_SEPARATOR,
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
                \MarkBridge\Vendor\ConverterV1\League\CommonMark\Parser\MarkdownParser::class,
            ))->getFileName();
            $worker = (new ReflectionClass(\MarkBridge\Probe\Worker::class))->getFileName();
            $compatible =
                realpath($parser) ===
                    realpath(
                        $directory .
                            '/scoped/vendor/league/commonmark/src/Parser/MarkdownParser.php',
                    ) && realpath($worker) === realpath($directory . '/scoped/src/Worker.php');
        }
    } catch (Throwable $error) {
        $compatible = false;
    }
    $add(
        'php_autoload',
        mbb_t('Dependency loading'),
        $compatible,
        $compatible
            ? mbb_t('Namespaced dependencies and the standalone loading map are loaded.')
            : mbb_t(
                'PHP dependencies failed to load or conflict with an existing dependency. Node was not used as a fallback.',
            ),
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
            mbb_t('PHP conversion'),
            $compatible,
            $compatible
                ? mbb_t('PHP paired conversion passed.')
                : mbb_t('PHP conversion failed. Node was not used as a fallback.'),
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
        return mbb_error(
            'conversion_backend',
            mbb_t('The conversion backend settings are invalid. Original content was not written.'),
            503,
        );
    }
    if (!is_array($input)) {
        return ['ok' => false, 'code' => 'REQUEST', 'message' => 'Invalid conversion request'];
    }
    if (!mbb_php_converter_diagnostics()['ok']) {
        return mbb_error(
            'conversion_backend',
            mbb_t(
                'PHP conversion dependencies are unavailable or conflict. Original content was not written.',
            ),
            503,
        );
    }
    $lock = mbb_runtime_lock();
    if (!$lock) {
        return mbb_error(
            'busy',
            mbb_t(
                'The converter is processing another request or the shared lock is unreadable. Try later and check permissions.',
            ),
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
