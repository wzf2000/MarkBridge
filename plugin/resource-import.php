<?php
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
        mbb_resource_throw('resource_ownership', '私有资源路径不属于当前运行身份，未接管');
    }
}
function mbb_resource_permission($r)
{
    $allowed = mbb_permission($r);
    if (is_wp_error($allowed) || $allowed !== true) {
        return $allowed;
    }
    if (!current_user_can('upload_files')) {
        return mbb_error('resource_permission', '当前账号无权导入媒体。', 403);
    }
    if (
        !class_exists('ZipArchive') ||
        !class_exists('Normalizer') ||
        !function_exists('posix_geteuid')
    ) {
        return mbb_error(
            'resource_unavailable',
            '资源 ZIP 导入需要 PHP zip、intl 与 POSIX 安全暂存；普通 Markdown 编辑仍可用。',
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
            '文章已删除、在回收站或尚未建立受管身份；请先正常还原或新建文档。',
            409,
        );
    }
    if ($p && get_post_meta($p->ID, '_mbb_source_managed', true) === 'file') {
        return mbb_error(
            'resource_source',
            '文件来源文章不能导入 ZIP 新媒体；请通过原来源维护资源。',
            409,
        );
    }
    return true;
}
function mbb_resource_root(): string
{
    if (!function_exists('posix_geteuid')) {
        mbb_resource_throw('resource_unavailable', '安全暂存需要 POSIX 运行身份检查');
    }
    $uid = posix_geteuid();
    $path = rtrim(sys_get_temp_dir(), '/') . '/mbb-resources-' . mbb_resource_site() . '-' . $uid;
    if (is_link($path) || (!is_dir($path) && !mkdir($path, 0700, true))) {
        mbb_resource_throw('resource_storage', '无法准备私有暂存目录');
    }
    $root = realpath($path);
    mbb_resource_private_owner($path);
    foreach ([ABSPATH, $_SERVER['DOCUMENT_ROOT'] ?? ''] as $web) {
        $web = $web ? realpath($web) : false;
        if ($web && ($root === $web || str_starts_with($root, $web . '/'))) {
            mbb_resource_throw('resource_storage', '暂存目录必须位于 Web 根之外');
        }
    }
    if (!$root || !chmod($root, 0700)) {
        mbb_resource_throw('resource_storage', '无法限制暂存目录权限');
    }
    return $root;
}
function mbb_resource_owner_root(): string
{
    $path = mbb_resource_root() . '/' . hash('sha256', (string) get_current_user_id());
    if (is_link($path) || (!is_dir($path) && !mkdir($path, 0700))) {
        mbb_resource_throw('resource_storage', '无法准备当前用户暂存目录');
    }
    mbb_resource_private_owner($path);
    if (realpath($path) !== $path) {
        mbb_resource_throw('resource_ownership', '用户暂存目录发生路径跳转');
    }
    chmod($path, 0700);
    return $path;
}
function mbb_resource_path(string $name, bool $directory = false): string
{
    if (!mb_check_encoding($name, 'UTF-8') || str_contains($name, "\0")) {
        mbb_resource_throw('resource_path', 'ZIP 路径不是有效 Unicode');
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
        mbb_resource_throw('resource_path', 'ZIP 路径非法');
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
            mbb_resource_throw('resource_path', 'ZIP 路径包含空段、越界或别名');
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
        mbb_resource_throw('resource_mime', '图片扩展名、MIME 与实际图片数据不一致');
    }
    if ($size[0] < 1 || $size[1] < 1 || $size[0] > 32000000 / $size[1]) {
        mbb_resource_throw('resource_pixels', '单张图片最多 32 MP');
    }
    if (function_exists('wp_get_image_editor')) {
        $editor = wp_get_image_editor($file);
        if (is_wp_error($editor)) {
            mbb_resource_throw('resource_processing', 'WordPress 无法安全解码此图片；未创建媒体');
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
        mbb_resource_throw('resource_storage', '暂存清单过大');
    }
    $tmp = $dir . '/manifest-' . bin2hex(random_bytes(8));
    $f = @fopen($tmp, 'xb');
    if (!$f) {
        mbb_resource_throw('resource_storage', '无法写入暂存清单');
    }
    chmod($tmp, 0600);
    try {
        if (fwrite($f, $json) !== strlen($json) || !fflush($f)) {
            mbb_resource_throw('resource_storage', '暂存清单写入未完成');
        }
    } finally {
        fclose($f);
    }
    if (!rename($tmp, $dir . '/manifest.json')) {
        @unlink($tmp);
        mbb_resource_throw('resource_storage', '暂存清单提交未完成');
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
            mbb_resource_throw('resource_storage', '暂存目录出现未知对象，未清理');
        }
        mbb_resource_private_owner($file);
        if (!unlink($file)) {
            mbb_resource_throw('resource_storage', '暂存清理未完成');
        }
    }
    if (!rmdir($dir)) {
        mbb_resource_throw('resource_storage', '暂存目录清理未完成');
    }
}
function mbb_resource_extract(string $archive, string $dir): array
{
    if (!is_file($archive) || is_link($archive) || filesize($archive) > 8388608) {
        mbb_resource_throw('resource_size', 'ZIP 最多 8 MiB');
    }
    $zip = new ZipArchive();
    if ($zip->open($archive, ZipArchive::CHECKCONS) !== true) {
        mbb_resource_throw('resource_zip', 'ZIP 无效或损坏');
    }
    $seen = [];
    $images = [];
    $markdown = null;
    $expanded = 0;
    try {
        if ($zip->numFiles < 1 || $zip->numFiles > 100) {
            mbb_resource_throw('resource_entries', 'ZIP 最多 100 项');
        }
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $stat = $zip->statIndex($i);
            $directory = str_ends_with($stat['name'], '/');
            $name = mbb_resource_path($stat['name'], $directory);
            $identity = mb_strtolower($name, 'UTF-8');
            if (isset($seen[$identity])) {
                mbb_resource_throw('resource_duplicate', 'ZIP 路径重复或 Unicode 等价');
            }
            $seen[$identity] = true;
            $zip->getExternalAttributesIndex($i, $system, $attributes);
            $mode = ($attributes >> 16) & 0170000;
            if (
                !in_array($mode, [0, 0100000, 0040000], true) ||
                ($stat['encryption_method'] ?? 0) !== 0 ||
                !in_array($stat['comp_method'], [0, 8], true)
            ) {
                mbb_resource_throw('resource_entry', 'ZIP 不支持链接、特殊文件、加密或此压缩方式');
            }
            if ($directory) {
                if ($stat['size'] !== 0) {
                    mbb_resource_throw('resource_entry', '目录不能含数据');
                }
                continue;
            }
            $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
            $is_md = in_array($ext, ['md', 'markdown'], true);
            if (!$is_md && !in_array($ext, ['png', 'jpg', 'jpeg', 'gif', 'webp'], true)) {
                mbb_resource_throw(
                    'resource_type',
                    'ZIP 只接受一个 Markdown 文稿及 PNG/JPEG/GIF/WebP',
                );
            }
            if (($is_md && $markdown !== null) || (!$is_md && count($images) >= 32)) {
                mbb_resource_throw('resource_entries', 'ZIP 只能有一个文稿和最多 32 张图片');
            }
            $limit = $is_md ? 262144 : 8388608;
            if ($stat['size'] > $limit || $stat['size'] + $expanded > 33554432) {
                mbb_resource_throw('resource_size', 'ZIP 声明的展开大小超限');
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
                mbb_resource_throw('resource_zip', '无法读取 ZIP 项');
            }
            chmod($file, 0600);
            $bytes = 0;
            $crc = hash_init('crc32b');
            try {
                while (!feof($input)) {
                    $chunk = fread($input, 65536);
                    if ($chunk === false || ($chunk === '' && !feof($input))) {
                        mbb_resource_throw('resource_zip', 'ZIP 数据读取失败');
                    }
                    $bytes += strlen($chunk);
                    $expanded += strlen($chunk);
                    hash_update($crc, $chunk);
                    if ($bytes > $limit || $expanded > 33554432) {
                        mbb_resource_throw('resource_size', 'ZIP 实际流展开大小超限');
                    }
                    if ($chunk !== '' && fwrite($output, $chunk) !== strlen($chunk)) {
                        mbb_resource_throw('resource_storage', '资源暂存写入失败');
                    }
                }
            } finally {
                fclose($input);
                fclose($output);
            }
            if ($bytes !== $stat['size']) {
                mbb_resource_throw('resource_zip', 'ZIP 声明大小与真实流不一致');
            }
            if (hash_final($crc) !== substr(sprintf('%08x', $stat['crc']), -8)) {
                mbb_resource_throw('resource_zip', 'ZIP 项 CRC 校验失败');
            }
            $sha = hash_file('sha256', $file);
            if ($is_md) {
                $source = file_get_contents($file);
                if (!mb_check_encoding($source, 'UTF-8') || str_contains($source, "\0")) {
                    mbb_resource_throw('resource_markdown', 'Markdown 必须是有界 UTF-8 文本');
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
            mbb_resource_throw('resource_markdown', 'ZIP 必须包含一个 Markdown 文稿');
        }
        return ['markdown' => $markdown, 'images' => $images, 'expandedBytes' => $expanded];
    } finally {
        $zip->close();
    }
}
function mbb_resource_scope($r): array
{
    $id = absint($r['post_id']);
    $p = $id ? get_post($id) : null;
    $documentId = $p ? mbb_id($id) : $r['documentId'] ?? '';
    if (!is_string($documentId) || !preg_match('/^[A-Za-z][A-Za-z0-9_-]{2,63}$/D', $documentId)) {
        mbb_resource_throw('resource_identity', '资源导入需要有效文档 ID');
    }
    $expected = $p ? mbb_token($p) : null;
    if ($p && $r['expected'] !== $expected) {
        mbb_resource_throw('resource_conflict', '文章已变化，请重新预览后导入');
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
            : '资源导入未完成；原文未写入。',
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
        mbb_resource_throw('resource_corrupt', '资源清单不可用，请重新上传 ZIP');
    }
    mbb_resource_private_owner($file);
    $m = json_decode(file_get_contents($file), true);
    if (!is_array($m)) {
        mbb_resource_throw('resource_corrupt', '资源清单无效');
    }
    $mac = $m['mac'] ?? null;
    unset($m['mac']);
    if (
        !is_array($m) ||
        !is_string($mac) ||
        !hash_equals(hash_hmac('sha256', mbb_component_json($m), wp_salt('auth')), $mac)
    ) {
        mbb_resource_throw('resource_corrupt', '资源清单校验失败，请重新上传 ZIP');
    }
    return $m;
}
function mbb_resource_load(string $token, bool $exclusive = false): array
{
    if (!preg_match('/^[a-f0-9]{64}$/D', $token)) {
        mbb_resource_throw('resource_token', '资源标识无效');
    }
    $dir = mbb_resource_owner_root() . '/' . $token;
    if (is_link($dir) || !is_dir($dir)) {
        mbb_resource_throw('resource_gone', '资源已过期或取消，请重新上传 ZIP');
    }
    mbb_resource_private_owner($dir);
    if (realpath($dir) !== $dir) {
        mbb_resource_throw('resource_ownership', '资源目录越界');
    }
    $lockfile = $dir . '/lock';
    if (is_link($lockfile)) {
        mbb_resource_throw('resource_corrupt', '资源锁不可用');
    }
    if (file_exists($lockfile)) {
        mbb_resource_private_owner($lockfile);
    }
    $lock = fopen($lockfile, 'c');
    mbb_resource_private_owner($lockfile);
    chmod($lockfile, 0600);
    if (!$lock || !flock($lock, ($exclusive ? LOCK_EX : LOCK_SH) | LOCK_NB)) {
        mbb_resource_throw('resource_busy', '此资源正在保存或清理');
    }
    try {
        $manifest = mbb_resource_manifest($dir);
        if (
            $manifest['scope']['site'] !== mbb_resource_site() ||
            $manifest['scope']['user'] !== get_current_user_id() ||
            $manifest['token'] !== $token
        ) {
            mbb_resource_throw('resource_scope', '资源不属于当前身份');
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
        mbb_resource_throw('resource_corrupt', '暂存文件名无效');
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
        mbb_resource_throw('resource_corrupt', '资源内容已改变，请重新上传 ZIP');
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
            mbb_resource_throw('resource_busy', '另一个 ZIP 正在准备');
        }
        mbb_resource_cleanup_expired($owner);
        $active = array_filter(
            scandir($owner),
            static fn($name) => preg_match('/^[a-f0-9]{64}$/D', $name),
        );
        if (count($active) >= 4) {
            mbb_resource_throw('resource_quota', '最多保留四个资源候选，请取消旧候选或等待过期');
        }
        $files = $r->get_file_params();
        $upload = $files['archive'] ?? null;
        if (
            !is_array($upload) ||
            ($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK ||
            !is_string($upload['tmp_name'] ?? null) ||
            (!(defined('WP_CLI') && WP_CLI) && !is_uploaded_file($upload['tmp_name']))
        ) {
            mbb_resource_throw('resource_upload', '请选择本地 ZIP；请同时检查本站 PHP 上传限制');
        }
        $token = bin2hex(random_bytes(32));
        $dir = $owner . '/' . $token;
        if (!mkdir($dir, 0700)) {
            mbb_resource_throw('resource_storage', '无法建立资源暂存');
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
            mbb_resource_throw('resource_markdown', 'ZIP 文稿不能闭合转换；请先修正文稿');
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
        mbb_resource_throw('resource_reference', '本地图引用必须是 ZIP 内相对路径');
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
                mbb_resource_throw('resource_reference', '图片引用不能越过 ZIP 根目录');
            }
            array_pop($segments);
        } else {
            $segments[] = mbb_resource_path($segment);
        }
    }
    if (!$segments) {
        mbb_resource_throw('resource_reference', '图片引用必须指向 ZIP 内文件');
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
                mbb_resource_throw('resource_request', '待上传资源提示字段无效');
            }
            mbb_resource_path($requirements['basePath']);
            foreach ($requirements['paths'] as $path) {
                if (!is_string($path) || mbb_resource_path($path) !== $path) {
                    mbb_resource_throw('resource_request', '待上传图片路径无效');
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
                    '此候选仍引用待上传图片；请重新上传 ZIP 或移除这些图片，正文仍保留',
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
        mbb_resource_throw('resource_request', '资源导入信封字段无效');
    }
    $guard = mbb_resource_permission($r);
    if ($guard !== true) {
        mbb_resource_throw('resource_permission', '资源导入权限已失效');
    }
    if (!in_array($r['mode'] ?? 'markdown', ['markdown', 'upload'], true)) {
        mbb_resource_throw('resource_mode', '资源 ZIP 只能作为 Markdown 候选导入');
    }
    $ctx = mbb_resource_load($import['token']);
    try {
        $m = $ctx['manifest'];
        if ($m['state'] !== 'staged' || $m['expires'] < time()) {
            mbb_resource_throw('resource_gone', '资源已保存、过期或取消，请重新上传 ZIP');
        }
        if (mbb_resource_scope($r) !== $m['scope']) {
            mbb_resource_throw('resource_scope', '文章、来源身份或版本已变化，请重新上传 ZIP');
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
                mbb_resource_throw('resource_baseline', '已有文章配对无效，不能认定原有媒体链接');
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
                mbb_resource_throw('resource_missing', '本地图引用在 ZIP 中不存在：' . $path);
            }
            $image = $byPath[$path];
            $used[$image['key']] = $image;
            $mappings[] = ['from' => $url, 'to' => 'mbb-import/' . $image['key']];
        }
        if (count($mappings) > 256) {
            mbb_resource_throw(
                'resource_references',
                '最多支持 256 种本地图引用；真实图片仍最多 32 张',
            );
        }
        $projected = mbb_convert([
            'mode' => 'resource_images',
            'documentId' => $candidate['document']['documentId'],
            'base' => $candidate['document'],
            'mappings' => $mappings,
        ]);
        if (is_wp_error($projected)) {
            mbb_resource_throw('resource_rewrite', '图片变换不能闭合往返；候选未保存');
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
            '请确认原媒体 URL 可能公开的风险，并重新预览资源变换',
        );
    }
    $ctx = mbb_resource_load($c['resource_plan']['token'], true);
    try {
        $m = $ctx['manifest'];
        if ($m['state'] !== 'staged' || $m['expires'] < time()) {
            mbb_resource_throw('resource_gone', '资源候选不可重复保存');
        }
        if (
            mbb_resource_scope($r) !== $m['scope'] ||
            !hash_equals(
                $c['resource_plan']['manifestDigest'],
                hash('sha256', mbb_component_json([$m['scope'], $m['markdown'], $m['images']])),
            )
        ) {
            mbb_resource_throw('resource_scope', '资源在预览后已变化');
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
        mbb_resource_throw('resource_ownership', '新媒体目录的所有权校验失败');
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
            mbb_resource_throw('resource_ownership', '新媒体目录包含链接或越界对象');
        }
        mbb_resource_private_owner($file->getPathname());
        if ($file->isFile()) {
            $files[] = $file->getPathname();
        }
        if (count($files) > 4096) {
            mbb_resource_throw('resource_storage', '生成的媒体文件数超限');
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
        mbb_resource_throw('resource_media', '媒体库目录不可用');
    }
    $base = realpath($uploads['basedir']);
    $parent = $base . '/markbridge-imports';
    if (is_link($parent) || (!is_dir($parent) && !mkdir($parent, 0755))) {
        mbb_resource_throw('resource_media', '无法建立新媒体命名空间');
    }
    $dir = $parent . '/' . mbb_resource_public_key($ctx['manifest']['token']);
    if (file_exists($dir) || !mkdir($dir, 0755)) {
        mbb_resource_throw('resource_ownership', '新媒体目录已存在，不覆盖任何旧资源');
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
                mbb_resource_throw('resource_storage', '无法准备本次媒体副本');
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
                mbb_resource_throw('resource_media', 'WordPress 拒绝图片，或媒体写入位置不符');
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
                mbb_resource_throw('resource_media', 'WordPress 未创建图片附件');
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
                    'WordPress 图片处理不可用，未保留不完整的媒体',
                );
            }
            wp_update_attachment_metadata($attachment, $metadata);
            mbb_resource_journal($ctx);
            $url = wp_get_attachment_url($attachment);
            if (
                !is_string($url) ||
                !str_starts_with($url, $ctx['manifest']['journal']['url'] . '/')
            ) {
                mbb_resource_throw('resource_media', '最终媒体 URL 不属于本次导入');
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
            mbb_resource_throw('resource_rewrite', '最终媒体 URL 无法闭合往返');
        }
        if (!mbb_html_allowed(parse_blocks($doc['serialized']))) {
            mbb_resource_throw('resource_rewrite', '最终媒体 HTML 不符合保存允许列表');
        }
        $old = \MarkBridge\Probe\FrontMatter::parse($candidate['document']['source']);
        $new = \MarkBridge\Probe\FrontMatter::parse($doc['source']);
        if (($old['raw'] ?? null) !== ($new['raw'] ?? null)) {
            mbb_resource_throw('resource_metadata', '图片导入不能改写原始元数据头');
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
            mbb_resource_throw('resource_metadata', '图片变换后元数据授权不再一致');
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
            mbb_resource_throw('resource_ownership', '新附件所有权核验失败');
        }
        $result = wp_update_post(['ID' => $attachment, 'post_parent' => $id], true);
        if (is_wp_error($result) || (int) get_post($attachment)->post_parent !== $id) {
            mbb_resource_throw('resource_parent', '新图片与文章关联未完成');
        }
        update_post_meta($attachment, '_mbb_resource_committed', $ctx['manifest']['token']);
        if (
            get_post_meta($attachment, '_mbb_resource_committed', true) !==
            $ctx['manifest']['token']
        ) {
            mbb_resource_throw('resource_parent', '媒体提交标识未完成');
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
                '导入提交状态不确定；已保留媒体与私有记录，请核对文章后重试',
            );
        }
        if ($state === 'clear' && !mbb_resource_compensate($ctx, true)) {
            mbb_resource_throw('resource_cleanup', '中断媒体未能全部清理，请稍后重试');
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
                        mbb_resource_throw('resource_gone', '预览资源已失效，请重新上传 ZIP');
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
                    mbb_resource_throw('resource_gone', '此图片不属于资源候选');
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
