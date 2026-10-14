<?php

// Standalone CLI conversion and model tests remain supported; direct web access requires WordPress.
if (!defined('ABSPATH')) {
    if (PHP_SAPI !== 'cli') {
        exit();
    }
}

// Direct database observations distinguish a rollback from an ambiguous COMMIT acknowledgement.
// Never include these snapshots in API responses or persistent recovery storage.
function mbb_save_database_snapshot(int $id): array
{
    global $wpdb;
    if (!$id) {
        return ['post' => null, 'meta' => [], 'terms' => []];
    }
    $post = $wpdb->get_row(
        $wpdb->prepare("SELECT * FROM {$wpdb->posts} WHERE ID = %d", $id),
        ARRAY_A,
    );
    if ($wpdb->last_error) {
        throw new RuntimeException('Cannot inspect saved database state');
    }
    $meta = $wpdb->get_results(
        $wpdb->prepare(
            "SELECT meta_key, meta_value FROM {$wpdb->postmeta} WHERE post_id = %d ORDER BY meta_key, meta_value LIMIT 1001",
            $id,
        ),
        ARRAY_A,
    );
    if ($wpdb->last_error || !is_array($meta) || count($meta) > 1000) {
        throw new RuntimeException('Cannot inspect saved metadata');
    }
    $terms = $wpdb->get_results(
        $wpdb->prepare(
            "SELECT term_taxonomy_id, term_order FROM {$wpdb->term_relationships} WHERE object_id = %d ORDER BY term_taxonomy_id LIMIT 1001",
            $id,
        ),
        ARRAY_A,
    );
    if ($wpdb->last_error || !is_array($terms) || count($terms) > 1000) {
        throw new RuntimeException('Cannot inspect saved taxonomy state');
    }
    return ['post' => $post, 'meta' => $meta, 'terms' => $terms];
}
function mbb_save_rollback_confirmed(int $id, ?array $baseline): bool
{
    if ($baseline === null) {
        return false;
    }
    try {
        return mbb_save_database_snapshot($id) === $baseline;
    } catch (Throwable $error) {
        return false;
    }
}
function mbb_save_restore_source($post, string $target, string $written, string $backup): bool
{
    // A failed save does not authorize overwriting a changed binding or a third-party edit.
    try {
        clean_post_cache((int) $post->ID);
        wp_cache_delete((int) $post->ID, 'post_meta');
        $post = get_post((int) $post->ID);
        if (!$post) {
            return false;
        }
        if (mbb_source_target($post) !== $target) {
            return false;
        }
        $fresh = mbb_source_fingerprint($target);
        if (is_wp_error($fresh) || !hash_equals(hash('sha256', $written), $fresh['sha256'])) {
            return false;
        }
        return !is_wp_error(mbb_source_atomic_write($target, $backup));
    } catch (Throwable $error) {
        return false;
    }
}
