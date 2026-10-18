<?php
/** Bounded, actor-scoped new-draft batches. No alternate writable article source. */
if (!defined('ABSPATH')) {
    exit();
}

function mbb_batch_config(): array
{
    return [
        'schema' => 1,
        'maxItems' => 10,
        'maxUploadBytes' => 16777216,
        'maxExpandedBytes' => 33554432,
        'maxImagePixels' => 128000000,
        'maxDocumentBytes' => 262144,
        'maxActivePerUser' => 2,
        'maxSiteRecords' => 16,
        'ttlSeconds' => 3600,
    ];
}
function mbb_batch_throw(string $code, string $message): never
{
    throw new RuntimeException('batch_' . $code . ':' . $message);
}
function mbb_batch_error(Throwable $e)
{
    [$code, $message] = array_pad(explode(':', $e->getMessage(), 2), 2, '');
    if (!str_starts_with($code, 'batch_')) {
        return mbb_error(
            'batch_failed',
            mbb_t('The batch operation did not complete. Refresh its status before trying again.'),
            409,
        );
    }
    return mbb_error(
        $code,
        $message,
        in_array($code, ['batch_scope', 'batch_forbidden'], true)
            ? 403
            : ($code === 'batch_expired'
                ? 410
                : 409),
    );
}
function mbb_batch_permission()
{
    return is_user_logged_in() && current_user_can('edit_posts')
        ? true
        : mbb_error(
            'batch_forbidden',
            mbb_t('Sign in with an account that can create drafts.'),
            403,
        );
}
function mbb_batch_root(): string
{
    $dir = mbb_resource_root() . '/batches-v1';
    if (is_link($dir) || (!is_dir($dir) && !mkdir($dir, 0700))) {
        mbb_batch_throw('storage', mbb_t('Private batch staging is unavailable.'));
    }
    mbb_resource_private_owner($dir);
    chmod($dir, 0700);
    return $dir;
}
function mbb_batch_directory(string $token): string
{
    if (!preg_match('/^[a-f0-9]{64}$/D', $token)) {
        mbb_batch_throw('scope', mbb_t('The batch identity is invalid.'));
    }
    $dir = mbb_batch_root() . '/' . $token;
    if (is_link($dir) || !is_dir($dir) || realpath($dir) !== $dir) {
        mbb_batch_throw(
            'expired',
            mbb_t('The batch expired or is unavailable. Prepare the files again.'),
        );
    }
    mbb_resource_private_owner($dir);
    return $dir;
}
function mbb_batch_lock(string $dir)
{
    $file = $dir . '/lock';
    if (file_exists($file) || is_link($file)) {
        mbb_resource_private_owner($file);
    }
    $lock = fopen($file, 'c');
    if (!$lock) {
        mbb_batch_throw('storage', mbb_t('The batch lock could not be opened.'));
    }
    mbb_resource_private_owner($file);
    chmod($file, 0600);
    if (!flock($lock, LOCK_EX | LOCK_NB)) {
        fclose($lock);
        mbb_batch_throw(
            'busy',
            mbb_t('A batch operation is in progress. Refresh its status after it completes.'),
        );
    }
    return $lock;
}
function mbb_batch_uncertain(array $m): bool
{
    foreach ($m['items'] ?? [] as $item) {
        if (in_array($item['state'] ?? '', ['committing', 'review'], true)) {
            return true;
        }
    }
    return false;
}
function mbb_batch_record(string $dir, bool $actor = true, bool $expiry = true): array
{
    $m = mbb_resource_manifest($dir);
    if (
        ($m['schema'] ?? null) !== 1 ||
        ($m['kind'] ?? null) !== 'markbridge-batch' ||
        ($m['token'] ?? null) !== basename($dir) ||
        ($m['site'] ?? null) !== mbb_resource_site() ||
        !is_int($m['user'] ?? null) ||
        !is_int($m['expires'] ?? null) ||
        !is_array($m['items'] ?? null) ||
        !array_is_list($m['items']) ||
        count($m['items']) > 10
    ) {
        mbb_batch_throw('scope', mbb_t('Batch ownership or its manifest could not be verified.'));
    }
    if ($actor && $m['user'] !== get_current_user_id()) {
        mbb_batch_throw('scope', mbb_t('This batch belongs to another account.'));
    }
    if ($expiry && $m['expires'] <= time() && !mbb_batch_uncertain($m)) {
        mbb_batch_throw(
            'expired',
            mbb_t('The batch expired. Saved drafts remain; prepare the remaining files again.'),
        );
    }
    return $m;
}
function mbb_batch_remove_files(string $dir, array $m): void
{
    // Only the fixed item directories recorded by this authenticated manifest.
    foreach ($m['items'] as $i => $item) {
        $child = $dir . '/item-' . $i;
        if (is_link($child)) {
            mbb_batch_throw('storage', mbb_t('Unknown staging objects were preserved for review.'));
        }
        if (is_dir($child)) {
            mbb_resource_remove_private($child);
        }
    }
}
function mbb_batch_cleanup(string $root): array
{
    $records = [];
    foreach (scandir($root) as $name) {
        if (!preg_match('/^[a-f0-9]{64}$/D', $name)) {
            continue;
        }
        $dir = $root . '/' . $name;
        try {
            if (is_link($dir) || !is_dir($dir)) {
                continue;
            }
            $lock = mbb_batch_lock($dir);
            try {
                $m = mbb_batch_record($dir, false, false);
                if ($m['expires'] <= time() && !mbb_batch_uncertain($m)) {
                    mbb_batch_remove_files($dir, $m);
                    // A closed manifest layout; never recursively delete unknown files.
                    foreach (scandir($dir) as $file) {
                        if (
                            $file === '.' ||
                            $file === '..' ||
                            in_array($file, ['manifest.json', 'lock'], true)
                        ) {
                            continue;
                        }
                        mbb_batch_throw(
                            'storage',
                            mbb_t('Unknown staging objects were preserved for review.'),
                        );
                    }
                    unlink($dir . '/manifest.json');
                    unlink($dir . '/lock');
                    rmdir($dir);
                } else {
                    $records[] = $m;
                }
            } finally {
                fclose($lock);
            }
        } catch (Throwable $e) {
            // Unverifiable or busy entries still occupy a quota slot.
            $records[] = ['user' => null, 'state' => 'unavailable', 'token' => $name];
        }
    }
    return $records;
}
function mbb_batch_summary(array $m): array
{
    $items = [];
    foreach ($m['items'] as $index => $item) {
        $items[] = [
            'index' => $index,
            'name' => $item['name'],
            'title' => $item['title'],
            'bytes' => $item['bytes'],
            'sourceSha256' => $item['sourceSha256'] ?? null,
            'state' => $item['state'],
            'error' => $item['error'] ?? null,
            'reason' => $item['reason'] ?? null,
            'warnings' => $item['warnings'] ?? [],
            'images' => $item['images'] ?? 0,
            'post_id' => $item['post_id'] ?? null,
            'editUrl' =>
                isset($item['post_id']) && current_user_can('edit_post', $item['post_id'])
                    ? get_edit_post_link($item['post_id'], 'raw')
                    : null,
        ];
    }
    return [
        'schema' => 1,
        'token' => $m['token'],
        'expiresAt' => $m['expires'],
        'state' => $m['state'],
        'items' => $items,
        'identityStrategy' => $m['identityStrategy'] ?? 'copy',
        'identityMappings' => $m['identityMappings'] ?? [],
        'limits' => mbb_batch_config(),
    ];
}
function mbb_batch_input(string $dir, int $index, array $item): string
{
    $file = $dir . '/item-' . $index . '/input.' . $item['type'];
    if (is_link($file) || !is_file($file) || filesize($file) !== $item['bytes']) {
        mbb_batch_throw('changed', mbb_t('A staged input changed. Prepare that file again.'));
    }
    mbb_resource_private_owner($file);
    if (!hash_equals($item['sha256'], hash_file('sha256', $file))) {
        mbb_batch_throw(
            'changed',
            mbb_t('A staged input digest changed. Prepare that file again.'),
        );
    }
    return $file;
}
function mbb_batch_source(string $dir, int $index, array $item): string
{
    $file = $dir . '/item-' . $index . '/source.md';
    mbb_resource_private_owner($file);
    if (is_link($file) || !is_file($file) || filesize($file) > 262144) {
        mbb_batch_throw('changed', mbb_t('The staged document is unavailable.'));
    }
    $source = file_get_contents($file);
    if (!hash_equals($item['sourceSha256'], hash('sha256', $source))) {
        mbb_batch_throw('changed', mbb_t('The staged document changed. Prepare that file again.'));
    }
    return $source;
}
function mbb_batch_request(array $item, string $source): WP_REST_Request
{
    $r = new WP_REST_Request('POST', '/mbb/v1/save');
    foreach (
        [
            'mode' => 'markdown',
            'post_id' => 0,
            'documentId' => $item['documentId'],
            'source' => $source,
            'title' => $item['title'],
            'post_status' => 'draft',
            'featured_media' => 0,
            'frontmatter_selected' => [],
        ]
        as $k => $v
    ) {
        $r->set_param($k, $v);
    }
    if (!empty($item['logicalIdentity'])) {
        $r['identity_receipt'] = mbb_references_receipt([
            'post_id' => 0,
            'expected' => null,
            'identity' => $item['logicalIdentity'],
            'owner' => mbb_references_operation_owner(),
            'expires' => time() + 900,
            'action' => 'batch-import',
        ]);
    }
    if (isset($item['resourceToken'])) {
        $r['resource_import'] = [
            'schema' => 1,
            'token' => $item['resourceToken'],
            'ack_public_media' => true,
        ];
    }
    return $r;
}
function mbb_batch_duplicate_warnings(array $item, array $previous): array
{
    $warnings = [];
    foreach ($previous as $other) {
        if (mb_strtolower($other['name']) === mb_strtolower($item['name'])) {
            $warnings['filename'] = 'duplicate-filename';
        }
        if (($other['sourceSha256'] ?? null) === $item['sourceSha256']) {
            $warnings['source'] = 'duplicate-source';
        }
        if ($other['title'] === $item['title']) {
            $warnings['title'] = 'duplicate-title';
        }
    }
    $common = [
        'post_type' => 'post',
        'post_status' => array_keys(get_post_stati()),
        'numberposts' => 3,
        'fields' => 'ids',
        'author' => current_user_can('edit_others_posts') ? '' : get_current_user_id(),
    ];
    foreach (get_posts($common + ['title' => $item['title']]) as $id) {
        if (current_user_can('edit_post', $id)) {
            $warnings['existingTitle'] = 'existing-title';
            break;
        }
    }
    foreach (
        get_posts(
            $common + [
                'meta_query' => [
                    [
                        'key' => '_mbb_source_history',
                        'value' => $item['sourceSha256'],
                        'compare' => 'LIKE',
                    ],
                ],
            ],
        )
        as $id
    ) {
        if (
            current_user_can('edit_post', $id) &&
            mbb_managed($id) &&
            hash('sha256', get_post($id)->post_content_filtered) === $item['sourceSha256']
        ) {
            $warnings['existingSource'] = 'existing-source';
            break;
        }
    }
    return array_values($warnings);
}
function mbb_batch_prepare($r)
{
    $global = null;
    $dir = null;
    $record = null;
    try {
        $identityStrategy = $r['identity_strategy'] ?? 'copy';
        if (!in_array($identityStrategy, ['copy', 'migrate'], true)) {
            mbb_batch_throw('identity', mbb_t('Choose copy or explicit identity migration.'));
        }
        $files = $r->get_file_params()['documents'] ?? null;
        if (
            !is_array($files) ||
            !is_array($files['name'] ?? null) ||
            !array_is_list($files['name']) ||
            count($files['name']) < 1 ||
            count($files['name']) > 10
        ) {
            mbb_batch_throw(
                'upload',
                mbb_t('Choose between one and ten Markdown or single-document ZIP files.'),
            );
        }
        $count = count($files['name']);
        $total = 0;
        foreach (['tmp_name', 'error', 'size'] as $key) {
            if (
                !is_array($files[$key] ?? null) ||
                !array_is_list($files[$key]) ||
                count($files[$key]) !== $count
            ) {
                mbb_batch_throw('upload', mbb_t('The uploaded batch is incomplete.'));
            }
        }
        for ($i = 0; $i < $count; $i++) {
            if (
                !is_string($files['name'][$i]) ||
                !mb_check_encoding($files['name'][$i], 'UTF-8') ||
                mb_strlen($files['name'][$i]) > 200 ||
                $files['error'][$i] !== UPLOAD_ERR_OK ||
                !is_string($files['tmp_name'][$i]) ||
                (!(defined('WP_CLI') && WP_CLI) && !is_uploaded_file($files['tmp_name'][$i])) ||
                is_link($files['tmp_name'][$i]) ||
                !is_file($files['tmp_name'][$i])
            ) {
                mbb_batch_throw(
                    'upload',
                    mbb_t('A file did not finish uploading. No drafts were created.'),
                );
            }
            $size = filesize($files['tmp_name'][$i]);
            $ext = strtolower(pathinfo($files['name'][$i], PATHINFO_EXTENSION));
            if (
                !in_array($ext, ['md', 'markdown', 'zip'], true) ||
                !is_int($size) ||
                $size < 1 ||
                $size > ($ext === 'zip' ? 8388608 : 262144) ||
                ($total += $size) > 16777216
            ) {
                mbb_batch_throw(
                    'budget',
                    mbb_t('The batch exceeds its file type, per-file or 16 MiB upload budget.'),
                );
            }
        }
        $root = mbb_batch_root();
        $global = mbb_batch_lock($root);
        $active = mbb_batch_cleanup($root);
        if (
            count($active) >= 16 ||
            count(
                array_filter(
                    $active,
                    fn($m) => $m['user'] === get_current_user_id() && $m['state'] === 'open',
                ),
            ) >= 2
        ) {
            mbb_batch_throw(
                'quota',
                mbb_t(
                    'Keep at most two active batches. Cancel an older batch or wait for expiry; the site also has a shared staging limit.',
                ),
            );
        }
        $token = bin2hex(random_bytes(32));
        $dir = $root . '/' . $token;
        if (!mkdir($dir, 0700)) {
            mbb_batch_throw('storage', mbb_t('The batch staging directory could not be created.'));
        }
        $record = [
            'schema' => 1,
            'kind' => 'markbridge-batch',
            'token' => $token,
            'site' => mbb_resource_site(),
            'user' => get_current_user_id(),
            'created' => time(),
            'expires' => time() + 3600,
            'state' => 'open',
            'identityStrategy' => $identityStrategy,
            'identityMappings' => [],
            'items' => [],
        ];
        $expanded = 0;
        $consumeExpanded = static function (int $count) use (&$expanded) {
            if ($count < 1 || $expanded + $count > 33554432) {
                mbb_batch_throw('expanded', mbb_t('The batch exceeds the 32 MiB expanded budget.'));
            }
            $expanded += $count;
        };
        $pixels = 0;
        $consumePixels = static function (int $count) use (&$pixels) {
            if ($count < 1 || $pixels + $count > 128000000) {
                mbb_batch_throw(
                    'pixels',
                    mbb_t('The batch exceeds the 128 MP image processing budget.'),
                );
            }
            $pixels += $count;
        };
        for ($i = 0; $i < $count; $i++) {
            $name = basename(str_replace('\\', '/', $files['name'][$i]));
            $title = sanitize_text_field(pathinfo($name, PATHINFO_FILENAME));
            if ($title === '') {
                $title = mbb_t('Untitled draft');
            }
            $type = strtolower(pathinfo($name, PATHINFO_EXTENSION)) === 'zip' ? 'zip' : 'md';
            $sub = $dir . '/item-' . $i;
            mkdir($sub, 0700);
            $input = $sub . '/input.' . $type;
            if (!copy($files['tmp_name'][$i], $input) || !chmod($input, 0600)) {
                mbb_batch_throw('storage', mbb_t('Private input staging failed.'));
            }
            $item = [
                'name' => $name,
                'title' => $title,
                'type' => $type,
                'bytes' => filesize($input),
                'sha256' => hash_file('sha256', $input),
                'documentId' => 'Batch' . substr(hash('sha256', $token . ':' . $i), 0, 48),
                'state' => 'ready',
                'images' => 0,
                'warnings' => [],
            ];
            try {
                if ($type === 'zip') {
                    if (
                        !current_user_can('upload_files') ||
                        !class_exists('ZipArchive') ||
                        !class_exists('Normalizer')
                    ) {
                        mbb_batch_throw(
                            'zip',
                            mbb_t(
                                'ZIP batches require image upload permission and the existing ZIP dependencies.',
                            ),
                        );
                    }
                    $pack = mbb_resource_extract(
                        $input,
                        $sub,
                        33554432 - $expanded,
                        64000000,
                        $consumePixels,
                        $consumeExpanded,
                    );
                    $source = $pack['markdown']['source'];
                    $size = $pack['expandedBytes'];
                    $item['images'] = count($pack['images']);
                    $paths = array_fill_keys(array_column($pack['images'], 'path'), true);
                } else {
                    $source = file_get_contents($input);
                    $size = strlen($source);
                    $consumeExpanded($size);
                    $paths = [];
                }
                if ($expanded > 33554432) {
                    mbb_batch_throw(
                        'expanded',
                        mbb_t('The batch exceeds the 32 MiB expanded budget.'),
                    );
                }
                if (
                    strlen($source) > 262144 ||
                    !mb_check_encoding($source, 'UTF-8') ||
                    str_contains($source, "\0")
                ) {
                    mbb_batch_throw(
                        'document',
                        mbb_t('Each document must be UTF-8 text within 256 KiB.'),
                    );
                }
                $item['sourceSha256'] = hash('sha256', $source);
                $converted = mbb_convert([
                    'mode' => 'markdown',
                    'source' => $source,
                    'documentId' => $item['documentId'],
                ]);
                if (is_wp_error($converted)) {
                    mbb_batch_throw(
                        'conversion',
                        mbb_t(
                            'This document failed conversion. Correct the original file and prepare it again.',
                        ),
                    );
                }
                if (function_exists('mbb_references_projection')) {
                    $item['originalIdentity'] = mbb_references_projection($converted['serialized'])[
                        'identity'
                    ];
                }
                $admission = mbb_native_media_portable_admission($converted['serialized']);
                if (is_wp_error($admission)) {
                    mbb_batch_throw(
                        'media',
                        mbb_t(
                            'Local attachment IDs cannot be imported from a batch. Use portable images without another site\'s IDs.',
                        ),
                    );
                }
                foreach (\MarkBridge\Probe\ResourceImages::urls($converted['serialized']) as $url) {
                    if (preg_match('~^https?://~i', $url) || str_starts_with($url, '/')) {
                        $item['warnings'][] = 'unbundled-image';
                        continue;
                    }
                    if (
                        $type !== 'zip' ||
                        !isset($paths[mbb_resource_relative($url, $pack['markdown']['path'])])
                    ) {
                        mbb_batch_throw(
                            'images',
                            mbb_t(
                                'A relative image is missing. Include it in the single-document ZIP.',
                            ),
                        );
                    }
                }
                if (str_starts_with($source, '---')) {
                    $item['warnings'][] = 'metadata-not-applied';
                }
                $item['warnings'] = array_values(
                    array_unique(
                        array_merge(
                            $item['warnings'],
                            mbb_batch_duplicate_warnings($item, $record['items']),
                        ),
                    ),
                );
                if (
                    file_put_contents($sub . '/source.md', $source) !== strlen($source) ||
                    !chmod($sub . '/source.md', 0600)
                ) {
                    mbb_batch_throw('storage', mbb_t('The staged source could not be written.'));
                }
            } catch (Throwable $e) {
                if (
                    str_starts_with($e->getMessage(), 'batch_expanded:') ||
                    str_starts_with($e->getMessage(), 'batch_pixels:')
                ) {
                    throw $e;
                }
                $item['state'] = 'blocked';
                $item['error'] = 'scan-rejected';
                $message = $e->getMessage();
                $item['reason'] = mb_substr(
                    explode(':', $message, 2)[1] ?? mbb_t('File validation failed.'),
                    0,
                    500,
                );
            }
            // Keep only the original input and canonical raw source; temporary extraction is redundant.
            foreach (scandir($sub) as $file) {
                if (preg_match('/^[a-f0-9]{32}\.blob$/D', $file)) {
                    mbb_resource_private_owner($sub . '/' . $file);
                    unlink($sub . '/' . $file);
                }
            }
            $record['items'][] = $item;
        }
        if (function_exists('mbb_references_batch_prepare')) {
            mbb_references_batch_prepare($dir, $record);
        }
        mbb_resource_write_json($dir, $record);
        return mbb_batch_summary($record);
    } catch (Throwable $e) {
        if ($dir && $record) {
            try {
                // Preparation has never created articles or media.
                foreach (scandir($dir) as $name) {
                    if (preg_match('/^item-[0-9]$/D', $name)) {
                        mbb_resource_remove_private($dir . '/' . $name);
                    }
                }
                if (is_file($dir . '/manifest.json')) {
                    unlink($dir . '/manifest.json');
                }
                rmdir($dir);
            } catch (Throwable $cleanup) {
                /* Preserve anything whose ownership is uncertain. */
            }
        }
        return mbb_batch_error($e);
    } finally {
        if (is_resource($global)) {
            fclose($global);
        }
    }
}

