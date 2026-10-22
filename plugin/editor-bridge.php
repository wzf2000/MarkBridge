<?php

// Standalone CLI conversion and model tests remain supported; direct web access requires WordPress.
if (!defined('ABSPATH')) {
    if (PHP_SAPI !== 'cli') {
        exit();
    }
}

require_once __DIR__ . '/includes/i18n.php';
// Paired document storage, validation and capability-checked editing endpoints.
require_once __DIR__ . '/includes/conversion-backends.php';
require_once __DIR__ . '/frontmatter.php';
require_once __DIR__ . '/block-adapters.php';
require_once __DIR__ . '/resource-import.php';
require_once __DIR__ . '/save-commit.php';
require_once __DIR__ . '/export.php';
require_once __DIR__ . '/merge.php';
require_once __DIR__ . '/preview-navigation.php';
function mbb_managed($id)
{
    return get_post_meta($id, '_mbb_origin', true) === 'markdown_import' &&
        (!get_post_meta($id, '_llm_document_id', true) ||
            get_post_meta($id, '_mbb_source_managed', true) === 'file');
}
function mbb_id($id)
{
    return get_post_meta($id, '_mbb_document_id', true) ?:
        get_post_meta($id, '_mbb_fixture_id', true);
}
function mbb_token($p)
{
    $taxonomies = [];
    foreach (get_object_taxonomies($p->post_type, 'objects') as $taxonomy) {
        if (!$taxonomy->show_in_rest) {
            continue;
        }
        $ids = wp_get_object_terms($p->ID, $taxonomy->name, ['fields' => 'ids']);
        $ids = is_wp_error($ids) ? ['error' => $ids->get_error_code()] : array_map('intval', $ids);
        sort($ids);
        $taxonomies[$taxonomy->name] = $ids;
    }
    ksort($taxonomies);
    $metadata = [];
    $registered = array_merge(
        get_registered_meta_keys('post'),
        get_registered_meta_keys('post', $p->post_type),
    );
    ksort($registered);
    foreach ($registered as $key => $args) {
        if (!empty($args['show_in_rest'])) {
            $metadata[$key] = get_post_meta($p->ID, $key, !empty($args['single']));
        }
    }
    return hash(
        'sha256',
        wp_json_encode([
            $p->post_content,
            $p->post_content_filtered,
            $p->post_title,
            $p->post_status,
            $p->post_author,
            $p->post_excerpt,
            $p->post_name,
            $p->post_date,
            $p->post_date_gmt,
            $p->post_parent,
            $p->menu_order,
            $p->comment_status,
            $p->ping_status,
            $p->post_password,
            mbb_id($p->ID),
            get_post_thumbnail_id($p->ID),
            get_page_template_slug($p->ID),
            is_sticky($p->ID),
            $taxonomies,
            $metadata,
            mbb_binding_projection($p),
        ]),
    );
}
function mbb_document($p)
{
    return [
        'schema' => 1,
        'converter' => '0.2.0',
        'origin' => 'markdown_import',
        'documentId' => mbb_id($p->ID),
        'source' => $p->post_content_filtered,
        'serialized' => $p->post_content,
    ];
}
function mbb_state($id)
{
    $p = get_post($id);
    $state = [
        'post_id' => $id,
        'source_managed' => get_post_meta($id, '_mbb_source_managed', true) === 'file',
        'post_status' => $p->post_status,
        'featured_media' => (int) get_post_thumbnail_id($id),
        'title' => $p->post_title,
        'frontmatter_current' => mbb_frontmatter_current($p),
        'expected' => mbb_token($p),
        'document' => mbb_document($p),
        'editor_url' => admin_url('post.php?post=' . $id . '&action=edit'),
        'preview_url' => get_preview_post_link($id),
    ];
    if ($state['source_managed']) {
        $target = mbb_source_target($p);
        $capability = apply_filters('mbb_source_write_capability', 'edit_post', $id);
        $state['source_write_available'] =
            !is_wp_error($target) && (bool) $capability && current_user_can($capability, $id);
        if (!is_wp_error($target)) {
            $fingerprint = mbb_source_fingerprint($target);
            if (!is_wp_error($fingerprint)) {
                $state['source_sha256'] = $fingerprint['sha256'];
            }
        }
    }
    return $state;
}
function mbb_permission($r)
{
    $id = absint($r->get_param('post_id'));
    if (!is_user_logged_in() || !current_user_can($id ? 'edit_post' : 'edit_posts', $id)) {
        return new WP_Error(
            'forbidden',
            mbb_t('You do not have permission to edit this article.'),
            ['status' => 403],
        );
    }
    if ($id && !mbb_managed($id)) {
        return new WP_Error('origin', mbb_t('This article is not a Markdown source document.'), [
            'status' => 403,
        ]);
    }
    return true;
}
function mbb_source_write_permission($r)
{
    $permission = mbb_permission($r);
    if (is_wp_error($permission)) {
        return $permission;
    }
    $id = absint($r->get_param('post_id'));
    $capability = apply_filters('mbb_source_write_capability', 'edit_post', $id);
    if (!$capability || !current_user_can($capability, $id)) {
        return new WP_Error(
            'source_forbidden',
            mbb_t('You do not have permission to write this article\'s source file.'),
            ['status' => 403],
        );
    }
    return true;
}
function mbb_source_audit_permission($r)
{
    $id = absint($r->get_param('post_id'));
    if (!$id || !current_user_can('manage_options')) {
        return new WP_Error(
            'forbidden',
            mbb_t('Only administrators can view the source write audit.'),
            ['status' => 403],
        );
    }
    if (get_post_meta($id, '_mbb_source_managed', true) !== 'file') {
        return new WP_Error('source_managed', mbb_t('This article has no source file binding.'), [
            'status' => 409,
        ]);
    }
    return true;
}
function mbb_source_record_audit($id, $fields)
{
    update_post_meta(
        $id,
        '_mbb_source_web_audit',
        array_merge(
            [
                'user_id' => get_current_user_id(),
                'time' => current_time('mysql', true),
            ],
            $fields,
        ),
    );
}
function mbb_error($code, $message, $status = 409)
{
    return new WP_Error($code, $message, ['status' => $status]);
}
require_once __DIR__ . '/includes/conversion-errors.php';
function mbb_convert($input)
{
    $diagnostics = mbb_runtime_diagnostics();
    if (!$diagnostics['ok']) {
        return mbb_error(
            'runtime_incompatible',
            mbb_t(
                'The conversion runtime is unconfigured or incompatible with this plugin or WordPress. Original content was not written.',
            ),
            503,
        );
    }
    $adapter_digest = mbb_block_adapter_digest();
    $input['blockAdapters'] = mbb_block_adapter_snapshot();
    $result = mbb_converter_dispatch($input);
    if (!hash_equals($adapter_digest, mbb_block_adapter_digest())) {
        return mbb_error(
            'adapter_conflict',
            mbb_t(
                'Static block registrations changed during conversion. The candidate was not written.',
            ),
        );
    }
    if (is_wp_error($result)) {
        return $result;
    }
    if (empty($result['ok'])) {
        return mbb_conversion_failure($result);
    }
    return $result['document'];
}
function mbb_html_normalize($html)
{
    $d = new DOMDocument('1.0', 'UTF-8');
    $old = libxml_use_internal_errors(true);
    $d->loadHTML(
        '<?xml encoding="UTF-8"?><div>' . $html . '</div>',
        LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET,
    );
    libxml_clear_errors();
    libxml_use_internal_errors($old);
    return $d->saveHTML();
}
function mbb_safe_css($properties)
{
    $properties[] = 'zoom';
    return array_unique($properties);
}
function mbb_html_allowed($blocks)
{
    $css_filter = has_filter('safe_style_css', 'mbb_safe_css');
    if ($css_filter === false) {
        add_filter('safe_style_css', 'mbb_safe_css');
    }
    try {
        $allowed = [
            'core/paragraph',
            'core/heading',
            'core/separator',
            'core/quote',
            'core/list',
            'core/list-item',
            'core/table',
            'core/image',
            'core/gallery',
            'core/html',
            'core/more',
            'core/group',
            'core/details',
            'core/buttons',
            'core/button',
            ...mbb_block_adapter_names(),
            'mbb/list',
            'mbb/list-item',
            'mbb/task-item',
            'mbb/footnotes',
            'mbb/footnote',
            'mbb/math',
            'mbb/code',
            'mbb/frontmatter',
            'mbb/identity',
            'mbb/component',
            'mbb/collapse',
            'mbb/steps',
            'mbb/step',
            'mbb/code-compare',
            'mbb/code-tabs',
            'mbb/object',
            'mbb/statement',
            'mbb/bibliography',
        ];
        foreach ($blocks as $b) {
            if ($b['blockName'] === null && trim($b['innerHTML']) === '') {
                continue;
            }
            if (
                !in_array($b['blockName'], $allowed, true) ||
                mbb_html_normalize(wp_kses_post($b['innerHTML'])) !==
                    mbb_html_normalize($b['innerHTML']) ||
                !mbb_html_allowed($b['innerBlocks'])
            ) {
                return false;
            }
        }
        return true;
    } finally {
        if ($css_filter === false) {
            remove_filter('safe_style_css', 'mbb_safe_css');
        }
    }
}
function mbb_candidate($r)
{
    $digest = mbb_block_adapter_digest();
    $candidate = mbb_candidate_current($r);
    if (!is_wp_error($candidate)) {
        $media = mbb_native_media_validate_candidate($candidate['document']['serialized']);
        if (is_wp_error($media)) {
            return $media;
        }
    }
    if (!is_wp_error($candidate)) {
        // Dependency inspection can invoke the real block_parser_class filter.
        // Keep the entry snapshot and compare only after every preparation/parse step.
        $candidate['adapter_digest'] = mbb_document_has_adapters(
            $candidate['document']['serialized'],
        )
            ? $digest
            : null;
        $candidate['_adapter_registry_digest'] = $digest;
    }
    if (!hash_equals($digest, mbb_block_adapter_digest())) {
        return mbb_error(
            'adapter_conflict',
            mbb_t('Static registrations changed while preparing the candidate. Preview again.'),
        );
    }
    return $candidate;
}
function mbb_candidate_current($r)
{
    if (strlen((string) $r->get_body()) > 2000000) {
        return mbb_error('size', mbb_t('The request is too large.'), 413);
    }
    $id = absint($r['post_id']);
    $p = $id ? get_post($id) : null;
    $mode = $r['mode'] ?? 'markdown';
    if (!in_array($mode, ['markdown', 'upload', 'blocks', 'restore'], true)) {
        return mbb_error('mode', mbb_t('Unknown editing mode.'), 422);
    }
    if ($p && (!is_string($r['expected']) || !hash_equals(mbb_token($p), $r['expected']))) {
        return mbb_error(
            'conflict',
            mbb_t('The article has newer changes. Reload and merge them.'),
        );
    }
    if ($mode === 'restore') {
        if ($r->has_param('resource_import') || $r->has_param('resource_receipt')) {
            return mbb_error(
                'resource_mode',
                mbb_t('Revision restoration cannot import new ZIP resources.'),
                422,
            );
        }
        $revision = mbb_revision_candidate($r, $p);
        return is_wp_error($revision) ? $revision : mbb_frontmatter_candidate($r, $p, $revision);
    }
    $docId = $p ? mbb_id($id) : $r['documentId'] ?? '';
    if (!is_string($docId) || !preg_match('/^[A-Za-z][A-Za-z0-9_-]{2,63}$/', $docId)) {
        return mbb_error(
            'identity',
            mbb_t(
                'The document ID must begin with a letter and contain 3–64 ASCII letters, digits, underscores, or hyphens.',
            ),
            422,
        );
    }
    if (!$p && $mode === 'blocks') {
        return mbb_error('origin', mbb_t('Import Markdown first for a new document.'), 422);
    }
    $originalBlocks = $r['new_blocks_original'];
    if (
        $r->has_param('new_blocks_original') &&
        ($p ||
            $mode !== 'markdown' ||
            !is_string($originalBlocks) ||
            strlen($originalBlocks) > 262144)
    ) {
        return mbb_error(
            'recovery_shape',
            mbb_t(
                'A new native block candidate must be imported through bounded Markdown while preserving its original block shape.',
            ),
            422,
        );
    }
    $title = $r['title'] ?? ($p ? $p->post_title : '');
    if ($mode !== 'blocks' && (!is_string($r['source']) || strlen($r['source']) > 1500000)) {
        return mbb_error('source', mbb_t('Markdown is missing or the source is too large.'), 422);
    }
    if (
        $mode === 'blocks' &&
        (!is_string($r['serialized']) || strlen($r['serialized']) > 1500000)
    ) {
        return mbb_error('blocks', mbb_t('Block content is missing or too large.'), 422);
    }
    if ($p && $mode === 'upload') {
        $history = get_post_meta($id, '_mbb_source_history', true);
        $hash = hash('sha256', $r['source']);
        if (
            is_array($history) &&
            in_array($hash, $history, true) &&
            $hash !== hash('sha256', $p->post_content_filtered)
        ) {
            return mbb_error(
                'old_upload',
                mbb_t(
                    'The uploaded file is a known older version and cannot overwrite the current edits.',
                ),
            );
        }
    }
    $doc = mbb_convert([
        'mode' => $mode === 'blocks' ? 'blocks' : 'markdown',
        'source' => $r['source'],
        'serialized' => $r['serialized'],
        'documentId' => $docId,
        'base' => $p ? mbb_document($p) : null,
    ]);
    if (is_wp_error($doc)) {
        return $doc;
    }
    if ($r->has_param('new_blocks_original') && !hash_equals($doc['serialized'], $originalBlocks)) {
        return mbb_error(
            'recovery_shape',
            mbb_t(
                'Native blocks cannot round-trip exactly through Markdown. No candidate was created. Download them for safekeeping or adjust the blocks.',
            ),
            422,
        );
    }
    if ($p && str_contains($p->post_content, '<!-- wp:mbb/component ')) {
        $trusted = mbb_convert([
            'mode' => 'paired_restore',
            'source' => $p->post_content_filtered,
            'serialized' => $p->post_content,
            'documentId' => mbb_id($p->ID),
        ]);
        if (is_wp_error($trusted)) {
            return mbb_error(
                'component_base',
                mbb_t(
                    'The original component pair is damaged and cannot authorize preservation of unregistered configuration.',
                ),
                422,
            );
        }
    }
    $admission = mbb_component_admit($doc['serialized'], $p ? $p->post_content : '');
    if (is_wp_error($admission)) {
        return $admission;
    }
    // Independent server HTML policy: never silently strip content accepted by the worker.
    if (!mbb_html_allowed(parse_blocks($doc['serialized']))) {
        return mbb_error(
            'html_policy',
            mbb_t('The content does not satisfy the server HTML allowlist and was not saved.'),
            422,
        );
    }
    $candidate = mbb_frontmatter_candidate($r, $p, [
        'document' => $doc,
        'title' => $title,
        'post_id' => $id,
        'expected' => $p ? mbb_token($p) : null,
    ]);
    if (is_wp_error($candidate)) {
        return $candidate;
    }
    try {
        return mbb_resource_plan($r, $candidate);
    } catch (Throwable $e) {
        return mbb_resource_error($e);
    }
}
function mbb_preview($r)
{
    $c = mbb_candidate($r);
    if (is_wp_error($c)) {
        return $c;
    }
    $p = $c['post_id'] ? get_post($c['post_id']) : null;
    if ($p && isset($c['revision_id']) && function_exists('mbb_references_projection')) {
        $currentIdentity = mbb_references_projection($p->post_content)['identity'];
        $historyIdentity = mbb_references_projection($c['document']['serialized'])['identity'];
        $c['identity_restore'] =
            $currentIdentity !== $historyIdentity
                ? ($currentIdentity && !$historyIdentity
                    ? 'adopt-history'
                    : 'incompatible')
                : 'exact';
    }
    $c['before'] = $p ? $p->post_content_filtered : '';
    $c['before_title'] = $p ? $p->post_title : '';
    $c['frontmatter_receipt'] = isset($c['frontmatter_binding'])
        ? mbb_frontmatter_receipt($c['frontmatter_binding'])
        : null;
    unset($c['frontmatter_binding']);
    $receipt_request = clone $r;
    $receipt_request['frontmatter_receipt'] = $c['frontmatter_receipt'];
    $c['resource_receipt'] = mbb_resource_receipt($receipt_request, $c);
    $rendered = mbb_preview_navigation(
        $c['document'],
        $c['resource_plan']['projectedDocument'] ?? $c['document'],
    );
    $c['html'] = $rendered['html'];
    $c['navigation'] = $rendered['navigation'];
    if (!hash_equals($c['_adapter_registry_digest'], mbb_block_adapter_digest())) {
        return mbb_error(
            'adapter_conflict',
            mbb_t(
                'Static registrations changed while rendering the preview. The candidate was not written. Preview again.',
            ),
        );
    }
    unset($c['_adapter_registry_digest']);
    return $c;
}
// Code/TeX attributes are plain text. The rendered HTML still passes normal KSES.
function mbb_kses_plain_block_sources($text, $allowed = 'post', $protocols = [])
{
    if (!str_contains($text, '<!--')) {
        return $text;
    }
    $component_comments = [];
    preg_match_all('/<!-- wp:mbb\/component (\{[\s\S]*?\}) -->/', $text, $matches);
    foreach ($matches[0] as $i => $comment) {
        $attrs = json_decode($matches[1][$i], false, 32);
        if (is_object($attrs) && isset($attrs->id)) {
            $component_comments[$attrs->id] = $comment;
        }
    }
    $walk = function ($blocks) use (&$walk, $allowed, $protocols) {
        foreach ($blocks as &$b) {
            $fields =
                [
                    'mbb/frontmatter' => ['raw'],
                    'mbb/component' => ['params'],
                    'mbb/code' => ['code'],
                    'mbb/math' => ['tex'],
                    'mbb/code-compare' => ['codeLeft', 'codeRight', 'leftTitle', 'rightTitle'],
                    'mbb/code-tabs' => ['tabs'],
                    'mbb/collapse' => ['title'],
                    'mbb/steps' => ['title'],
                    'mbb/step' => ['title'],
                    'mbb/object' => ['caption'],
                    'mbb/statement' => ['title'],
                    'mbb/bibliography' => ['entries'],
                ][$b['blockName']] ?? [];
            if (in_array($b['blockName'], mbb_block_adapter_names(), true)) {
                $fields = array_keys($b['attrs']);
            }
            $plain = [];
            $attrs = $b['attrs'];
            foreach ($fields as $field) {
                if (
                    isset($attrs[$field]) &&
                    (is_string($attrs[$field]) ||
                        ($b['blockName'] === 'mbb/component' && $field === 'params') ||
                        ($b['blockName'] === 'mbb/bibliography' &&
                            $field === 'entries' &&
                            is_array($attrs[$field])) ||
                        ($b['blockName'] === 'mbb/code-tabs' &&
                            $field === 'tabs' &&
                            is_array($attrs[$field])))
                ) {
                    $plain[$field] = $attrs[$field];
                    $attrs[$field] = '';
                }
            }
            $b['attrs'] = filter_block_kses_value($attrs, $allowed, $protocols, $b);
            foreach ($plain as $field => $value) {
                $b['attrs'][$field] = $value;
            }
            $b['innerBlocks'] = $walk($b['innerBlocks']);
        }
        return $blocks;
    };
    $filtered = serialize_blocks($walk(parse_blocks($text)));
    return preg_replace_callback(
        '/<!-- wp:mbb\/component (\{[\s\S]*?\}) -->/',
        static function ($m) use ($component_comments) {
            $attrs = json_decode($m[1], false, 32);
            return $component_comments[$attrs->id ?? ''] ?? $m[0];
        },
        $filtered,
    );
}
// Preserve only DOM-equivalent entity and void-element spelling after normal KSES.
function mbb_filter_paired_html($value)
{
    $filtered = wp_filter_post_kses($value);
    return mbb_html_normalize(wp_unslash($filtered)) === mbb_html_normalize(wp_unslash($value))
        ? $value
        : $filtered;
}
// Scope these exceptions to server-validated paired writes; preserve callback order and restore afterward.
function mbb_raw_source_filters(&$saved = null)
{
    global $wp_filter;
    $saved = [];
    foreach (['content_filtered_save_pre', 'content_save_pre', 'pre_kses'] as $tag) {
        foreach ($wp_filter[$tag]->callbacks ?? [] as $priority => $callbacks) {
            foreach ($callbacks as $key => $entry) {
                if (
                    $tag === 'content_filtered_save_pre' &&
                    in_array(
                        $entry['function'],
                        ['wp_filter_post_kses', 'wp_filter_global_styles_post'],
                        true,
                    )
                ) {
                    $plain = static function ($value) {
                        return $value;
                    };
                } elseif (
                    $tag === 'content_save_pre' &&
                    $entry['function'] === 'wp_filter_post_kses'
                ) {
                    $plain = 'mbb_filter_paired_html';
                } elseif (
                    $tag === 'pre_kses' &&
                    $entry['function'] === 'wp_pre_kses_block_attributes'
                ) {
                    $plain = 'mbb_kses_plain_block_sources';
                } else {
                    continue;
                }
                $saved[] = [$tag, $priority, $key, $entry, $plain];
                $wp_filter[$tag]->callbacks[$priority][$key]['function'] = $plain;
            }
        }
    }
    return $saved;
}
function mbb_restore_source_filters($saved)
{
    global $wp_filter;
    foreach ($saved as [$tag, $priority, $key, $entry, $plain]) {
        if (($wp_filter[$tag]->callbacks[$priority][$key]['function'] ?? null) === $plain) {
            $wp_filter[$tag]->callbacks[$priority][$key] = $entry;
        }
    }
}
function mbb_save($r, $cli_source_path = null, ?callable $new_document_provenance = null)
{
    if (
        !empty($GLOBALS['mbb_reference_transaction']) ||
        !empty($GLOBALS['mbb_reference_lifecycle'])
    ) {
        return mbb_error(
            'nested_save',
            mbb_t('A paired save cannot start inside a native save transaction.'),
            409,
        );
    }
    $result = mbb_save_core($r, $cli_source_path, $new_document_provenance);
    if (is_wp_error($result) && $result->get_error_code() === 'reference_connection_required') {
        return mbb_references_connection(
            fn() => mbb_save_core($r, $cli_source_path, $new_document_provenance),
        );
    }
    return $result;
}
function mbb_save_core($r, $cli_source_path = null, ?callable $new_document_provenance = null)
{
    global $wpdb;
    if (
        function_exists('mbb_references_request_touched') &&
        mbb_references_request_touched($r, absint($r['post_id']))
    ) {
        return mbb_references_connection(
            fn() => mbb_save_core($r, $cli_source_path, $new_document_provenance),
        );
    }
    if (!empty($GLOBALS['mbb_native_pair'])) {
        return mbb_error(
            'nested_save',
            mbb_t('A paired save cannot start inside a native save transaction.'),
            409,
        );
    }
    $id = absint($r['post_id']);
    $cli_source_sync =
        defined('WP_CLI') && WP_CLI && is_string($cli_source_path) && $cli_source_path !== '';
    if (
        $id &&
        get_post_meta($id, '_mbb_source_managed', true) === 'file' &&
        !$cli_source_sync &&
        empty($GLOBALS['mbb_source_web_write'])
    ) {
        return mbb_error(
            'source_managed',
            mbb_t(
                'This article is synchronized from a source file. Edit the source and run the synchronization tool; blocks and previews remain available here.',
            ),
            409,
        );
    }
    $docId = $id ? mbb_id($id) : $r['documentId'] ?? '';
    if (!is_string($docId) || !preg_match('/^[A-Za-z][A-Za-z0-9_-]{2,63}$/', $docId)) {
        return mbb_error('identity', mbb_t('The document ID is invalid.'), 422);
    }
    $source_lock =
        $id &&
        get_post_meta($id, '_mbb_source_managed', true) === 'file' &&
        ($cli_source_sync || !empty($GLOBALS['mbb_source_web_write']));
    $prefix = $source_lock ? '/mbb-source-locks-' : '/mbb-locks-';
    $dir = sys_get_temp_dir() . $prefix . hash('sha256', ABSPATH);
    if (!is_dir($dir)) {
        mkdir($dir, 0700, true);
    }
    $lock = fopen($dir . '/' . hash('sha256', $docId) . '.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
        return mbb_error('busy', mbb_t('Another save is in progress. Try again later.'));
    }
    $resource_context = null;
    try {
        if ($id) {
            clean_post_cache($id);
        }
        $ids = get_posts([
            'post_type' => ['post', 'page'],
            'post_status' => array_keys(get_post_stati()),
            'numberposts' => 2,
            'fields' => 'ids',
            'meta_query' => [
                'relation' => 'OR',
                ['key' => '_mbb_document_id', 'value' => $docId],
                ['key' => '_mbb_fixture_id', 'value' => $docId],
            ],
        ]);
        if (count($ids) > 1 || (!$id && $ids)) {
            return mbb_error(
                'duplicate',
                mbb_t('The document ID already exists. Continue editing the existing document.'),
            );
        }
        $c = mbb_candidate($r);
        if (is_wp_error($c)) {
            return $c;
        }
        if (
            function_exists('mbb_references_requires_connection') &&
            mbb_references_requires_connection($c['document'])
        ) {
            return mbb_error(
                'reference_connection_required',
                'Reference transaction required.',
                409,
            );
        }
        $adapter_confirm = mbb_block_adapter_confirm($r, $c);
        if (is_wp_error($adapter_confirm)) {
            return $adapter_confirm;
        }
        $receipt = mbb_frontmatter_verify_receipt($r, $c);
        if (is_wp_error($receipt)) {
            return $receipt;
        }
        try {
            $resource_context = mbb_resource_verify($r, $c);
        } catch (Throwable $e) {
            return mbb_resource_error($e);
        }
        $doc = $c['document'];
        if ($cli_source_sync) {
            clean_post_cache($id);
        }
        $p = $id ? get_post($id) : null;
        if (
            $cli_source_sync &&
            (!$p || !mbb_managed($id) || get_post_meta($id, '_mbb_source_managed', true) !== 'file')
        ) {
            return mbb_error(
                'conflict',
                mbb_t(
                    'The article or source binding identity changed. Verify it again before synchronization.',
                ),
            );
        }
        $source_backup = null;
        $source_target = null;
        try {
            $database_baseline = mbb_save_database_snapshot((int) $id);
        } catch (Throwable $error) {
            return mbb_error(
                'save_state_unavailable',
                mbb_t(
                    'The database save baseline could not be verified. Neither the article nor the source file was written.',
                ),
                500,
            );
        }
        if (
            function_exists('mbb_references_begin') &&
            !empty($GLOBALS['mbb_reference_connection'])
        ) {
            mbb_references_begin((int) $id, $doc, $r);
            $p = $id ? mbb_references_fresh_post($id) : null;
        }
        if ($p && get_post_meta($id, '_mbb_source_managed', true) === 'file') {
            if ($cli_source_sync) {
                if (!hash_equals((string) ($r['expected'] ?? ''), mbb_token($p))) {
                    return mbb_error(
                        'conflict',
                        mbb_t('The article has newer changes. Reload and merge them.'),
                    );
                }
                if (!mbb_cli_source_matches($id, $cli_source_path, $doc['source'])) {
                    return mbb_error(
                        'source_conflict',
                        mbb_t(
                            'The source binding or content changed. Read it again before synchronization.',
                        ),
                    );
                }
            } elseif (empty($GLOBALS['mbb_source_web_write'])) {
                return mbb_error(
                    'source_managed',
                    mbb_t(
                        'This article is synchronized from a source file. Use the controlled source write workflow.',
                    ),
                );
            } else {
                $source_target = mbb_source_target($p);
                if (is_wp_error($source_target)) {
                    return $source_target;
                }
                $current_source = mbb_source_fingerprint($source_target);
                if (is_wp_error($current_source)) {
                    return $current_source;
                }
                if (
                    !hash_equals((string) ($r['source_sha256'] ?? ''), $current_source['sha256']) ||
                    !hash_equals((string) ($r['expected'] ?? ''), mbb_token($p))
                ) {
                    return mbb_error(
                        'source_conflict',
                        mbb_t(
                            'The source file or article content changed. Read it again before confirming.',
                        ),
                    );
                }
                $source_backup = $current_source['contents'];
                $written = mbb_source_atomic_write($source_target, $doc['source']);
                if (is_wp_error($written)) {
                    return $written;
                }
            }
        }
        $term_cache = [];
        $GLOBALS['mbb_frontmatter_revision_ids'] = [];
        $transaction_started = false;
        $transaction_attempted = false;
        $commit_attempted = false;
        $raw_source_filters = [];
        try {
            if (
                $p &&
                !$resource_context &&
                $p->post_content === $doc['serialized'] &&
                $p->post_content_filtered === $doc['source'] &&
                $p->post_title === $c['title'] &&
                $p->post_status === $c['post_status'] &&
                (int) get_post_thumbnail_id($id) === $c['featured_media'] &&
                mbb_frontmatter_matches($id, $c['frontmatter_applied'])
            ) {
                return array_merge(mbb_state($id), ['noop' => true]);
            }
            $transaction_attempted = true;
            if (
                (function_exists('mbb_references_start_sql')
                    ? mbb_references_start_sql()
                    : $wpdb->query('START TRANSACTION')) === false
            ) {
                throw new RuntimeException(mbb_t('The save transaction could not be started'));
            }
            $transaction_started = true;
            if ($resource_context) {
                $GLOBALS['mbb_paired_save'] = false;
                $GLOBALS['mbb_pair_identity'] = null;
                // Attachment writes never inherit the main article's paired-save identity.
                $c = mbb_resource_media($resource_context, $r, $c);
                $doc = $c['document'];
            }
            $GLOBALS['mbb_paired_save'] = true;
            $GLOBALS['mbb_pair_identity'] = $docId;
            $raw_source_filters = mbb_raw_source_filters($raw_source_filters);
            add_filter('safe_style_css', 'mbb_safe_css');
            if ($resource_context && !$p) {
                $term_cache['category'] = [(int) get_option('default_category')];
            }
            foreach (['categories' => 'category', 'tags' => 'post_tag'] as $key => $taxonomy) {
                if (array_key_exists($key, $c['frontmatter_applied'])) {
                    $old = $p ? wp_get_object_terms($p->ID, $taxonomy, ['fields' => 'ids']) : [];
                    if (is_wp_error($old)) {
                        throw new RuntimeException(
                            mbb_t('The original categories or tags could not be read'),
                        );
                    }
                    $term_cache[$taxonomy] = array_values(
                        array_unique(
                            array_merge(
                                $term_cache[$taxonomy] ?? [],
                                array_map('intval', $old),
                                $c['frontmatter_applied'][$key],
                            ),
                        ),
                    );
                }
            }
            $before_revision = $p ? mbb_pair_snapshot($id) : 0;
            $revision_floor = $p
                ? max(array_merge([0], array_keys(wp_get_post_revisions($id))))
                : 0;
            $data = [
                'post_type' => $p ? $p->post_type : 'post',
                'post_status' => $c['post_status'],
                'post_title' => $c['title'],
                'post_content' => $doc['serialized'],
                'post_content_filtered' => $doc['source'],
            ];
            if (array_key_exists('excerpt', $c['frontmatter_applied'])) {
                $data['post_excerpt'] = $c['frontmatter_applied']['excerpt'];
            }
            if (array_key_exists('slug', $c['frontmatter_applied'])) {
                $data['post_name'] = $c['frontmatter_applied']['slug'];
            }
            if ($p) {
                $data['ID'] = $id;
                $data['edit_date'] = true;
                $data['post_date'] = $p->post_date;
                $data['post_date_gmt'] = $p->post_date_gmt;
            } else {
                $data['post_author'] = get_current_user_id();
            }
            $id = $p
                ? wp_update_post(wp_slash($data), true)
                : wp_insert_post(wp_slash($data), true);
            if (is_wp_error($id)) {
                throw new RuntimeException(mbb_t('WordPress save failed'));
            }
            if ($c['featured_media']) {
                if (
                    (int) get_post_thumbnail_id($id) !== $c['featured_media'] &&
                    !set_post_thumbnail($id, $c['featured_media'])
                ) {
                    throw new RuntimeException(mbb_t('Featured image save failed'));
                }
            } else {
                delete_post_thumbnail($id);
            }
            foreach (['categories' => 'category', 'tags' => 'post_tag'] as $key => $taxonomy) {
                if (array_key_exists($key, $c['frontmatter_applied'])) {
                    $set = wp_set_object_terms(
                        $id,
                        $c['frontmatter_applied'][$key],
                        $taxonomy,
                        false,
                    );
                    if (is_wp_error($set)) {
                        throw new RuntimeException(mbb_t('Category or tag save failed'));
                    }
                }
            }
            update_post_meta($id, '_mbb_origin', 'markdown_import');
            update_post_meta($id, '_mbb_document_id', $docId);
            // Internal new-document provenance participates in the same transaction;
            // it is never supplied by REST fields or run for an existing article.
            if (!$p && $new_document_provenance !== null) {
                $new_document_provenance($id, $docId);
            }
            $history = get_post_meta($id, '_mbb_source_history', true);
            if (!is_array($history)) {
                $history = [];
            }
            if ($p) {
                $history[] = hash('sha256', $p->post_content_filtered);
            }
            $history[] = hash('sha256', $doc['source']);
            update_post_meta(
                $id,
                '_mbb_source_history',
                array_slice(array_values(array_unique($history)), -100),
            );
            clean_post_cache($id);
            $saved = get_post($id);
            if (
                $saved->post_title !== $c['title'] ||
                !mbb_frontmatter_matches($id, $c['frontmatter_applied']) ||
                $saved->post_content !== $doc['serialized'] ||
                $saved->post_content_filtered !== $doc['source'] ||
                $saved->post_status !== $c['post_status'] ||
                (int) get_post_thumbnail_id($id) !== $c['featured_media'] ||
                $wpdb->last_error
            ) {
                throw new RuntimeException(mbb_t('Post-save content verification failed'));
            }
            $after_revision = mbb_pair_snapshot($id, $revision_floor);
            if ($resource_context) {
                $GLOBALS['mbb_paired_save'] = false;
                $GLOBALS['mbb_pair_identity'] = null;
                try {
                    mbb_resource_link($resource_context, $id);
                } finally {
                    $GLOBALS['mbb_paired_save'] = true;
                    $GLOBALS['mbb_pair_identity'] = $docId;
                }
            }
            if (
                !empty($c['revision_id']) &&
                !update_metadata(
                    'post',
                    $after_revision,
                    '_mbb_restored_from',
                    (int) $c['revision_id'],
                )
            ) {
                throw new RuntimeException(mbb_t('Restoration provenance could not be recorded'));
            }
            if (is_wp_error(mbb_block_adapter_confirm($r, $c))) {
                throw new RuntimeException(
                    mbb_t('Static block registrations changed during saving'),
                );
            }
            if (function_exists('mbb_references_provenance')) {
                mbb_references_provenance($r, (int) $id, $doc, (int) $after_revision);
            }
            if (function_exists('mbb_references_finish')) {
                mbb_references_finish((int) $id, $doc);
            }
            $commit_attempted = true;
            if ($wpdb->query('COMMIT') === false) {
                throw new RuntimeException(mbb_t('Transaction commit failed'));
            }
        } catch (Throwable $e) {
            $cached_revisions = $GLOBALS['mbb_frontmatter_revision_ids'] ?? [];
            try {
                $rollback_ok = !$transaction_attempted || $wpdb->query('ROLLBACK') !== false;
            } catch (Throwable $rollback_error) {
                $rollback_ok = false;
            }
            $rollback_certain =
                $rollback_ok &&
                (!$commit_attempted || mbb_save_rollback_confirmed((int) $id, $database_baseline));
            $source_restored = !$source_target || $source_backup === null || $rollback_certain;
            $resources_restored =
                !$resource_context || mbb_resource_compensate($resource_context, $rollback_certain);
            if ($source_target && $source_backup !== null && $rollback_certain) {
                $source_restored = mbb_save_restore_source(
                    $p,
                    $source_target,
                    $doc['source'],
                    $source_backup,
                );
            }
            // Cache hooks cannot prevent either rollback attempt. IDs are collected during revision creation.
            try {
                if (is_int($id)) {
                    foreach ($cached_revisions as $revision_id) {
                        wp_cache_delete($revision_id, 'posts');
                        wp_cache_delete($revision_id, 'post_meta');
                    }
                    if ($c['frontmatter_applied'] || $resource_context) {
                        foreach ($term_cache as $taxonomy => $term_ids) {
                            clean_term_cache($term_ids, $taxonomy);
                        }
                        clean_object_term_cache($id, $p->post_type ?? 'post');
                    }
                    clean_post_cache($id);
                }
            } catch (Throwable $cache_error) {
                foreach ($term_cache as $taxonomy => $term_ids) {
                    foreach ($term_ids as $term_id) {
                        wp_cache_delete($term_id, 'terms');
                    }
                    wp_cache_delete($id, $taxonomy . '_relationships');
                }
            }
            if (($c['frontmatter_applied'] || $resource_context) && is_int($id)) {
                wp_cache_delete($id, 'posts');
                wp_cache_delete($id, 'post_meta');
                wp_cache_set_posts_last_changed();
                wp_cache_set_terms_last_changed();
            }
            if ($commit_attempted && !$rollback_certain) {
                return mbb_error(
                    'commit_uncertain',
                    mbb_t(
                        'The commit result could not be reliably confirmed. Current source, media, and import records are preserved. Verify the article before importing again.',
                    ),
                    500,
                );
            }
            if (!$rollback_ok) {
                return mbb_error(
                    'rollback_failed',
                    $source_restored
                        ? mbb_t(
                            'Database rollback failed; the save state is uncertain. Verify the article.',
                        )
                        : mbb_t(
                            'Database and source file rollback both failed. Verify both representations.',
                        ),
                    500,
                );
            }
            if (!$source_restored) {
                return mbb_error(
                    'source_restore_failed',
                    mbb_t(
                        'The database was rolled back, but the source file could not be restored.',
                    ),
                    500,
                );
            }
            if (!$resources_restored) {
                return mbb_error(
                    'resource_cleanup_failed',
                    mbb_t(
                        'The database was rolled back, but some newly created media could not be removed. Verify the import state.',
                    ),
                    500,
                );
            }
            // A rejected claim is a normal conflict once every write has rolled back.
            // Uncertain commit or failed compensation above must retain their stronger errors.
            if ($e instanceof MBB_Reference_Failure) {
                return mbb_references_error($e);
            }
            return $transaction_started
                ? mbb_error(
                    'save_failed',
                    mbb_t('Saving did not complete and was rolled back.'),
                    500,
                )
                : mbb_error(
                    'transaction',
                    mbb_t(
                        'The save transaction did not start; the source file was restored. The source was not saved.',
                    ),
                    500,
                );
        } finally {
            remove_filter('safe_style_css', 'mbb_safe_css');
            mbb_restore_source_filters($raw_source_filters);
            $GLOBALS['mbb_paired_save'] = false;
            $GLOBALS['mbb_pair_identity'] = null;
            $GLOBALS['mbb_source_web_write'] = false;
            unset($GLOBALS['mbb_frontmatter_revision_ids']);
        }
        if ($resource_context) {
            mbb_resource_complete($resource_context);
        }
        return array_merge(mbb_state($id), [
            'noop' => false,
            'before_revision' => $before_revision,
            'saved_revision' => $after_revision,
            'restored_from' => $c['revision_id'] ?? null,
        ]);
    } finally {
        if ($resource_context) {
            mbb_resource_release($resource_context);
        }
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
add_action('rest_api_init', function () {
    register_rest_route('mbb/v1', '/document', [
        'methods' => 'GET',
        'permission_callback' => 'mbb_permission',
        'callback' => function ($r) {
            if (!$r['post_id']) {
                return mbb_error('id', mbb_t('The article ID is missing.'), 422);
            }
            return mbb_state(absint($r['post_id']));
        },
    ]);
    register_rest_route('mbb/v1', '/source', [
        'methods' => 'GET',
        'permission_callback' => 'mbb_permission',
        'callback' => function ($r) {
            $id = absint($r['post_id']);
            $p = get_post($id);
            if (!$p || get_post_meta($id, '_mbb_source_managed', true) !== 'file') {
                return mbb_error(
                    'source_managed',
                    mbb_t('This article has no writable source file binding.'),
                    409,
                );
            }
            $target = mbb_source_target($p);
            if (is_wp_error($target)) {
                return $target;
            }
            $fingerprint = mbb_source_fingerprint($target);
            if (is_wp_error($fingerprint)) {
                return $fingerprint;
            }
            return [
                'post_id' => $id,
                'expected' => mbb_token($p),
                'source_sha256' => $fingerprint['sha256'],
                'source' => $fingerprint['contents'],
            ];
        },
    ]);
    register_rest_route('mbb/v1', '/preview', [
        'methods' => 'POST',
        'permission_callback' => 'mbb_permission',
        'callback' => 'mbb_preview',
    ]);
    register_rest_route('mbb/v1', '/source-save', [
        'methods' => 'POST',
        'permission_callback' => 'mbb_source_write_permission',
        'callback' => function ($r) {
            $id = absint($r['post_id']);
            $p = get_post($id);
            if (!$p || get_post_meta($id, '_mbb_source_managed', true) !== 'file') {
                return mbb_error(
                    'source_managed',
                    mbb_t('This article has no writable source file binding.'),
                    409,
                );
            }
            if (!is_string($r['source'] ?? null) || !is_string($r['source_sha256'] ?? null)) {
                return mbb_error(
                    'source_input',
                    mbb_t('Source file content or its version fingerprint is missing.'),
                    422,
                );
            }
            $target = mbb_source_target($p);
            if (is_wp_error($target)) {
                mbb_source_record_audit($id, [
                    'source_sha256_before' => null,
                    'source_sha256_after' => null,
                    'result' => 'failed',
                    'code' => $target->get_error_code(),
                ]);
                return $target;
            }
            $current = mbb_source_fingerprint($target);
            if (is_wp_error($current)) {
                mbb_source_record_audit($id, [
                    'source_sha256_before' => null,
                    'source_sha256_after' => null,
                    'result' => 'failed',
                    'code' => $current->get_error_code(),
                ]);
                return $current;
            }
            if (!hash_equals($r['source_sha256'], $current['sha256'])) {
                $error = mbb_error(
                    'source_conflict',
                    mbb_t('The source file changed. Read it again before confirming.'),
                );
                mbb_source_record_audit($id, [
                    'source_sha256_before' => $current['sha256'],
                    'source_sha256_after' => null,
                    'result' => 'failed',
                    'code' => $error->get_error_code(),
                ]);
                return $error;
            }
            $GLOBALS['mbb_source_web_write'] = true;
            try {
                $result = mbb_save($r);
            } catch (Throwable $e) {
                $result = mbb_error(
                    'source_save_failed',
                    mbb_t('Neither the source file nor the paired article was saved.'),
                    500,
                );
            } finally {
                $GLOBALS['mbb_source_web_write'] = false;
                unset($GLOBALS['mbb_frontmatter_revision_ids']);
            }
            if (is_wp_error($result)) {
                mbb_source_record_audit($id, [
                    'source_sha256_before' => $current['sha256'],
                    'source_sha256_after' => null,
                    'result' => 'failed',
                    'code' => $result->get_error_code(),
                ]);
                return $result;
            }
            mbb_source_record_audit($id, [
                'source_sha256_before' => $current['sha256'],
                'source_sha256_after' => hash('sha256', $r['source']),
                'result' => 'saved',
            ]);
            return $result;
        },
    ]);
    register_rest_route('mbb/v1', '/source-audit', [
        'methods' => 'GET',
        'permission_callback' => 'mbb_source_audit_permission',
        'callback' => function ($r) {
            $id = absint($r['post_id']);
            return [
                'post_id' => $id,
                'document_id' => mbb_id($id),
                'audit' => get_post_meta($id, '_mbb_source_web_audit', true) ?: null,
            ];
        },
    ]);
    register_rest_route('mbb/v1', '/save', [
        'methods' => 'POST',
        'permission_callback' => 'mbb_permission',
        'callback' => 'mbb_save',
    ]);
});
add_filter(
    'rest_post_dispatch',
    function ($response, $server, $r) {
        if (str_starts_with($r->get_route(), '/mbb/v1/')) {
            $response = rest_ensure_response($response);
            $response->header('Cache-Control', 'private, no-store');
        }
        return $response;
    },
    10,
    3,
);
require_once __DIR__ . '/native-rest-save.php';
add_filter(
    'wp_insert_post_empty_content',
    function ($empty, $data) {
        if (!empty($GLOBALS['mbb_paired_save'])) {
            return $empty;
        }
        $id = absint($data['ID'] ?? 0);
        $parent = absint($data['post_parent'] ?? 0);
        if (
            ($id && mbb_managed($id)) ||
            (($data['post_type'] ?? '') === 'revision' && $parent && mbb_managed($parent))
        ) {
            return true;
        }
        return $empty;
    },
    10,
    2,
);
add_filter('_wp_post_revision_fields', function ($fields) {
    $fields['post_content_filtered'] = mbb_t('Markdown source');
    return $fields;
});
add_action('admin_menu', function () {
    add_management_page(
        mbb_t('Markdown editing bridge'),
        mbb_t('Markdown editing bridge'),
        'edit_posts',
        'mbb-editor',
        function () {
            if (($_GET['view'] ?? '') === 'collections') {
                mbb_collections_page();
                return;
            }
            echo '<p><a class="button" href="' .
                esc_url(admin_url('tools.php?page=mbb-editor&view=collections')) .
                '">' .
                esc_html(mbb_t('Collections')) .
                '</a></p>';
            echo mbb_t(
                '<div class="wrap"><h1>Markdown editing bridge</h1><p>Upload Markdown for editing in both representations. Preview differences before saving, publishing, or submitting for review. Set a featured image before publishing.</p><p><button class="button button-primary" id="mbb-new">Upload a new document</button></p><ul>',
            );
            echo '<li><button class="button" id="mbb-batch-new">' .
                esc_html(mbb_t('Batch import drafts')) .
                '</button></li>';
            $page = max(1, absint($_GET['mbb_page'] ?? 1));
            $posts = get_posts([
                'post_type' => 'post',
                'post_status' => array_values(
                    array_diff(array_keys(get_post_stati()), ['trash', 'auto-draft']),
                ),
                'numberposts' => 101,
                'offset' => ($page - 1) * 100,
                'orderby' => ['date' => 'DESC', 'ID' => 'DESC'],
                'author' => current_user_can('edit_others_posts') ? '' : get_current_user_id(),
                'meta_key' => '_mbb_origin',
                'meta_value' => 'markdown_import',
            ]);
            foreach (array_slice($posts, 0, 100) as $p) {
                if (current_user_can('edit_post', $p->ID)) {
                    echo '<li><a href="' .
                        esc_url(get_edit_post_link($p->ID)) .
                        '">' .
                        esc_html($p->post_title) .
                        '</a> <button class="button mbb-open" data-post="' .
                        (int) $p->ID .
                        mbb_t(
                            '">Edit Markdown</button> <button class="button mbb-history" data-post="',
                        ) .
                        (int) $p->ID .
                        mbb_t(
                            '">Revisions / restore</button> <button class="button mbb-export" data-post="',
                        ) .
                        (int) $p->ID .
                        mbb_t('">Export saved article</button></li>');
                }
            }
            echo '</ul><nav aria-label="' . esc_attr(mbb_t('Document pagination')) . '">';
            if ($page > 1) {
                echo '<a href="' .
                    esc_url(admin_url('tools.php?page=mbb-editor&mbb_page=' . ($page - 1))) .
                    mbb_t('">Previous page</a> ');
            }
            if (count($posts) > 100) {
                echo '<a href="' .
                    esc_url(admin_url('tools.php?page=mbb-editor&mbb_page=' . ($page + 1))) .
                    mbb_t('">Next page</a>');
            }
            echo '</nav></div>';
        },
    );
});
function mbb_enqueue_ui()
{
    $id = absint($_GET['post'] ?? 0);
    if (!current_user_can('edit_posts') && (!$id || !current_user_can('edit_post', $id))) {
        return;
    }
    $screen = get_current_screen();
    $tool = $screen && $screen->id === 'tools_page_mbb-editor';
    if ($id && !current_user_can('edit_post', $id)) {
        return;
    }
    $post_screen =
        ($screen && in_array($screen->base, ['post', 'post-new'], true)) ||
        basename($_SERVER['PHP_SELF'] ?? '') === 'post-new.php';
    $new_post = !$id && $post_screen;
    if (!$tool && (!$post_screen || (!$new_post && !mbb_managed($id)))) {
        return;
    }
    if ($tool) {
        mbb_enqueue_kernel(true);
        wp_enqueue_style(
            'mbb-batch-ui',
            plugins_url(mbb_asset('batch-ui.css'), __FILE__),
            [],
            substr(hash_file('sha256', __DIR__ . '/batch-ui.css'), 0, 12),
        );
        wp_enqueue_script(
            'mbb-batch-ui',
            plugins_url(mbb_asset('batch-ui.js'), __FILE__),
            ['mbb-editor-ui', 'mbb-source-tools', 'mbb-math'],
            substr(hash_file('sha256', __DIR__ . '/batch-ui.js'), 0, 12),
            true,
        );
    }
    wp_enqueue_script(
        'mbb-resource-ui',
        plugins_url(mbb_asset('resource-ui.js'), __FILE__),
        [],
        substr(hash_file('sha256', __DIR__ . '/resource-ui.js'), 0, 12),
        true,
    );
    wp_enqueue_script(
        'mbb-source-tools',
        plugins_url(mbb_asset('source-tools.js'), __FILE__),
        [],
        substr(hash_file('sha256', __DIR__ . '/source-tools.js'), 0, 12),
        true,
    );
    wp_enqueue_script(
        'mbb-writing-ui',
        plugins_url(mbb_asset('writing-ui.js'), __FILE__),
        ['mbb-kernel', 'mbb-references-ui'],
        substr(hash_file('sha256', __DIR__ . '/writing-ui.js'), 0, 12),
        true,
    );
    wp_enqueue_script(
        'mbb-editor-ui',
        plugins_url(mbb_asset('editor-ui.js'), __FILE__),
        [
            'wp-data',
            'wp-blocks',
            'wp-api-fetch',
            'mbb-math',
            'mbb-resource-ui',
            'mbb-kernel',
            'mbb-source-tools',
            'mbb-writing-ui',
        ],
        substr(hash_file('sha256', __DIR__ . '/editor-ui.js'), 0, 12),
        true,
    );
    wp_enqueue_script(
        'mbb-revisions-ui',
        plugins_url('revisions-ui.js', __FILE__),
        ['mbb-editor-ui'],
        substr(hash_file('sha256', __DIR__ . '/revisions-ui.js'), 0, 12),
        true,
    );
    wp_localize_script('mbb-editor-ui', 'MBB_EDITOR', [
        'root' => rest_url('mbb/v1'),
        'nonce' => wp_create_nonce('wp_rest'),
        'postId' => $tool ? 0 : $id,
        'newPost' => $new_post && !$tool,
        'canPublish' => current_user_can(
            $id && get_post_type($id) === 'page' ? 'publish_pages' : 'publish_posts',
        ),
        'state' => $tool || $new_post ? null : mbb_state($id),
        'footnoteStyle' => file_get_contents(__DIR__ . '/footnotes.css'),
        'teachingStyle' => file_get_contents(__DIR__ . '/teaching.css'),
        'technicalStyle' => file_get_contents(__DIR__ . '/technical.css'),
        'nativeMediaStyle' => file_get_contents(__DIR__ . '/media-presentation.css'),
        'codeDisplayStyle' => file_get_contents(__DIR__ . '/code-display.css'),
        'navigationBridge' => [
            'script' => file_get_contents(__DIR__ . '/preview-navigation.js'),
            'sha256' => base64_encode(
                hash_file('sha256', __DIR__ . '/preview-navigation.js', true),
            ),
        ],
        'supportedBlocks' => array_merge(
            array_keys(
                json_decode(
                    file_get_contents(__DIR__ . '/includes/php-converter/block-capabilities.json'),
                    true,
                ),
            ),
            mbb_block_adapter_names(),
        ),
        'sourceFontSize' => mbb_display_preferences()['source_font_size'],
        'recovery' => mbb_recovery_config(),
        'resources' => mbb_resource_config(),
        'exports' => mbb_export_config(),
    ]);
    wp_enqueue_script(
        'mbb-static-code',
        plugins_url(mbb_asset('static-code.js'), __FILE__),
        [],
        substr(hash_file('sha256', __DIR__ . '/static-code.js'), 0, 12),
        true,
    );
    wp_add_inline_script(
        'mbb-static-code',
        'window.MBB_STATIC_CODE=' .
            wp_json_encode([
                'core' => plugins_url('vendor/prism/components/prism-core.min.js', __FILE__),
                'autoloader' => plugins_url(
                    'vendor/prism/plugins/autoloader/prism-autoloader.min.js',
                    __FILE__,
                ),
                'languages' => plugins_url('vendor/prism/components/', __FILE__),
                'known' => mbb_code_languages(),
            ]) .
            ';',
        'before',
    );
    wp_enqueue_script(
        'mbb-static-export',
        plugins_url(mbb_asset('static-export.js'), __FILE__),
        ['mbb-math', 'mbb-static-code'],
        substr(hash_file('sha256', __DIR__ . '/static-export.js'), 0, 12),
        true,
    );
    wp_enqueue_script(
        'mbb-export-ui',
        plugins_url(mbb_asset('export-ui.js'), __FILE__),
        ['mbb-editor-ui', 'mbb-static-export'],
        substr(hash_file('sha256', __DIR__ . '/export-ui.js'), 0, 12),
        true,
    );
    wp_enqueue_script(
        'mbb-local-recovery',
        plugins_url(mbb_asset('local-recovery.js'), __FILE__),
        ['mbb-editor-ui'],
        substr(hash_file('sha256', __DIR__ . '/local-recovery.js'), 0, 12),
        true,
    );
    wp_enqueue_script(
        'mbb-paired-backups',
        plugins_url(mbb_asset('paired-backups.js'), __FILE__),
        ['mbb-local-recovery'],
        substr(hash_file('sha256', __DIR__ . '/paired-backups.js'), 0, 12),
        true,
    );
    wp_enqueue_style(
        'mbb-editor-ui',
        plugins_url(mbb_asset('editor-ui.css'), __FILE__),
        [],
        substr(hash_file('sha256', __DIR__ . '/editor-ui.css'), 0, 12),
    );
    wp_enqueue_style(
        'mbb-footnotes',
        plugins_url(mbb_asset('footnotes.css'), __FILE__),
        [],
        substr(hash_file('sha256', __DIR__ . '/footnotes.css'), 0, 12),
    );
}
add_action('admin_enqueue_scripts', 'mbb_enqueue_ui');
add_action('enqueue_block_editor_assets', 'mbb_enqueue_ui');
add_action('admin_footer-post-new.php', 'mbb_enqueue_ui');

require_once __DIR__ . '/local-recovery.php';
require_once __DIR__ . '/paired-backups.php';
require_once __DIR__ . '/lifecycle.php';
