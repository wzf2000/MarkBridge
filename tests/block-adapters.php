<?php
declare(strict_types=1);
require __DIR__ . '/helpers/localization.php';
// Pure registration/JSON/HTML trust contracts. Actual WordPress writes use block-adapters-save.php.
$actions = $filters = $types = $inline = [];
function add_action($name, $callback, ...$args)
{
    $GLOBALS['actions'][$name][] = $callback;
}
function add_filter($name, $callback, ...$args)
{
    $GLOBALS['filters'][$name][] = $callback;
}
function register_block_type($name, $args)
{
    if (isset($GLOBALS['types'][$name])) {
        return false;
    }
    return $GLOBALS['types'][$name] = $args;
}
function unregister_block_type($name)
{
    unset($GLOBALS['types'][$name]);
    return true;
}
function wp_script_is($handle, $state)
{
    return $handle === 'mbb-kernel';
}
function wp_add_inline_script($handle, $text, $position)
{
    $GLOBALS['inline'][] = [$handle, $text, $position];
}
function ba_assert($condition, $message)
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}
require dirname(__DIR__) . '/plugin/block-adapters.php';
require dirname(__DIR__) . '/plugin/includes/php-converter/Worker.php';
use MarkBridge\Probe\BlockAdapters;
use MarkBridge\Probe\Worker;
$fixture = json_decode(
    file_get_contents(__DIR__ . '/fixtures/block-adapters.json'),
    false,
    32,
    JSON_THROW_ON_ERROR,
);
$descriptor = $fixture->descriptors[0];
ba_assert(mbb_register_block_adapter($descriptor), 'Trusted registration failed');
$digest = mbb_block_adapter_digest();
ba_assert(!mbb_register_block_adapter($descriptor), 'Same name/version registered twice');
ba_assert(
    $types[$descriptor->blockName]['supports']['html'] === false,
    'Static editor exposed HTML override',
);
ba_assert(
    !isset($types[$descriptor->blockName]['attributes']['text']['default']),
    'Static fields silently defaulted',
);
$snapshot = mbb_block_adapter_snapshot();
foreach ($fixture->native as $source) {
    $doc = Worker::convert([
        'mode' => 'markdown',
        'source' => $source,
        'documentId' => 'php-native',
        'blockAdapters' => $snapshot,
    ]);
    ba_assert($doc['ok'], json_encode($doc));
    $doc = $doc['document'];
    $result = Worker::convert([
        'mode' => 'paired_restore',
        'source' => $source,
        'serialized' => $doc['serialized'],
        'documentId' => $doc['documentId'],
        'blockAdapters' => $snapshot,
    ]);
    ba_assert(
        $result['ok'] && $result['document'] === $doc,
        'Native exact source could not restore',
    );
}
// Whole fragment validation rejects wrapper escapes rather than silently dropping suffix nodes.
foreach (
    [
        ['summary', 'Safe</div><span>ignored</span><div>'],
        ['buttonText', 'Safe</div><script>alert(1)</script><div>'],
    ]
    as [$method, $text]
) {
    try {
        BlockAdapters::$method($text);
        ba_assert(false, 'Fragment escape accepted');
    } catch (MarkBridge\Probe\ConversionError $error) {
        ba_assert(
            in_array(
                $error->errorCode,
                ['ADAPTER_INLINE', 'ADAPTER_SUMMARY', 'ADAPTER_STRUCTURE'],
                true,
            ),
            'Unexpected fragment error',
        );
    }
}
foreach (
    [['summary' => 123], ['summary' => null], ['summary' => 'Safe', 'anchor' => null]]
    as $attrs
) {
    try {
        BlockAdapters::nativeAttrs('details', $attrs);
        ba_assert(false, 'Invalid native type accepted');
    } catch (MarkBridge\Probe\ConversionError $error) {
    }
}
foreach ([null, 123] as $text) {
    try {
        BlockAdapters::nativeAttrs('button', ['url' => '#x', 'text' => $text]);
        ba_assert(false, 'Invalid button text accepted');
    } catch (MarkBridge\Probe\ConversionError $error) {
    }
}
// Bad trusted providers cannot stop page initialization or poison other registered JSON.
foreach ([NAN, INF, fopen('php://memory', 'r'), "\xff"] as $value) {
    $bad = clone $descriptor;
    $bad->name = 'bad-provider';
    $bad->template = (object) ['tag' => 'p', 'children' => [(object) ['text' => $value]]];
    ba_assert(!mbb_register_block_adapter($bad), 'Invalid trusted registration accepted');
    if (is_resource($value)) {
        fclose($value);
    }
}
foreach (['core/paragraph', 'mbb/code', $descriptor->blockName] as $name) {
    $bad = clone $descriptor;
    $bad->name = 'other';
    $bad->blockName = $name;
    ba_assert(!mbb_register_block_adapter($bad), 'Reserved/colliding block name accepted');
}
$bad = clone $descriptor;
$bad->name = 'bad-template';
$bad->blockName = 'example/bad-template';
$bad->template = (object) [
    'tag' => 'p',
    'children' => [(object) ['tag' => 'div', 'children' => []]],
];
ba_assert(!mbb_register_block_adapter($bad), 'DOM-repaired template accepted');
$bad = unserialize(serialize($descriptor));
$bad->name = 'bad-field';
$bad->blockName = 'example/bad-field';
$bad->template->children[0]->children[0]->field = ['text'];
ba_assert(!mbb_register_block_adapter($bad), 'Array coerced to field name');
$source =
    ':::mbb:v1 adapter ' .
    json_encode([
        'name' => 'plain-card',
        'version' => '1.0.0',
        'attrs' => [
            'text' => 'Literal <tag> & <!--<script> ![x](image.png) $x$',
            'count' => 1.0,
            'enabled' => false,
            'tone' => 'plain',
        ],
    ]) .
    "\n:::mbb:end\n";
