<?php
/** Optional exact-source proof inside the existing native paired save transaction. */
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}
function mbb_native_document_error(int $status = 409)
{
    return mbb_error(
        'document_native_candidate',
        mbb_t(
            'The applied document candidate expired or its baseline changed. Your input is preserved. Undo it and prepare the candidate again before saving.',
        ),
        $status,
    );
}
function mbb_native_document_open($request, int $id, string $expected)
{
    try {
        $raw = $request->get_body();
        if (
            !$request->is_json_content_type() ||
            !is_string($raw) ||
            strlen($raw) > 1500000 ||
            !mb_check_encoding($raw, 'UTF-8')
        ) {
            return mbb_native_document_error(422);
        }
        try {
            $body = json_decode($raw, false, 32, JSON_THROW_ON_ERROR);
            mbb_document_tools_unique_json_keys($raw);
        } catch (Throwable) {
            return mbb_native_document_error(422);
        }
        if (
            !($body instanceof stdClass) ||
            !property_exists($body, 'mbb_document_candidate') ||
            ($body->mbb_expected ?? null) !== $expected
        ) {
            return mbb_native_document_error(422);
        }
        $input = $body->mbb_document_candidate;
        $keys = $input instanceof stdClass ? array_keys(get_object_vars($input)) : [];
        sort($keys);
        if (
            $keys !== ['receipt', 'schema', 'sourceBase64'] ||
            $input->schema !== 1 ||
            !is_string($input->sourceBase64) ||
            strlen($input->sourceBase64) > 349528 ||
            !is_string($input->receipt)
        ) {
            return mbb_native_document_error(422);
        }
        $source = base64_decode($input->sourceBase64, true);
        if (
            !is_string($source) ||
            base64_encode($source) !== $input->sourceBase64 ||
            strlen($source) > 262144 ||
            !mb_check_encoding($source, 'UTF-8') ||
            str_contains($source, "\0")
        ) {
            return mbb_native_document_error(422);
        }
        $claims = mbb_document_tools_verify($input->receipt);
        $baseline = $claims;
        unset($baseline['expires']);
        $current = mbb_document_tools_current($id, $expected);
        if ($current['snapshot']['source_managed'] || $baseline !== $current['claims']) {
            return mbb_native_document_error();
        }
        return [
            'source' => $source,
            'claims' => $claims,
            'originalSerialized' => $current['snapshot']['document']['serialized'],
        ];
    } catch (Throwable) {
        return mbb_native_document_error();
    }
}
function mbb_native_document_candidate($review, $serialized, array $exact)
{
    if (!is_string($serialized) || strlen($serialized) > 1500000) {
        return mbb_native_document_error(422);
    }
    $markdown = clone $review;
    $markdown->set_param('mode', 'markdown');
    $markdown->set_param('source', $exact['source']);
    $candidate = mbb_candidate($markdown);
    if (is_wp_error($candidate)) {
        return $candidate;
    }
    $document = $candidate['document'];
    if (
        strlen($document['serialized']) > 262144 ||
        $document['source'] !== $exact['source'] ||
        mbb_references_projection($document['serialized'])['identity'] !==
            $exact['claims']['identity']
    ) {
        return mbb_native_document_error(422);
    }
    // Reuse the existing source-preserving block export. This is a conversion base,
    // never an adoption of another database expected token or a second writable body.
    $verified = mbb_convert([
        'mode' => 'blocks',
        'serialized' => $serialized,
        'documentId' => $document['documentId'],
        'base' => $document,
    ]);
    if (is_wp_error($verified)) {
        return $verified;
    }
    if (
        $verified['source'] !== $document['source'] ||
        $verified['serialized'] !== $document['serialized']
    ) {
        return mbb_error(
            'document_native_mismatch',
            mbb_t(
                'The native editor did not retain the complete candidate. Current input is preserved; use Markdown edit / upload to preview it again.',
            ),
            409,
        );
    }
    return $candidate;
}
function mbb_native_document_final(array $exact, int $id)
{
    try {
        mbb_references_fresh_user();
        $post = mbb_references_fresh_post($id);
        if (!current_user_can('edit_post', $id)) {
            return mbb_native_document_error(403);
        }
        $c = $exact['claims'];
        if (
            !$post ||
            !mbb_managed($id) ||
            $c['expires'] <= time() ||
            $c['actor'] !== get_current_user_id() ||
            $c['blog'] !== get_current_blog_id() ||
            $c['site'] !== mbb_resource_site() ||
            $c['session'] !== hash('sha256', wp_get_session_token()) ||
            $c['post'] !== $id ||
            get_post_meta($id, '_mbb_source_managed', true) === 'file' ||
            $c['binding'] !== mbb_binding_projection($post) ||
            $c['pins'] !== mbb_document_tools_pins($exact['originalSerialized']) ||
            mbb_references_projection($post->post_content)['identity'] !== $c['identity']
        ) {
            return mbb_native_document_error();
        }
        return true;
    } catch (Throwable) {
        return mbb_native_document_error();
    }
}
