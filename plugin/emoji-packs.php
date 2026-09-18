<?php
/** Optional, data-only emoji packs. Never extract an untrusted archive. */
if (!defined('ABSPATH')) {
    exit();
}
function mbb_emoji_root()
{
    $upload = wp_upload_dir();
    if ($upload['error']) {
        throw new RuntimeException('Uploads directory is unavailable.');
    }
    return [$upload['basedir'] . '/markbridge/emoji', $upload['baseurl'] . '/markbridge/emoji'];
}
function mbb_emoji_validate($archive)
{
    if (!class_exists('ZipArchive') || !is_file($archive) || filesize($archive) > 8388608) {
        throw new RuntimeException('ZIP support is required; archive limit is 8 MiB.');
    }
    $zip = new ZipArchive();
    if ($zip->open($archive) !== true) {
        throw new RuntimeException('Cannot read ZIP.');
    }
    try {
        if ($zip->numFiles < 2 || $zip->numFiles > 129) {
            throw new RuntimeException('A pack requires 1–128 images and manifest.json.');
        }
        $entries = [];
        $total = 0;
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $stat = $zip->statIndex($i);
            $name = $stat['name'];
            $zip->getExternalAttributesIndex($i, $opsys, $attributes);
            $kind = ($attributes >> 16) & 0170000;
            if (
                !preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}\z/D', $name) ||
                isset($entries[$name]) ||
                !in_array($kind, [0, 0100000], true) ||
                $stat['size'] > 262144 ||
                ($total += $stat['size']) > 8388608
            ) {
                throw new RuntimeException(
                    'Unsafe, duplicate, non-regular or oversized ZIP entry.',
                );
            }
            $bytes = $zip->getFromIndex($i, 262145);
            if ($bytes === false || strlen($bytes) !== $stat['size']) {
                throw new RuntimeException('Cannot read complete ZIP entry.');
            }
            $entries[$name] = $bytes;
        }
        $manifest = json_decode($entries['manifest.json'] ?? '', true);
        if (!is_array($manifest) || ($manifest['schema'] ?? null) !== 1) {
            throw new RuntimeException('Unsupported manifest schema.');
        }
        foreach (['id', 'version'] as $field) {
            if (
                !is_string($manifest[$field] ?? null) ||
                !preg_match('/\A[a-z0-9][a-z0-9.-]{0,63}\z/D', $manifest[$field])
            ) {
                throw new RuntimeException('Invalid pack identity.');
            }
        }
        foreach (['name', 'source', 'license'] as $field) {
            if (
                !is_string($manifest[$field] ?? null) ||
                trim($manifest[$field]) === '' ||
                strlen($manifest[$field]) > 500
            ) {
                throw new RuntimeException(
                    'Name, source and license are required (maximum 500 bytes).',
                );
            }
        }
        if (
            !is_array($manifest['emoji'] ?? null) ||
            !$manifest['emoji'] ||
            count($manifest['emoji']) > 128
        ) {
            throw new RuntimeException('Invalid shortcode mapping.');
        }
        $used = ['manifest.json' => true];
        foreach ($manifest['emoji'] as $code => $item) {
            if (!preg_match('/\A[a-zA-Z0-9_+\-]{1,64}\z/D', (string) $code) || !is_array($item)) {
                throw new RuntimeException('Invalid shortcode.');
            }
            $file = $item['file'] ?? '';
            if (
                !is_string($file) ||
                !preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9_-]*\.(png|gif|webp)\z/D', $file, $match) ||
                !isset($entries[$file]) ||
                !is_string($item['sha256'] ?? null) ||
                !hash_equals(hash('sha256', $entries[$file]), $item['sha256'])
            ) {
                throw new RuntimeException('Image path or checksum mismatch.');
            }
            $info = @getimagesizefromstring($entries[$file]);
            $mime = ['png' => 'image/png', 'gif' => 'image/gif', 'webp' => 'image/webp'][$match[1]];
            if (
                !$info ||
                $info['mime'] !== $mime ||
                $info[0] > 512 ||
                $info[1] > 512 ||
                stripos($entries[$file], '<?') !== false
            ) {
                throw new RuntimeException(
                    'Only PNG, GIF and WebP images up to 512 × 512 are accepted.',
                );
            }
            $used[$file] = true;
        }
        if (array_diff_key($entries, $used)) {
            throw new RuntimeException('Unlisted files are not allowed.');
        }
        return [$manifest, $entries];
    } finally {
        $zip->close();
    }
}
function mbb_emoji_locked($callback)
{
    [$root] = mbb_emoji_root();
    if (!wp_mkdir_p($root) || is_link($root)) {
        throw new RuntimeException('Cannot create resource directory.');
    }
    $lock = fopen($root . '/.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
        if ($lock) {
            fclose($lock);
        }
        throw new RuntimeException('Another resource operation is running.');
    }
    try {
        return $callback($root);
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
function mbb_emoji_import($archive)
{
    [$manifest, $entries] = mbb_emoji_validate($archive);
    return mbb_emoji_locked(function ($root) use ($manifest, $entries) {
        $key =
            $manifest['id'] .
            '-' .
            $manifest['version'] .
            '-' .
            substr(hash('sha256', $entries['manifest.json']), 0, 16);
        $packs = get_option('markbridge_emoji_packs', []);
        if (isset($packs[$key]) || file_exists($root . '/' . $key)) {
            throw new RuntimeException('This pack is already installed.');
        }
        $stage = $root . '/.stage-' . wp_generate_uuid4();
        if (!mkdir($stage, 0755)) {
            throw new RuntimeException('Cannot stage pack.');
        }
        try {
            foreach ($entries as $name => $bytes) {
                if (file_put_contents($stage . '/' . $name, $bytes, LOCK_EX) !== strlen($bytes)) {
                    throw new RuntimeException('Cannot write resource.');
                }
            }
            if (!rename($stage, $root . '/' . $key)) {
                throw new RuntimeException('Cannot install resource atomically.');
            }
            $packs[$key] = $manifest;
            if (!update_option('markbridge_emoji_packs', $packs, false)) {
                foreach (array_keys($entries) as $name) {
                    unlink($root . '/' . $key . '/' . $name);
                }
                rmdir($root . '/' . $key);
                throw new RuntimeException('Cannot save pack metadata.');
            }
        } finally {
            if (is_dir($stage)) {
                foreach (glob($stage . '/*') as $file) {
                    unlink($file);
                }
                rmdir($stage);
            }
        }
        return $key;
    });
}
function mbb_emoji_select($key)
{
    return mbb_emoji_locked(function ($root) use ($key) {
        $packs = get_option('markbridge_emoji_packs', []);
        if ($key !== '' && (!isset($packs[$key]) || !is_dir($root . '/' . $key))) {
            throw new RuntimeException('Pack is not installed.');
        }
        if (
            get_option('markbridge_emoji_active', '') !== $key &&
            !update_option('markbridge_emoji_active', $key, false)
        ) {
            throw new RuntimeException('Cannot save selection; previous setting retained.');
        }
    });
}
function mbb_emoji_delete($key)
{
    return mbb_emoji_locked(function ($root) use ($key) {
        $packs = get_option('markbridge_emoji_packs', []);
        if (
            !isset($packs[$key]) ||
            !preg_match('/\A[a-z0-9.-]+\z/D', $key) ||
            get_option('markbridge_emoji_active', '') === $key
        ) {
            throw new RuntimeException(
                'Select Unicode or another pack before deleting an installed pack.',
            );
        }
        $dir = $root . '/' . $key;
        if (is_link($dir)) {
            throw new RuntimeException('Resource directory must not be a symbolic link.');
        }
        $removed = $root . '/.delete-' . wp_generate_uuid4();
        if (!rename($dir, $removed)) {
            throw new RuntimeException('Cannot remove pack.');
        }
        unset($packs[$key]);
        if (!update_option('markbridge_emoji_packs', $packs, false)) {
            rename($removed, $dir);
            throw new RuntimeException('Cannot update metadata.');
        }
        foreach (glob($removed . '/*') as $file) {
            unlink($file);
        }
        rmdir($removed);
    });
}
function mbb_emoji_config()
{
    $key = get_option('markbridge_emoji_active', '');
    $packs = get_option('markbridge_emoji_packs', []);
    if (!isset($packs[$key]) || !preg_match('/\A[a-z0-9.-]+\z/D', $key)) {
        return [];
    }
    try {
        [$root, $url] = mbb_emoji_root();
    } catch (RuntimeException $error) {
        return [];
    }
    $images = [];
    foreach ($packs[$key]['emoji'] as $code => $item) {
        if (
            !is_array($item) ||
            !is_string($item['file'] ?? null) ||
            !preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9_-]*\.(png|gif|webp)\z/D', $item['file']) ||
            !is_string($item['sha256'] ?? null)
        ) {
            continue;
        }
        $path = $root . '/' . $key . '/' . $item['file'];
        if (is_file($path) && !is_link($path) && hash_file('sha256', $path) === $item['sha256']) {
            $images[$code] = $url . '/' . rawurlencode($key) . '/' . rawurlencode($item['file']);
        }
    }
    return $images;
}
add_action('admin_menu', function () {
    add_options_page(
        'MarkBridge 图片表情',
        'MarkBridge 图片表情',
        'manage_options',
        'markbridge-emoji',
        'mbb_emoji_page',
    );
});
function mbb_emoji_page()
{
    if (!current_user_can('manage_options')) {
        wp_die('Forbidden', '', ['response' => 403]);
    }
    $message = '';
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        check_admin_referer('markbridge-emoji');
        try {
            $operation = sanitize_key($_POST['operation'] ?? '');
            $key = sanitize_text_field(wp_unslash($_POST['pack'] ?? ''));
            if ($operation === 'import') {
                $upload = $_FILES['pack_zip'] ?? [];
                if (
                    ($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK ||
                    !is_uploaded_file($upload['tmp_name'])
                ) {
                    throw new RuntimeException('Please upload a ZIP data pack.');
                }
                mbb_emoji_import($upload['tmp_name']);
            } elseif ($operation === 'select') {
                mbb_emoji_select($key);
            } elseif ($operation === 'delete') {
                mbb_emoji_delete($key);
            } else {
                throw new RuntimeException('Unknown operation.');
            }
            $message = '操作完成。';
        } catch (Throwable $error) {
            $message = $error->getMessage();
        }
    }
    echo '<div class="wrap"><h1>MarkBridge 图片表情</h1><p>默认使用 Unicode，不自动下载外部资源。当前没有预置下载源；可导入具有明确来源与许可的图片数据包。导入不授予资源使用许可。</p>';
    echo '<p>' . esc_html($message) . '</p><form method="post" enctype="multipart/form-data">';
    wp_nonce_field('markbridge-emoji');
    echo '<input type="hidden" name="operation" value="import"><input type="file" name="pack_zip" accept=".zip" required><button class="button">导入数据包</button></form><form method="post">';
    wp_nonce_field('markbridge-emoji');
    echo '<p><select name="pack"><option value="">Unicode</option>';
    foreach (get_option('markbridge_emoji_packs', []) as $key => $pack) {
        echo '<option value="' .
            esc_attr($key) .
            '" ' .
            selected(get_option('markbridge_emoji_active', ''), $key, false) .
            '>' .
            esc_html($pack['name'] . ' ' . $pack['version'] . ' — ' . $pack['license']) .
            '</option>';
    }
    echo '</select> <button class="button" name="operation" value="select">启用所选</button> <button class="button" name="operation" value="delete">删除未启用包</button></p></form></div>';
}
