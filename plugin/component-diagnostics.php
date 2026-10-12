<?php
// Administrator-only, read-only extension status. Never expose local resource paths.
function mbb_component_diagnostics(): array
{
    return [
        'protocolVersion' => 1,
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
    echo '<div class="wrap"><h1>MarkBridge 教学扩展</h1><p>只读诊断：固定本地资源与公开纯数据参数。执行并发上限 2，预览上限 4；参数上限 16 KiB。停用扩展后静态正文与原配置仍保留。</p><table class="widefat striped"><thead><tr><th>组件</th><th>版本 / 协议 / 最低 MarkBridge</th><th>状态</th><th>预算</th></tr></thead><tbody>';
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
    echo '</tbody></table><h2>登记拒绝</h2><ul>';
    foreach ($report['rejections'] as $r) {
        echo '<li>' . esc_html($r['id'] . ': ' . $r['reason']) . '</li>';
    }
    echo '</ul></div>';
}
add_action('admin_menu', static function () {
    add_management_page(
        'MarkBridge 教学扩展',
        'MarkBridge 教学扩展',
        'manage_options',
        'markbridge-teaching',
        'mbb_component_diagnostics_page',
    );
});