$doc = Worker::convert([
    'mode' => 'markdown',
    'source' => $source,
    'documentId' => 'php-static',
    'blockAdapters' => $snapshot,
]);
ba_assert($doc['ok'], json_encode($doc));
ba_assert(
    str_contains($doc['document']['serialized'], '1 / false / plain'),
    'Pure boolean/integer text changed',
);
$precision = ini_get('serialize_precision');
ini_set('serialize_precision', '14');
ba_assert(mbb_block_adapter_digest() === $digest, 'Registry depends on PHP precision');
ini_set('serialize_precision', (string) $precision);
foreach ($actions['enqueue_block_editor_assets'] as $callback) {
    $callback();
}
ba_assert(
    count($inline) === 1 && $inline[0][0] === 'mbb-kernel' && $inline[0][2] === 'before',
    'Registry attached to wrong script lifecycle',
);
$decoded = json_decode(
    substr($inline[0][1], strlen('window.MBB_ADAPTERS='), -1),
    false,
    32,
    JSON_THROW_ON_ERROR,
);
ba_assert(count($decoded) === 1, 'Inline registry corrupted');
ba_assert(
    mbb_unregister_block_adapter('plain-card') && mbb_block_adapter_digest() !== $digest,
    'Missing provider did not change registry identity',
);
$missing = Worker::convert([
    'mode' => 'paired_restore',
    'source' => $source,
    'serialized' => $doc['document']['serialized'],
    'documentId' => 'php-static',
    'blockAdapters' => mbb_block_adapter_snapshot(),
]);
ba_assert(!$missing['ok'], 'Missing provider reinterpreted static content');
$notice = $filters['render_block'][0]($doc['document']['serialized'], [
    'blockName' => $descriptor->blockName,
    'attrs' => ['mbbAdapterVersion' => '1.0.0'],
]);
ba_assert(
    str_ends_with($notice, $doc['document']['serialized']) &&
        str_contains($notice, '已保存内容与配置保留'),
    'Missing provider erased saved static content',
);
ba_assert(
    mbb_register_block_adapter($descriptor) && mbb_block_adapter_digest() === $digest,
    'Same provider restore changed digest',
);
echo "Block adapter PHP registration/native/fragment contracts passed.\n";
// Execute the real public preparation functions with modeled one-shot registry hooks.
// This is not a DB test: the guarded suite separately injects real WP filters/actions.
class WP_Error
{
    public function __construct(
        public string $code,
        public string $message,
        public array $data = [],
    ) {}
}
function is_wp_error($value)
{
    return $value instanceof WP_Error;
}
function mbb_error($code, $message, $status = 409)
{
    return new WP_Error($code, $message, ['status' => $status]);
}
function get_post($id)
{
    return null;
}
function mbb_resource_receipt(...$args)
{
    return null;
}
function mbb_render_footnotes($html)
{
    return $html;
}
function ba_mutate_registry($phase)
{
    if (($GLOBALS['ba_mutation_phase'] ?? null) !== $phase) {
        return;
    }
    $GLOBALS['ba_mutation_phase'] = null;
    mbb_unregister_block_adapter('plain-card');
    $d = $GLOBALS['ba_mutation_descriptor'];
    if (!mbb_register_block_adapter($d)) {
        throw new RuntimeException('Model mutation failed');
    }
}
function parse_blocks($serialized)
{
    ba_mutate_registry('parse');
    return [['attrs' => ['mbbAdapterVersion' => '1.0.0'], 'innerBlocks' => []]];
}
function do_blocks($serialized)
{
    ba_mutate_registry('render');
    return $serialized;
}
function mbb_preview_navigation($document, $projected)
{
    // This model checks registry mutation during render. Real navigation uses the WP lab suite.
    return [
        'html' => mbb_render_footnotes(do_blocks($projected['serialized'])),
        'navigation' => null,
    ];
}
function mbb_candidate_current($request)
{
    return [
        'document' => $GLOBALS['ba_candidate_document'],
        'post_id' => 0,
        'title' => 'Model candidate',
    ];
}
define('ABSPATH', __DIR__ . '/');
require dirname(__DIR__) . '/plugin/native-media.php';
$api = file_get_contents(dirname(__DIR__) . '/plugin/editor-bridge.php');
$begin = strpos($api, 'function mbb_candidate($r)');
$end = strpos($api, 'function mbb_candidate_current($r)', $begin);
eval(substr($api, $begin, $end - $begin));
$begin = strpos($api, 'function mbb_preview($r)');
$end = strpos($api, '// Code/TeX attributes', $begin);
eval(substr($api, $begin, $end - $begin));
$GLOBALS['ba_candidate_document'] = $doc['document'];
$GLOBALS['ba_mutation_descriptor'] = json_decode(json_encode($descriptor), true);
$GLOBALS['ba_mutation_descriptor']['template']['children'][1]['children'][1]['text'] = ' : ';
foreach (['parse', 'render'] as $phase) {
    $GLOBALS['ba_mutation_phase'] = $phase;
    $result = mbb_preview(new ArrayObject());
    ba_assert(
        is_wp_error($result) && $result->code === 'adapter_conflict',
        'Old rendered candidate acquired a new registry digest',
    );
    mbb_unregister_block_adapter('plain-card');
    ba_assert(mbb_register_block_adapter($descriptor), 'Could not restore model provider');
}
$candidate = mbb_candidate(new ArrayObject());
$captured = $candidate['adapter_digest'];
$GLOBALS['ba_mutation_phase'] = 'parse';
ba_assert(
    mbb_block_adapter_confirm(['adapter_digest' => $captured], $candidate) === true &&
        $GLOBALS['ba_mutation_phase'] === 'parse',
    'Confirmation re-parsed dependency instead of checking captured identity',
);
ba_mutate_registry('parse');
ba_assert(
    is_wp_error(
        mbb_block_adapter_confirm(['adapter_digest' => mbb_block_adapter_digest()], $candidate),
    ),
    'Changed candidate identity was washed by the current digest',
);
mbb_unregister_block_adapter('plain-card');
ba_assert(mbb_register_block_adapter($descriptor), 'Could not restore provider after model race');
echo "Captured registry digest preparation/render/confirmation race contracts passed.\n";
