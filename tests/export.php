<?php
// Synthetic option/CAS and attachment models; guarded WordPress tests are separate.
define('ABSPATH', sys_get_temp_dir() . '/mbb-export-model-wp-' . bin2hex(random_bytes(8)) . '/');
function add_action(...$args) {}
function add_filter(...$args) {}
function is_user_logged_in()
{
    return $GLOBALS['logged'];
}
function current_user_can($cap, $id = null)
{
    return !in_array($cap . ':' . $id, $GLOBALS['denied'], true);
}
function get_current_user_id()
{
    return $GLOBALS['actor'];
}
function get_current_blog_id()
{
    return $GLOBALS['blog'];
}
function home_url($path = '')
{
    return 'http://export-model.invalid' . $path;
}
function wp_salt($scheme)
{
    return 'synthetic-export-salt';
}
function mbb_component_json($value)
{
    return json_encode(
        $value,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS,
    );
}
function clean_post_cache($id) {}
function mbb_managed($id)
{
    return $id === 12;
}
function mbb_id($id)
{
    return 'EXPORT-MODEL';
}
function get_post($id)
{
    return $id === 12 ? $GLOBALS['post'] : null;
}
function get_post_type($id)
{
    return $id === 34 ? 'attachment' : 'post';
}
function mbb_token($p)
{
    return hash('sha256', serialize($p));
}
function mbb_permission($r)
{
    return true;
}
function get_post_meta($id, $key, $single = true)
{
    return $key === '_mbb_source_managed' ? 'file' : '';
}
function wp_upload_dir()
{
    return ['basedir' => $GLOBALS['uploads']];
}
function get_posts($args)
{
    $GLOBALS['enumerations'][] = $args;
    return $GLOBALS['ids'];
}
function get_attached_file($id, $unfiltered = false)
{
    return $GLOBALS['imageFile'];
}
function wp_get_attachment_url($id)
{
    $GLOBALS['mediaReads']++;
    return $GLOBALS['imageURL'];
}
function wp_get_attachment_metadata($id)
{
    return ['sizes' => []];
}
function wp_get_attachment_image_src($id, $size)
{
    return false;
}
function parse_blocks($content)
{
    return [];
}
function mbb_frontmatter_current($post)
{
    return [
        'title' => $post->post_title,
        'excerpt' => '',
        'slug' => 'model',
        'status' => 'draft',
        'featured_media' => 0,
        'categories' => [],
        'tags' => [],
    ];
}
function maybe_serialize($value)
{
    return serialize($value);
}
function wp_cache_delete(...$args) {}
function add_option($key, $value, $deprecated = '', $autoload = false)
{
    if (isset($GLOBALS['options'][$key])) {
        return false;
    }
    $GLOBALS['options'][$key] = $value;
    return true;
}
function get_option($key, $default = null)
{
    return $GLOBALS['options'][$key] ?? $default;
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
class WP_REST_Response
{
    public function __construct(public $data, public $status = 200, public $headers = []) {}
    public function get_data()
    {
        return $this->data;
    }
}
class ExportRequest implements ArrayAccess
{
    public function __construct(public array $values) {}
    public function get_json_params()
    {
        return array_diff_key($this->values, ['token' => true]);
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
$GLOBALS['wpdb'] = new class {
    public $options = 'model_options';
    public function prepare($sql, ...$args)
    {
        return $args;
    }
    public function query($args)
    {
        $update = count($args) === 3;
        if ($update) {
            [$new, $key, $old] = $args;
        } else {
            [$key, $old] = $args;
        }
        if ($update && ($GLOBALS['readyFailure'] ?? null)) {
            $mode = $GLOBALS['readyFailure'];
            $GLOBALS['readyFailure'] = null;
            $GLOBALS['failedReadyToken'] = unserialize($new)['token'];
            if ($mode === 'cancelled') {
                unset($GLOBALS['options'][$key]);
            }
            return $mode === 'cancelled' ? 0 : false;
        }
        if ($GLOBALS['cancelRace']) {
            unset($GLOBALS['options'][$key]);
            $GLOBALS['cancelRace'] = false;
        }
        if (!isset($GLOBALS['options'][$key]) || serialize($GLOBALS['options'][$key]) !== $old) {
            return 0;
        }
        if ($update) {
            $GLOBALS['options'][$key] = unserialize($new);
        } else {
            unset($GLOBALS['options'][$key]);
        }
        return 1;
    }
};
require __DIR__ . '/../plugin/includes/php-converter/Worker.php';
require __DIR__ . '/../plugin/includes/php-converter/Teaching.php';
function mbb_convert($request)
{
    $result = \MarkBridge\Probe\Worker::convert($request);
    return $result['ok'] ? $result['document'] : mbb_error($result['code'], $result['message']);
}
require __DIR__ . '/../plugin/resource-import.php';
require __DIR__ . '/../plugin/export.php';
function check($condition, $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}
function prepareExport($format = 'markdown')
{
    return mbb_export_prepare(
        new ExportRequest([
            'schema' => 1,
            'post_id' => 12,
            'expected' => mbb_token($GLOBALS['post']),
            'format' => $format,
        ]),
    );
}
function downloadExport($value, $receipt = null)
{
    return mbb_export_download(
        new ExportRequest([
            'token' => $value['token'],
            'schema' => 1,
            'receipt' => $receipt ?? $value['receipt'],
        ]),
    );
}
$GLOBALS['actor'] = 11;
$GLOBALS['blog'] = 1;
$GLOBALS['logged'] = true;
$GLOBALS['denied'] = [];
$GLOBALS['options'] = [];
$GLOBALS['cancelRace'] = false;
$GLOBALS['mediaReads'] = 0;
$GLOBALS['ids'] = [34];
$GLOBALS['enumerations'] = [];
$uploads = sys_get_temp_dir() . '/mbb-export-model-upload-' . bin2hex(random_bytes(8));
mkdir($uploads, 0700);
$GLOBALS['uploads'] = $uploads;
$imageFile = $uploads . '/image.png';
$GLOBALS['imageFile'] = $imageFile;
file_put_contents(
    $imageFile,
    base64_decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJX8AAAAASUVORK5CYII=',
    ),
);
$GLOBALS['imageURL'] = 'http://export-model.invalid/uploads/image.png';
$source =
    "---\nmarkbridge: 1\ntitle: \"Proposal\"\n---\n\n![image](" .
    $GLOBALS['imageURL'] .
    ")\r\n\r\n[ordinary](" .
    $GLOBALS['imageURL'] .
    ")\r\n\r\n```md\r\n![literal](" .
    $GLOBALS['imageURL'] .
    ")\r\n```\r\n";
$document = mbb_convert([
    'mode' => 'markdown',
    'source' => $source,
    'documentId' => 'EXPORT-MODEL',
]);
check(!is_wp_error($document), 'Model source failed conversion');
$GLOBALS['post'] = (object) [
    'ID' => 12,
    'post_type' => 'post',
    'post_status' => 'draft',
    'post_title' => 'Saved title',
    'post_content' => $document['serialized'],
    'post_content_filtered' => $source,
];
try {
    $before = clone $GLOBALS['post'];
    foreach (['trash', 'auto-draft'] as $inactive) {
        $GLOBALS['post']->post_status = $inactive;
        check(prepareExport()->code === 'export_inactive', 'Inactive article accepted');
    }
    $GLOBALS['post']->post_status = 'draft';
    $path = $uploads . '/alias.png';
    symlink($imageFile, $path);
    try {
        mbb_export_media_file($path);
        throw new RuntimeException('Symlink accepted');
    } catch (RuntimeException $error) {
        check(str_starts_with($error->getMessage(), 'export_file:'), 'Wrong path rejection');
    }
    unlink($path);

    $value = prepareExport();
    check(is_array($value), 'Markdown preparation failed');
    check(
        $GLOBALS['mediaReads'] === 0 && $GLOBALS['enumerations'] === [],
        'Markdown used optional ZIP/media dependencies',
    );
    check(
        !str_contains(serialize($GLOBALS['options']), $source),
        'Option stored private article body',
    );
    check(
        downloadExport($value, str_repeat('0', 64))->code === 'export_receipt',
        'Receipt tamper accepted',
    );
    $result = downloadExport($value);
    check(
        $result instanceof WP_REST_Response && $result->data === $source,
        'Markdown exact bytes lost',
    );
    check(downloadExport($value)->code === 'export_expired', 'Consumed token reused');
    $value = prepareExport();
    $GLOBALS['actor'] = 22;
    check(downloadExport($value)->code === 'export_expired', 'Other owner read candidate');
    $GLOBALS['actor'] = 11;
    $GLOBALS['blog'] = 2;
    check(downloadExport($value)->code === 'export_expired', 'Other site read candidate');
    $GLOBALS['blog'] = 1;
    $GLOBALS['denied'] = ['edit_post:12'];
    check(downloadExport($value)->code === 'export_forbidden', 'Permission loss accepted');
    $GLOBALS['denied'] = [];
    $GLOBALS['post']->post_title = 'Changed';
    check(downloadExport($value)->code === 'export_conflict', 'Concurrent metadata accepted');
    $GLOBALS['post']->post_title = 'Saved title';
    mbb_export_cancel(new ExportRequest(['token' => $value['token']]));
    check(downloadExport($value)->code === 'export_expired', 'Cancelled token survived');
    $value = prepareExport();
    $GLOBALS['cancelRace'] = true;
    check(
        downloadExport($value)->code === 'export_expired',
        'Cancellation CAS loss still sent bytes',
    );
    for ($i = 0; $i < 4; $i++) {
        check(is_array(prepareExport()), 'Fixed owner quota failed');
    }
    check(prepareExport()->code === 'export_quota', 'Fifth slot accepted');
    foreach ($GLOBALS['options'] as &$record) {
        $record['expires'] = time() - 1;
    }
    unset($record);
    check(is_array(prepareExport()), 'Expired owner slots did not recover');
    foreach ($GLOBALS['options'] as $key => $record) {
        mbb_export_drop($key, $record);
    }
    // HTML uses the same receipt, snapshot and final claim flow as existing formats.
    $html = prepareExport('html');
    check(is_array($html), 'HTML descriptor preparation failed');
    check(
        !str_contains(serialize($GLOBALS['options']), 'data:image/'),
        'Static image bytes leaked into options',
    );
    check(
        downloadExport($html, str_repeat('0', 64))->code === 'export_receipt',
        'HTML receipt tamper accepted',
    );
    $response = downloadExport($html);
    check($response instanceof WP_REST_Response, 'HTML descriptor download failed');
    $descriptor = json_decode($response->data, true, 64, JSON_THROW_ON_ERROR);
    check(
        $descriptor['kind'] === 'markbridge-static' && count($descriptor['images']) === 1,
        'Static image descriptor missing',
    );
    check(!str_contains($response->data, $imageFile), 'Static descriptor leaked local file path');
    check(downloadExport($html)->code === 'export_expired', 'HTML candidate claim reused');
    $html = prepareExport('html');
    $GLOBALS['post']->post_title = 'Concurrent static title';
    check(downloadExport($html)->code === 'export_conflict', 'HTML snapshot change accepted');
    $GLOBALS['post']->post_title = 'Saved title';
    mbb_export_cancel(new ExportRequest(['token' => $html['token']]));
    $originalContent = $GLOBALS['post']->post_content;
    $originalSource = $GLOBALS['post']->post_content_filtered;
    $external = mbb_convert([
        'mode' => 'markdown',
        'source' => '![external](https://external.invalid/image.png)\n',
        'documentId' => 'EXPORT-MODEL',
    ]);
    $GLOBALS['post']->post_content = $external['serialized'];
    $GLOBALS['post']->post_content_filtered = $external['source'];
    check(prepareExport('html')->code === 'export_images', 'External static image accepted');
    $GLOBALS['post']->post_content = $originalContent;
    $GLOBALS['post']->post_content_filtered = $originalSource;
    if (mbb_export_config()['zipAvailable']) {
        $other = prepareExport();
        $unrelated = $GLOBALS['options'];
        foreach (['failed', 'cancelled'] as $mode) {
            $GLOBALS['readyFailure'] = $mode;
            $failure = prepareExport('zip');
            check(
                is_wp_error($failure) && $failure->code === 'export_expired',
                'Ready CAS failure did not abort',
            );
            $privatePath =
                rtrim(sys_get_temp_dir(), '/') .
                '/mbb-exports-' .
                mbb_export_owner() .
                '-' .
                posix_geteuid() .
                '/' .
                $GLOBALS['failedReadyToken'];
            check(!file_exists($privatePath), 'Ready CAS failure left this token package behind');
            check(
                $GLOBALS['options'] === $unrelated,
                'Ready failure removed another candidate or revived the reservation',
            );
        }
        $reference = mbb_export_record($other['token'])['record'];
        foreach (['cancel', 'expired'] as $mode) {
            $reservation = $reference;
            $reservation['token'] = bin2hex(random_bytes(32));
            $reservation['format'] = 'zip';
            $reservation['state'] = 'preparing';
            $key = mbb_export_store($reservation);
            // Simulate interruption immediately after atomic reservation, before mkdir.
            if ($mode === 'cancel') {
                check(
                    mbb_export_cancel(new ExportRequest(['token' => $reservation['token']]))[
                        'cancelled'
                    ],
                    'Pre-directory cancellation failed',
                );
            } else {
                $GLOBALS['options'][$key]['expires'] = time() - 1;
                check(
                    mbb_export_record($reservation['token']) === null,
                    'Pre-directory expiration did not clean reservation',
                );
            }
            check(
                $GLOBALS['options'] === $unrelated,
                'Pre-directory cleanup affected another candidate',
            );
        }
        check(
            downloadExport($other) instanceof WP_REST_Response,
            'Unrelated candidate stopped working after cleanup',
        );
        $GLOBALS['ids'] = range(1, 33);
        check(
            prepareExport('zip')->code === 'export_images',
            'Parent association enumeration was truncated',
        );
        $GLOBALS['ids'] = [34];
        $value = prepareExport('zip');
        check(
            is_array($value),
            'ZIP prepare failed: ' . (is_wp_error($value) ? $value->message : 'unknown'),
        );
        check(
            count($value['resources']) === 1 &&
                str_contains($value['projectedSource'], '[ordinary](' . $GLOBALS['imageURL'] . ')'),
            'ZIP changed ordinary link or omitted image',
        );
        $pending = mbb_export_record($value['token']);
        $interrupted = $pending['record'];
        $interrupted['state'] = 'preparing';
        $GLOBALS['options'][$pending['key']] = $interrupted;
        check(
            downloadExport($value)->code === 'export_pending',
            'Incomplete ZIP became downloadable',
        );
        $GLOBALS['options'][$pending['key']] = $pending['record'];
        $result = downloadExport($value);
        check($result instanceof WP_REST_Response, 'ZIP download failed');
        $file = $uploads . '/result.zip';
        file_put_contents($file, $result->data);
        $private = $uploads . '/private';
        mkdir($private, 0700);
        $extracted = mbb_resource_extract($file, $private);
        check(count($extracted['images']) === 1, 'Export ZIP could not be safely reimported');
        $zip = new ZipArchive();
        $zip->open($file);
        $sidecar = json_decode($zip->getFromName('markbridge-export.json'), true);
        $zip->close();
        check(
            !isset($sidecar['metadata']['status']) &&
                !isset($sidecar['metadata']['featured_media']) &&
                !isset($sidecar['documentId']),
            'Sidecar leaked write identity',
        );
        foreach (['resources', 'categories', 'tags'] as $field) {
            $changed = $sidecar;
            if ($field === 'resources') {
                $changed[$field] = (object) [];
            } else {
                $changed['metadata'][$field] = (object) [];
            }
            try {
                mbb_resource_export_sidecar(
                    mbb_component_json($changed),
                    $extracted['markdown'],
                    $extracted['images'],
                );
                throw new RuntimeException('Object accepted for JSON array');
            } catch (RuntimeException $error) {
                check(
                    str_starts_with($error->getMessage(), 'resource_sidecar:'),
                    'Wrong sidecar rejection',
                );
            }
        }
        $value = prepareExport('zip');
        file_put_contents($imageFile, 'not an image');
        check(is_wp_error(downloadExport($value)), 'Changed image accepted');
        mbb_export_cancel(new ExportRequest(['token' => $value['token']]));
        foreach (scandir($private) as $name) {
            if ($name !== '.' && $name !== '..') {
                unlink($private . '/' . $name);
            }
        }
        rmdir($private);
        unlink($file);
    }
    check($GLOBALS['post'] == $before, 'Export modified saved article');
    echo "Export models: bytes, owner/site/permission, receipt/CAS/quota/TTL, ZIP reimport and closed sidecar passed\n";
} finally {
    foreach ($GLOBALS['options'] as $key => $record) {
        mbb_export_drop($key, $record);
    }
    unlink($imageFile);
    rmdir($uploads);
}
