<?php
// The real handler and option parser; only environment diagnostics are controlled here.
const MINUTE_IN_SECONDS = 60;
$options = ['mbb_runtime_path' => '/synthetic/legacy/node', 'unrelated' => 'preserved'];
$transients = $diagnostic_calls = $writes = [];
$can_manage = $nonce_ok = $database_ok = $diagnostic_ok = true;
$mode = $argv[1] ?? '';
if ($mode === 'backend-constant') {
    define('MARKBRIDGE_CONVERTER_BACKEND', 'php');
}
if ($mode === 'runtime-constant') {
    define('MARKBRIDGE_RUNTIME', '/synthetic/server/node');
}
class MbbConverterStop extends RuntimeException {}
function add_action(...$args) {}
function get_option($key, $default = false)
{
    return array_key_exists($key, $GLOBALS['options']) ? $GLOBALS['options'][$key] : $default;
}
function update_option($key, $value, $autoload = null)
{
    $GLOBALS['writes'][] = [$key, $value, $autoload];
    if (!$GLOBALS['database_ok']) {
        return false;
    }
    $GLOBALS['options'][$key] = $value;
    return true;
}
function current_user_can($capability)
{
    return $capability === 'manage_options' && $GLOBALS['can_manage'];
}
function wp_die($message, $title, $args)
{
    throw new MbbConverterStop('denied:' . $args['response']);
}
function check_admin_referer($action)
{
    if ($action !== ($GLOBALS['expected_nonce'] ?? 'mbb_converter_save') || !$GLOBALS['nonce_ok']) {
        throw new MbbConverterStop('nonce');
    }
}
function wp_unslash($input)
{
    return $input;
}
function admin_url($path)
{
    return '/wp-admin/' . $path;
}
function wp_safe_redirect($url)
{
    throw new MbbConverterStop($url);
}
function get_current_user_id()
{
    return 42;
}
function set_transient($key, $value, $expiration)
{
    $GLOBALS['transients'][$key] = $value;
}
function mbb_test_diagnostics($backend, $path, $smoke)
{
    $GLOBALS['diagnostic_calls'][] = [$backend, $path, $smoke];
    return [
        'ok' => $GLOBALS['diagnostic_ok'],
        'path' => rtrim($path, '/'),
        'checks' => [
            [
                'label' => 'Synthetic readiness',
                'ok' => $GLOBALS['diagnostic_ok'],
                'message' => 'Synthetic result',
            ],
        ],
    ];
}
function mbb_php_converter_diagnostics($smoke = false)
{
    return mbb_test_diagnostics('php', '', $smoke);
}
function mbb_runtime_diagnostics($candidate = null, $smoke = false)
{
    if ($candidate === null && mbb_converter_backend() === 'php') {
        return mbb_php_converter_diagnostics($smoke);
    }
    return mbb_test_diagnostics('node', $candidate ?? mbb_runtime_configuration()['path'], $smoke);
}
require __DIR__ . '/../plugin/includes/converter-settings.php';
const MBB_RUNTIME_OPTION = 'mbb_runtime_path';
// Load selected real functions while leaving only environment diagnostics mocked.
// PHP tokenization tracks code braces, ignoring braces inside strings/comments.
function converter_load_functions($file, $names)
{
    $tokens = token_get_all(file_get_contents($file));
    for ($index = 0; $index < count($tokens); $index++) {
        if (!is_array($tokens[$index]) || $tokens[$index][0] !== T_FUNCTION) {
            continue;
        }
        $name_index = $index + 1;
        while (is_array($tokens[$name_index]) && $tokens[$name_index][0] === T_WHITESPACE) {
            $name_index++;
        }
        if (!is_array($tokens[$name_index]) || !in_array($tokens[$name_index][1], $names, true)) {
            continue;
        }
        $code = '';
        $depth = 0;
        $started = false;
        do {
            $token = $tokens[$index++];
            $code .= is_array($token) ? $token[1] : $token;
            if ($token === '{') {
                $started = true;
                $depth++;
            } elseif ($token === '}') {
                $depth--;
            }
        } while (!$started || $depth > 0);
        eval($code);
        $index--;
    }
}
converter_load_functions(__DIR__ . '/../plugin/includes/runtime-settings.php', [
    'mbb_runtime_normalize_path',
    'mbb_runtime_configuration',
    'mbb_runtime_settings_save',
    'mbb_runtime_settings_page',
]);
converter_load_functions(__DIR__ . '/../plugin/includes/conversion-backends.php', [
    'mbb_converter_backend',
]);

