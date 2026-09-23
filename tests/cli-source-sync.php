<?php
// Isolated regression for the existing file-bound CLI save path.
define('WP_CLI', true);
define('ABSPATH', '/isolated-markbridge-test/');

class WP_Error
{
    public function __construct(private $code, private $message, private $data = []) {}
    public function get_error_code()
    {
        return $this->code;
    }
    public function get_error_message()
    {
        return $this->message;
    }
}
class WP_REST_Request implements ArrayAccess
{
    private $data = [];
    private $body = '';
    public function __construct($method, $route) {}
    public function set_body($body)
    {
        $this->body = $body;
        $this->data = json_decode($body, true);
    }
    public function get_body()
    {
        return $this->body;
    }
    public function set_header($name, $value) {}
    public function offsetExists($offset): bool
    {
        return isset($this->data[$offset]);
    }
    public function offsetGet($offset): mixed
    {
        return $this->data[$offset] ?? null;
    }
    public function offsetSet($offset, $value): void
    {
        $this->data[$offset] = $value;
    }
    public function offsetUnset($offset): void
    {
        unset($this->data[$offset]);
    }
}
class TestDB
{
    public $last_error = '';
    public $queries = [];
    public function query($sql)
    {
        $this->queries[] = $sql;
        return 1;
    }
}
$wpdb = new TestDB();
$wp_filter = [];
$meta = [
    7 => [
        '_mbb_origin' => 'markdown_import',
        '_mbb_document_id' => 'M01',
        '_llm_document_id' => 'M01',
        '_mbb_source_managed' => 'file',
    ],
];
$post = (object) [
    'ID' => 7,
    'post_type' => 'post',
    'post_title' => 'Existing',
    'post_status' => 'publish',
    'post_author' => 1,
    'post_content' => 'paired:before',
    'post_content_filtered' => 'before',
    'post_date' => '2026-01-01 00:00:00',
    'post_date_gmt' => '2026-01-01 00:00:00',
];
$cached_post = null;
$worker_hook = null;
function get_post($id)
{
    global $post, $cached_post;
    if ((int) $id !== 7) {
        return null;
    }
    if ($cached_post === null) {
        $cached_post = clone $post;
    }
    return clone $cached_post;
}
function get_post_meta($id, $key, $single = true)
{
    global $meta;
    return $meta[$id][$key] ?? '';
}
function update_post_meta($id, $key, $value)
{
    global $meta;
    $meta[$id][$key] = $value;
    return true;
}
function get_post_thumbnail_id($id)
{
    return 0;
}
function delete_post_thumbnail($id)
{
    return true;
}
function wp_json_encode($value)
{
    return json_encode($value);
}
function absint($value)
{
    return abs((int) $value);
}
function is_wp_error($value)
{
    return $value instanceof WP_Error;
}
function mbb_is_lab()
{
    return false;
}
function get_posts($args)
{
    return [7];
}
function get_post_stati()
{
    return ['publish' => 'Published'];
}
function clean_post_cache($id)
{
    global $cached_post;
    $cached_post = null;
}
function sanitize_text_field($value)
{
    return $value;
}
function mbb_runtime_diagnostics()
{
    return ['ok' => true];
}
function mbb_run_worker($input)
{
    global $worker_hook;
    if ($worker_hook) {
        $hook = $worker_hook;
        $worker_hook = null;
        $hook();
    }
    return [
        'ok' => true,
        'document' => [
            'source' => $input['source'],
            'serialized' => 'paired:' . $input['source'],
        ],
    ];
}
function parse_blocks($value)
{
    return [];
}
function mbb_with_publication($request, $post, $candidate)
{
    return array_merge($candidate, [
        'post_status' => $request['post_status'],
        'featured_media' => 0,
    ]);
}
function wp_get_post_revisions($id)
{
    return [];
}
function mbb_pair_snapshot($id, $floor = 0)
{
    return 11;
}
function wp_slash($value)
{
    return $value;
}
function wp_update_post($data, $error)
{
    global $post;
    foreach ($data as $key => $value) {
        $post->$key = $value;
    }
    return 7;
}
function add_filter($name, $callback) {}
function remove_filter($name, $callback) {}
function has_filter($name, $callback)
{
    return false;
}
function apply_filters($name, $value, ...$args)
{
    return $value;
}
function add_action($name, $callback) {}
function current_user_can($capability, ...$args)
{
    return false;
}
function admin_url($path)
{
    return $path;
}
function get_preview_post_link($id)
{
    return 'preview';
}

