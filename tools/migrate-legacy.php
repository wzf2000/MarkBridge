<?php
// CLI-only explicit plan. No HTTP route. Source and public meaning are pre-audited in the plan.
if (!defined('WP_CLI') || !WP_CLI) {
    throw new Exception('CLI only');
}
function mbb_migration_fingerprint($p)
{
    return hash(
        'sha256',
        serialize([
            $p->post_content,
            $p->post_content_filtered,
            $p->post_modified_gmt,
            $p->post_status,
        ]),
    );
}
function mbb_migration_html_math($blocks)
{
    foreach ($blocks as $b) {
        if ($b['blockName'] === 'core/html') {
            $d = new DOMDocument();
            $prev = libxml_use_internal_errors(true);
            $d->loadHTML('<?xml encoding="UTF-8"?><div>' . $b['innerHTML'] . '</div>');
            libxml_clear_errors();
            libxml_use_internal_errors($prev);
            $x = new DOMXPath($d);
            foreach (iterator_to_array($x->query('//pre|//code|//span[@data-mbb-tex]')) as $node) {
                $node->parentNode->removeChild($node);
            }
            if (preg_match('/(?<!\\\\)\$[^$\r\n]+\$|\$\$/', $d->textContent)) {
                return true;
            }
        }
        if (mbb_migration_html_math($b['innerBlocks'])) {
            return true;
        }
    }
    return false;
}
function mbb_migrate_legacy($row, $verified_document = null)
{
    global $wpdb;
    $id = (int) $row['id'];
    $p = get_post($id);
    if (!$p || !in_array($p->post_type, ['post', 'page'], true) || mbb_managed($id)) {
        throw new Exception('Wrong origin ' . $id);
    }
    if (get_post_meta($id, '_llm_document_id', true) && empty($row['external'])) {
        throw new Exception('LLM source owner required');
    }
    if (mbb_migration_fingerprint($p) !== $row['fingerprint']) {
        throw new Exception('Conflict ' . $id);
    }
    $document_id = $row['document_id'] ?? 'legacy-post-' . $id;
    $doc =
        $verified_document ??
        mbb_convert([
            'mode' => 'markdown',
            'source' => $row['source'],
            'documentId' => $document_id,
        ]);
    if (is_wp_error($doc)) {
        throw new Exception($doc->get_error_message());
    }
    if (
        $doc['source'] !== $row['source'] ||
        $doc['documentId'] !== $document_id ||
        $doc['serialized'] !== $row['serialized'] ||
        !mbb_html_allowed(parse_blocks($doc['serialized'])) ||
        mbb_migration_html_math(parse_blocks($doc['serialized']))
    ) {
        throw new Exception('Conversion or policy changed ' . $id);
    }
    $keep = [
        $p->post_title,
        $p->post_status,
        $p->post_author,
        $p->post_name,
        $p->post_date,
        $p->post_excerpt,
        $p->post_password,
        $p->comment_status,
        $p->ping_status,
        get_post_thumbnail_id($id),
        wp_get_post_categories($id),
        wp_get_post_tags($id, ['fields' => 'ids']),
    ];
    $wpdb->query('START TRANSACTION');
    $wpdb->get_var($wpdb->prepare("SELECT ID FROM {$wpdb->posts} WHERE ID=%d FOR UPDATE", $id));
    clean_post_cache($id);
    try {
        if (mbb_migration_fingerprint(get_post($id)) !== $row['fingerprint']) {
            throw new Exception('Concurrent edit ' . $id);
        }
        $before = wp_save_post_revision($id);
        if (!$before) {
            $before = _wp_put_post_revision($p);
        }
        if (is_wp_error($before)) {
            throw new Exception('Legacy revision failed');
        }
        $GLOBALS['mbb_migrating'] = true;
        $GLOBALS['mbb_paired_save'] = true;
        $GLOBALS['mbb_pair_identity'] = $doc['documentId'];
        $raw_filters = mbb_raw_source_filters();
        add_filter('safe_style_css', 'mbb_safe_css');
        if (!empty($row['external'])) {
            update_post_meta($id, '_mbb_source_managed', 'file');
            update_post_meta($id, '_mbb_source_path_hash', $row['source_path_hash']);
        }
        $result = wp_update_post(
            wp_slash([
                'ID' => $id,
                'edit_date' => true,
                'post_date' => $p->post_date,
                'post_date_gmt' => $p->post_date_gmt,
                'post_content' => $doc['serialized'],
                'post_content_filtered' => $doc['source'],
            ]),
            true,
        );
        if (is_wp_error($result)) {
            throw new Exception('Save failed');
        }
        delete_post_meta($id, '_wpcom_is_markdown');
        update_post_meta($id, '_mbb_origin', 'markdown_import');
        update_post_meta($id, '_mbb_document_id', $doc['documentId']);
        update_post_meta($id, '_mbb_source_history', [hash('sha256', $doc['source'])]);
        update_post_meta($id, '_mbb_legacy_migration', [
            'schema' => 1,
            'before' => $row['fingerprint'],
            'legacy_revision' => (int) $before,
            'date' => gmdate('c'),
        ]);
        clean_post_cache($id);
        $p = get_post($id);
        $after = [
            $p->post_title,
            $p->post_status,
            $p->post_author,
            $p->post_name,
            $p->post_date,
            $p->post_excerpt,
            $p->post_password,
            $p->comment_status,
            $p->ping_status,
            get_post_thumbnail_id($id),
            wp_get_post_categories($id),
            wp_get_post_tags($id, ['fields' => 'ids']),
        ];
        if (
            $keep !== $after ||
            $p->post_content !== $doc['serialized'] ||
            $p->post_content_filtered !== $doc['source'] ||
            $wpdb->last_error
        ) {
            throw new Exception(
                'Post-save invariant failed ' .
                    $id .
                    ' ' .
                    wp_json_encode([
                        'attributes_equal' => $keep === $after,
                        'blocks_equal' => $p->post_content === $doc['serialized'],
                        'source_equal' => $p->post_content_filtered === $doc['source'],
                        'database_error' => (bool) $wpdb->last_error,
                        'changed_attribute_indexes' => array_keys(
                            array_filter(
                                $keep,
                                fn($v, $k) => $v !== $after[$k],
                                ARRAY_FILTER_USE_BOTH,
                            ),
                        ),
                    ]),
            );
        }
        if (function_exists('llmn_refresh')) {
            llmn_refresh($id);
        }
        if (!empty($row['registry_ids'])) {
            $reg = get_post_meta($id, '_llm_block_registry', true);
            $active = array_column(
                array_filter(is_array($reg) ? $reg : [], fn($b) => $b['active']),
                'id',
            );
            $lost = array_values(array_diff($row['registry_ids'], $active));
            $unexpected = $lost;
            foreach ($row['allowed_registry_splits'] ?? [] as $old_id => $parts) {
                if (!in_array($old_id, $lost, true)) {
                    continue;
                }
                $texts = array_column(
                    array_values(array_filter($reg, fn($b) => $b['active'])),
                    'text',
                );
                $exact = false;
                for ($j = 0; $j < count($texts) - 1; $j++) {
                    if (array_slice($texts, $j, 2) === $parts) {
                        $exact = true;
                    }
                }
                if (!$exact) {
                    throw new Exception('Formula split changed ' . $id);
                }
                foreach (
                    get_posts([
                        'post_type' => 'llm_note',
                        'post_status' => array_keys(get_post_stati()),
                        'posts_per_page' => -1,
                    ])
                    as $note
                ) {
                    $data = get_post_meta($note->ID, '_llm_note_data', true);
                    if (
                        (int) ($data['post_id'] ?? 0) === $id &&
                        ($data['block_id'] ?? '') === $old_id
                    ) {
                        throw new Exception(
                            'Existing note on split formula; review required ' . $id,
                        );
                    }
                }
                $unexpected = array_values(array_diff($unexpected, [$old_id]));
            }
            if ($unexpected) {
                throw new Exception(
                    'Registry IDs changed ' . $id . ' ' . wp_json_encode($unexpected),
                );
            }
        }
        $revision = mbb_pair_snapshot($id);
        $wpdb->query('COMMIT');
        return [
            'id' => $id,
            'retired_formula_groups' => array_keys($row['allowed_registry_splits'] ?? []),
            'before' => $row['fingerprint'],
            'after' => mbb_migration_fingerprint($p),
            'source_sha256' => hash('sha256', $doc['source']),
            'blocks_sha256' => hash('sha256', $doc['serialized']),
            'revision' => $revision,
            'status' => $p->post_status,
        ];
    } catch (Throwable $e) {
        $wpdb->query('ROLLBACK');
        clean_post_cache($id);
        throw $e;
    } finally {
        if (isset($raw_filters)) {
            mbb_restore_source_filters($raw_filters);
        }
        remove_filter('safe_style_css', 'mbb_safe_css');
        $GLOBALS['mbb_migrating'] = false;
        $GLOBALS['mbb_paired_save'] = false;
        $GLOBALS['mbb_pair_identity'] = null;
    }
}
if (($args[0] ?? '') === 'run') {
    $plan = json_decode(file_get_contents($args[1]), true);
    $out = $args[2];
    $rows = [];
    wp_set_current_user(1);
    foreach ($plan as $row) {
        $rows[] = mbb_migrate_legacy($row);
        file_put_contents($out, wp_json_encode($rows));
    }
    echo count($rows) . ' posts migrated';
}