function esc_html($value)
{
    return htmlspecialchars($value, ENT_QUOTES);
}
function esc_attr($value)
{
    return htmlspecialchars($value, ENT_QUOTES);
}
function esc_url($value)
{
    return htmlspecialchars($value, ENT_QUOTES);
}
function wp_nonce_field($action)
{
    echo '<input name="_wpnonce" value="' . esc_attr($action) . '">';
}
function submit_button($text, ...$args)
{
    echo '<button>' . esc_html($text) . '</button>';
}
function get_transient($key)
{
    return $GLOBALS['transients'][$key] ?? false;
}
function delete_transient($key)
{
    unset($GLOBALS['transients'][$key]);
}
function do_action(...$args) {}
function mbb_admin_settings_overview($backend, $diagnostics)
{
    $GLOBALS['rendered_overview'] = [$backend, $diagnostics['ok']];
    echo '<p>Effective ' . esc_html($backend) . '</p>';
}
function mbb_admin_settings_preferences() {}
function converter_assert($condition, $message)
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}
function converter_submit($input)
{
    $GLOBALS['expected_nonce'] = 'mbb_converter_save';
    $_POST = ['converter' => $input];
    try {
        mbb_converter_settings_save();
    } catch (MbbConverterStop $stop) {
        return $stop->getMessage();
    }
    throw new RuntimeException('Handler did not terminate');
}
$baseline = $options;
$options[MBB_CONVERTER_OPTION] = ['backend' => 'php', 'runtime_path' => '/synthetic/retained/node'];
ob_start();
mbb_converter_settings_form();
$form = ob_get_clean();
converter_assert(
    str_contains($form, 'value="php" checked') &&
        str_contains($form, 'name="converter[runtime_path]"'),
    'PHP form cannot select Node and supply path',
);
converter_assert(
    str_contains($form, '<fieldset disabled>') === ($mode === 'backend-constant'),
    'Backend constant form was not locked',
);
converter_assert(
    str_contains($form, ' readonly') === ($mode === 'runtime-constant'),
    'Path constant form was not readonly',
);
$options = $baseline;

$node = ['backend' => 'node', 'runtime_path' => '/synthetic/new/node/'];
converter_assert(
    mbb_converter_settings() === null && $options === $baseline,
    'Default read wrote options',
);
$can_manage = false;
converter_assert(
    converter_submit($node) === 'denied:403' && $options === $baseline,
    'Capability bypass',
);
$can_manage = true;
$nonce_ok = false;
converter_assert(converter_submit($node) === 'nonce' && $options === $baseline, 'Nonce bypass');
$nonce_ok = true;
if ($mode === 'backend-constant') {
    converter_assert(
        str_contains(converter_submit($node), 'managed'),
        'Backend constant did not lock',
    );
    converter_assert(
        !$writes && !$diagnostic_calls && $options === $baseline,
        'Locked form changed state',
    );
    echo "Backend constant locking passed.\n";
    return;
}
foreach (
    [
        null,
        [],
        'php',
        $node + ['extra' => true],
        ['backend' => 'node'],
        ['backend' => 'unknown', 'runtime_path' => ''],
        ['backend' => ['php'], 'runtime_path' => ''],
        ['backend' => 'php', 'runtime_path' => []],
        ['backend' => 'node', 'runtime_path' => false],
    ]
    as $invalid
) {
    converter_assert(
        str_contains(converter_submit($invalid), 'rejected') && $options === $baseline,
        'Invalid input persisted',
    );
}
converter_assert(!$writes && !$diagnostic_calls, 'Invalid input invoked environment or DB writes');
$diagnostic_ok = false;
foreach (['php', 'node'] as $backend) {
    converter_assert(
        str_contains(
            converter_submit(['backend' => $backend, 'runtime_path' => $node['runtime_path']]),
            'rejected',
        ) && $options === $baseline,
        'Failed readiness switched backend',
    );
    converter_assert(
        $transients['mbb_converter_diagnostics_42']['backend'] === $backend,
        'Candidate engine identity lost',
    );
}
$diagnostic_ok = true;
$database_ok = false;
converter_assert(
    str_contains(converter_submit($node), 'save-failed') && $options === $baseline,
    'DB failure changed state or claimed success',
);
$database_ok = true;
$writes = [];
converter_assert(str_contains(converter_submit($node), 'updated'), 'Node choice failed');
$expected_path = $mode === 'runtime-constant' ? MARKBRIDGE_RUNTIME : '/synthetic/new/node';
$expected = ['backend' => 'node', 'runtime_path' => $expected_path];
converter_assert(
    mbb_converter_settings() === $expected,
    'Atomic combination/path normalization lost',
);
converter_assert(
    $writes === [[MBB_CONVERTER_OPTION, $expected, false]],
    'Selection was not one atomic write',
);
converter_assert(
    end($diagnostic_calls) === [
        'node',
        $mode === 'runtime-constant' ? MARKBRIDGE_RUNTIME : $node['runtime_path'],
        true,
    ],
    'Node did not smoke-test effective directory',
);
$writes = [];
converter_assert(
    str_contains(converter_submit($node), 'updated') && !$writes,
    'Duplicate choice failed or rewrote options',
);
converter_assert(
    str_contains(
        converter_submit(['backend' => 'php', 'runtime_path' => '/ignored/client/path']),
        'updated',
    ),
    'PHP choice failed',
);
converter_assert(
    mbb_converter_settings() === ['backend' => 'php', 'runtime_path' => $expected_path],
    'PHP choice discarded retained Node directory',
);
converter_assert(
    end($diagnostic_calls) === ['php', '', true],
    'PHP readiness was not smoke-tested',
);
$saved = $options;
$diagnostic_ok = false;
converter_assert(
    str_contains(converter_submit($node), 'rejected') && $options === $saved,
    'Failed switch changed saved configuration',
);
$diagnostic_ok = true;
$database_ok = false;
converter_assert(
    str_contains(converter_submit($node), 'save-failed') && $options === $saved,
    'DB switch failure changed configuration',
);
$database_ok = true;
converter_assert(
    array_diff_key($options, [MBB_CONVERTER_OPTION => true]) === $baseline,
    'Legacy option was migrated/deleted/rewritten',
);
foreach (
    [
        null,
        false,
        [],
        ['backend' => 'node'],
        ['backend' => 'node', 'runtime_path' => '', 'extra' => true],
    ]
    as $corrupt
) {
    $options[MBB_CONVERTER_OPTION] = $corrupt;
    $snapshot = $options;
    converter_assert(
        mbb_converter_settings() === false && $options === $snapshot,
        'Stored corruption guessed defaults or wrote DB',
    );
}
converter_assert(
    str_contains(converter_submit(['backend' => 'php', 'runtime_path' => '']), 'updated'),
    'Explicit valid selection could not repair corrupt configuration',
);

