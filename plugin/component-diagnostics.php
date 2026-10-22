<?php

// Standalone CLI conversion and model tests remain supported; direct web access requires WordPress.
if (!defined('ABSPATH')) {
    if (PHP_SAPI !== 'cli') {
        exit();
    }
}

require_once __DIR__ . '/includes/i18n.php';
// Administrator-only, read-only extension status. Never expose local resource paths.
function mbb_component_diagnostics(): array
{
    return [
        'protocolVersion' => 1,
        'protocolVersions' => [1, 2],
        'limits' => ['activeRuns' => 2, 'previewFrames' => 4, 'paramsBytes' => 16384],
        'providers' => array_values(
            array_map(
                static fn($p) => array_intersect_key(
                    $p,
                    array_flip([
                        'id',
                        'title',
                        'version',
                        'protocolVersion',
                        'minMarkBridge',
                        'status',
                        'budgets',
                    ]),
                ),
                mbb_component_registry(),
            ),
        ),
        'rejections' => $GLOBALS['mbb_component_rejections'] ?? [],
    ];
}
function mbb_component_diagnostics_page(): void
{
    if (!current_user_can('manage_options')) {
        return;
    }
    $report = mbb_component_diagnostics();
    echo mbb_t(
        '<div class="wrap"><h1>MarkBridge teaching extensions</h1><p>Read-only diagnostics: fixed local resources and public data-only parameters. At most 2 active executions and 4 previews; parameters are limited to 16 KiB. Static content and configuration are preserved when an extension is disabled.</p><table class="widefat striped"><thead><tr><th>Component</th><th>Version / protocol / minimum MarkBridge</th><th>Status</th><th>Budgets</th></tr></thead><tbody>',
    );
    foreach ($report['providers'] as $p) {
        echo '<tr><td>' .
            esc_html($p['id'] . ' · ' . $p['title']) .
            '</td><td>' .
            esc_html($p['version'] . ' / ' . $p['protocolVersion'] . ' / ' . $p['minMarkBridge']) .
            '</td><td>' .
            esc_html($p['status']) .
            '</td><td>' .
            esc_html(mbb_component_json($p['budgets'])) .
            '</td></tr>';
    }
    echo mbb_t('</tbody></table><h2>Rejected registrations</h2><ul>');
    foreach ($report['rejections'] as $r) {
        echo '<li>' . esc_html($r['id'] . ': ' . $r['reason']) . '</li>';
    }
    echo '</ul></div>';
}
// Keep the old entry URL as a redirect to the consolidated settings tab.
add_action('admin_init', static function () {
    if (($_GET['page'] ?? null) === 'markbridge-teaching' && current_user_can('manage_options')) {
        wp_safe_redirect(admin_url('options-general.php?page=markbridge&tab=extensions'));
        exit();
    }
});
