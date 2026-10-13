<?php
require_once __DIR__ . '/includes/i18n.php';
// ZIP staging is private. This module never saves article content independently.
require_once __DIR__ . '/includes/php-converter/ResourceImages.php';
use MarkBridge\Probe\ResourceImages;

function mbb_resource_config(): array
{
    return [
        'schema' => 1,
        'available' =>
            class_exists('ZipArchive') &&
            class_exists('Normalizer') &&
            function_exists('posix_geteuid') &&
            current_user_can('upload_files'),
        'maxArchiveBytes' => 8388608,
        'maxExpandedBytes' => 33554432,
        'maxEntries' => 100,
        'maxImages' => 32,
        'maxImageReferences' => 256,
        'maxImageBytes' => 8388608,
        'maxPixels' => 32000000,
        'previewBytes' => 8388608,
        'previewPixels' => 16000000,
        'ttlSeconds' => 900,
    ];
}
function mbb_resource_throw($code, $message): never
{
    throw new RuntimeException($code . ':' . $message);
}
function mbb_resource_site(): string
{
    return hash('sha256', home_url('/') . ':' . get_current_blog_id());
}
function mbb_resource_public_key(string $token): string
{
    return hash('sha256', 'mbb-resource-public-v1:' . $token);
}
function mbb_resource_private_owner(string $path): void
{
    clearstatcache(true, $path);
    if (
        !function_exists('posix_geteuid') ||
        is_link($path) ||
        @fileowner($path) !== posix_geteuid()
    ) {
        mbb_resource_throw(
            'resource_ownership',
            mbb_t(
                'The private resource path is not owned by the current process identity and was not taken over',
            ),
        );
    }
}
function mbb_resource_permission($r)
{
    $allowed = mbb_permission($r);
    if (is_wp_error($allowed) || $allowed !== true) {
        return $allowed;
    }
    if (!current_user_can('upload_files')) {
        return mbb_error(
            'resource_permission',
            mbb_t('The current account cannot import media.'),
            403,
        );
    }
    if (
        !class_exists('ZipArchive') ||
        !class_exists('Normalizer') ||
        !function_exists('posix_geteuid')
    ) {
        return mbb_error(
            'resource_unavailable',
            mbb_t(
                'Resource ZIP import requires PHP zip, intl, and POSIX-safe staging. Ordinary Markdown editing remains available.',
            ),
            503,
        );
    }
    $p = absint($r['post_id']) ? get_post(absint($r['post_id'])) : null;
    if (
        absint($r['post_id']) &&
        (!$p ||
            !in_array($p->post_type, ['post', 'page'], true) ||
            in_array($p->post_status, ['trash', 'auto-draft'], true))
    ) {
        return mbb_error(
            'resource_inactive',
            mbb_t(
                'The article is deleted, trashed, or not yet managed. Restore it normally or create a new document first.',
            ),
            409,
        );
    }
    if ($p && get_post_meta($p->ID, '_mbb_source_managed', true) === 'file') {
        return mbb_error(
            'resource_source',
            mbb_t(
                'Source-managed articles cannot import new ZIP media. Maintain resources through the original source.',
            ),
            409,
        );
    }
    return true;
}
function mbb_resource_root(): string
{
    if (!function_exists('posix_geteuid')) {
        mbb_resource_throw(
            'resource_unavailable',
            mbb_t('Safe staging requires POSIX process identity checks'),
        );
    }
    $uid = posix_geteuid();
    $path = rtrim(sys_get_temp_dir(), '/') . '/mbb-resources-' . mbb_resource_site() . '-' . $uid;
    if (is_link($path) || (!is_dir($path) && !mkdir($path, 0700, true))) {
        mbb_resource_throw(
            'resource_storage',
            mbb_t('The private staging directory could not be prepared'),
        );
    }
    $root = realpath($path);
    mbb_resource_private_owner($path);
    foreach ([ABSPATH, $_SERVER['DOCUMENT_ROOT'] ?? ''] as $web) {
        $web = $web ? realpath($web) : false;
        if ($web && ($root === $web || str_starts_with($root, $web . '/'))) {
            mbb_resource_throw(
                'resource_storage',
                mbb_t('The staging directory must be outside the web root'),
            );
        }
    }
    if (!$root || !chmod($root, 0700)) {
        mbb_resource_throw(
            'resource_storage',
            mbb_t('Staging directory permissions could not be restricted'),
        );
    }
    return $root;
}
function mbb_resource_owner_root(): string
{
    $path = mbb_resource_root() . '/' . hash('sha256', (string) get_current_user_id());
    if (is_link($path) || (!is_dir($path) && !mkdir($path, 0700))) {
        mbb_resource_throw(
            'resource_storage',
            mbb_t('The current user\'s staging directory could not be prepared'),
        );
    }
    mbb_resource_private_owner($path);
    if (realpath($path) !== $path) {
        mbb_resource_throw(
            'resource_ownership',
            mbb_t('The user staging directory changed its resolved path'),
        );
    }
    chmod($path, 0700);
    return $path;
}
function mbb_resource_path(string $name, bool $directory = false): string
{
    if (!mb_check_encoding($name, 'UTF-8') || str_contains($name, "\0")) {
        mbb_resource_throw('resource_path', mbb_t('The ZIP path is not valid Unicode'));
    }
    // Actual ZIP admission requires intl. Existing ordinary text can still shed a
    // pending-resource hint when that optional dependency is temporarily unavailable.
    $normal = class_exists('Normalizer') ? Normalizer::normalize($name, Normalizer::FORM_C) : $name;
    if (
        $normal === false ||
        strlen($normal) > 1024 ||
        preg_match('/[\x00-\x1f\x7f\\\\:]/u', $normal) ||
        preg_match('/%(?:2f|5c|00|2e)/i', $normal) ||
        str_starts_with($normal, '/')
    ) {
        mbb_resource_throw('resource_path', mbb_t('The ZIP path is invalid'));
    }
    if ($directory) {
        $normal = rtrim($normal, '/');
    }
    foreach (explode('/', $normal) as $segment) {
        if (
            $segment === '' ||
            $segment === '.' ||
            $segment === '..' ||
            trim($segment) !== $segment ||
            str_ends_with($segment, '.') ||
            mb_strlen($segment) > 200
        ) {
            mbb_resource_throw(
                'resource_path',
                mbb_t('The ZIP path contains empty segments, traversal, or aliases'),
            );
        }
    }
    return $normal;
}
function mbb_resource_image(string $file, string $name): array
{
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    $types = [
        'png' => 'image/png',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'gif' => 'image/gif',
        'webp' => 'image/webp',
    ];
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file);
    $size = @getimagesize($file);
    if (
        !isset($types[$ext]) ||
        $mime !== $types[$ext] ||
        !$size ||
        ($size['mime'] ?? '') !== $mime
    ) {
        mbb_resource_throw(
            'resource_mime',
            mbb_t('The image extension, MIME type, and actual image data do not agree'),
        );
    }
    if ($size[0] < 1 || $size[1] < 1 || $size[0] > 32000000 / $size[1]) {
        mbb_resource_throw('resource_pixels', mbb_t('Each image is limited to 32 MP'));
    }
    if (function_exists('wp_get_image_editor')) {
        $editor = wp_get_image_editor($file);
        if (is_wp_error($editor)) {
            mbb_resource_throw(
                'resource_processing',
                mbb_t('WordPress cannot safely decode this image. No media was created'),
            );
        }
        unset($editor);
    }
    return ['mime' => $mime, 'width' => $size[0], 'height' => $size[1]];
}
function mbb_resource_write_json(string $dir, array $manifest): void
{
    unset($manifest['mac']);
    mbb_resource_private_owner($dir);
    if (file_exists($dir . '/manifest.json') || is_link($dir . '/manifest.json')) {
        mbb_resource_private_owner($dir . '/manifest.json');
    }
    $manifest['mac'] = hash_hmac('sha256', mbb_component_json($manifest), wp_salt('auth'));
    $json = mbb_component_json($manifest);
    if (!is_string($json) || strlen($json) > 1048576) {
        mbb_resource_throw('resource_storage', mbb_t('The staging manifest is too large'));
    }
    $tmp = $dir . '/manifest-' . bin2hex(random_bytes(8));
    $f = @fopen($tmp, 'xb');
    if (!$f) {
        mbb_resource_throw('resource_storage', mbb_t('The staging manifest could not be written'));
    }
    chmod($tmp, 0600);
    try {
        if (fwrite($f, $json) !== strlen($json) || !fflush($f)) {
            mbb_resource_throw(
                'resource_storage',
                mbb_t('The staging manifest write did not complete'),
            );
        }
    } finally {
        fclose($f);
    }
    if (!rename($tmp, $dir . '/manifest.json')) {
        @unlink($tmp);
        mbb_resource_throw(
            'resource_storage',
            mbb_t('The staging manifest commit did not complete'),
        );
    }
}
function mbb_resource_remove_private(string $dir): void
{
    if (is_link($dir) || !is_dir($dir)) {
        return;
    }
    mbb_resource_private_owner($dir);
    foreach (scandir($dir) as $name) {
        if ($name === '.' || $name === '..') {
            continue;
        }
        $file = $dir . '/' . $name;
        if (is_link($file) || !is_file($file)) {
            mbb_resource_throw(
                'resource_storage',
                mbb_t('The staging directory contains unknown objects and was not cleaned'),
            );
        }
        mbb_resource_private_owner($file);
        if (!unlink($file)) {
            mbb_resource_throw('resource_storage', mbb_t('Staging cleanup did not complete'));
        }
    }
    if (!rmdir($dir)) {
        mbb_resource_throw('resource_storage', mbb_t('Staging directory cleanup did not complete'));
    }
}
function mbb_resource_extract(string $archive, string $dir): array
{
    if (!is_file($archive) || is_link($archive) || filesize($archive) > 8388608) {
        mbb_resource_throw('resource_size', mbb_t('ZIP files are limited to 8 MiB'));
    }
    $zip = new ZipArchive();
    if ($zip->open($archive, ZipArchive::CHECKCONS) !== true) {
        mbb_resource_throw('resource_zip', mbb_t('The ZIP is invalid or damaged'));
    }
    $seen = [];
    $images = [];
    $markdown = null;
    $sidecar = null;
    $expanded = 0;
    try {
        if ($zip->numFiles < 1 || $zip->numFiles > 100) {
            mbb_resource_throw('resource_entries', mbb_t('ZIP files are limited to 100 entries'));
        }
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $stat = $zip->statIndex($i);
            $directory = str_ends_with($stat['name'], '/');
            $name = mbb_resource_path($stat['name'], $directory);
            $identity = mb_strtolower($name, 'UTF-8');
            if (isset($seen[$identity])) {
                mbb_resource_throw(
                    'resource_duplicate',
                    mbb_t('The ZIP contains duplicate or Unicode-equivalent paths'),
                );
            }
            $seen[$identity] = true;
            $zip->getExternalAttributesIndex($i, $system, $attributes);
            $mode = ($attributes >> 16) & 0170000;
            if (
                !in_array($mode, [0, 0100000, 0040000], true) ||
                ($stat['encryption_method'] ?? 0) !== 0 ||
                !in_array($stat['comp_method'], [0, 8], true)
            ) {
                mbb_resource_throw(
                    'resource_entry',
                    mbb_t(
                        'The ZIP contains links, special files, encryption, or an unsupported compression method',
                    ),
                );
            }
            if ($directory) {
                if ($stat['size'] !== 0) {
                    mbb_resource_throw(
                        'resource_entry',
                        mbb_t('Directories must not contain data'),
                    );
                }
                continue;
            }
            $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
            $is_md = in_array($ext, ['md', 'markdown'], true);
            $is_sidecar = $name === 'markbridge-export.json';
            if (
                !$is_md &&
                !$is_sidecar &&
                !in_array($ext, ['png', 'jpg', 'jpeg', 'gif', 'webp'], true)
            ) {
                mbb_resource_throw(
                    'resource_type',
                    mbb_t(
                        'A ZIP may contain only one Markdown document and PNG/JPEG/GIF/WebP images',
                    ),
                );
            }
            if (
                ($is_md && $markdown !== null) ||
                ($is_sidecar && $sidecar !== null) ||
                (!$is_md && !$is_sidecar && count($images) >= 32)
            ) {
                mbb_resource_throw(
                    'resource_entries',
                    mbb_t('A ZIP may contain only one document and at most 32 images'),
                );
            }
            $limit = $is_md || $is_sidecar ? 262144 : 8388608;
            if ($stat['size'] > $limit || $stat['size'] + $expanded > 33554432) {
                mbb_resource_throw(
                    'resource_size',
                    mbb_t('The declared uncompressed ZIP size exceeds its budget'),
                );
            }
            $slot = bin2hex(random_bytes(16));
            $file = $dir . '/' . $slot . '.blob';
            $input = $zip->getStream($stat['name']);
            $output = fopen($file, 'xb');
            if (!$input || !$output) {
                if (is_resource($input)) {
                    fclose($input);
                }
                if (is_resource($output)) {
                    fclose($output);
                }
                mbb_resource_throw('resource_zip', mbb_t('The ZIP entry could not be read'));
            }
            chmod($file, 0600);
            $bytes = 0;
            $crc = hash_init('crc32b');
            try {
                while (!feof($input)) {
                    $chunk = fread($input, 65536);
                    if ($chunk === false || ($chunk === '' && !feof($input))) {
                        mbb_resource_throw('resource_zip', mbb_t('Reading ZIP data failed'));
                    }
                    $bytes += strlen($chunk);
                    $expanded += strlen($chunk);
                    hash_update($crc, $chunk);
                    if ($bytes > $limit || $expanded > 33554432) {
                        mbb_resource_throw(
                            'resource_size',
                            mbb_t('The actual streamed ZIP expansion exceeds its budget'),
                        );
                    }
                    if ($chunk !== '' && fwrite($output, $chunk) !== strlen($chunk)) {
                        mbb_resource_throw(
                            'resource_storage',
                            mbb_t('Resource staging write failed'),
                        );
                    }
                }
            } finally {
                fclose($input);
                fclose($output);
            }
            if ($bytes !== $stat['size']) {
                mbb_resource_throw(
                    'resource_zip',
                    mbb_t('The declared ZIP size differs from its actual stream'),
                );
            }
            if (hash_final($crc) !== substr(sprintf('%08x', $stat['crc']), -8)) {
                mbb_resource_throw('resource_zip', mbb_t('ZIP entry CRC verification failed'));
            }
            $sha = hash_file('sha256', $file);
            if ($is_sidecar) {
                $sidecar = file_get_contents($file);
                unlink($file);
            } elseif ($is_md) {
                $source = file_get_contents($file);
                if (!mb_check_encoding($source, 'UTF-8') || str_contains($source, "\0")) {
                    mbb_resource_throw(
                        'resource_markdown',
                        mbb_t('Markdown must be bounded UTF-8 text'),
                    );
                }
                $markdown = [
                    'path' => $name,
                    'file' => $slot . '.blob',
                    'sha256' => $sha,
                    'bytes' => $bytes,
                    'source' => $source,
                ];
            } else {
                $images[] = array_merge(
                    [
                        'key' => hash('sha256', $name . "\0" . $sha),
                        'path' => $name,
                        'file' => $slot . '.blob',
                        'sha256' => $sha,
                        'bytes' => $bytes,
                    ],
                    mbb_resource_image($file, $name),
                );
            }
        }
        if ($markdown === null) {
            mbb_resource_throw(
                'resource_markdown',
                mbb_t('The ZIP must contain one Markdown document'),
            );
        }
        if ($sidecar !== null) {
            mbb_resource_export_sidecar($sidecar, $markdown, $images);
        }
        return ['markdown' => $markdown, 'images' => $images, 'expandedBytes' => $expanded];
    } finally {
        $zip->close();
    }
}
function mbb_resource_export_sidecar(string $raw, array $markdown, array $images): void
{
    try {
        $typed = json_decode($raw, false, 32, JSON_THROW_ON_ERROR);
        if (
            !($typed instanceof stdClass) ||
            !(($typed->document ?? null) instanceof stdClass) ||
            !(($typed->metadata ?? null) instanceof stdClass) ||
            !is_array($typed->resources ?? null) ||
            !is_array($typed->metadata->categories ?? null) ||
            !is_array($typed->metadata->tags ?? null)
        ) {
            throw new RuntimeException();
        }
        foreach ($typed->resources as $entry) {
            if (!($entry instanceof stdClass)) {
                throw new RuntimeException();
            }
        }
        $value = \MarkBridge\Probe\Teaching::json($raw);
        $keys = static function (array $value, array $expected): bool {
            $actual = array_keys($value);
            sort($actual);
            sort($expected);
            return $actual === $expected;
        };
        if (
            !$keys($value, ['schema', 'kind', 'document', 'resources', 'metadata']) ||
            $value['schema'] !== 1 ||
            $value['kind'] !== 'markbridge-portable' ||
            !is_array($value['document']) ||
            !is_array($value['resources']) ||
            !array_is_list($value['resources']) ||
            !is_array($value['metadata'])
        ) {
            throw new RuntimeException();
        }
        $doc = $value['document'];
        if (
            !$keys($doc, ['path', 'representation', 'originalSourceSha256', 'bytes', 'sha256']) ||
            $doc['path'] !== $markdown['path'] ||
            $doc['representation'] !== 'portable' ||
            !is_string($doc['originalSourceSha256']) ||
            !preg_match('/^[a-f0-9]{64}$/D', $doc['originalSourceSha256']) ||
            $doc['bytes'] !== $markdown['bytes'] ||
            $doc['sha256'] !== $markdown['sha256'] ||
            count($value['resources']) !== count($images)
        ) {
            throw new RuntimeException();
        }
        $seen = [];
        foreach ($value['resources'] as $resource) {
            if (
                !is_array($resource) ||
                !$keys($resource, ['path', 'mime', 'bytes', 'sha256', 'width', 'height']) ||
                !is_string($resource['path']) ||
                !preg_match('~^images/[a-f0-9]{64}\.(?:png|jpg|gif|webp)$~D', $resource['path']) ||
                isset($seen[$resource['path']])
            ) {
                throw new RuntimeException();
            }
            $seen[$resource['path']] = true;
            $found = false;
            foreach ($images as $image) {
                if ($image['path'] === $resource['path']) {
                    foreach (['mime', 'bytes', 'sha256', 'width', 'height'] as $field) {
                        if ($resource[$field] !== $image[$field]) {
                            throw new RuntimeException();
                        }
                    }
                    $found = true;
                }
            }
            if (!$found) {
                throw new RuntimeException();
            }
        }
        $metadata = $value['metadata'];
        if (!$keys($metadata, ['title', 'excerpt', 'slug', 'categories', 'tags'])) {
            throw new RuntimeException();
        }
        foreach (['title' => 2000, 'excerpt' => 8192, 'slug' => 2000] as $field => $max) {
            if (
                !is_string($metadata[$field]) ||
                !mb_check_encoding($metadata[$field], 'UTF-8') ||
                str_contains($metadata[$field], "\0") ||
                strlen($metadata[$field]) > $max
            ) {
                throw new RuntimeException();
            }
        }
        foreach (['categories', 'tags'] as $field) {
            if (
                !is_array($metadata[$field]) ||
                !array_is_list($metadata[$field]) ||
                count($metadata[$field]) > 100
            ) {
                throw new RuntimeException();
            }
            foreach ($metadata[$field] as $slug) {
                if (
                    !is_string($slug) ||
                    !mb_check_encoding($slug, 'UTF-8') ||
                    str_contains($slug, "\0") ||
                    strlen($slug) > 2000
                ) {
                    throw new RuntimeException();
                }
            }
        }
        // Metadata is descriptive only. Never return or apply it as a write proposal.
    } catch (Throwable $error) {
        mbb_resource_throw(
            'resource_sidecar',
            mbb_t(
                'The export sidecar fields or body/image digests do not match. Import was rejected',
            ),
        );
    }
}

