<?php
/** Read-only body candidates. No persistence or background jobs. */
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}
function mbb_document_tools_fail(): never
{
    throw new RuntimeException('document_candidate');
}
function mbb_document_tools_pins(string $serialized): string
{
    $pins = [];
    foreach (mbb_component_descriptors($serialized) as $a) {
        $key = $a->component . '@' . $a->componentVersion;
        if (isset($pins[$key])) {
            continue;
        }
        $p = mbb_component_provider($a->component, $a->componentVersion);
        if (!$p || $p['status'] !== 'available' || !empty($p['integrityChanged'])) {
            mbb_document_tools_fail();
        }
        $file = $p['resource']['file'];
        clearstatcache(true, $file);
        if (
            !is_file($file) ||
            is_link($file) ||
            filesize($file) > 524288 ||
            !hash_equals($p['resource']['sha256'], (string) hash_file('sha256', $file))
        ) {
            mbb_document_tools_fail();
        }
        $pins[$key] = [
            'definition' => markbridge_teaching_component_fingerprint($a->component, $p),
            'projection' => mbb_component_projection_fingerprint(
                $a->component,
                $a->componentVersion,
            ),
            'group' =>
                ($p['protocolVersion'] ?? 1) === 2
                    ? mbb_component_v2_check($p)['plan']['groupSha256']
                    : null,
        ];
    }
    ksort($pins);
    return hash('sha256', mbb_component_json($pins));
}
function mbb_document_tools_current(int $id, string $expected): array
{
    mbb_references_fresh_user();
    mbb_references_fresh_post($id);
    $snapshot = mbb_merge_current($id, $expected);
    $document = $snapshot['document'];
    $identity = mbb_references_projection($document['serialized'])['identity'];
    if ($identity) {
        global $wpdb;
        $control = mbb_references_control();
        $tables = mbb_references_tables();
        if (!$control || $control['state'] !== 'ready') {
            mbb_document_tools_fail();
        }
        $claim = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT post_id,pair_hash FROM {$tables['claims']} WHERE generation=%d AND namespace_key=%s AND document_key=%s",
                $control['active_generation'],
                $identity['namespace'],
                $identity['document'],
            ),
            ARRAY_A,
        );
        if (
            !$claim ||
            (int) $claim['post_id'] !== $id ||
            !hash_equals($claim['pair_hash'], mbb_references_pair_hash(get_post($id)))
        ) {
            mbb_document_tools_fail();
        }
    }
    $file = null;
    if ($snapshot['source_managed']) {
        $path = mbb_source_target(get_post($id));
        if (is_wp_error($path) || !is_writable($path) || !is_writable(dirname($path))) {
            mbb_document_tools_fail();
        }
        clearstatcache(true, $path);
        $stat = stat($path);
        $file = hash(
            'sha256',
            mbb_component_json([
                $path,
                $stat['dev'],
                $stat['ino'],
                $stat['size'],
                $stat['mtime'],
                $stat['ctime'],
                $snapshot['source_sha256'],
            ]),
        );
    }
    $claims = [
        'schema' => 1,
        'actor' => get_current_user_id(),
        'blog' => get_current_blog_id(),
        'site' => mbb_resource_site(),
        'session' => hash('sha256', wp_get_session_token()),
        'post' => $id,
        'expected' => $snapshot['expected'],
        'binding' => mbb_binding_projection(get_post($id)),
        'source' => hash('sha256', $document['source']),
        'serialized' => hash('sha256', $document['serialized']),
        'identity' => $identity,
        'file' => $file,
        'pins' => mbb_document_tools_pins($document['serialized']),
    ];
    mbb_merge_assert_current($snapshot, $id);
    return ['snapshot' => $snapshot, 'claims' => $claims];
}
function mbb_document_tools_sign(string $json): string
{
    return hash_hmac('sha256', "mbb-document-capture-v1\0" . $json, wp_salt('auth'));
}
function mbb_document_tools_receipt(array $claims): string
{
    $json = mbb_component_json($claims);
    return rtrim(strtr(base64_encode($json), '+/', '-_'), '=') .
        '.' .
        mbb_document_tools_sign($json);
}
function mbb_document_tools_verify(mixed $receipt): array
{
    if (!is_string($receipt) || strlen($receipt) > 8192) {
        mbb_document_tools_fail();
    }
    $parts = explode('.', $receipt);
    $json = count($parts) === 2 ? base64_decode(strtr($parts[0], '-_', '+/'), true) : false;
    if (!is_string($json) || !hash_equals(mbb_document_tools_sign($json), $parts[1])) {
        mbb_document_tools_fail();
    }
    $claims = json_decode($json, true, 16, JSON_THROW_ON_ERROR);
    if (
        !is_array($claims) ||
        !is_int($claims['expires'] ?? null) ||
        $claims['expires'] <= time() ||
        $claims['expires'] > time() + 900
    ) {
        mbb_document_tools_fail();
    }
    return $claims;
}
/** Decode only the authenticated HTTP JSON body; request parameter precedence is irrelevant. */
function mbb_document_tools_input($request, bool $preview): array
{
    $body = $request->get_body();
    $limit = $preview ? (262144 + 8192) * 6 + 4096 : 4096;
    if (
        !$request->is_json_content_type() ||
        !is_string($body) ||
        strlen($body) > $limit ||
        !mb_check_encoding($body, 'UTF-8')
    ) {
        throw new InvalidArgumentException('document_request');
    }
    $object = json_decode($body, false, 16, JSON_THROW_ON_ERROR);
    if (!($object instanceof stdClass)) {
        throw new InvalidArgumentException('document_request');
    }
    $data = get_object_vars($object);
    $keys = array_keys($data);
    $allowed = $preview ? ['post_id', 'expected', 'receipt', 'source'] : ['post_id', 'expected'];
    sort($keys);
    sort($allowed);
    if (
        $keys !== $allowed ||
        !is_int($data['post_id']) ||
        $data['post_id'] < 1 ||
        !is_string($data['expected']) ||
        !preg_match('/^[a-f0-9]{64}$/D', $data['expected']) ||
        ($preview &&
            (!is_string($data['receipt']) ||
                !is_string($data['source']) ||
                strlen($data['source']) > 262144 ||
                str_contains($data['source'], "\0")))
    ) {
        throw new InvalidArgumentException('document_request');
    }
    // JSON decoding above validates syntax/Unicode/depth. Scan the bounded bytes once to
    // reject top-level duplicate keys, including spellings such as "post\u005fid".
    // Skip quoted strings iteratively; no recursive parser or long-string regex is needed.
    $depth = 0;
    $keyExpected = false;
    $seen = [];
    $length = strlen($body);
    for ($i = 0; $i < $length; $i++) {
        $char = $body[$i];
        if ($char === '"') {
            $start = $i++;
            while ($i < $length && $body[$i] !== '"') {
                $i += $body[$i] === '\\' ? 2 : 1;
            }
            if ($depth === 1 && $keyExpected) {
                $key = json_decode(
                    substr($body, $start, $i - $start + 1),
                    false,
                    2,
                    JSON_THROW_ON_ERROR,
                );
                if (isset($seen[$key])) {
                    throw new InvalidArgumentException('document_request');
                }
                $seen[$key] = true;
                $keyExpected = false;
            }
        } elseif ($char === '{' || $char === '[') {
            $depth++;
            if ($depth === 1) {
                $keyExpected = true;
            }
        } elseif ($char === '}' || $char === ']') {
            $depth--;
        } elseif ($char === ',' && $depth === 1) {
            $keyExpected = true;
        }
    }
    return $data;
}
function mbb_document_tools_request($r, bool $preview)
{
    try {
        $r = mbb_document_tools_input($r, $preview);
    } catch (Throwable) {
        return mbb_error(
            'document_request',
            mbb_t(
                'Document candidate requests require a closed JSON object with valid fields and no duplicate keys.',
            ),
            422,
        );
    }
    try {
        $id = $r['post_id'];
        if (!is_int($id) || $id < 1 || !is_string($r['expected'])) {
            mbb_document_tools_fail();
        }
        $current = mbb_document_tools_current($id, $r['expected']);
        if (!$preview) {
            $final = mbb_document_tools_current($id, $r['expected']);
            if ($current['claims'] !== $final['claims']) {
                mbb_document_tools_fail();
            }
            $d = $current['snapshot']['document'];
            $result = [
                'source' => $d['source'],
                'serialized' => $d['serialized'],
                'documentId' => $d['documentId'],
                'identity' => $current['claims']['identity'],
                'sourceSha256' => $current['claims']['source'],
                'serializedSha256' => $current['claims']['serialized'],
                'receipt' => mbb_document_tools_receipt(
                    $current['claims'] + ['expires' => time() + 900],
                ),
            ];
        } else {
            $claims = mbb_document_tools_verify($r['receipt']);
            $baseline = $claims;
            unset($baseline['expires']);
            if (
                $baseline !== $current['claims'] ||
                !is_string($r['source']) ||
                strlen($r['source']) > 262144 ||
                !mb_check_encoding($r['source'], 'UTF-8') ||
                str_contains($r['source'], "\0")
            ) {
                mbb_document_tools_fail();
            }
            // A closed request: plugins cannot smuggle metadata/resource/restore authority.
            $request = new WP_REST_Request('POST', '/mbb/v1/preview');
            foreach (
                [
                    'post_id' => $id,
                    'expected' => $r['expected'],
                    'mode' => 'markdown',
                    'source' => $r['source'],
                ]
                as $key => $value
            ) {
                $request->set_param($key, $value);
            }
            $result = mbb_preview($request);
            if (
                !is_wp_error($result) &&
                (strlen($result['document']['serialized']) > 262144 ||
                    mbb_references_projection($result['document']['serialized'])['identity'] !==
                        $baseline['identity'])
            ) {
                $result = mbb_error(
                    'document_identity',
                    mbb_t('Keep the current identity. Import a copy as a new draft instead.'),
                    422,
                );
            }
            $final = mbb_document_tools_current($id, $r['expected']);
            if ($baseline !== $final['claims'] || $claims['expires'] <= time()) {
                mbb_document_tools_fail();
            }
            // Even a rejected candidate must not hide a concurrent authority/baseline change.
            if (is_wp_error($result)) {
                return $result;
            }
            // The receipt is deliberately never renewed by a preview.
        }
        $response = new WP_REST_Response($result);
        $response->header('Cache-Control', 'private, no-store');
        $response->header('Vary', 'Cookie');
        return $response;
    } catch (Throwable) {
        return mbb_error(
            'document_candidate',
            mbb_t(
                'The document candidate is unavailable or expired. Save current edits and reopen the tool.',
            ),
            409,
        );
    }
}
add_action('rest_api_init', static function () {
    foreach (['capture' => false, 'preview' => true] as $name => $preview) {
        register_rest_route('mbb/v1', '/document-tools/' . $name, [
            'methods' => 'POST',
            'permission_callback' => 'mbb_merge_permission',
            'callback' => static fn($r) => mbb_document_tools_request($r, $preview),
        ]);
    }
});

add_filter(
    'rest_post_dispatch',
    static function ($response, $server, $request) {
        if (str_starts_with($request->get_route(), '/mbb/v1/document-tools/')) {
            $response->header('Cache-Control', 'private, no-store');
            $response->header('Vary', 'Cookie');
        }
        return $response;
    },
    10,
    3,
);
