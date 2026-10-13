<?php
// Signed, read-only merge baselines. This module never saves articles or source files.
function mbb_binding_projection($p): string
{
    return hash_hmac(
        'sha256',
        "mbb-binding-v1\0" .
            wp_json_encode(
                [
                    'site' => hash('sha256', home_url('/') . ':' . get_current_blog_id()),
                    'post' => (int) $p->ID,
                    'type' => $p->post_type,
                    'documentId' => mbb_id($p->ID),
                    'origin' => get_post_meta($p->ID, '_mbb_origin', true),
                    'managed' => get_post_meta($p->ID, '_mbb_source_managed', true),
                    'llmDocument' => get_post_meta($p->ID, '_llm_document_id', true),
                    'binding' => get_post_meta($p->ID, '_mbb_source_path_hash', true),
                    'adapters' => function_exists('mbb_block_adapter_digest')
                        ? mbb_block_adapter_digest()
                        : hash('sha256', '[]'),
                ],
                JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES,
            ),
        wp_salt('auth'),
    );
}
function mbb_merge_throw(string $code, string $message): never
{
    throw new RuntimeException($code . ':' . $message);
}
function mbb_merge_error(Throwable $error)
{
    $parts = explode(':', $error->getMessage(), 2);
    $code = str_starts_with($parts[0], 'merge_') ? $parts[0] : 'merge_failed';
    return mbb_error(
        $code,
        $code === 'merge_failed'
            ? '合并准备未完成，原候选与已保存内容未修改。'
            : $parts[1] ?? '合并准备失败',
        in_array($code, ['merge_forbidden', 'merge_identity'], true) ? 403 : 409,
    );
}
function mbb_merge_keys($data, array $keys): void
{
    if (!is_array($data)) {
        mbb_merge_throw('merge_shape', '合并数据不是闭合对象');
    }
    $actual = array_keys($data);
    sort($actual);
    sort($keys);
    if ($actual !== $keys) {
        mbb_merge_throw('merge_shape', '合并数据字段未知或缺失');
    }
}
function mbb_merge_permission($r)
{
    $id = $r['post_id'] ?? null;
    $allowed = mbb_export_permission(['post_id' => $id]);
    if ($allowed !== true) {
        return $allowed;
    }
    if (get_post_meta($id, '_mbb_source_managed', true) === 'file') {
        if (is_array($r)) {
            $request = new WP_REST_Request('POST', '/mbb/v1/merge');
            $request->set_param('post_id', $id);
            $r = $request;
        }
        return mbb_source_write_permission($r);
    }
    return true;
}
function mbb_merge_candidate($value): array
{
    mbb_merge_keys($value, ['source', 'title', 'post_status', 'featured_media']);
    if (
        !is_string($value['source']) ||
        strlen($value['source']) > 262144 ||
        !mb_check_encoding($value['source'], 'UTF-8') ||
        str_contains($value['source'], "\0") ||
        !is_string($value['title']) ||
        mb_strlen($value['title'], 'UTF-8') > 200 ||
        !mb_check_encoding($value['title'], 'UTF-8') ||
        preg_match('/[\r\n\0]/', $value['title']) ||
        !in_array($value['post_status'], ['draft', 'pending', 'publish', 'private'], true) ||
        !is_int($value['featured_media']) ||
        $value['featured_media'] < 0 ||
        $value['featured_media'] > 9007199254740991
    ) {
        mbb_merge_throw('merge_candidate', '候选正文或元数据超限/类型非法');
    }
    mbb_merge_source_budget($value['source']);
    return [
        'source' => $value['source'],
        'title' => $value['title'],
        'post_status' => $value['post_status'],
        'featured_media' => $value['featured_media'],
    ];
}
function mbb_merge_source_budget(string $source): void
{
    preg_match_all('/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/', $source, $lines);
    if (strlen($source) > 262144 || count($lines[0]) > 32768) {
        mbb_merge_throw(
            'merge_budget',
            '三方合并每份原文最多 256 KiB / 32,768 行，原候选可下载后手动比较',
        );
    }
}
function mbb_merge_pair($document): array
{
    mbb_merge_keys($document, [
        'schema',
        'converter',
        'origin',
        'documentId',
        'source',
        'serialized',
    ]);
    if (
        $document['schema'] !== 1 ||
        $document['origin'] !== 'markdown_import' ||
        !in_array($document['converter'], ['0.1.2', '0.2.0'], true) ||
        !is_string($document['documentId']) ||
        !is_string($document['source']) ||
        !is_string($document['serialized']) ||
        strlen($document['source']) > 262144 ||
        strlen($document['serialized']) > 262144
    ) {
        mbb_merge_throw('merge_pair', '合并基线文档形状或容量不合法');
    }
    mbb_merge_source_budget($document['source']);
    $verified = mbb_convert([
        'mode' => 'paired_restore',
        'source' => $document['source'],
        'serialized' => $document['serialized'],
        'documentId' => $document['documentId'],
    ]);
    if (is_wp_error($verified)) {
        mbb_merge_throw('merge_pair', '合并基线无法通过完整配对核验');
    }
    return $verified;
}
function mbb_merge_current(int $id, ?string $expected = null): array
{
    clean_post_cache($id);
    $permission = mbb_merge_permission(['post_id' => $id]);
    if ($permission !== true) {
        mbb_merge_throw('merge_forbidden', '当前账号无权准备此文章或源文件的合并');
    }
    $p = clone get_post($id);
    $metadata = [
        'title' => $p->post_title,
        'post_status' => $p->post_status,
        'featured_media' => (int) get_post_thumbnail_id($id),
    ];
    $token = mbb_token($p);
    if (
        $expected !== null &&
        (!preg_match('/^[a-f0-9]{64}$/D', $expected) || !hash_equals($token, $expected))
    ) {
        mbb_merge_throw('merge_conflict', '文章已变化，不能把当前版本倒充打开时基线');
    }
    $document = mbb_merge_pair(mbb_document($p));
    $managed = get_post_meta($id, '_mbb_source_managed', true) === 'file';
    $sha = null;
    if ($managed) {
        $target = mbb_source_target($p);
        if (is_wp_error($target)) {
            mbb_merge_throw('merge_source', '绑定源不可用，请保留候选并手动协调');
        }
        $contents = mbb_merge_read_source($target);
        mbb_merge_source_budget($contents);
        if ($contents !== $document['source']) {
            mbb_merge_throw(
                'merge_source_diverged',
                '实际源文件与已保存配对不同，自动三方合并不可用；请先正常协调来源',
            );
        }
        $sha = hash('sha256', $contents);
    }
    $snapshot =
        [
            'schema' => 1,
            'document' => $document,
            'expected' => $token,
            'source_managed' => $managed,
            'source_sha256' => $sha,
        ] + $metadata;
    mbb_merge_assert_current($snapshot, $id);
    return $snapshot;
}
// Optimistic read validation: no fields read after conversion may be paired with an older token.
function mbb_merge_assert_current(array $snapshot, int $id): void
{
    clean_post_cache($id);
    if (mbb_merge_permission(['post_id' => $id]) !== true) {
        mbb_merge_throw('merge_forbidden', '合并读取期间权限已变化');
    }
    $p = get_post($id);
    $metadata = [
        'title' => $p->post_title,
        'post_status' => $p->post_status,
        'featured_media' => (int) get_post_thumbnail_id($id),
    ];
    if (
        mbb_token($p) !== $snapshot['expected'] ||
        mbb_document($p) !== $snapshot['document'] ||
        (get_post_meta($id, '_mbb_source_managed', true) === 'file') !== $snapshot['source_managed']
    ) {
        mbb_merge_throw('merge_conflict', '文章身份或配对在读取期间变化，请重新协调');
    }
    foreach ($metadata as $key => $value) {
        if ($snapshot[$key] !== $value) {
            mbb_merge_throw('merge_conflict', '文章元数据在读取期间变化，请重新协调');
        }
    }
    if ($snapshot['source_managed']) {
        $target = mbb_source_target($p);
        if (
            is_wp_error($target) ||
            hash('sha256', mbb_merge_read_source($target)) !== $snapshot['source_sha256']
        ) {
            mbb_merge_throw('merge_conflict', '绑定源在读取期间变化，请重新协调');
        }
    }
}
function mbb_merge_same_snapshot(array $a, array $b): bool
{
    foreach (
        [
            'document',
            'title',
            'post_status',
            'featured_media',
            'expected',
            'source_managed',
            'source_sha256',
        ]
        as $key
    ) {
        if ($a[$key] !== $b[$key]) {
            return false;
        }
    }
    return true;
}
function mbb_merge_read_source(string $path): string
{
    clearstatcache(true, $path);
    if (is_link($path) || !is_file($path) || filesize($path) > 262144) {
        mbb_merge_throw('merge_source_diverged', '绑定源不是有界普通文件，请先正常协调来源');
    }
    $file = fopen($path, 'rb');
    if (!$file) {
        mbb_merge_throw('merge_source', '无法读取绑定源文件');
    }
    try {
        $stat = fstat($file);
        if (!$stat || ($stat['mode'] & 0170000) !== 0100000 || $stat['size'] > 262144) {
            mbb_merge_throw('merge_source_diverged', '绑定源超出安全读取预算');
        }
        $bytes = stream_get_contents($file, 262145);
        if (!is_string($bytes) || strlen($bytes) > 262144 || strlen($bytes) !== $stat['size']) {
            mbb_merge_throw('merge_source_diverged', '源文件读取期间变化或超过预算');
        }
        return $bytes;
    } finally {
        fclose($file);
    }
}
function mbb_merge_claims(
    array $snapshot,
    int $id,
    string $kind,
    ?array $opening = null,
    ?array $candidate = null,
): array {
    mbb_merge_assert_current($snapshot, $id);
    $p = get_post($id);
    $claims = [
        'schema' => 1,
        'kind' => $kind,
        'actor' => get_current_user_id(),
        'site' => mbb_resource_site(),
        'post' => $id,
        'type' => $p->post_type,
        'documentId' => $snapshot['document']['documentId'],
        'binding' => mbb_binding_projection($p),
        'expected' => $snapshot['expected'],
        'sourceSha' => hash('sha256', $snapshot['document']['source']),
        'serializedSha' => hash('sha256', $snapshot['document']['serialized']),
        'metadata' => [
            'title' => $snapshot['title'],
            'post_status' => $snapshot['post_status'],
            'featured_media' => $snapshot['featured_media'],
        ],
        'sourceManaged' => $snapshot['source_managed'],
        'sourceSha256' => $snapshot['source_sha256'],
        'expires' => time() + 900,
    ];
    if ($kind === 'latest') {
        if (
            $claims['binding'] !== $opening['claims']['binding'] ||
            $claims['actor'] !== $opening['claims']['actor']
        ) {
            mbb_merge_throw('merge_binding', '打开基线与最新版本身份在读取期间变化');
        }
        $claims['opening'] = $opening['signature'];
        $claims['candidate'] = hash('sha256', mbb_component_json($candidate));
        $claims['expires'] = min($claims['expires'], $opening['claims']['expires']);
    }
    mbb_merge_assert_current($snapshot, $id);
    return $claims;
}
function mbb_merge_sign(array $claims): string
{
    ksort($claims);
    if (is_array($claims['metadata'] ?? null)) {
        ksort($claims['metadata']);
    }
    return hash_hmac('sha256', "mbb-merge-v1\0" . mbb_component_json($claims), wp_salt('auth'));
}
function mbb_merge_envelope(array $snapshot, array $claims): array
{
    return $snapshot + ['claims' => $claims, 'signature' => mbb_merge_sign($claims)];
}
function mbb_merge_verify($envelope, int $id, string $kind): array
{
    mbb_merge_keys($envelope, [
        'schema',
        'document',
        'title',
        'post_status',
        'featured_media',
        'expected',
        'source_managed',
        'source_sha256',
        'claims',
        'signature',
    ]);
    $claims = $envelope['claims'];
    $keys = [
        'schema',
        'kind',
        'actor',
        'site',
        'post',
        'type',
        'documentId',
        'binding',
        'expected',
        'sourceSha',
        'serializedSha',
        'metadata',
        'sourceManaged',
        'sourceSha256',
        'expires',
    ];
    if ($kind === 'latest') {
        $keys = array_merge($keys, ['opening', 'candidate']);
    }
    mbb_merge_keys($claims, $keys);
    $encoded = mbb_component_json($claims);
    if (!is_string($encoded) || strlen($encoded) > 8192) {
        mbb_merge_throw('merge_shape', '合并签名投影超限或不是有效 JSON');
    }
    if (
        $envelope['schema'] !== 1 ||
        $claims['schema'] !== 1 ||
        $claims['kind'] !== $kind ||
        !is_string($envelope['signature']) ||
        !preg_match('/^[a-f0-9]{64}$/D', $envelope['signature']) ||
        !hash_equals(mbb_merge_sign($claims), $envelope['signature'])
    ) {
        mbb_merge_throw('merge_signature', '合并基线签名不匹配');
    }
    if (
        !is_int($claims['expires']) ||
        $claims['expires'] <= time() ||
        $claims['expires'] > time() + 900
    ) {
        mbb_merge_throw('merge_expired', '打开基线已过期，请保留候选并重新协调');
    }
    $permission = mbb_merge_permission(['post_id' => $id]);
    if ($permission !== true) {
        mbb_merge_throw('merge_forbidden', '合并权限已失效');
    }
    clean_post_cache($id);
    $p = get_post($id);
    if (
        $claims['actor'] !== get_current_user_id() ||
        $claims['site'] !== mbb_resource_site() ||
        $claims['post'] !== $id ||
        $claims['type'] !== $p->post_type ||
        $claims['documentId'] !== mbb_id($id)
    ) {
        mbb_merge_throw('merge_identity', '合并基线不属于当前用户、站点或文章身份');
    }
    if (
        !is_string($claims['binding']) ||
        !hash_equals(mbb_binding_projection($p), $claims['binding'])
    ) {
        mbb_merge_throw('merge_binding', '文章或来源绑定已变化，不能沿用旧基线');
    }
    $document = mbb_merge_pair($envelope['document']);
    $metadata = [
        'title' => $envelope['title'],
        'post_status' => $envelope['post_status'],
        'featured_media' => $envelope['featured_media'],
    ];
    mbb_merge_keys($claims['metadata'], ['title', 'post_status', 'featured_media']);
    mbb_merge_candidate(['source' => $document['source']] + $metadata);
    foreach ($metadata as $key => $value) {
        if ($claims['metadata'][$key] !== $value) {
            mbb_merge_throw('merge_pair', '元数据类型或值与签名不同');
        }
    }
    if (
        $document['documentId'] !== $claims['documentId'] ||
        $claims['sourceSha'] !== hash('sha256', $document['source']) ||
        $claims['serializedSha'] !== hash('sha256', $document['serialized']) ||
        $claims['expected'] !== $envelope['expected'] ||
        $claims['sourceManaged'] !== $envelope['source_managed'] ||
        $claims['sourceSha256'] !== $envelope['source_sha256'] ||
        ($claims['sourceManaged'] && $claims['sourceSha256'] !== $claims['sourceSha'])
    ) {
        mbb_merge_throw('merge_pair', '合并正文、元数据或来源投影与签名不同');
    }
    // Paired conversion can call hooks; authority checked before it must still hold afterwards.
    clean_post_cache($id);
    if (mbb_merge_permission(['post_id' => $id]) !== true) {
        mbb_merge_throw('merge_forbidden', '配对核验期间合并权限已失效');
    }
    $p = get_post($id);
    if (
        $claims['actor'] !== get_current_user_id() ||
        $claims['site'] !== mbb_resource_site() ||
        $claims['type'] !== $p->post_type ||
        $claims['documentId'] !== mbb_id($id)
    ) {
        mbb_merge_throw('merge_identity', '配对核验期间文章身份已变化');
    }
    if (!hash_equals(mbb_binding_projection($p), $claims['binding'])) {
        mbb_merge_throw('merge_binding', '配对核验期间来源绑定已变化');
    }
    return $envelope;
}
function mbb_merge_request($r, array $keys): array
{
    $data = $r->get_json_params();
    mbb_merge_keys($data, $keys);
    if ($data['schema'] !== 1 || !is_int($data['post_id']) || $data['post_id'] < 1) {
        mbb_merge_throw('merge_shape', '合并请求身份不合法');
    }
    return $data;
}
function mbb_merge_open($r)
{
    try {
        $data = mbb_merge_request($r, ['schema', 'post_id', 'expected']);
        if (!is_string($data['expected'])) {
            mbb_merge_throw('merge_shape', '缺少打开时版本');
        }
        $snapshot = mbb_merge_current($data['post_id'], $data['expected']);
        return mbb_merge_envelope(
            $snapshot,
            mbb_merge_claims($snapshot, $data['post_id'], 'opening'),
        );
    } catch (Throwable $error) {
        return mbb_merge_error($error);
    }
}
function mbb_merge_latest($r)
{
    try {
        $data = mbb_merge_request($r, ['schema', 'post_id', 'opening', 'candidate']);
        $opening = mbb_merge_verify($data['opening'], $data['post_id'], 'opening');
        $candidate = mbb_merge_candidate($data['candidate']);
        $snapshot = mbb_merge_current($data['post_id']);
        return mbb_merge_envelope(
            $snapshot,
            mbb_merge_claims($snapshot, $data['post_id'], 'latest', $opening, $candidate),
        );
    } catch (Throwable $error) {
        return mbb_merge_error($error);
    }
}
function mbb_merge_adopt($r)
{
    try {
        $data = mbb_merge_request($r, [
            'schema',
            'post_id',
            'opening',
            'latest',
            'candidate',
            'source',
        ]);
        $opening = mbb_merge_verify($data['opening'], $data['post_id'], 'opening');
        $latest = mbb_merge_verify($data['latest'], $data['post_id'], 'latest');
        $candidate = mbb_merge_candidate($data['candidate']);
        if (
            $latest['claims']['opening'] !== $opening['signature'] ||
            $latest['claims']['candidate'] !== hash('sha256', mbb_component_json($candidate))
        ) {
            mbb_merge_throw('merge_candidate', '候选或打开基线在预览合并后变化');
        }
        $current = mbb_merge_current($data['post_id'], $latest['expected']);
        if (!mbb_merge_same_snapshot($current, $latest)) {
            mbb_merge_throw('merge_conflict', '服务器或来源在合并确认期间变化');
        }
        $merged = mbb_merge_candidate([
            'source' => $data['source'],
            'title' => $candidate['title'],
            'post_status' => $candidate['post_status'],
            'featured_media' => $candidate['featured_media'],
        ]);
        $document = mbb_convert([
            'mode' => 'markdown',
            'source' => $merged['source'],
            'documentId' => $current['document']['documentId'],
        ]);
        if (is_wp_error($document)) {
            mbb_merge_throw('merge_conversion', '合并结果无法闭合转换，原候选仍保留');
        }
        $final = mbb_merge_current($data['post_id'], $latest['expected']);
        if (!mbb_merge_same_snapshot($final, $latest)) {
            mbb_merge_throw('merge_conflict', '来源在转换期间变化，请重新核对');
        }
        $final['post_id'] = $data['post_id'];
        $final['source_write_available'] = $final['source_managed'];
        $final['frontmatter_current'] = mbb_frontmatter_current(get_post($data['post_id']));
        mbb_merge_assert_current($final, $data['post_id']);
        return ['schema' => 1, 'saved' => false, 'document' => $document, 'newbase' => $final];
    } catch (Throwable $error) {
        return mbb_merge_error($error);
    }
}
add_action('rest_api_init', static function () {
    foreach (['open', 'latest', 'adopt'] as $action) {
        register_rest_route('mbb/v1', '/merge/' . $action, [
            'methods' => 'POST',
            'permission_callback' => 'mbb_merge_permission',
            'callback' => 'mbb_merge_' . $action,
        ]);
    }
});
