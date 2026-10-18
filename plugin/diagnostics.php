<?php
if (!defined('ABSPATH')) {
    exit();
}
function mbb_diagnostics_configuration(): array
{
    $version = function_exists('get_file_data')
        ? get_file_data(__DIR__ . '/markdown-block-bridge.php', ['version' => 'Version'])[
                'version'
            ] ?? ''
        : '';
    return [
        'version' => preg_match('/^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/iD', $version) ? $version : '',
        'canCopy' => function_exists('current_user_can') && current_user_can('manage_options'),
    ];
}
function mbb_register_diagnostics(): void
{
    wp_register_script(
        'mbb-diagnostics',
        plugins_url(mbb_asset('diagnostics.js'), __FILE__),
        [],
        null,
        true,
    );
}
function mbb_enqueue_diagnostics(): void
{
    if (wp_script_is('mbb-diagnostics', 'enqueued')) {
        return;
    }
    wp_enqueue_script(
        'mbb-diagnostics',
        plugins_url(mbb_asset('diagnostics.js'), __FILE__),
        [],
        null,
        true,
    );
    wp_enqueue_style(
        'mbb-diagnostics',
        plugins_url(mbb_asset('diagnostics.css'), __FILE__),
        [],
        null,
    );
    wp_add_inline_script(
        'mbb-diagnostics',
        'window.MBB_DIAGNOSTICS_CONFIG=' . wp_json_encode(mbb_diagnostics_configuration()) . ';',
        'before',
    );
}