function mbb_resource_scope($r): array
{
    $id = absint($r['post_id']);
    $p = $id ? get_post($id) : null;
    $documentId = $p ? mbb_id($id) : $r['documentId'] ?? '';
    if (!is_string($documentId) || !preg_match('/^[A-Za-z][A-Za-z0-9_-]{2,63}$/D', $documentId)) {
        mbb_resource_throw(
            'resource_identity',
            mbb_t('Resource import requires a valid document ID'),
        );
    }
    $expected = $p ? mbb_token($p) : null;
    if ($p && $r['expected'] !== $expected) {
        mbb_resource_throw(
            'resource_conflict',
            mbb_t('The article changed. Preview again before importing'),
        );
    }
    return [
        'site' => mbb_resource_site(),
        'user' => get_current_user_id(),
        'post' => $id,
        'documentId' => $documentId,
        'expected' => $expected,
    ];
}
function mbb_resource_error(Throwable $e)
{
    $parts = explode(':', $e->getMessage(), 2);
    $code = preg_match('/^resource_[a-z_]+$/D', $parts[0]) ? $parts[0] : 'resource_failed';
    return mbb_error(
        $code,
        count($parts) === 2 && $code !== 'resource_failed'
            ? $parts[1]
            : mbb_t('Resource import did not complete. The source was not written.'),
        $code === 'resource_permission'
            ? 403
            : (in_array(
                $code,
                [
                    'resource_conflict',
                    'resource_receipt',
                    'resource_gone',
                    'resource_busy',
                    'resource_scope',
                ],
                true,
            )
                ? 409
                : 422),
    );
}
function mbb_resource_manifest(string $dir): array
{
    $file = $dir . '/manifest.json';
    mbb_resource_private_owner($dir);
    if (is_link($file) || !is_file($file) || filesize($file) > 1048576) {
        mbb_resource_throw(
            'resource_corrupt',
            mbb_t('The resource manifest is unavailable. Upload the ZIP again'),
        );
    }
    mbb_resource_private_owner($file);
    $m = json_decode(file_get_contents($file), true);
    if (!is_array($m)) {
        mbb_resource_throw('resource_corrupt', mbb_t('The resource manifest is invalid'));
    }
    $mac = $m['mac'] ?? null;
    unset($m['mac']);
    if (
        !is_array($m) ||
        !is_string($mac) ||
        !hash_equals(hash_hmac('sha256', mbb_component_json($m), wp_salt('auth')), $mac)
    ) {
        mbb_resource_throw(
            'resource_corrupt',
            mbb_t('Resource manifest verification failed. Upload the ZIP again'),
        );
    }
    return $m;
}
function mbb_resource_load(string $token, bool $exclusive = false): array
{
    if (!preg_match('/^[a-f0-9]{64}$/D', $token)) {
        mbb_resource_throw('resource_token', mbb_t('The resource identifier is invalid'));
    }
    $dir = mbb_resource_owner_root() . '/' . $token;
    if (is_link($dir) || !is_dir($dir)) {
        mbb_resource_throw(
            'resource_gone',
            mbb_t('The resource expired or was canceled. Upload the ZIP again'),
        );
    }
    mbb_resource_private_owner($dir);
    if (realpath($dir) !== $dir) {
        mbb_resource_throw(
            'resource_ownership',
            mbb_t('The resource directory escapes its boundary'),
        );
    }
    $lockfile = $dir . '/lock';
    if (is_link($lockfile)) {
        mbb_resource_throw('resource_corrupt', mbb_t('The resource lock is unavailable'));
    }
    if (file_exists($lockfile)) {
        mbb_resource_private_owner($lockfile);
    }
    $lock = fopen($lockfile, 'c');
    mbb_resource_private_owner($lockfile);
    chmod($lockfile, 0600);
    if (!$lock || !flock($lock, ($exclusive ? LOCK_EX : LOCK_SH) | LOCK_NB)) {
        mbb_resource_throw('resource_busy', mbb_t('This resource is being saved or cleaned'));
    }
    try {
        $manifest = mbb_resource_manifest($dir);
        if (
            $manifest['scope']['site'] !== mbb_resource_site() ||
            $manifest['scope']['user'] !== get_current_user_id() ||
            $manifest['token'] !== $token
        ) {
            mbb_resource_throw(
                'resource_scope',
                mbb_t('The resource does not belong to the current identity'),
            );
        }
        return ['dir' => $dir, 'lock' => $lock, 'manifest' => $manifest];
    } catch (Throwable $e) {
        fclose($lock);
        throw $e;
    }
}
function mbb_resource_release(array $context): void
{
    if (is_resource($context['lock'] ?? null)) {
        flock($context['lock'], LOCK_UN);
        fclose($context['lock']);
    }
}
function mbb_resource_file(array $ctx, array $item): string
{
    if (!preg_match('/^[a-f0-9]{32}\.blob$/D', $item['file'] ?? '')) {
        mbb_resource_throw('resource_corrupt', mbb_t('The staging file name is invalid'));
    }
    $file = $ctx['dir'] . '/' . $item['file'];
    mbb_resource_private_owner($file);
    if (
        is_link($file) ||
        !is_file($file) ||
        filesize($file) !== $item['bytes'] ||
        filesize($file) > 8388608 ||
        !hash_equals($item['sha256'], hash_file('sha256', $file))
    ) {
        mbb_resource_throw(
            'resource_corrupt',
            mbb_t('Resource content changed. Upload the ZIP again'),
        );
    }
    return $file;
}
function mbb_resource_public_images(array $images): array
{
    return array_map(static function ($image) {
        unset($image['file']);
        return $image;
    }, $images);
}
function mbb_resource_prepare($r)
{
    $guard = mbb_resource_permission($r);
    if ($guard !== true) {
        return $guard;
    }
    $dir = null;
    $ownerlock = null;
    try {
        $scope = mbb_resource_scope($r);
        $owner = mbb_resource_owner_root();
        if (file_exists($owner . '/prepare.lock')) {
            mbb_resource_private_owner($owner . '/prepare.lock');
        }
        $ownerlock = fopen($owner . '/prepare.lock', 'c');
        mbb_resource_private_owner($owner . '/prepare.lock');
        chmod($owner . '/prepare.lock', 0600);
        if (!$ownerlock || !flock($ownerlock, LOCK_EX | LOCK_NB)) {
            mbb_resource_throw('resource_busy', mbb_t('Another ZIP is being prepared'));
        }
        mbb_resource_cleanup_expired($owner);
        $active = array_filter(
            scandir($owner),
            static fn($name) => preg_match('/^[a-f0-9]{64}$/D', $name),
        );
        if (count($active) >= 4) {
            mbb_resource_throw(
                'resource_quota',
                mbb_t(
                    'At most four resource candidates may be kept. Cancel older candidates or wait for expiration',
                ),
            );
        }
        $files = $r->get_file_params();
        $upload = $files['archive'] ?? null;
        if (
            !is_array($upload) ||
            ($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK ||
            !is_string($upload['tmp_name'] ?? null) ||
            (!(defined('WP_CLI') && WP_CLI) && !is_uploaded_file($upload['tmp_name']))
        ) {
            mbb_resource_throw(
                'resource_upload',
                mbb_t('Choose a local ZIP. Also check this site\'s PHP upload limits'),
            );
        }
        $token = bin2hex(random_bytes(32));
        $dir = $owner . '/' . $token;
        if (!mkdir($dir, 0700)) {
            mbb_resource_throw('resource_storage', mbb_t('Resource staging could not be created'));
        }
        $pack = mbb_resource_extract($upload['tmp_name'], $dir);
        $source = $pack['markdown']['source'];
        unset($pack['markdown']['source']);
        $document = mbb_convert([
            'mode' => 'markdown',
            'source' => $source,
            'documentId' => $scope['documentId'],
        ]);
        if (is_wp_error($document)) {
            mbb_resource_throw(
                'resource_markdown',
                mbb_t('The ZIP document failed closed conversion. Correct the document first'),
            );
        }
        $m = array_merge(
            [
                'schema' => 1,
                'token' => $token,
                'scope' => $scope,
                'created' => time(),
                'expires' => time() + 900,
                'state' => 'staged',
                'journal' => ['ids' => [], 'files' => []],
            ],
            $pack,
        );
        mbb_resource_write_json($dir, $m);
        return [
            'schema' => 1,
            'token' => $token,
            'expiresAt' => $m['expires'],
            'source' => $source,
            'requirements' => [
                'schema' => 1,
                'basePath' => $pack['markdown']['path'],
                'paths' => array_column($pack['images'], 'path'),
            ],
            'images' => mbb_resource_public_images($pack['images']),
            'warnings' => ['publicMedia' => true],
            'limits' => mbb_resource_config(),
        ];
    } catch (Throwable $e) {
        if ($dir) {
            try {
                mbb_resource_remove_private($dir);
            } catch (Throwable $cleanup) {
            }
        }
        return mbb_resource_error($e);
    } finally {
        if (is_resource($ownerlock)) {
            fclose($ownerlock);
        }
    }
}
function mbb_resource_relative(string $url, string $markdown): string
{
    if (
        preg_match('~^(?:[a-z][a-z0-9+.-]*:|/|#)~i', $url) ||
        str_contains($url, '?') ||
        str_contains($url, '#') ||
        preg_match('/%(?:2f|5c|00)/i', $url)
    ) {
        mbb_resource_throw(
            'resource_reference',
            mbb_t('Local image references must be relative paths within the ZIP'),
        );
    }
    $path = rawurldecode($url);
    $base = dirname(mbb_resource_path($markdown));
    $segments = $base === '.' ? [] : explode('/', $base);
    foreach (explode('/', $path) as $segment) {
        if ($segment === '.') {
            continue;
        }
        if ($segment === '..') {
            if (!$segments) {
                mbb_resource_throw(
                    'resource_reference',
                    mbb_t('An image reference must not traverse above the ZIP root'),
                );
            }
            array_pop($segments);
        } else {
            $segments[] = mbb_resource_path($segment);
        }
    }
    if (!$segments) {
        mbb_resource_throw(
            'resource_reference',
            mbb_t('Image references must point to files within the ZIP'),
        );
    }
    return mbb_resource_path(implode('/', $segments));
}
function mbb_resource_plan($r, array $candidate): array
{
    $import = $r['resource_import'] ?? null;
    if (!$r->has_param('resource_import')) {
        $requirements = $r['requires_resources'] ?? null;
        if ($r->has_param('requires_resources')) {
            if (
                !is_array($requirements) ||
                count($requirements) !== 3 ||
                ($requirements['schema'] ?? null) !== 1 ||
                !is_string($requirements['basePath'] ?? null) ||
                !is_array($requirements['paths'] ?? null) ||
                !array_is_list($requirements['paths']) ||
                count($requirements['paths']) > 32
            ) {
                mbb_resource_throw(
                    'resource_request',
                    mbb_t('Pending resource hint fields are invalid'),
                );
            }
            mbb_resource_path($requirements['basePath']);
            foreach ($requirements['paths'] as $path) {
                if (!is_string($path) || mbb_resource_path($path) !== $path) {
                    mbb_resource_throw(
                        'resource_request',
                        mbb_t('A pending image path is invalid'),
                    );
                }
            }
        }
        foreach (ResourceImages::urls($candidate['document']['serialized']) as $url) {
            $pending = false;
            if ($requirements && !preg_match('~^(?:[a-z][a-z0-9+.-]*:|/|#)~i', $url)) {
                try {
                    $pending = in_array(
                        mbb_resource_relative($url, $requirements['basePath']),
                        $requirements['paths'],
                        true,
                    );
                } catch (Throwable $error) {
                }
            }
            if (str_starts_with($url, 'mbb-import/') || $pending) {
                mbb_resource_throw(
                    'resource_required',
                    mbb_t(
                        'This candidate still references pending images. Upload the ZIP again or remove those images. Body content is preserved',
                    ),
                );
            }
        }
        return $candidate;
    }
    if (
        !is_array($import) ||
        count($import) !== 3 ||
        ($import['schema'] ?? null) !== 1 ||
        !is_string($import['token'] ?? null) ||
        !is_bool($import['ack_public_media'] ?? null)
    ) {
        mbb_resource_throw(
            'resource_request',
            mbb_t('Resource import envelope fields are invalid'),
        );
    }
    $guard = mbb_resource_permission($r);
    if ($guard !== true) {
        mbb_resource_throw('resource_permission', mbb_t('Resource import permission was lost'));
    }
    if (!in_array($r['mode'] ?? 'markdown', ['markdown', 'upload'], true)) {
        mbb_resource_throw(
            'resource_mode',
            mbb_t('A resource ZIP can only be imported as a Markdown candidate'),
        );
    }
    $ctx = mbb_resource_load($import['token']);
    try {
        $m = $ctx['manifest'];
        if ($m['state'] !== 'staged' || $m['expires'] < time()) {
            mbb_resource_throw(
                'resource_gone',
                mbb_t('The resource was saved, expired, or canceled. Upload the ZIP again'),
            );
        }
        if (mbb_resource_scope($r) !== $m['scope']) {
            mbb_resource_throw(
                'resource_scope',
                mbb_t('The article, source identity, or version changed. Upload the ZIP again'),
            );
        }
        mbb_resource_file($ctx, $m['markdown']);
        $byPath = [];
        foreach ($m['images'] as $image) {
            mbb_resource_file($ctx, $image);
            $byPath[$image['path']] = $image;
        }
        $mappings = [];
        $used = [];
        $existing = [];
        if ($candidate['post_id']) {
            $post = get_post($candidate['post_id']);
            $verified = mbb_convert([
                'mode' => 'paired_restore',
                'source' => $post->post_content_filtered,
                'serialized' => $post->post_content,
                'documentId' => $m['scope']['documentId'],
            ]);
            if (is_wp_error($verified)) {
                mbb_resource_throw(
                    'resource_baseline',
                    mbb_t(
                        'The existing article pair is invalid and cannot establish existing media links',
                    ),
                );
            }
            $existing = ResourceImages::urls($verified['serialized']);
        }
        foreach (ResourceImages::urls($candidate['document']['serialized']) as $url) {
            if (preg_match('~^https?://~i', $url) || str_starts_with($url, '/')) {
                continue;
            } // Existing URLs are preserved; never fetched or imported by the server.
            try {
                $path = mbb_resource_relative($url, $m['markdown']['path']);
            } catch (Throwable $error) {
                if (in_array($url, $existing, true)) {
                    continue;
                }
                throw $error;
            }
            if (!isset($byPath[$path])) {
                if (in_array($url, $existing, true)) {
                    continue;
                }
                mbb_resource_throw(
                    'resource_missing',
                    mbb_t('A local image reference is not present in the ZIP: ') . $path,
                );
            }
            $image = $byPath[$path];
            $used[$image['key']] = $image;
            $mappings[] = ['from' => $url, 'to' => 'mbb-import/' . $image['key']];
        }
        if (count($mappings) > 256) {
            mbb_resource_throw(
                'resource_references',
                mbb_t(
                    'At most 256 distinct local image references are supported; actual images remain limited to 32',
                ),
            );
        }
        $projected = mbb_convert([
            'mode' => 'resource_images',
            'documentId' => $candidate['document']['documentId'],
            'base' => $candidate['document'],
            'mappings' => $mappings,
        ]);
        if (is_wp_error($projected)) {
            mbb_resource_throw(
                'resource_rewrite',
                mbb_t(
                    'Image transformation failed closed round-trip validation. The candidate was not saved',
                ),
            );
        }
        $candidate['resource_plan'] = [
            'schema' => 1,
            'token' => $m['token'],
            'expiresAt' => $m['expires'],
            'manifestDigest' => hash(
                'sha256',
                mbb_component_json([$m['scope'], $m['markdown'], $m['images']]),
            ),
            'projectedDocument' => $projected,
            'mappings' => $mappings,
            'images' => mbb_resource_public_images(array_values($used)),
            'ackPublicMedia' => $import['ack_public_media'],
        ];
        return $candidate;
    } finally {
        mbb_resource_release($ctx);
    }
}
function mbb_resource_receipt_payload($r, array $c): array
{
    return [
        'version' => 1,
        'site' => mbb_resource_site(),
        'user' => get_current_user_id(),
        'post' => $c['post_id'],
        'expected' => $c['expected'],
        'documentId' => $c['document']['documentId'],
        'candidate' => hash(
            'sha256',
            mbb_component_json([
                $c['document'],
                $c['title'],
                $c['post_status'],
                $c['featured_media'],
                $r['mode'] ?? 'markdown',
            ]),
        ),
        'plan' => hash('sha256', mbb_component_json($c['resource_plan'])),
        'selected' => $c['frontmatter']['selected'],
        'resolved' => $c['frontmatter_applied'],
        'frontmatterReceipt' => hash('sha256', (string) ($r['frontmatter_receipt'] ?? '')),
    ];
}
function mbb_resource_receipt($r, array $c): ?string
{
    if (!isset($c['resource_plan']) || !$c['resource_plan']['ackPublicMedia']) {
        return null;
    }
    return mbb_frontmatter_receipt(mbb_resource_receipt_payload($r, $c));
}
function mbb_resource_verify($r, array $c): ?array
{
    if (!isset($c['resource_plan'])) {
        return null;
    }
    if (
        !$c['resource_plan']['ackPublicMedia'] ||
        !is_string($r['resource_receipt']) ||
        !hash_equals(mbb_resource_receipt($r, $c), $r['resource_receipt'])
    ) {
        mbb_resource_throw(
            'resource_receipt',
            mbb_t(
                'Confirm that original media URLs may be public, and preview the resource transformation again',
            ),
        );
    }
    $ctx = mbb_resource_load($c['resource_plan']['token'], true);
    try {
        $m = $ctx['manifest'];
        if ($m['state'] !== 'staged' || $m['expires'] < time()) {
            mbb_resource_throw(
                'resource_gone',
                mbb_t('A resource candidate cannot be saved twice'),
            );
        }
        if (
            mbb_resource_scope($r) !== $m['scope'] ||
            !hash_equals(
                $c['resource_plan']['manifestDigest'],
                hash('sha256', mbb_component_json([$m['scope'], $m['markdown'], $m['images']])),
            )
        ) {
            mbb_resource_throw('resource_scope', mbb_t('Resources changed after preview'));
        }
        mbb_resource_file($ctx, $m['markdown']);
        foreach ($m['images'] as $image) {
            mbb_resource_file($ctx, $image);
        }
    } catch (Throwable $error) {
        mbb_resource_release($ctx);
        throw $error;
    }
    return $ctx;
}
function mbb_resource_owned_files(array $ctx): array
{
    $dir = $ctx['manifest']['journal']['directory'] ?? null;
    if (!$dir) {
        return [];
    }
    $base = realpath(wp_upload_dir()['basedir']);
    $expected = $base . '/markbridge-imports/' . mbb_resource_public_key($ctx['manifest']['token']);
    if (
        !$base ||
        $dir !== $expected ||
        is_link($dir) ||
        !is_dir($dir) ||
        realpath($dir) !== $expected
    ) {
        mbb_resource_throw(
            'resource_ownership',
            mbb_t('New media directory ownership verification failed'),
        );
    }
    mbb_resource_private_owner($dir);
    $files = [];
    foreach (
        new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::SELF_FIRST,
        )
        as $file
    ) {
        if ($file->isLink() || !str_starts_with($file->getRealPath() ?: '', $expected . '/')) {
            mbb_resource_throw(
                'resource_ownership',
                mbb_t('The new media directory contains links or objects outside its boundary'),
            );
        }
        mbb_resource_private_owner($file->getPathname());
        if ($file->isFile()) {
            $files[] = $file->getPathname();
        }
        if (count($files) > 4096) {
            mbb_resource_throw('resource_storage', mbb_t('Too many media files were generated'));
        }
    }
    return $files;
}
function mbb_resource_journal(array &$ctx): void
{
    $ctx['manifest']['journal']['files'] = mbb_resource_owned_files($ctx);
    mbb_resource_write_json($ctx['dir'], $ctx['manifest']);
}
function mbb_resource_media(array &$ctx, $r, array $candidate): array
{
    require_once ABSPATH . 'wp-admin/includes/file.php';
    require_once ABSPATH . 'wp-admin/includes/media.php';
    require_once ABSPATH . 'wp-admin/includes/image.php';
    $uploads = wp_upload_dir();
    if ($uploads['error'] || !realpath($uploads['basedir'])) {
        mbb_resource_throw('resource_media', mbb_t('The media library directory is unavailable'));
    }
    $base = realpath($uploads['basedir']);
    $parent = $base . '/markbridge-imports';
    if (is_link($parent) || (!is_dir($parent) && !mkdir($parent, 0755))) {
        mbb_resource_throw('resource_media', mbb_t('A new media namespace could not be created'));
    }
    $dir = $parent . '/' . mbb_resource_public_key($ctx['manifest']['token']);
    if (file_exists($dir) || !mkdir($dir, 0755)) {
        mbb_resource_throw(
            'resource_ownership',
            mbb_t('The new media directory already exists. No existing resources were overwritten'),
        );
    }
    $ctx['manifest']['state'] = 'saving';
    $ctx['manifest']['journal']['directory'] = $dir;
    $ctx['manifest']['journal']['url'] =
        rtrim($uploads['baseurl'], '/') .
        '/markbridge-imports/' .
        mbb_resource_public_key($ctx['manifest']['token']);
    mbb_resource_journal($ctx); // Directory ownership precedes every original/scaled/subsize write.
    $destination = static function ($u) use (&$ctx) {
        $u['path'] = $ctx['manifest']['journal']['directory'];
        $u['url'] = $ctx['manifest']['journal']['url'];
        $u['subdir'] = '/markbridge-imports/' . mbb_resource_public_key($ctx['manifest']['token']);
        $u['error'] = false;
        return $u;
    };
    $capture = static function ($id) use (&$ctx) {
        $p = get_post($id);
        if ($p && str_starts_with($p->guid, $ctx['manifest']['journal']['url'] . '/')) {
            $ctx['manifest']['journal']['ids'][] = (int) $id;
            mbb_resource_journal($ctx);
        }
    };
    add_filter('upload_dir', $destination, PHP_INT_MAX);
    add_action('add_attachment', $capture, -PHP_INT_MAX);
    $final = [];
    try {
        $images = array_column($ctx['manifest']['images'], null, 'key');
        foreach ($candidate['resource_plan']['images'] as $image) {
            $original = $images[$image['key']];
            $file = mbb_resource_file($ctx, $original);
            $copy = $ctx['dir'] . '/' . bin2hex(random_bytes(16)) . '.blob';
            if (!copy($file, $copy) || !chmod($copy, 0600)) {
                mbb_resource_throw(
                    'resource_storage',
                    mbb_t('Media copies for this import could not be prepared'),
                );
            }
            $sideload = [
                'name' =>
                    'mbb-' .
                    substr($image['key'], 0, 24) .
                    '.' .
                    strtolower(pathinfo($image['path'], PATHINFO_EXTENSION)),
                'tmp_name' => $copy,
                'type' => $image['mime'],
                'size' => $image['bytes'],
                'error' => UPLOAD_ERR_OK,
            ];
            $upload = wp_handle_sideload($sideload, [
                'test_form' => false,
                'mimes' => [
                    'jpg|jpeg' => 'image/jpeg',
                    'png' => 'image/png',
                    'gif' => 'image/gif',
                    'webp' => 'image/webp',
                ],
            ]);
            mbb_resource_journal($ctx);
            if (
                !is_array($upload) ||
                isset($upload['error']) ||
                ($upload['type'] ?? null) !== $image['mime'] ||
                !is_string($upload['file'] ?? null) ||
                !str_starts_with(realpath($upload['file']) ?: '', $dir . '/')
            ) {
                mbb_resource_throw(
                    'resource_media',
                    mbb_t(
                        'WordPress rejected the image or wrote it outside the expected media location',
                    ),
                );
            }
            $attachment = wp_insert_attachment(
                [
                    'post_title' => sanitize_text_field(
                        pathinfo($image['path'], PATHINFO_FILENAME),
                    ),
                    'post_mime_type' => $image['mime'],
                    'post_status' => 'inherit',
                    'post_author' => $ctx['manifest']['scope']['user'],
                    'guid' => $upload['url'],
                ],
                $upload['file'],
                0,
                true,
            );
            if (is_wp_error($attachment)) {
                mbb_resource_throw(
                    'resource_media',
                    mbb_t('WordPress did not create an image attachment'),
                );
            }
            if (!in_array($attachment, $ctx['manifest']['journal']['ids'], true)) {
                $ctx['manifest']['journal']['ids'][] = $attachment;
                mbb_resource_journal($ctx);
            }
            update_post_meta($attachment, '_mbb_resource_import', $ctx['manifest']['token']);
            $metadata = wp_generate_attachment_metadata($attachment, $upload['file']);
            mbb_resource_journal($ctx);
            if (
                !is_array($metadata) ||
                empty($metadata['width']) ||
                empty($metadata['height']) ||
                empty($metadata['file'])
            ) {
                mbb_resource_throw(
                    'resource_processing',
                    mbb_t(
                        'WordPress image processing is unavailable. Incomplete media was not kept',
                    ),
                );
            }
            wp_update_attachment_metadata($attachment, $metadata);
            mbb_resource_journal($ctx);
            $url = wp_get_attachment_url($attachment);
            if (
                !is_string($url) ||
                !str_starts_with($url, $ctx['manifest']['journal']['url'] . '/')
            ) {
                mbb_resource_throw(
                    'resource_media',
                    mbb_t('The final media URL does not belong to this import'),
                );
            }
            $final[] = ['from' => 'mbb-import/' . $image['key'], 'to' => $url];
        }
        $doc = mbb_convert([
            'mode' => 'resource_images',
            'documentId' => $candidate['document']['documentId'],
            'base' => $candidate['resource_plan']['projectedDocument'],
            'mappings' => $final,
        ]);
        if (is_wp_error($doc)) {
            mbb_resource_throw(
                'resource_rewrite',
                mbb_t('The final media URL cannot round-trip exactly'),
            );
        }
        if (!mbb_html_allowed(parse_blocks($doc['serialized']))) {
            mbb_resource_throw(
                'resource_rewrite',
                mbb_t('Final media HTML does not satisfy the save allowlist'),
            );
        }
        $old = \MarkBridge\Probe\FrontMatter::parse($candidate['document']['source']);
        $new = \MarkBridge\Probe\FrontMatter::parse($doc['source']);
        if (($old['raw'] ?? null) !== ($new['raw'] ?? null)) {
            mbb_resource_throw(
                'resource_metadata',
                mbb_t('Image import must not change the original metadata header'),
            );
        }
        $again = mbb_frontmatter_candidate(
            $r,
            $candidate['post_id'] ? get_post($candidate['post_id']) : null,
            [
                'document' => $doc,
                'title' => $candidate['title'],
                'post_id' => $candidate['post_id'],
                'expected' => $candidate['expected'],
            ],
        );
        if (
            is_wp_error($again) ||
            $again['frontmatter']['selected'] !== $candidate['frontmatter']['selected'] ||
            mbb_component_json($again['frontmatter_applied']) !==
                mbb_component_json($candidate['frontmatter_applied']) ||
            $again['title'] !== $candidate['title'] ||
            $again['post_status'] !== $candidate['post_status'] ||
            $again['featured_media'] !== $candidate['featured_media']
        ) {
            mbb_resource_throw(
                'resource_metadata',
                mbb_t('Metadata authorization differs after image transformation'),
            );
        }
        $candidate['document'] = $doc;
        $ctx['manifest']['journal']['pairDigest'] = hash(
            'sha256',
            $doc['serialized'] . "\0" . $doc['source'],
        );
        mbb_resource_journal($ctx);
        return $candidate;
    } finally {
        remove_filter('upload_dir', $destination, PHP_INT_MAX);
        remove_action('add_attachment', $capture, -PHP_INT_MAX);
        // wp_upload_dir caches filtered paths; do not leave this import's directory as the next upload target.
        wp_upload_dir(null, false, true);
    }
}
function mbb_resource_link(array &$ctx, int $id): void
{
    $ctx['manifest']['journal']['postId'] = $id;
    mbb_resource_journal($ctx);
    foreach ($ctx['manifest']['journal']['ids'] as $attachment) {
        $p = get_post($attachment);
        if (
            !$p ||
            (int) $p->post_author !== $ctx['manifest']['scope']['user'] ||
            get_post_meta($attachment, '_mbb_resource_import', true) !== $ctx['manifest']['token']
        ) {
            mbb_resource_throw(
                'resource_ownership',
                mbb_t('New attachment ownership verification failed'),
            );
        }
        $result = wp_update_post(['ID' => $attachment, 'post_parent' => $id], true);
        if (is_wp_error($result) || (int) get_post($attachment)->post_parent !== $id) {
            mbb_resource_throw(
                'resource_parent',
                mbb_t('New images were not fully associated with the article'),
            );
        }
        update_post_meta($attachment, '_mbb_resource_committed', $ctx['manifest']['token']);
        if (
            get_post_meta($attachment, '_mbb_resource_committed', true) !==
            $ctx['manifest']['token']
        ) {
            mbb_resource_throw('resource_parent', mbb_t('Media commit markers did not complete'));
        }
    }
}
function mbb_resource_database_state(array $ctx): string
{
    global $wpdb;
    try {
        $journal = $ctx['manifest']['journal'];
        $postId = (int) ($journal['postId'] ?? $ctx['manifest']['scope']['post']);
        $post = $postId
            ? $wpdb->get_row(
                $wpdb->prepare(
                    "SELECT post_content, post_content_filtered FROM {$wpdb->posts} WHERE ID = %d",
                    $postId,
                ),
                ARRAY_A,
            )
            : null;
        if ($wpdb->last_error) {
            return 'uncertain';
        }
        $referenced = false;
        if ($post && !empty($journal['url'])) {
            foreach (ResourceImages::urls($post['post_content']) as $url) {
                if (str_starts_with($url, $journal['url'] . '/')) {
                    $referenced = true;
                }
            }
        }
        $surviving = false;
        $complete =
            $post &&
            !empty($journal['pairDigest']) &&
            hash_equals(
                $journal['pairDigest'],
                hash('sha256', $post['post_content'] . "\0" . $post['post_content_filtered']),
            );
        foreach ($journal['ids'] as $id) {
            $row = $wpdb->get_row(
                $wpdb->prepare(
                    "SELECT post_parent, post_author, post_type FROM {$wpdb->posts} WHERE ID = %d",
                    $id,
                ),
                ARRAY_A,
            );
            if ($wpdb->last_error) {
                return 'uncertain';
            }
            if (!$row) {
                $complete = false;
                continue;
            }
            $surviving = true;
            $meta = $wpdb->get_results(
                $wpdb->prepare(
                    "SELECT meta_key, meta_value FROM {$wpdb->postmeta} WHERE post_id = %d AND meta_key IN ('_mbb_resource_import', '_mbb_resource_committed')",
                    $id,
                ),
                ARRAY_A,
            );
            if ($wpdb->last_error || !is_array($meta)) {
                return 'uncertain';
            }
            $values = array_column($meta, 'meta_value', 'meta_key');
            if (
                $row['post_type'] !== 'attachment' ||
                (int) $row['post_parent'] !== $postId ||
                (int) $row['post_author'] !== $ctx['manifest']['scope']['user'] ||
                ($values['_mbb_resource_import'] ?? null) !== $ctx['manifest']['token'] ||
                ($values['_mbb_resource_committed'] ?? null) !== $ctx['manifest']['token']
            ) {
                $complete = false;
            }
        }
        if ($complete && ($journal['ids'] ? $referenced : true)) {
            return 'committed';
        }
        return $surviving || $referenced ? 'uncertain' : 'clear';
    } catch (Throwable $error) {
        return 'uncertain';
    }
}
function mbb_resource_needs_review(array &$ctx): void
{
    $ctx['manifest']['state'] = 'needs-review';
    try {
        mbb_resource_write_json($ctx['dir'], $ctx['manifest']);
    } catch (Throwable $error) {
    }
}
function mbb_resource_compensate(array &$ctx, bool $rollback): bool
{
    if (!$rollback || mbb_resource_database_state($ctx) !== 'clear') {
        mbb_resource_needs_review($ctx);
        return false;
    }
    try {
        // The namespace was journaled before generation, so even interrupted subsize writes are owned.
        foreach (mbb_resource_owned_files($ctx) as $file) {
            if (!unlink($file)) {
                return false;
            }
        }
        $dir = $ctx['manifest']['journal']['directory'] ?? null;
        if ($dir) {
            foreach (
                new RecursiveIteratorIterator(
                    new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
                    RecursiveIteratorIterator::CHILD_FIRST,
                )
                as $entry
            ) {
                if ($entry->isDir() && !rmdir($entry->getPathname())) {
                    return false;
                }
            }
            if (!rmdir($dir)) {
                return false;
            }
        }
        foreach ($ctx['manifest']['journal']['ids'] as $id) {
            wp_cache_delete($id, 'posts');
            wp_cache_delete($id, 'post_meta');
        }
        wp_cache_set_posts_last_changed();
        $ctx['manifest']['state'] = 'staged';
        $ctx['manifest']['journal'] = ['ids' => [], 'files' => []];
        mbb_resource_write_json($ctx['dir'], $ctx['manifest']);
        return true;
    } catch (Throwable $e) {
        return false;
    }
}
function mbb_resource_complete(array &$ctx): void
{
    // Called only after COMMIT. Auxiliary storage failure must not compensate successful media.
    try {
        $ctx['manifest']['state'] = 'committed';
        mbb_resource_write_json($ctx['dir'], $ctx['manifest']);
        mbb_resource_remove_private($ctx['dir']);
    } catch (Throwable $e) {
    }
}
function mbb_resource_discard(array &$ctx): void
{
    if (in_array($ctx['manifest']['state'], ['saving', 'needs-review'], true)) {
        $state = mbb_resource_database_state($ctx);
        if ($state === 'uncertain') {
            mbb_resource_needs_review($ctx);
            mbb_resource_throw(
                'resource_uncertain',
                mbb_t(
                    'The import commit state is uncertain. Media and private records are preserved. Verify the article before trying again',
                ),
            );
        }
        if ($state === 'clear' && !mbb_resource_compensate($ctx, true)) {
            mbb_resource_throw(
                'resource_cleanup',
                mbb_t('Some interrupted media could not be cleaned. Try later'),
            );
        }
        // Only a complete pair + owned attachment associations prove commit. Partial rows keep the journal.
    }
    mbb_resource_remove_private($ctx['dir']);
}
function mbb_resource_cleanup_expired(string $owner): void
{
    $visited = 0;
    foreach (scandir($owner) as $name) {
        if (!preg_match('/^[a-f0-9]{64}$/D', $name) || ++$visited > 16) {
            continue;
        }
        try {
            $ctx = mbb_resource_load($name, true);
            try {
                if ($ctx['manifest']['expires'] < time()) {
                    mbb_resource_discard($ctx);
                }
            } finally {
                mbb_resource_release($ctx);
            }
        } catch (Throwable $e) {
            // A process may stop during extraction, before any manifest or public-media journal exists.
            $dir = $owner . '/' . $name;
            try {
                mbb_resource_private_owner($dir);
                if (
                    realpath($dir) === $dir &&
                    !file_exists($dir . '/manifest.json') &&
                    !is_link($dir . '/manifest.json') &&
                    filemtime($dir) < time() - 900
                ) {
                    $names = array_diff(scandir($dir), ['.', '..']);
                    if (
                        !array_filter(
                            $names,
                            static fn($file) => !preg_match(
                                '/^(?:[a-f0-9]{32}\.blob|manifest-[a-f0-9]{16}|lock)$/D',
                                $file,
                            ),
                        )
                    ) {
                        mbb_resource_remove_private($dir);
                    }
                }
            } catch (Throwable $orphan_error) {
            }
        } // Busy or damaged jobs cannot affect unrelated storage.
    }
}
add_action('rest_api_init', function () {
    register_rest_route('mbb/v1', '/resource-import/prepare', [
        'methods' => 'POST',
        'permission_callback' => 'mbb_resource_permission',
        'callback' => 'mbb_resource_prepare',
    ]);
    register_rest_route('mbb/v1', '/resource-import/(?P<token>[a-f0-9]{64})', [
        'methods' => 'DELETE',
        'permission_callback' => static fn() => is_user_logged_in(),
        'callback' => static function ($r) {
            try {
                $ctx = mbb_resource_load($r['token'], true);
                try {
                    mbb_resource_discard($ctx);
                    return ['cancelled' => true];
                } finally {
                    mbb_resource_release($ctx);
                }
            } catch (Throwable $e) {
                return mbb_resource_error($e);
            }
        },
    ]);
    register_rest_route(
        'mbb/v1',
        '/resource-import/(?P<token>[a-f0-9]{64})/image/(?P<key>[a-f0-9]{64})',
        [
            'methods' => 'GET',
            'permission_callback' => 'mbb_resource_permission',
            'callback' => static function ($r) {
                $ctx = null;
                try {
                    $ctx = mbb_resource_load($r['token']);
                    if (
                        $ctx['manifest']['expires'] < time() ||
                        $ctx['manifest']['state'] !== 'staged' ||
                        mbb_resource_scope($r) !== $ctx['manifest']['scope']
                    ) {
                        mbb_resource_throw(
                            'resource_gone',
                            mbb_t('Preview resources expired. Upload the ZIP again'),
                        );
                    }
                    foreach ($ctx['manifest']['images'] as $image) {
                        if ($image['key'] === $r['key']) {
                            $file = mbb_resource_file($ctx, $image);
                            $GLOBALS['mbb_resource_stream'] = [
                                'context' => $ctx,
                                'file' => $file,
                                'mime' => $image['mime'],
                            ];
                            return new WP_REST_Response(['resourceStream' => $image['key']]);
                        }
                    }
                    mbb_resource_throw(
                        'resource_gone',
                        mbb_t('This image does not belong to the resource candidate'),
                    );
                } catch (Throwable $e) {
                    if ($ctx) {
                        mbb_resource_release($ctx);
                    }
                    return mbb_resource_error($e);
                }
            },
        ],
    );
});
add_filter(
    'rest_pre_serve_request',
    static function ($served, $result, $request, $server) {
        $stream = $GLOBALS['mbb_resource_stream'] ?? null;
        if (
            !$stream ||
            !preg_match(
                '~/mbb/v1/resource-import/[a-f0-9]{64}/image/[a-f0-9]{64}$~D',
                $request->get_route(),
            )
        ) {
            return $served;
        }
        unset($GLOBALS['mbb_resource_stream']);
        try {
            $server->send_header('Content-Type', $stream['mime']);
            $server->send_header('Cache-Control', 'private, no-store');
            $server->send_header('X-Content-Type-Options', 'nosniff');
            $file = fopen($stream['file'], 'rb');
            $sent = 0;
            if (!$file) {
                return true;
            }
            try {
                while (!feof($file)) {
                    $chunk = fread($file, 65536);
                    if ($chunk === false || ($chunk === '' && !feof($file))) {
                        break;
                    }
                    $sent += strlen($chunk);
                    if ($sent > 8388608) {
                        break;
                    }
                    echo $chunk;
                }
            } finally {
                fclose($file);
            }
            return true;
        } finally {
            mbb_resource_release($stream['context']);
        }
    },
    10,
    4,
);
