<?php
// Explicitly guarded synthetic WordPress; exporting never modifies saved article/source.
$root = getenv('MARKBRIDGE_TEST_WORDPRESS_ROOT');
$home = getenv('MARKBRIDGE_TEST_HOME');
if (
    !$root ||
    !$home ||
    !in_array(parse_url($home, PHP_URL_HOST), ['127.0.0.1', 'localhost', '::1'], true) ||
    realpath(ABSPATH) !== realpath($root) ||
    rtrim(home_url(), '/') !== rtrim($home, '/') ||
    wp_get_environment_type() !== 'local'
) {
    throw new RuntimeException('Export tests require an explicitly identified local lab');
}
if (!function_exists('mbb_export_prepare') || !mbb_runtime_diagnostics()['ok']) {
    throw new RuntimeException('Current candidate converter required');
}
function ex_assert($condition, $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}
function ex_request(string $route, array $params = [], string $method = 'POST')
{
    $r = new WP_REST_Request($method, $route);
    if ($method === 'GET') {
        $r->set_query_params($params);
    } elseif ($method !== 'DELETE') {
        $r->set_header('Content-Type', 'application/json');
        $r->set_body(wp_json_encode($params));
    }
    return rest_do_request($r);
}
function ex_ok($response, string $message): mixed
{
    ex_assert(
        $response->get_status() === 200,
        $message . ': ' . wp_json_encode($response->get_data()),
    );
    return $response->get_data();
}
function ex_prepare(int $id, string $format): array
{
    return ex_ok(
        ex_request('/mbb/v1/export/prepare', [
            'schema' => 1,
            'post_id' => $id,
            'expected' => mbb_token(get_post($id)),
            'format' => $format,
        ]),
        'Prepare failed',
    );
}
function ex_download(array $value)
{
    return ex_request('/mbb/v1/export/' . $value['token'] . '/download', [
        'schema' => 1,
        'receipt' => $value['receipt'],
    ]);
}
function ex_png(): string
{
    $chunk = static fn($name, $bytes) => pack('N', strlen($bytes)) .
        $name .
        $bytes .
        pack('H*', hash('crc32b', $name . $bytes));
    return "\x89PNG\r\n\x1a\n" .
        $chunk('IHDR', pack('NNCCCCC', 48, 32, 8, 2, 0, 0, 0)) .
        $chunk('IDAT', gzcompress(str_repeat("\0" . str_repeat("\xff\0\0", 48), 32))) .
        $chunk('IEND', '');
}
function ex_snapshot(int $id): array
{
    clean_post_cache($id);
    $p = get_post($id);
    return [$p, get_post_meta($id), wp_get_post_revisions($id), get_comments(['post_id' => $id])];
}
$prior = get_current_user_id();
$actors = [];
$post = 0;
$attachment = 0;
$private = null;
$archive = null;
$sourceFile = null;
$link = null;
$sourceTarget = null;
$nonce = bin2hex(random_bytes(6));
try {
    foreach (['author', 'author'] as $index => $role) {
        $id = wp_insert_user([
            'user_login' => 'export-' . $index . '-' . $nonce,
            'user_pass' => wp_generate_password(32),
            'role' => $role,
        ]);
        ex_assert(!is_wp_error($id), 'Actor creation failed');
        $actors[] = $id;
    }
    wp_set_current_user($actors[0]);
    require_once ABSPATH . 'wp-admin/includes/file.php';
    require_once ABSPATH . 'wp-admin/includes/media.php';
    require_once ABSPATH . 'wp-admin/includes/image.php';
    $upload = wp_upload_bits('export-' . $nonce . '.png', null, ex_png());
    ex_assert(empty($upload['error']), 'Synthetic PNG upload failed');
    $attachment = wp_insert_attachment(
        [
            'post_title' => 'Synthetic export image',
            'post_mime_type' => 'image/png',
            'post_status' => 'inherit',
            'post_author' => $actors[0],
        ],
        $upload['file'],
    );
    ex_assert(!is_wp_error($attachment), 'Attachment creation failed');
    wp_update_attachment_metadata(
        $attachment,
        wp_generate_attachment_metadata($attachment, $upload['file']),
    );
    $url = wp_get_attachment_url($attachment);
    $code = "![literal]($url)\r\n";
    $source = "---\nmarkbridge: 1\ntitle: \"Header proposal\"\n---\n\n# Synthetic export\r\n\r\n![local](<$url> 'kept title')\r\n\r\n[ordinary](<$url>) and `![literal]($url)`\r\n\r\n![external](https://example.invalid/not-fetched.png)\r\n\r\n```md\r\n$code```\r\n";
    $params = [
        'mode' => 'markdown',
        'post_id' => 0,
        'documentId' => 'Export' . $nonce,
        'source' => $source,
        'title' => 'Synthetic export saved title',
        'post_status' => 'draft',
        'featured_media' => 0,
    ];
    ex_ok(ex_request('/mbb/v1/preview', $params), 'Initial preview failed');
    $saved = ex_ok(ex_request('/mbb/v1/save', $params), 'Initial paired save failed');
    $post = (int) $saved['post_id'];
    wp_update_post(['ID' => $attachment, 'post_parent' => $post]);
    update_post_meta($post, '_export_private_note', 'Synthetic private note');
    wp_insert_comment([
        'comment_post_ID' => $post,
        'comment_content' => 'Synthetic comment',
        'comment_approved' => 1,
    ]);
    $before = ex_snapshot($post);
    ex_assert(
        ex_request('/mbb/v1/export/prepare', [
            'schema' => 1,
            'post_id' => $post,
            'expected' => mbb_token(get_post($post)),
            'format' => 'html',
        ])->get_status() >= 400,
        'Static export silently omitted an external image',
    );
    $md = ex_prepare($post, 'markdown');
    ex_assert($md['projectedSource'] === $source, 'MD preparation changed raw bytes');
    $response = ex_download($md);
    $body = ex_ok($response, 'MD download failed');
    ex_assert($body === $source, 'MD download changed CRLF or code');
    ex_assert(
        ($response->get_headers()['Cache-Control'] ?? '') === 'private, no-store',
        'Download caches private bytes',
    );
    ex_assert(ex_download($md)->get_data()['code'] === 'export_expired', 'Consumed token reused');
    $zip = ex_prepare($post, 'zip');
    ex_assert(
        count($zip['resources']) === 1 && count($zip['retainedImages']) === 1,
        'ZIP association or external warning wrong',
    );
    ex_assert(
        str_contains($zip['projectedSource'], '[ordinary](<' . $url . '>)') &&
            str_contains($zip['projectedSource'], $code),
        'Portable projection changed link/code',
    );
    $archive = tempnam(sys_get_temp_dir(), 'mbb-export-save-');
    file_put_contents($archive, ex_ok(ex_download($zip), 'ZIP download failed'));
    $private = sys_get_temp_dir() . '/mbb-export-reimport-' . $nonce;
    mkdir($private, 0700);
    $pack = mbb_resource_extract($archive, $private);
    ex_assert(
        count($pack['images']) === 1 && $pack['markdown']['source'] === $zip['projectedSource'],
        'Safe export reimport failed',
    );
    $read = new ZipArchive();
    ex_assert($read->open($archive, ZipArchive::CHECKCONS) === true, 'Invalid export CRC');
    $manifest = json_decode(
        $read->getFromName('markbridge-export.json'),
        true,
        32,
        JSON_THROW_ON_ERROR,
    );
    $read->close();
    ex_assert(
        array_keys($manifest['metadata']) === ['title', 'excerpt', 'slug', 'categories', 'tags'],
        'Sidecar exports forbidden metadata',
    );
    ex_assert(
        !str_contains(wp_json_encode($manifest), '_export_private_note') &&
            !isset($manifest['documentId']),
        'Sidecar leaked private information',
    );
    $cancel = ex_prepare($post, 'markdown');
    ex_ok(ex_request('/mbb/v1/export/' . $cancel['token'], [], 'DELETE'), 'Cancel failed');
    ex_assert(
        ex_download($cancel)->get_data()['code'] === 'export_expired',
        'Cancelled download accepted',
    );
    $expired = ex_prepare($post, 'markdown');
    $slot = mbb_export_record($expired['token']);
    $record = $slot['record'];
    $record['expires'] = time() - 1;
    update_option($slot['key'], $record, false);
    ex_assert(
        ex_download($expired)->get_data()['code'] === 'export_expired',
        'Expired download accepted',
    );
    $scope = ex_prepare($post, 'markdown');
    wp_set_current_user($actors[1]);
    ex_assert(
        ex_download($scope)->get_data()['code'] === 'export_expired',
        'Other owner downloaded candidate',
    );
    ex_assert(
        ex_request('/mbb/v1/export/prepare', [
            'schema' => 1,
            'post_id' => $post,
            'expected' => mbb_token(get_post($post)),
            'format' => 'markdown',
        ])->get_status() === 403,
        'Other author export accepted',
    );
    wp_set_current_user($actors[0]);
    ex_assert(
        ex_snapshot($post) == $before,
        'Read-only export mutated article/meta/revisions/comments',
    );
    $conflict = ex_prepare($post, 'markdown');
    $blocked = wp_update_post(['ID' => $post, 'post_title' => 'Concurrent synthetic title'], true);
    ex_assert(
        is_wp_error($blocked) && $blocked->get_error_code() === 'empty_content',
        'Unpaired managed update bypassed the protection chain',
    );
    $baselineToken = mbb_token(get_post($post));
    ex_ok(
        ex_request('/wp/v2/posts/' . $post, [
            'title' => 'Concurrent synthetic title',
            'content' => get_post($post)->post_content,
            'mbb_expected' => $baselineToken,
        ]),
        'Concurrent paired native title save failed',
    );
    clean_post_cache($post);
    ex_assert(
        get_post($post)->post_title === 'Concurrent synthetic title' &&
            mbb_token(get_post($post)) !== $baselineToken,
        'Concurrent native save did not change title/version',
    );
    $conflictResponse = ex_download($conflict);
    $conflictData = $conflictResponse->get_data();
    ex_assert(
        $conflictResponse->get_status() === 409 &&
            is_array($conflictData) &&
            ($conflictData['code'] ?? null) === 'export_conflict',
        'Concurrent metadata accepted: status=' .
            $conflictResponse->get_status() .
            ', data=' .
            gettype($conflictData),
    );
    ex_ok(
        ex_request('/wp/v2/posts/' . $post, [
            'title' => 'Synthetic export saved title',
            'content' => get_post($post)->post_content,
            'mbb_expected' => mbb_token(get_post($post)),
        ]),
        'Paired native title restoration failed',
    );
    ex_assert(
        get_post($post)->post_title === 'Synthetic export saved title',
        'Restored native title differs',
    );
    $tamper = ex_prepare($post, 'markdown');
    ex_assert(
        ex_request('/mbb/v1/export/' . $tamper['token'] . '/download', [
            'schema' => 1,
            'receipt' => str_repeat('0', 64),
        ])->get_data()['code'] === 'export_receipt',
        'Tampered receipt accepted',
    );
    foreach (range(0, 3) as $index) {
        $key = mbb_export_slot($index);
        $record = get_option($key);
        if (is_array($record)) {
            mbb_export_drop($key, $record);
        }
    }
    $changed = ex_prepare($post, 'zip');
    $original = file_get_contents($upload['file']);
    file_put_contents($upload['file'], $original . 'changed');
    ex_assert(
        ex_download($changed)->get_data()['code'] === 'export_changed',
        'Resource hash change accepted',
    );
    file_put_contents($upload['file'], $original);
    $sourceFile = tempnam(sys_get_temp_dir(), 'mbb-export-source-');
    file_put_contents($sourceFile, 'External synthetic third draft');
    update_post_meta($post, '_mbb_source_managed', 'file');
    update_post_meta($post, '_mbb_source_path_hash', hash('sha256', realpath($sourceFile)));
    $sourceProbes = 0;
    $trap = false;
    $sourceTarget = static function ($target, $p) use ($post, $sourceFile, &$sourceProbes, &$trap) {
        if ((int) $p->ID !== $post) {
            return $target;
        }
        $sourceProbes++;
        if ($trap) {
            throw new RuntimeException('Export attempted to probe the synthetic source binding');
        }
        return $sourceFile;
    };
    add_filter('mbb_source_write_target', $sourceTarget, 10, 2);
    ex_assert(
        !is_wp_error(mbb_source_target(get_post($post))),
        'Synthetic source binding is not valid',
    );
    $sourceProbes = 0;
    $trap = true;
    $sourceBefore = file_get_contents($sourceFile);
    $context = ex_ok(
        ex_request('/mbb/v1/export/context', ['post_id' => $post], 'GET'),
        'Source-managed export context failed',
    );
    ex_assert(
        $context['expected'] === mbb_token(get_post($post)),
        'Source export context version differs',
    );
    $sourceMD = ex_prepare($post, 'markdown');
    ex_assert(
        ex_ok(ex_download($sourceMD), 'Source-managed saved MD failed') === $source &&
            file_get_contents($sourceFile) === $sourceBefore &&
            $sourceProbes === 0,
        'Export read/changed source instead of saved pair',
    );
    delete_post_meta($post, '_mbb_source_managed');
    delete_post_meta($post, '_mbb_source_path_hash');
    remove_filter('mbb_source_write_target', $sourceTarget, 10);
    $sourceTarget = null;
    // Compare meaningful article identity/content/meta/comments; tests intentionally changed title revisions above.
    $after = ex_snapshot($post);
    ex_assert(
        $after[0]->post_content === $before[0]->post_content &&
            $after[0]->post_content_filtered === $before[0]->post_content_filtered &&
            $after[0]->post_author === $before[0]->post_author &&
            get_post_meta($post, '_export_private_note', true) === 'Synthetic private note' &&
            mbb_id($post) === $saved['document']['documentId'] &&
            $after[3] == $before[3],
        'Export changed article/private identities',
    );
    // Actual static export uses the same saved-pair/CAS path and never mutates it.
    $params['post_id'] = $post;
    $params['documentId'] = mbb_id($post);
    $params['expected'] = mbb_token(get_post($post));
    $params['source'] =
        str_replace("![external](https://example.invalid/not-fetched.png)\r\n\r\n", '', $source) .
        "\r\nFormula \$a=b\$.\r\n";
    ex_ok(ex_request('/mbb/v1/save', $params), 'Static paired fixture save failed');
    $staticBefore = ex_snapshot($post);
    $html = ex_prepare($post, 'html');
    $denied = ex_prepare($post, 'html');
    wp_set_current_user($actors[1]);
    ex_assert(ex_download($denied)->get_status() >= 400, 'Static owner check bypassed');
    wp_set_current_user($actors[0]);
    $descriptor = json_decode(
        ex_ok(ex_download($html), 'Static download failed'),
        true,
        512,
        JSON_THROW_ON_ERROR,
    );
    ex_assert(
        $descriptor['kind'] === 'markbridge-static' && count($descriptor['images']) === 1,
        'Static descriptor omitted local image',
    );
    ex_assert(
        str_contains($descriptor['body'], 'mbb-static:') &&
            !str_contains(wp_json_encode($descriptor), '_export_private_note'),
        'Static privacy/projection failed',
    );
    ex_assert(ex_download($html)->get_status() >= 400, 'Static claim reused');
    ex_assert(
        ex_snapshot($post) == $staticBefore,
        'Static export changed saved pair or private data',
    );
    $changedHTML = ex_prepare($post, 'html');
    file_put_contents($upload['file'], $original . 'changed');
    ex_assert(ex_download($changedHTML)->get_status() >= 400, 'Changed static image accepted');
    file_put_contents($upload['file'], $original);
    wp_set_current_user(0);
    ex_assert(
        ex_request('/mbb/v1/export/prepare', [
            'schema' => 1,
            'post_id' => $post,
            'expected' => mbb_token(get_post($post)),
            'format' => 'markdown',
        ])->get_status() === 403,
        'Anonymous export accepted',
    );
    echo "Real WordPress export: paired exact MD/ZIP/static HTML, parent media, reimport, owner/TTL/receipt/conflict, resource SHA, source isolation and no writes passed\n";
} finally {
    if ($sourceTarget) {
        remove_filter('mbb_source_write_target', $sourceTarget, 10);
    }
    wp_set_current_user($actors[0] ?? $prior);
    for ($index = 0; $index < 4; $index++) {
        $key = mbb_export_slot($index);
        $record = get_option($key);
        if (is_array($record)) {
            mbb_export_drop($key, $record);
        }
    }
    wp_set_current_user($prior);
    if ($attachment) {
        wp_delete_attachment($attachment, true);
    }
    if ($post) {
        wp_delete_post($post, true);
    }
    if ($sourceFile && is_file($sourceFile)) {
        unlink($sourceFile);
    }
    if ($archive && is_file($archive)) {
        unlink($archive);
    }
    if ($private && is_dir($private)) {
        foreach (scandir($private) as $name) {
            if ($name !== '.' && $name !== '..') {
                unlink($private . '/' . $name);
            }
        }
        rmdir($private);
    }
    require_once ABSPATH . 'wp-admin/includes/user.php';
    foreach ($actors as $actor) {
        wp_delete_user($actor);
    }
}
