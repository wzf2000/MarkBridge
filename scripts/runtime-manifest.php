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
    $paths[$relative] = hash_file('sha256', ABSPATH . ltrim($relative, '/'));
}
// Native math authoring needs a core ES module and the format registration script.
// Copy these browser-only assets without executing them in the conversion bootstrap.
$browser_assets = [
    '/wp-includes/js/dist/script-modules/latex-to-mathml/index.js',
    '/wp-includes/js/dist/format-library.min.js',
];
foreach ($browser_assets as $module) {
    if (!is_file(ABSPATH . ltrim($module, '/'))) {
        throw new RuntimeException('Core native math module is missing.');
    }
    $paths[$module] = hash_file('sha256', ABSPATH . ltrim($module, '/'));
}
echo wp_json_encode([
    'format' => 1,
    'wordpress' => get_bloginfo('version'),
    'scripts' => array_values(array_diff(array_keys($paths), $browser_assets)),
    'browser_assets' => $browser_assets,
    'core_sha256' => $paths,
    'public_roots' => array_values(
        array_filter([
            realpath(ABSPATH),
            realpath(WP_CONTENT_DIR),
            realpath(wp_upload_dir(null, false)['basedir']),
        ]),
    ),
]);