function mbb_batch_receipt(array $m, int $index): string
{
    $item = $m['items'][$index];
    return hash_hmac(
        'sha256',
        mbb_component_json([
            $m['site'],
            $m['user'],
            $m['token'],
            $m['expires'],
            $index,
            $item['documentId'],
            $item['sourceSha256'],
            $m['identityMappings'] ?? [],
            $m['identityStrategy'] ?? 'copy',
            $item['title'],
            $item['preview'] ?? null,
        ]),
        wp_salt('auth'),
    );
}
function mbb_batch_origin(array $m, int $index): string
{
    return hash_hmac(
        'sha256',
        'mbb-batch-origin-v1:' . $m['site'] . ':' . $m['user'] . ':' . $m['token'] . ':' . $index,
        wp_salt('auth'),
    );
}
function mbb_batch_recover(array &$m, int $index): bool
{
    $item = &$m['items'][$index];
    if ($item['state'] !== 'committing' && $item['state'] !== 'review') {
        return $item['state'] === 'saved';
    }
    $ids = get_posts([
        'post_type' => ['post', 'page'],
        'post_status' => array_keys(get_post_stati()),
        'numberposts' => 2,
        'fields' => 'ids',
        'meta_key' => '_mbb_document_id',
        'meta_value' => $item['documentId'],
    ]);
    if (count($ids) === 1) {
        $post = get_post($ids[0]);
        if (
            (int) $post->post_author === $m['user'] &&
            mbb_managed($post->ID) &&
            current_user_can('edit_post', $post->ID) &&
            hash_equals(
                mbb_batch_origin($m, $index),
                (string) get_post_meta($post->ID, '_mbb_batch_origin', true),
            )
        ) {
            $item['state'] = 'saved';
            $item['post_id'] = (int) $post->ID;
            unset($item['preview']);
            return true;
        }
    }
    // An interrupted call may have committed media without a reliably visible article.
    // Absence is not proof of rollback. Never automatically create another copy.
    $item['state'] = 'review';
    $item['error'] = 'commit-needs-review';
    return false;
}
function mbb_batch_public_item(array $m, int $index): array
{
    return mbb_batch_summary($m)['items'][$index];
}
function mbb_batch_with($r, callable $action)
{
    $lock = null;
    try {
        $dir = mbb_batch_directory((string) $r['token']);
        $lock = mbb_batch_lock($dir);
        $m = mbb_batch_record($dir);
        $result = $action($m, $dir);
        return $result;
    } catch (Throwable $e) {
        return mbb_batch_error($e);
    } finally {
        if (is_resource($lock)) {
            fclose($lock);
        }
    }
}
function mbb_batch_preview($r)
{
    return mbb_batch_with($r, function (array &$m, string $dir) use ($r) {
        $data = $r->get_json_params();
        $i = $data['index'] ?? null;
        $title = $data['title'] ?? null;
        if (
            !is_array($data) ||
            array_diff(array_keys($data), ['schema', 'index', 'title']) ||
            ($data['schema'] ?? null) !== 1 ||
            !is_int($i) ||
            !isset($m['items'][$i]) ||
            !is_string($title) ||
            $title === '' ||
            mb_strlen($title) > 200 ||
            sanitize_text_field($title) !== $title
        ) {
            mbb_batch_throw(
                'request',
                mbb_t('Choose a batch item and a plain title of at most 200 characters.'),
            );
        }
        if ($m['state'] !== 'open') {
            mbb_batch_throw(
                'cancelled',
                mbb_t('This batch was canceled. Saved drafts are preserved.'),
            );
        }
        $item = &$m['items'][$i];
        if ($m['expires'] <= time()) {
            mbb_batch_throw(
                'expired',
                mbb_t('This batch expired. Verify pending saves; prepare other files again.'),
            );
        }
        if (!in_array($item['state'], ['ready', 'previewed'], true)) {
            mbb_batch_throw(
                'state',
                mbb_t(
                    'This item cannot be previewed. Refresh its status or correct its original file.',
                ),
            );
        }
        $item['title'] = $title;
        $file = mbb_batch_input($dir, $i, $item);
        $source = mbb_batch_source($dir, $i, $item);
        if (isset($item['resourceToken'])) {
            try {
                $ctx = mbb_resource_load($item['resourceToken'], true);
                try {
                    mbb_resource_discard($ctx);
                } finally {
                    mbb_resource_release($ctx);
                }
            } catch (Throwable $e) {
                /* Expired resources will be prepared from the verified original. */
            }
            unset($item['resourceToken']);
        }
        $request = mbb_batch_request($item, $source);
        if ($item['type'] === 'zip') {
            $prepared = mbb_resource_prepare_file($request, $file);
            if (is_wp_error($prepared)) {
                return $prepared;
            }
            $item['resourceToken'] = $prepared['token'];
            $request = mbb_batch_request($item, $source);
        }
        $preview = mbb_preview($request);
        if (is_wp_error($preview)) {
            return $preview;
        }
        $item['state'] = 'previewed';
        $item['preview'] = [
            'identity' => bin2hex(random_bytes(16)),
            'adapterDigest' => $preview['adapter_digest'] ?? null,
            'frontmatterReceipt' => $preview['frontmatter_receipt'] ?? null,
            'resourceReceipt' => $preview['resource_receipt'] ?? null,
            'resourceDigest' => $preview['resource_plan']['manifestDigest'] ?? null,
            'expires' => min(
                $m['expires'],
                $preview['resource_plan']['expiresAt'] ?? $m['expires'],
            ),
        ];
        mbb_resource_write_json($dir, $m);
        return [
            'schema' => 1,
            'item' => mbb_batch_public_item($m, $i),
            'html' => $preview['html'],
            'source' => $source,
            'identityMappings' => $m['identityMappings'] ?? [],
            'identityStrategy' => $m['identityStrategy'] ?? 'copy',
            'receipt' => mbb_batch_receipt($m, $i),
            'documentId' => $item['documentId'],
            'resourceToken' => $item['resourceToken'] ?? null,
            'images' => $preview['resource_plan']['images'] ?? [],
            'expiresAt' => $item['preview']['expires'],
        ];
    });
}
function mbb_batch_confirm($r)
{
    return mbb_batch_with($r, function (array &$m, string $dir) use ($r) {
        $data = $r->get_json_params();
        $i = $data['index'] ?? null;
        if (
            !is_array($data) ||
            array_diff(array_keys($data), ['schema', 'index', 'receipt', 'ack_public_media']) ||
            ($data['schema'] ?? null) !== 1 ||
            !is_int($i) ||
            !isset($m['items'][$i]) ||
            !is_string($data['receipt'] ?? null) ||
            !is_bool($data['ack_public_media'] ?? null)
        ) {
            mbb_batch_throw('request', mbb_t('Explicit item confirmation is required.'));
        }
        $item = &$m['items'][$i];
        if (in_array($item['state'], ['committing', 'review', 'saved'], true)) {
            mbb_batch_recover($m, $i);
            mbb_resource_write_json($dir, $m);
            return mbb_batch_public_item($m, $i);
        }
        if (
            $m['state'] !== 'open' ||
            $item['state'] !== 'previewed' ||
            !isset($item['preview']) ||
            $item['preview']['expires'] <= time() ||
            !hash_equals(mbb_batch_receipt($m, $i), $data['receipt'])
        ) {
            mbb_batch_throw('preview', mbb_t('Preview this item again before creating its draft.'));
        }
        if ($item['images'] > 0 && $data['ack_public_media'] !== true) {
            mbb_batch_throw(
                'media_ack',
                mbb_t('Confirm that uploaded image URLs may be public, including for a draft.'),
            );
        }
        mbb_batch_input($dir, $i, $item);
        $source = mbb_batch_source($dir, $i, $item);
        $request = mbb_batch_request($item, $source);
        $request['adapter_digest'] = $item['preview']['adapterDigest'];
        $request['frontmatter_receipt'] = $item['preview']['frontmatterReceipt'] ?? null;
        $request['resource_receipt'] = $item['preview']['resourceReceipt'];
        $guard = mbb_permission($request);
        if ($guard !== true) {
            return $guard;
        }
        // Durable intention precedes the normal transactional save. A receipt is written
        // by an internal callback in the same transaction as the newly inserted article.
        $origin = mbb_batch_origin($m, $i);
        $actor = $m['user'];
        $inserted = null;
        $documentId = $item['documentId'];
        $mark = static function ($id, $savedDocumentId) use (
            $origin,
            $actor,
            $documentId,
            &$inserted,
        ) {
            $post = get_post($id);
            if (
                $savedDocumentId !== $documentId ||
                !$post ||
                (int) $post->post_author !== $actor ||
                $post->post_status !== 'draft'
            ) {
                throw new RuntimeException('Batch provenance identity changed.');
            }
            $inserted = (int) $id;
            update_post_meta($id, '_mbb_batch_origin', $origin);
            if (!hash_equals($origin, (string) get_post_meta($id, '_mbb_batch_origin', true))) {
                throw new RuntimeException('Batch provenance could not be recorded.');
            }
        };
        $item['state'] = 'committing';
        mbb_resource_write_json($dir, $m);
        $saved = mbb_save($request, null, $mark);
        if (is_wp_error($saved)) {
            // Known pre-transaction/rollback failures can be previewed again; uncertain
            // commit/resource recovery states require verification and never auto-repeat.
            if ($saved->get_error_code() === 'save_failed') {
                $item['state'] = 'ready';
                $item['error'] = $saved->get_error_code();
                unset($item['preview']);
            } else {
                $item['state'] = 'review';
                $item['error'] = 'commit-needs-review';
            }
            mbb_batch_recover($m, $i);
            mbb_resource_write_json($dir, $m);
            return $saved;
        }
        $postId = (int) ($saved['post_id'] ?? 0);
        if (
            !$postId ||
            $postId !== $inserted ||
            !hash_equals($origin, (string) get_post_meta($postId, '_mbb_batch_origin', true))
        ) {
            $item['state'] = 'review';
            $item['error'] = 'commit-needs-review';
            mbb_resource_write_json($dir, $m);
            mbb_batch_throw(
                'review',
                mbb_t('The save result needs verification. Do not import this item again.'),
            );
        }
        $item['state'] = 'saved';
        $item['post_id'] = $postId;
        unset($item['preview']);
        mbb_resource_write_json($dir, $m);
        return mbb_batch_public_item($m, $i);
    });
}
function mbb_batch_status($r)
{
    return mbb_batch_with($r, function (array &$m, string $dir) {
        foreach ($m['items'] as $i => $item) {
            if (in_array($item['state'], ['committing', 'review'], true)) {
                mbb_batch_recover($m, $i);
            }
        }
        mbb_resource_write_json($dir, $m);
        return mbb_batch_summary($m);
    });
}
function mbb_batch_cancel($r)
{
    return mbb_batch_with($r, function (array &$m, string $dir) {
        foreach ($m['items'] as $i => &$item) {
            if (in_array($item['state'], ['committing', 'review'], true)) {
                mbb_batch_recover($m, $i);
            }
            if (in_array($item['state'], ['review', 'committing'], true)) {
                mbb_batch_throw(
                    'review',
                    mbb_t(
                        'A save result is uncertain. Keep this batch for verification before canceling.',
                    ),
                );
            }
            if (isset($item['resourceToken']) && $item['state'] !== 'saved') {
                try {
                    $ctx = mbb_resource_load($item['resourceToken'], true);
                    try {
                        mbb_resource_discard($ctx);
                    } finally {
                        mbb_resource_release($ctx);
                    }
                } catch (Throwable $e) {
                    /* Never remove unverified or committed resources. */
                }
            }
            if ($item['state'] !== 'saved') {
                $item['state'] = 'cancelled';
            }
            unset($item['preview'], $item['resourceToken']);
        }
        unset($item);
        $m['state'] = 'cancelled';
        $m['expires'] = min($m['expires'], time() + 60);
        mbb_resource_write_json($dir, $m);
        mbb_batch_remove_files($dir, $m);
        return mbb_batch_summary($m);
    });
}
add_action('rest_api_init', static function () {
    register_rest_route('mbb/v1', '/batch', [
        'methods' => 'GET',
        'permission_callback' => 'mbb_batch_permission',
        'callback' => static function () {
            $lock = null;
            try {
                $root = mbb_batch_root();
                $lock = mbb_batch_lock($root);
                $records = mbb_batch_cleanup($root);
                return [
                    'schema' => 1,
                    'batches' => array_values(
                        array_map(
                            'mbb_batch_summary',
                            array_filter($records, fn($m) => $m['user'] === get_current_user_id()),
                        ),
                    ),
                    'limits' => mbb_batch_config(),
                ];
            } catch (Throwable $e) {
                return mbb_batch_error($e);
            } finally {
                if (is_resource($lock)) {
                    fclose($lock);
                }
            }
        },
    ]);
    register_rest_route('mbb/v1', '/batch/prepare', [
        'methods' => 'POST',
        'permission_callback' => 'mbb_batch_permission',
        'callback' => 'mbb_batch_prepare',
    ]);
    register_rest_route('mbb/v1', '/batch/(?P<token>[a-f0-9]{64})', [
        [
            'methods' => 'GET',
            'permission_callback' => 'mbb_batch_permission',
            'callback' => 'mbb_batch_status',
        ],
        [
            'methods' => 'DELETE',
            'permission_callback' => 'mbb_batch_permission',
            'callback' => 'mbb_batch_cancel',
        ],
    ]);
    register_rest_route('mbb/v1', '/batch/(?P<token>[a-f0-9]{64})/preview', [
        'methods' => 'POST',
        'permission_callback' => 'mbb_batch_permission',
        'callback' => 'mbb_batch_preview',
    ]);
    register_rest_route('mbb/v1', '/batch/(?P<token>[a-f0-9]{64})/confirm', [
        'methods' => 'POST',
        'permission_callback' => 'mbb_batch_permission',
        'callback' => 'mbb_batch_confirm',
    ]);
});
