<?php
define('ABSPATH', __DIR__);
require __DIR__ . '/helpers/localization.php';
require __DIR__ . '/../plugin/includes/i18n.php';
require __DIR__ . '/../plugin/includes/php-converter/src/Diagnostics.php';
class WP_Error
{
    public function __construct(public $code, public $message, public $data) {}
}
require __DIR__ . '/../plugin/includes/conversion-errors.php';
function lc_assert($value, $message)
{
    if (!$value) {
        throw new RuntimeException($message);
    }
}
$catalog = json_decode(
    file_get_contents(__DIR__ . '/../plugin/languages/messages.json'),
    true,
    32,
    JSON_THROW_ON_ERROR,
);
foreach ($catalog as $english => $chinese) {
    lc_assert(mbb_safe_translation($english, $chinese), 'Unsafe catalog entry: ' . $english);
}
foreach (
    ['<img src=x onerror=alert(1)>', '<script>alert(1)</script>', "\0bad", 'Unknown %1$s']
    as $bad
) {
    lc_assert(!mbb_safe_translation('Close', $bad), 'Unsafe plain translation accepted');
}
$fragment = '">Edit Markdown</button> <button class="button" data-post="';
foreach (
    [
        '" onmouseover="x">Edit Markdown</button> <button class="button" data-post="',
        '">Edit Markdown</button> <button id="changed" data-post="',
        '">Edit <img onerror=x></button> <button class="button" data-post="',
    ]
    as $bad
) {
    lc_assert(!mbb_safe_translation($fragment, $bad), 'Changed fragment accepted');
}
lc_assert(mbb_safe_translation('A "quoted" label', '有“引号”的文字'), 'Safe quotation rejected');
lc_assert(!mbb_safe_translation('Value %1$s', '值 %1$s %q'), 'Unknown printf accepted');
lc_assert(mbb_safe_translation('100% complete', '100% 完成'), 'Literal percent rejected');
foreach (
    json_decode(
        file_get_contents(__DIR__ . '/fixtures/localization-shapes.json'),
        true,
        32,
        JSON_THROW_ON_ERROR,
    )
    as [$source, $translated, $expected]
) {
    lc_assert(
        mbb_safe_translation($source, $translated) === $expected,
        'Quoted HTML shape boundary changed: ' . $source,
    );
}
lc_assert(mbb_t('Close') === '关闭', 'Chinese UI fallback failed');
$GLOBALS['mbb_test_locale'] = 'en_US';
lc_assert(mbb_t('Close') === 'Close', 'English UI failed');
$GLOBALS['mbb_test_locale'] = 'zh_CN';
$valid = [
    'message' => 'Unsupported block: core/example',
    'message_id' => 'Unsupported block: %1$s',
    'message_args' => ['core/example'],
    'code' => 'BLOCK',
    'location' => 'blocks[1].attributes.align',
];
lc_assert(
    str_contains(mbb_conversion_failure($valid)->message, 'core/example'),
    'Precise argument was lost',
);
lc_assert(
    str_contains(mbb_conversion_failure($valid)->message, '第 2 个区块，属性 align'),
    'Position was lost',
);
foreach (
    [
        ['message' => '/srv/private/source.md secret snippet'],
        array_replace($valid, [
            'message' => 'Unsupported block: /srv/private/source.md',
            'message_args' => ['/srv/private/source.md'],
        ]),
        array_replace($valid, ['message_args' => ['secret body\nfragment']]),
        array_replace($valid, ['message_id' => 'Not registered %1$s']),
    ]
    as $invalid
) {
    lc_assert(
        mbb_conversion_message($invalid) === '转换失败',
        'Unsafe or unknown diagnostic leaked',
    );
}
$diagnostic = MarkBridge\Probe\Diagnostics::describe(
    'Block core/example cannot be exported to Markdown',
);
lc_assert(
    $diagnostic['id'] === 'Block %1$s cannot be exported to Markdown' &&
        $diagnostic['args'] === ['core/example'],
    'Broad template swallowed a precise diagnostic',
);
lc_assert(
    MarkBridge\Probe\Diagnostics::describe(str_repeat('x', 8193)) === ['id' => null, 'args' => []],
    'Unbounded diagnostic accepted',
);
echo "Localization catalogs, placeholders, HTML boundaries and precise diagnostics passed.\n";

function add_action($hook, $callback, ...$args)
{
    $GLOBALS['lc_hooks'][$hook][] = $callback;
}
function plugin_basename($file)
{
    lc_assert(
        basename($file) === 'markdown-block-bridge.php',
        'Translation registration did not use the plugin entry file',
    );
    return $GLOBALS['lc_plugin_file'];
}
function load_plugin_textdomain($domain, $deprecated, $relative)
{
    $GLOBALS['lc_domain_path'] = $relative;
}
foreach (['markbridge', 'markdown-block-bridge'] as $slug) {
    $GLOBALS['lc_plugin_file'] = $slug . '/markdown-block-bridge.php';
    $GLOBALS['lc_hooks'] = [];
    mbb_i18n_register();
    foreach ($GLOBALS['lc_hooks']['init'] as $callback) {
        $callback();
    }
    lc_assert(
        $GLOBALS['lc_domain_path'] === $slug . '/languages',
        'Physical source directory replaced the registered plugin slug',
    );
}
echo "Registered plugin-slug translation paths preserve normal and symlink installations.\n";