require __DIR__ . '/../plugin/source-sync.php';
require __DIR__ . '/../plugin/editor-bridge.php';

function check($condition, $message)
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}
function request($source, $path = null)
{
    $request = new WP_REST_Request('POST', '/mbb/v1/save');
    $request->set_body(
        wp_json_encode([
            'post_id' => 7,
            'mode' => 'markdown',
            'source' => $source,
            'title' => 'Existing',
            'post_status' => 'publish',
            'expected' => mbb_token(get_post(7)),
            'source_path' => $path,
        ]),
    );
    return $request;
}

$dir = sys_get_temp_dir() . '/mbb-cli-sync-' . bin2hex(random_bytes(5));
mkdir($dir, 0700);
$path = $dir . '/source.md';
$other = $dir . '/other.md';
file_put_contents($path, 'new');
file_put_contents($other, 'new');
$meta[7]['_mbb_source_path_hash'] = hash('sha256', realpath($path));
try {
    $result = mbb_save(request('new', $path));
    check(
        is_wp_error($result) && $result->get_error_code() === 'source_managed',
        'REST save bypass',
    );
    check($post->post_content_filtered === 'before', 'REST save changed article');
    $GLOBALS['mbb_source_web_write'] = true;
    $result = mbb_save(request('new', $path));
    $GLOBALS['mbb_source_web_write'] = false;
    check(
        is_wp_error($result) && $result->get_error_code() === 'source_target_unavailable',
        'Web write bypassed trusted target',
    );

    try {
        mbb_sync_write(7, 'new', null, $other);
        throw new RuntimeException('Wrong path accepted');
    } catch (RuntimeException $error) {
        check($error->getMessage() === 'Wrong source owner or source changed', 'Wrong path error');
    }
    try {
        mbb_sync_write(7, 'stale', null, $path);
        throw new RuntimeException('Wrong contents accepted');
    } catch (RuntimeException $error) {
        check(
            $error->getMessage() === 'Wrong source owner or source changed',
            'Wrong contents error',
        );
    }

    $worker_hook = static function () use ($path) {
        file_put_contents($path, 'changed-during-conversion');
    };
    try {
        mbb_sync_write(7, 'new', null, $path);
        throw new RuntimeException('Concurrent source change accepted');
    } catch (RuntimeException $error) {
        check(
            str_contains($error->getMessage(), '源文件绑定或内容已变化'),
            'Source conflict error',
        );
    }
    check($post->post_content_filtered === 'before', 'Source conflict changed article');

    file_put_contents($path, 'new');
    $worker_hook = static function () {
        global $post;
        $post->post_title = 'Edited during conversion';
    };
    try {
        mbb_sync_write(7, 'new', null, $path);
        throw new RuntimeException('Concurrent article change accepted');
    } catch (RuntimeException $error) {
        check(str_contains($error->getMessage(), '文章已有新修改'), 'Article conflict error');
    }
    check($post->post_content_filtered === 'before', 'Article conflict changed body');

    $post->post_title = 'Existing';
    clean_post_cache(7);
    $worker_hook = static function () {
        global $meta;
        $meta[7]['_mbb_source_managed'] = '';
    };
    try {
        mbb_sync_write(7, 'new', null, $path);
        throw new RuntimeException('Changed source identity accepted');
    } catch (RuntimeException $error) {
        check(
            str_contains($error->getMessage(), '文章或文件来源身份已变化'),
            'Identity conflict error',
        );
    }
    check($post->post_content_filtered === 'before', 'Identity conflict changed body');
    $meta[7]['_mbb_source_managed'] = 'file';
    clean_post_cache(7);
    $saved = mbb_sync_write(7, 'new', null, $path);
    check($saved === 7, 'CLI save returned wrong ID');
    check($post->post_content_filtered === 'new', 'CLI save missed Markdown');
    check($post->post_content === 'paired:new', 'CLI save missed paired blocks');
    check(file_get_contents($path) === 'new', 'CLI save rewrote source file');
    check(in_array('COMMIT', $wpdb->queries, true), 'CLI save missed transaction');
    echo "CLI save, path/content binding, concurrent changes and REST guard passed.\n";
} finally {
    unlink($path);
    unlink($other);
    rmdir($dir);
}