function converter_legacy_submit($path)
{
    $GLOBALS['expected_nonce'] = 'mbb_runtime_save';
    $_POST = ['runtime_path' => $path];
    try {
        mbb_runtime_settings_save();
    } catch (MbbConverterStop $stop) {
        return $stop->getMessage();
    }
    throw new RuntimeException('Legacy handler did not terminate');
}
if ($mode === 'runtime-constant') {
    $saved = $options;
    converter_assert(
        str_contains(converter_legacy_submit('/ignored/client'), 'managed') && $options === $saved,
        'Legacy interface bypassed path constant',
    );
} else {
    $options[MBB_CONVERTER_OPTION] = ['backend' => 'node', 'runtime_path' => '/synthetic/old/node'];
    $writes = [];
    converter_assert(
        str_contains(converter_legacy_submit('/synthetic/legacy-update/node/'), 'updated'),
        'Legacy interface failed with new Node object',
    );
    $expected = ['backend' => 'node', 'runtime_path' => '/synthetic/legacy-update/node'];
    converter_assert(
        $writes === [[MBB_CONVERTER_OPTION, $expected, false]] &&
            mbb_converter_settings() === $expected,
        'Legacy interface wrote obsolete path or partial object',
    );
    converter_assert(
        $options['mbb_runtime_path'] === $baseline['mbb_runtime_path'],
        'Legacy path overwritten under new option',
    );
    $saved = $options;
    $database_ok = false;
    converter_assert(
        str_contains(converter_legacy_submit('/synthetic/db-failure'), 'save-failed') &&
            $options === $saved,
        'Legacy DB failure reported success',
    );
    $database_ok = true;
    foreach ([['backend' => 'php', 'runtime_path' => '/retained/node'], null] as $blocked) {
        $options[MBB_CONVERTER_OPTION] = $blocked;
        $saved = $options;
        converter_assert(
            str_contains(converter_legacy_submit('/synthetic/rejected'), 'managed') &&
                $options === $saved,
            'Legacy interface changed PHP/corrupt object',
        );
    }
    unset($options[MBB_CONVERTER_OPTION]);
    $writes = [];
    converter_assert(
        str_contains(converter_legacy_submit('/synthetic/old-mode/node'), 'updated'),
        'Old Node interface no longer works',
    );
    converter_assert(
        $writes === [[MBB_RUNTIME_OPTION, '/synthetic/old-mode/node', false]] &&
            mbb_converter_settings() === null,
        'Old Node interface unexpectedly migrated options',
    );
}

$options[MBB_CONVERTER_OPTION] = ['backend' => 'php', 'runtime_path' => '/synthetic/retained/node'];
$transients['mbb_converter_diagnostics_42'] = [
    'backend' => 'node',
    'diagnostics' => [
        'ok' => false,
        'checks' => [['label' => 'Rejected Node', 'ok' => false, 'message' => 'Candidate failure']],
    ],
];
ob_start();
mbb_runtime_settings_page();
$page = ob_get_clean();
converter_assert(
    $rendered_overview === ['php', true],
    'Rejected candidate changed active engine health in overview',
);
converter_assert(
    str_contains($page, '未应用的候选方案诊断：node') && str_contains($page, 'Candidate failure'),
    'Rejected candidate was not shown separately',
);
echo "Converter selection capability, nonce, strict input, readiness, atomic persistence, failure preservation, constants and repeat selection passed.\n";
