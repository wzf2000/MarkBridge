<?php
/** Physical callback file for the explicitly owned CLI projection-permission fixture. */
if (PHP_SAPI !== 'cli' || !defined('WP_CLI') || !WP_CLI) {
    exit(1);
}
function ap_revoke_renderer(object $params, array $context): array
{
    $tree = mbbtc_replay_projection($params, $context);
    wp_set_current_user(0);
    return $tree;
}
