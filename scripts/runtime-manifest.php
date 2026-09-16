<?php
// CLI only: export core script paths, never editor HTML, settings, cookies or nonces.
if (!defined('WP_CLI') || !WP_CLI) {
    exit();
}
$scripts = wp_scripts();
$scripts->all_deps(['wp-block-library']);
$paths = [];
foreach ($scripts->to_do as $handle) {
    $source = $scripts->registered[$handle]->src;
    if (!$source || $handle === 'editor') {
        continue;
    }
    $path = parse_url($source, PHP_URL_PATH);
    $relative = str_starts_with($path, '/wp-includes/js/') ? $path : null;
    if (!$relative || !is_file(ABSPATH . ltrim($relative, '/'))) {
        throw new RuntimeException('Non-core script dependency: ' . $handle);
    }
    $paths[] = $relative;
}
echo wp_json_encode(['wordpress' => get_bloginfo('version'), 'scripts' => $paths]);
