<?php
// Synthetic signature and filesystem contracts; actual WordPress uses merge-save.php.
define('ABSPATH', sys_get_temp_dir() . '/mbb-merge-model-wp/');
function add_action(...$args) {}
function add_filter(...$args) {}
function home_url($path = '')
{
    return 'http://merge-model.invalid' . $path;
}
function get_current_blog_id()
{
    return $GLOBALS['blog'];
}
function get_current_user_id()
{
    return $GLOBALS['actor'];
}
function is_user_logged_in()
{
    return $GLOBALS['logged'];
}
function current_user_can($cap, $id = null)
{
    return $GLOBALS['logged'] && $GLOBALS['edit'];
}
function wp_salt($scheme)
{
    return 'synthetic-merge-signing-salt';
}
function wp_json_encode($value, $flags = 0)
{
    return json_encode($value, $flags);
}
function mbb_component_json($value)
{
    return json_encode(
        $value,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS,
    );
}
function mbb_managed($id)
{
    return $id === 12 && $GLOBALS['meta']['_mbb_origin'] === 'markdown_import';
}
function mbb_id($id)
{
    return $GLOBALS['meta']['_mbb_document_id'];
}
function get_post_meta($id, $key, $single = true)
{
    return $GLOBALS['meta'][$key] ?? '';
}
function get_post($id)
{
    return $id === 12 ? $GLOBALS['post'] : null;
}
function clean_post_cache($id) {}
function mbb_token($p)
{
    return hash('sha256', serialize([$p, $GLOBALS['cover'], mbb_binding_projection($p)]));
}
function mbb_document($p)
{
    return [
        'schema' => 1,
        'converter' => '0.2.0',
        'origin' => 'markdown_import',
        'documentId' => mbb_id($p->ID),
        'source' => $p->post_content_filtered,
        'serialized' => $p->post_content,
    ];
}
function get_post_thumbnail_id($id)
{
    return $GLOBALS['cover'];
}
function mbb_frontmatter_current($p)
{
    return ['title' => $p->post_title];
}
function apply_filters($name, $value, ...$args)
{
    return $name === 'mbb_source_write_target' ? $GLOBALS['file'] : $value;
}
function absint($value)
{
    return abs((int) $value);
}
function wp_update_post(...$args)
{
    throw new RuntimeException('Read-only merge tried to write');
}
class WP_Error
{
    public function __construct(public $code, public $message = '', public $data = []) {}
    public function get_error_code()
    {
        return $this->code;
    }
    public function get_error_message()
    {
        return $this->message;
    }
}
function is_wp_error($value)
{
    return $value instanceof WP_Error;
}
function mbb_error($code, $message, $status = 409)
{
    return new WP_Error($code, $message, ['status' => $status]);
}
class WP_REST_Request implements ArrayAccess
{
    public function __construct(
        public $method = 'POST',
        public $route = '/',
        public array $values = [],
    ) {}
    public function get_json_params()
    {
        return $this->values;
    }
    public function set_param($key, $value)
    {
        $this->values[$key] = $value;
    }
    public function get_param($key)
    {
        return $this->values[$key] ?? null;
    }
    public function offsetExists($key): bool
    {
        return isset($this->values[$key]);
    }
    public function offsetGet($key): mixed
    {
        return $this->values[$key] ?? null;
    }
    public function offsetSet($key, $value): void
    {
        $this->values[$key] = $value;
    }
    public function offsetUnset($key): void
    {
        unset($this->values[$key]);
    }
}
function mbb_source_write_permission($r)
{
    return $GLOBALS['sourceWrite'] && current_user_can('edit_post', $r['post_id'])
        ? true
        : mbb_error('source_forbidden', 'Synthetic source permission denied', 403);
}
require __DIR__ . '/../plugin/includes/php-converter/Worker.php';
function mbb_convert($r)
{
    if (isset($GLOBALS['duringConvert'])) {
        $hook = $GLOBALS['duringConvert'];
        unset($GLOBALS['duringConvert']);
        $hook($r);
    }
    $v = \MarkBridge\Probe\Worker::convert($r);
    return $v['ok'] ? $v['document'] : mbb_error($v['code'], $v['message']);
}
require __DIR__ . '/../plugin/resource-import.php';
require __DIR__ . '/../plugin/export.php';
require __DIR__ . '/../plugin/source-sync.php';
require __DIR__ . '/../plugin/merge.php';
function assertMerge($value, $message)
{
    if (!$value) {
        throw new RuntimeException($message);
    }
}
function callMerge($action, $data)
{
    return ('mbb_merge_' .
        $action)(new WP_REST_Request('POST', '/', ['schema' => 1, 'post_id' => 12] + $data));
}
function errorMerge($result, $code)
{
    assertMerge(
        is_wp_error($result) && $result->code === $code,
        'Expected ' . $code . ', got ' . (is_wp_error($result) ? $result->code : 'success'),
    );
}
function setDocument($source)
{
    $doc = mbb_convert(['mode' => 'markdown', 'documentId' => 'MERGE-MODEL', 'source' => $source]);
    assertMerge(!is_wp_error($doc), 'Invalid synthetic document');
    $GLOBALS['post']->post_content_filtered = $doc['source'];
    $GLOBALS['post']->post_content = $doc['serialized'];
}
$GLOBALS['actor'] = 11;
$GLOBALS['blog'] = 1;
$GLOBALS['logged'] = $GLOBALS['edit'] = $GLOBALS['sourceWrite'] = true;
$GLOBALS['cover'] = 0;
$GLOBALS['file'] = null;
$GLOBALS['meta'] = [
    '_mbb_origin' => 'markdown_import',
    '_mbb_document_id' => 'MERGE-MODEL',
    '_mbb_source_managed' => '',
    '_mbb_source_path_hash' => '',
];
$GLOBALS['post'] = (object) [
    'ID' => 12,
    'post_type' => 'post',
    'post_status' => 'draft',
    'post_title' => 'Opening title',
];
$a = "First.\r\n\r\nSecond.\r\n";
setDocument($a);
$b = [
    'source' => str_replace('First', 'Mine', $a),
    'title' => 'Opening title',
    'post_status' => 'draft',
    'featured_media' => 0,
];
$files = [];
try {
    $baseline = clone $GLOBALS['post'];
    $opening = callMerge('open', ['expected' => mbb_token($GLOBALS['post'])]);
    assertMerge(!is_wp_error($opening), 'Opening failed');
    assertMerge($opening['document']['source'] === $a, 'Opening source normalized');
    foreach (['cover', 'binding', 'role'] as $race) {
        $beforeMeta = $GLOBALS['meta'];
        $beforeCover = $GLOBALS['cover'];
        $GLOBALS['duringConvert'] = static function () use ($race) {
            if ($race === 'cover') {
                $GLOBALS['cover'] = 2;
            } elseif ($race === 'binding') {
                $GLOBALS['meta']['_mbb_source_path_hash'] = 'changed-during-paired-restore';
            } else {
                $GLOBALS['edit'] = false;
            }
        };
        errorMerge(
            callMerge('open', ['expected' => mbb_token($GLOBALS['post'])]),
            $race === 'role' ? 'merge_forbidden' : 'merge_conflict',
        );
        assertMerge($GLOBALS['post'] == $baseline, 'Snapshot race wrote article');
        $GLOBALS['cover'] = $beforeCover;
        $GLOBALS['meta'] = $beforeMeta;
        $GLOBALS['edit'] = true;
    }
    foreach (['binding', 'role'] as $race) {
        $beforeMeta = $GLOBALS['meta'];
        $GLOBALS['duringConvert'] = static function () use ($race) {
            if ($race === 'binding') {
                $GLOBALS['meta']['_mbb_source_path_hash'] = 'changed-during-envelope-verification';
            } else {
                $GLOBALS['edit'] = false;
            }
        };
        errorMerge(
            callMerge('latest', ['opening' => $opening, 'candidate' => $b]),
            $race === 'role' ? 'merge_forbidden' : 'merge_binding',
        );
        assertMerge($GLOBALS['post'] == $baseline, 'Envelope race wrote article');
        $GLOBALS['meta'] = $beforeMeta;
        $GLOBALS['edit'] = true;
    }
    $projection = mbb_binding_projection($GLOBALS['post']);
    $GLOBALS['actor'] = 22;
    assertMerge(
        mbb_binding_projection($GLOBALS['post']) === $projection,
        'Binding HMAC included actor',
    );
    errorMerge(callMerge('latest', ['opening' => $opening, 'candidate' => $b]), 'merge_identity');
    $GLOBALS['actor'] = 11;
    $GLOBALS['blog'] = 2;
    errorMerge(callMerge('latest', ['opening' => $opening, 'candidate' => $b]), 'merge_identity');
    $GLOBALS['blog'] = 1;
    $GLOBALS['edit'] = false;
    errorMerge(callMerge('latest', ['opening' => $opening, 'candidate' => $b]), 'merge_forbidden');
    $GLOBALS['edit'] = true;
    $tampered = $opening;
    $tampered['document']['source'] .= 'tampered';
    errorMerge(callMerge('latest', ['opening' => $tampered, 'candidate' => $b]), 'merge_pair');
    $tampered = $opening;
    $tampered['claims']['expires'] = time() - 1;
    $tampered['signature'] = mbb_merge_sign($tampered['claims']);
    errorMerge(callMerge('latest', ['opening' => $tampered, 'candidate' => $b]), 'merge_expired');
    foreach (["\n" . str_repeat("\n", 32768), str_repeat('x', 262145)] as $oversize) {
        errorMerge(
            callMerge('latest', [
                'opening' => $opening,
                'candidate' => ['source' => $oversize] + array_diff_key($b, ['source' => true]),
            ]),
            strlen($oversize) > 262144 ? 'merge_candidate' : 'merge_budget',
        );
    }
    $c = str_replace('Second', 'Server', $a);
    setDocument($c);
    $GLOBALS['post']->post_title = 'Server title';
    $GLOBALS['post']->post_status = 'pending';
    $GLOBALS['cover'] = 2;
    $latest = callMerge('latest', ['opening' => $opening, 'candidate' => $b]);
    assertMerge(!is_wp_error($latest), 'Latest failed');
    $before = clone $GLOBALS['post'];
    $adopt = [
        'opening' => $opening,
        'latest' => $latest,
        'candidate' => $b,
        'source' => str_replace('First', 'Mine', $c),
    ];
    $result = callMerge('adopt', $adopt);
    assertMerge(
        !is_wp_error($result) &&
            $result['saved'] === false &&
            $result['newbase']['post_id'] === 12 &&
            $result['newbase']['featured_media'] === 2 &&
            $result['newbase']['post_status'] === 'pending' &&
            $GLOBALS['post'] == $before,
        'Adoption changed article or lost C metadata',
    );
    $changed = $adopt;
    $changed['candidate']['featured_media'] = 3;
    errorMerge(callMerge('adopt', $changed), 'merge_candidate');
    $GLOBALS['post']->post_title = 'Later title';
    errorMerge(callMerge('adopt', $adopt), 'merge_conflict');
    $GLOBALS['post']->post_title = 'Server title';
    $changed = $adopt;
    $changed['source'] = str_repeat("\r\n", 32769);
    errorMerge(callMerge('adopt', $changed), 'merge_budget');
    $changed = $adopt;
    $changed['source'] = ":::mbb:v1 collapse {}\n:::mbb:end\n";
    errorMerge(callMerge('adopt', $changed), 'merge_conversion');
    $files[] = $file = tempnam(sys_get_temp_dir(), 'mbb-merge-model-');
    file_put_contents($file, $c);
    $GLOBALS['file'] = $file;
    $GLOBALS['meta']['_mbb_source_managed'] = 'file';
    $GLOBALS['meta']['_mbb_source_path_hash'] = hash('sha256', realpath($file));
    $sourceOpening = callMerge('open', ['expected' => mbb_token($GLOBALS['post'])]);
    assertMerge(!is_wp_error($sourceOpening), 'Source opening failed');
    $sourceToken = mbb_token($GLOBALS['post']);
    $files[] = $newFile = tempnam(sys_get_temp_dir(), 'mbb-merge-rebind-');
    file_put_contents($newFile, $c);
    $GLOBALS['file'] = $newFile;
    $GLOBALS['meta']['_mbb_source_path_hash'] = hash('sha256', realpath($newFile));
    assertMerge(
        mbb_token($GLOBALS['post']) !== $sourceToken,
        'Same-byte rebind did not change token',
    );
    errorMerge(
        callMerge('latest', ['opening' => $sourceOpening, 'candidate' => $b]),
        'merge_binding',
    );
    $GLOBALS['file'] = $file;
    $GLOBALS['meta']['_mbb_source_path_hash'] = hash('sha256', realpath($file));
    $GLOBALS['sourceWrite'] = false;
    errorMerge(
        callMerge('latest', ['opening' => $sourceOpening, 'candidate' => $b]),
        'merge_forbidden',
    );
    $GLOBALS['sourceWrite'] = true;
    file_put_contents($file, $c . 'external');
    errorMerge(
        callMerge('open', ['expected' => mbb_token($GLOBALS['post'])]),
        'merge_source_diverged',
    );
    file_put_contents($file, str_repeat('x', 262145));
    errorMerge(
        callMerge('open', ['expected' => mbb_token($GLOBALS['post'])]),
        'merge_source_diverged',
    );
    assertMerge(filesize($file) === 262145, 'Oversize source was modified');
    echo "Merge signature/binding/source bounds/candidate/expiry/permissions/latest race/noWrites models passed\n";
} finally {
    foreach ($files as $file) {
        unlink($file);
    }
}
