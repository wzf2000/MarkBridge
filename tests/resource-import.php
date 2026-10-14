<?php
// Synthetic API/filesystem models. Actual WordPress writes are tested separately.
define(
    'ABSPATH',
    sys_get_temp_dir() . '/mbb-resource-wordpress-model-' . bin2hex(random_bytes(6)) . '/',
);
define('WP_CLI', true);
define('ARRAY_A', 'ARRAY_A');
function add_action(...$args) {}
function add_filter(...$args) {}
function remove_filter(...$args) {}
function remove_action(...$args) {}
function is_user_logged_in()
{
    return true;
}
function current_user_can($cap)
{
    return $GLOBALS['caps'][$cap] ?? true;
}
function absint($id)
{
    return abs((int) $id);
}
function home_url($tail = '')
{
    return 'http://resource-model.invalid/' . $GLOBALS['seed'] . $tail;
}
function get_current_blog_id()
{
    return $GLOBALS['blog'];
}
function get_current_user_id()
{
    return $GLOBALS['actor'];
}
function wp_salt($scheme)
{
    return 'synthetic-resource-model-salt';
}
function mbb_component_json($value)
{
    return json_encode(
        $value,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS,
    );
}
class WP_Error
{
    public function __construct(public $code, public $message = '', public $data = []) {}
    public function get_error_code()
    {
        return $this->code;
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
function mbb_permission($request)
{
    return true;
}
function mbb_id($id)
{
    return 'RESOURCE-MODEL';
}
function mbb_token($post)
{
    return 'expected-model';
}
function get_post($id)
{
    return isset($GLOBALS['dbrows'][$id])
        ? (object) array_merge(['ID' => $id], $GLOBALS['dbrows'][$id])
        : null;
}
function get_post_meta($id, $key, $single = true)
{
    return $GLOBALS['dbmeta'][$id][$key] ?? '';
}
function clean_post_cache(...$args) {}
function wp_cache_delete(...$args) {}
function wp_cache_set_posts_last_changed() {}
function wp_upload_dir(...$args)
{
    return [
        'basedir' => $GLOBALS['uploads'],
        'baseurl' => 'http://resource-model.invalid/media',
        'error' => false,
    ];
}
class ResourceSideloadBoundary extends RuntimeException {}
// WordPress takes the upload descriptor by reference. Exercise that ABI through the real media helper.
function wp_handle_sideload(&$file, $overrides = [])
{
    ri_assert(
        $file['error'] === UPLOAD_ERR_OK &&
            $file['type'] === 'image/png' &&
            is_file($file['tmp_name']) &&
            filesize($file['tmp_name']) === $file['size'] &&
            ($overrides['test_form'] ?? null) === false,
        'Sideload did not receive a complete staged upload descriptor',
    );
    $file['name'] = 'synthetic-by-reference.png';
    throw new ResourceSideloadBoundary('Stop before synthetic media creation');
}
function mbb_convert($request)
{
    $result = \MarkBridge\Probe\Worker::convert($request);
    return $result['ok'] ? $result['document'] : mbb_error($result['code'], $result['message']);
}
class ResourceRequest extends ArrayObject
{
    public array $files = [];
    public function has_param($name)
    {
        return array_key_exists($name, $this->getArrayCopy());
    }
    public function get_file_params()
    {
        return $this->files;
    }
}
class ResourceDB
{
    public $posts = 'posts',
        $postmeta = 'postmeta',
        $term_relationships = 'relations',
        $last_error = '';
    public bool $fail = false;
    public function prepare($sql, ...$args)
    {
        return vsprintf($sql, $args);
    }
    public function get_row($sql, $format)
    {
        if ($this->fail) {
            throw new RuntimeException('Synthetic read failure');
        }
        preg_match('/ID = (\d+)/', $sql, $match);
        return $GLOBALS['dbrows'][(int) ($match[1] ?? 0)] ?? null;
    }
    public function get_results($sql, $format)
    {
        if ($this->fail) {
            throw new RuntimeException('Synthetic read failure');
        }
        if (str_contains($sql, 'relations')) {
            return [];
        }
        preg_match('/post_id = (\d+)/', $sql, $match);
        $meta = $GLOBALS['dbmeta'][(int) ($match[1] ?? 0)] ?? [];
        ksort($meta);
        $rows = [];
        foreach ($meta as $key => $value) {
            $rows[] = ['meta_key' => $key, 'meta_value' => $value];
        }
        return $rows;
    }
}
require dirname(__DIR__) . '/plugin/includes/php-converter/Worker.php';
require dirname(__DIR__) . '/plugin/frontmatter.php';
require dirname(__DIR__) . '/plugin/resource-import.php';
require dirname(__DIR__) . '/plugin/save-commit.php';
function ri_assert($ok, $message)
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}
function ri_bad(callable $call, $code)
{
    try {
        $call();
    } catch (Throwable $error) {
        ri_assert(
            str_starts_with($error->getMessage(), $code . ':'),
            'Unexpected rejection: ' . $error->getMessage(),
        );
        return;
    }
    throw new RuntimeException('Expected rejection ' . $code);
}
$GLOBALS['seed'] = bin2hex(random_bytes(6));
$GLOBALS['blog'] = 1;
$GLOBALS['actor'] = 41;
$GLOBALS['caps'] = [];
$GLOBALS['dbrows'] = $GLOBALS['dbmeta'] = [];
$wpdb = new ResourceDB();
if (
    !class_exists('ZipArchive') ||
    !class_exists('Normalizer') ||
    !function_exists('posix_geteuid')
) {
    ri_assert(
        !mbb_resource_config()['available'],
        'Missing dependency did not disable only resource import',
    );
    echo "Resource import dependency-unavailable guard passed.\n";
    return;
}
$root = sys_get_temp_dir() . '/mbb-resource-model-' . $GLOBALS['seed'];
mkdir($root, 0700);
mkdir($root . '/uploads', 0700);
$GLOBALS['uploads'] = $root . '/uploads';
$privateRoot = mbb_resource_root();
mkdir(ABSPATH . 'wp-admin/includes', 0700, true);
foreach (['file.php', 'media.php', 'image.php'] as $include) {
    file_put_contents(ABSPATH . 'wp-admin/includes/' . $include, "<?php\n");
}
$chunk = static fn($type, $data) => pack('N', strlen($data)) .
    $type .
    $data .
    pack('N', crc32($type . $data));
$png =
    "\x89PNG\r\n\x1a\n" .
    $chunk('IHDR', pack('NNCCCCC', 1, 1, 8, 2, 0, 0, 0)) .
    $chunk('IDAT', gzcompress("\0\xff\0\0")) .
    $chunk('IEND', '');
$source =
    "![repeat](images/pic.png)\n\n![again](images/pic.png)\n\n[keep](images/pic.png)\n\n```html\n<img src=\"images/pic.png\">\n```\n";
$archiveSerial = 0;
function ri_zip(array $files): string
{
    global $root, $archiveSerial;
    $path = $root . '/archive-' . ++$archiveSerial . '.zip';
    $zip = new ZipArchive();
    ri_assert($zip->open($path, ZipArchive::CREATE) === true, 'Cannot create synthetic ZIP');
    foreach ($files as $name => $contents) {
        $zip->addFromString($name, $contents);
    }
    $zip->close();
    return $path;
}
function ri_extract($archive): array
{
    global $root, $archiveSerial;
    $dir = $root . '/extract-' . ++$archiveSerial;
    mkdir($dir, 0700);
    try {
        return mbb_resource_extract($archive, $dir);
    } finally {
        mbb_resource_remove_private($dir);
    }
}
function ri_prepare($archive): array
{
    $request = new ResourceRequest([
        'post_id' => 0,
        'documentId' => 'RESOURCE-MODEL',
        'expected' => null,
    ]);
    $request->files = ['archive' => ['tmp_name' => $archive, 'error' => UPLOAD_ERR_OK]];
    $result = mbb_resource_prepare($request);
    ri_assert(!is_wp_error($result), 'Resource prepare failed: ' . ($result->code ?? ''));
    return [$result, $request];
}
try {
    $archive = ri_zip(['lesson.md' => $source, 'images/pic.png' => $png]);
    $pack = ri_extract($archive);
    ri_assert(
        mbb_resource_relative('./images/pic.png', 'lesson.md') === 'images/pic.png',
        'Ordinary ./ image reference rejected',
    );
    ri_assert(
        mbb_resource_relative('../images/pic.png', 'docs/lesson.md') === 'images/pic.png',
        'Bounded parent reference rejected',
    );
    ri_bad(fn() => mbb_resource_relative('../images/pic.png', 'lesson.md'), 'resource_reference');
    ri_bad(
        fn() => mbb_resource_relative('../../images/pic.png', 'docs/lesson.md'),
        'resource_reference',
    );
    ri_bad(fn() => mbb_resource_relative('images%2fpic.png', 'lesson.md'), 'resource_reference');
    ri_assert(
        count($pack['images']) === 1 && $pack['images'][0]['mime'] === 'image/png',
        'True PNG not recognized',
    );
    ri_assert($pack['markdown']['source'] === $source, 'Raw Markdown changed during extraction');
    foreach (
        [
            '../bad.md',
            '/bad.md',
            'a\\bad.md',
            'a//bad.md',
            'a/./bad.md',
            'a/%2e%2e/b.md',
            'a%2fb.md',
            'a%5cb.md',
            'a%00b.md',
            'C:bad.md',
            'bad.md ',
            "bad\n.md",
        ]
        as $path
    ) {
        ri_bad(fn() => mbb_resource_path($path), 'resource_path');
    }
    foreach ([['a.md' => 'x', 'A.md' => 'x'], ['é.md' => 'x', "e\u{0301}.md" => 'x']] as $files) {
        ri_bad(fn() => ri_extract(ri_zip($files)), 'resource_duplicate');
    }
    ri_bad(fn() => ri_extract(ri_zip(['a.md' => 'x', 'b.md' => 'x'])), 'resource_entries');
    ri_bad(fn() => ri_extract(ri_zip(['a.md' => 'x', 'bad.svg' => '<svg/>'])), 'resource_type');
    ri_bad(fn() => ri_extract(ri_zip(['a.md' => 'x', 'wrong.jpg' => $png])), 'resource_mime');
    ri_bad(
        fn() => ri_extract(ri_zip(['a.md' => 'x', 'bad.png' => 'not an image'])),
        'resource_mime',
    );
    $files = ['a.md' => 'x'];
    for ($i = 0; $i < 33; $i++) {
        $files['pic' . $i . '.png'] = $png;
    }
    ri_bad(fn() => ri_extract(ri_zip($files)), 'resource_entries');
    $files = [];
    for ($i = 0; $i < 101; $i++) {
        $files['empty' . $i . '/'] = '';
    }
    ri_bad(fn() => ri_extract(ri_zip($files)), 'resource_entries');
    ri_bad(fn() => ri_extract(ri_zip(['a.md' => str_repeat('x', 262145)])), 'resource_size');
    ri_bad(
        fn() => ri_extract(ri_zip(['a.md' => 'x', 'big.png' => $png . str_repeat('0', 8388608)])),
        'resource_size',
    );
    $files = ['a.md' => 'x'];
    for ($i = 0; $i < 5; $i++) {
        $files['big' . $i . '.png'] = $png . str_repeat('0', 7 * 1048576);
    }
    ri_bad(fn() => ri_extract(ri_zip($files)), 'resource_size');
    $linkZip = ri_zip(['a.md' => 'x', 'link.png' => $png]);
    $zip = new ZipArchive();
    $zip->open($linkZip);
    $zip->setExternalAttributesName('link.png', ZipArchive::OPSYS_UNIX, 0120777 << 16);
    $zip->close();
    ri_bad(fn() => ri_extract($linkZip), 'resource_entry');
    $huge = substr_replace($png, pack('N2', 8001, 4000), 16, 8);
    ri_bad(fn() => ri_extract(ri_zip(['a.md' => 'x', 'huge.png' => $huge])), 'resource_pixels');
    [$prepared, $request] = ri_prepare($archive);
    ri_assert(
        !str_contains(mbb_component_json($prepared), $privateRoot) &&
            !str_contains(mbb_component_json($prepared), '.blob'),
        'Private staging path escaped to API',
    );
    $ctx = mbb_resource_load($prepared['token']);
    ri_assert(
        (fileperms($ctx['dir']) & 0777) === 0700 &&
            (fileperms($ctx['dir'] . '/manifest.json') & 0777) === 0600,
        'Staging permissions are not private',
    );
    mbb_resource_release($ctx);
    $doc = mbb_convert([
        'mode' => 'markdown',
        'source' => $source,
        'documentId' => 'RESOURCE-MODEL',
    ]);
    $candidate = [
        'document' => $doc,
        'post_id' => 0,
        'expected' => null,
        'title' => 'Resource model',
        'post_status' => 'draft',
        'featured_media' => 0,
        'frontmatter' => ['selected' => []],
        'frontmatter_applied' => [],
    ];
    $request['mode'] = 'markdown';
    $request['resource_import'] = [
        'schema' => 1,
        'token' => $prepared['token'],
        'ack_public_media' => true,
    ];
    $plan = mbb_resource_plan($request, $candidate);
    foreach ([33, 257] as $count) {
        $alias = $candidate;
        $alias['document'] = mbb_convert([
            'mode' => 'markdown',
            'documentId' => 'RESOURCE-MODEL',
            'source' =>
                implode(
                    "\n\n",
                    array_map(
                        static fn($i) => '![same](' . str_repeat('./', $i) . 'images/pic.png)',
                        range(0, $count - 1),
                    ),
                ) . "\n",
        ]);
        ri_assert(
            !is_wp_error($alias['document']),
            'Alias document exceeded a separate document budget',
        );
        if ($count === 33) {
            $aliasPlan = mbb_resource_plan($request, $alias);
            ri_assert(
                count($aliasPlan['resource_plan']['mappings']) === 33 &&
                    count($aliasPlan['resource_plan']['images']) === 1,
                'One image with 33 aliases was rejected or duplicated',
            );
        } else {
            ri_bad(fn() => mbb_resource_plan($request, $alias), 'resource_references');
        }
    }
    ri_assert(
        count($plan['resource_plan']['images']) === 1 &&
            str_contains($plan['resource_plan']['projectedDocument']['source'], 'mbb-import/'),
        'Repeated image import plan is not deduplicated',
    );
    $request['resource_receipt'] = mbb_resource_receipt($request, $plan);
    $abi = mbb_resource_load($prepared['token'], true);
    try {
        mbb_resource_media($abi, $request, $plan);
        throw new RuntimeException('Sideload boundary was not exercised');
    } catch (ResourceSideloadBoundary $boundary) {
        // An array literal at the call site raises Error instead, and fails this test.
    }
    ri_assert(mbb_resource_compensate($abi, true), 'Sideload test left owned media behind');
    mbb_resource_release($abi);
    foreach (
        ['title' => 'Changed', 'post_status' => 'publish', 'featured_media' => 3]
        as $field => $value
    ) {
        $changed = $plan;
        $changed[$field] = $value;
        ri_bad(fn() => mbb_resource_verify($request, $changed), 'resource_receipt');
    }
    $GLOBALS['blog'] = 2;
    ri_bad(fn() => mbb_resource_verify($request, $plan), 'resource_receipt');
    $GLOBALS['blog'] = 1;
    $verified = mbb_resource_verify($request, $plan);
    mbb_resource_release($verified);
    $GLOBALS['actor'] = 42;
    ri_bad(fn() => mbb_resource_load($prepared['token']), 'resource_gone');
    $GLOBALS['actor'] = 41;
    $without = clone $request;
    unset($without['resource_import']);
    $without['requires_resources'] = $prepared['requirements'];
    ri_bad(fn() => mbb_resource_plan($without, $candidate), 'resource_required');
    $unrelated = $candidate;
    $unrelated['document'] = mbb_convert([
        'mode' => 'markdown',
        'source' => "![existing](already-uploaded.png)\n",
        'documentId' => 'RESOURCE-MODEL',
    ]);
    ri_assert(
        mbb_resource_plan($without, $unrelated)['document'] === $unrelated['document'],
        'An unrelated relative image was blanket-rejected',
    );
    $unrelated['document'] = $plan['resource_plan']['projectedDocument'];
    unset($without['requires_resources']);
    ri_bad(fn() => mbb_resource_plan($without, $unrelated), 'resource_required');
    $ctx = mbb_resource_load($prepared['token'], true);
    $public =
        $GLOBALS['uploads'] . '/markbridge-imports/' . mbb_resource_public_key($prepared['token']);
    if (!is_dir(dirname($public))) {
        mkdir(dirname($public), 0700);
    }
    mkdir($public, 0700);
    file_put_contents($public . '/original.png', $png);
    file_put_contents($public . '/scaled.png', $png);
    $ctx['manifest']['state'] = 'saving';
    $ctx['manifest']['journal'] = [
        'ids' => [90],
        'postId' => 12,
        'directory' => $public,
        'url' =>
            'http://resource-model.invalid/media/' . mbb_resource_public_key($prepared['token']),
        'files' => [],
        'pairDigest' => hash('sha256', 'serialized' . "\0source"),
    ];
    mbb_resource_journal($ctx);
    $GLOBALS['dbrows'][90] = [
        'post_parent' => 12,
        'post_author' => 41,
        'post_type' => 'attachment',
    ];
    ri_assert(
        !mbb_resource_compensate($ctx, true) && is_file($public . '/scaled.png'),
        'Partial surviving rows incorrectly deleted owned files',
    );
    ri_bad(function () use (&$ctx) {
        mbb_resource_discard($ctx);
    }, 'resource_uncertain');
    ri_assert(
        is_file($ctx['dir'] . '/manifest.json'),
        'Partial commit lost its private recovery journal',
    );
    $wpdb->fail = true;
    ri_assert(!mbb_resource_compensate($ctx, true), 'DB read failure treated as safe rollback');
    $wpdb->fail = false;
    $GLOBALS['dbrows'][12] = [
        'post_content' => '<img src="' . $ctx['manifest']['journal']['url'] . '/scaled.png">',
        'post_content_filtered' => 'source',
    ];
    $ctx['manifest']['journal']['pairDigest'] = hash(
        'sha256',
        $GLOBALS['dbrows'][12]['post_content'] . "\0source",
    );
    $GLOBALS['dbmeta'][90] = [
        '_mbb_resource_import' => $prepared['token'],
        '_mbb_resource_committed' => $prepared['token'],
    ];
    ri_assert(
        mbb_resource_database_state($ctx) === 'committed',
        'Complete committed pair was not recognized',
    );
    ri_assert(
        !mbb_resource_compensate($ctx, true) && is_file($public . '/original.png'),
        'False COMMIT ACK removed committed media',
    );
    mbb_resource_discard($ctx);
    mbb_resource_release($ctx);
    ri_assert(
        !is_dir($ctx['dir']) && is_file($public . '/scaled.png'),
        'Confirmed commit cleanup removed public media',
    );
    [$prepared] = ri_prepare($archive);
    $ctx = mbb_resource_load($prepared['token'], true);
    $public =
        $GLOBALS['uploads'] . '/markbridge-imports/' . mbb_resource_public_key($prepared['token']);
    mkdir($public, 0700);
    file_put_contents($public . '/original.png', $png);
    file_put_contents($public . '/scaled.png', $png);
    $ctx['manifest']['state'] = 'saving';
    $ctx['manifest']['journal'] = [
        'ids' => [91],
        'files' => [],
        'directory' => $public,
        'url' =>
            'http://resource-model.invalid/media/' . mbb_resource_public_key($prepared['token']),
    ];
    mbb_resource_journal($ctx);
    ri_assert(
        mbb_resource_compensate($ctx, true) && !is_dir($public),
        'Proven normal rollback did not clean original/scaled files',
    );
    mbb_resource_discard($ctx);
    mbb_resource_release($ctx);
    [$prepared] = ri_prepare($archive);
    $ctx = mbb_resource_load($prepared['token'], true);
    mbb_resource_discard($ctx);
    mbb_resource_release($ctx);
    ri_assert(!is_dir($ctx['dir']), 'Cancellation did not remove owned private files');
    $GLOBALS['caps']['upload_files'] = false;
    ri_assert(
        !mbb_resource_config()['available'] &&
            mbb_resource_permission($request)->code === 'resource_permission',
        'Media permission guard failed',
    );
    echo "Resource ZIP paths, budgets, MIME, private staging, receipts and commit/rollback models passed.\n";
} finally {
    // Only this invocation's synthetic roots are eligible for deletion.
    foreach ([$root, $privateRoot, rtrim(ABSPATH, '/')] as $dir) {
        if (is_dir($dir)) {
            foreach (
                new RecursiveIteratorIterator(
                    new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
                    RecursiveIteratorIterator::CHILD_FIRST,
                )
                as $file
            ) {
                if ($file->isLink() || $file->isFile()) {
                    unlink($file->getPathname());
                } else {
                    rmdir($file->getPathname());
                }
            }
            rmdir($dir);
        }
    }
}
