<?php
require_once __DIR__ . '/i18n.php';
// Backend and Node directory are one atomic option; legacy settings remain untouched.
const MBB_CONVERTER_OPTION = 'mbb_converter_settings';

function mbb_converter_settings()
{
    $missing = new stdClass();
    $settings = get_option(MBB_CONVERTER_OPTION, $missing);
    if ($settings === $missing) {
        return null;
    }
    if (
        !is_array($settings) ||
        count($settings) !== 2 ||
        array_diff_key($settings, ['backend' => true, 'runtime_path' => true]) ||
        !in_array($settings['backend'] ?? null, ['php', 'node'], true) ||
        !is_string($settings['runtime_path'] ?? null) ||
        str_contains($settings['runtime_path'], "\0")
    ) {
        return false;
    }
    return $settings;
}

function mbb_converter_settings_save()
{
    if (!current_user_can('manage_options')) {
        wp_die(mbb_t('You cannot change MarkBridge conversion settings.'), '', ['response' => 403]);
    }
    check_admin_referer('mbb_converter_save');
    $result = 'managed';
    if (!defined('MARKBRIDGE_CONVERTER_BACKEND')) {
        $input = wp_unslash($_POST['converter'] ?? null);
        $result = 'rejected';
        if (
            is_array($input) &&
            count($input) === 2 &&
            !array_diff_key($input, ['backend' => true, 'runtime_path' => true]) &&
            in_array($input['backend'] ?? null, ['php', 'node'], true) &&
            is_string($input['runtime_path'] ?? null)
        ) {
            $configuration = mbb_runtime_configuration();
            $backend = $input['backend'];
            $diagnostics =
                $backend === 'php'
                    ? mbb_php_converter_diagnostics(true)
                    : mbb_runtime_diagnostics(
                        $configuration['managed'] ? $configuration['path'] : $input['runtime_path'],
                        true,
                    );
            if ($diagnostics['ok']) {
                $settings = [
                    'backend' => $backend,
                    'runtime_path' =>
                        $backend === 'php' ? $configuration['path'] : $diagnostics['path'],
                ];
                // Re-read persisted state before reporting success, including unchanged choices.
                if (mbb_converter_settings() !== $settings) {
                    update_option(MBB_CONVERTER_OPTION, $settings, false);
                }
                $result = mbb_converter_settings() === $settings ? 'updated' : 'save-failed';
            } else {
                set_transient(
                    'mbb_converter_diagnostics_' . get_current_user_id(),
                    ['backend' => $backend, 'diagnostics' => $diagnostics],
                    MINUTE_IN_SECONDS * 5,
                );
            }
        }
    }
    wp_safe_redirect(admin_url('options-general.php?page=markbridge&mbb-converter=' . $result));
    exit();
}
add_action('admin_post_mbb_converter_save', 'mbb_converter_settings_save');

function mbb_converter_settings_form()
{
    $backend = mbb_converter_backend();
    $configuration = mbb_runtime_configuration();
    $managed = defined('MARKBRIDGE_CONVERTER_BACKEND');
    $result = is_string($_GET['mbb-converter'] ?? null) ? $_GET['mbb-converter'] : '';
    $notices = [
        'updated' => ['success', mbb_t('The conversion backend was verified and applied.')],
        'rejected' => [
            'error',
            mbb_t(
                'The proposed conversion backend failed verification. Original settings are unchanged.',
            ),
        ],
        'save-failed' => [
            'error',
            mbb_t(
                'The conversion backend could not be saved. Check the database state. No successful switch was reported.',
            ),
        ],
        'managed' => [
            'info',
            mbb_t(
                'The conversion backend is managed by server constants. Database settings are unchanged.',
            ),
        ],
    ];
    echo mbb_t('<h2>Conversion backend</h2>');
    if (isset($notices[$result])) {
        [$class, $message] = $notices[$result];
        echo '<div class="notice notice-' . $class . '"><p>' . esc_html($message) . '</p></div>';
    }
    if ($backend !== 'php' && $backend !== 'node') {
        echo mbb_t(
            '<p>The current conversion configuration is invalid and will be rejected explicitly. No other backend is selected automatically.</p>',
        );
    }
    echo mbb_t(
        '<p>New installations default to PHP. Node requires a matching private server runtime prepared beforehand. Changes apply only after verification, never rewrite content, and do not automatically fall back on failure.</p>',
    );
    echo '<form action="' . esc_url(admin_url('admin-post.php')) . '" method="post">';
    echo '<input type="hidden" name="action" value="mbb_converter_save">';
    wp_nonce_field('mbb_converter_save');
    echo '<fieldset' . ($managed ? ' disabled' : '') . '>';
    foreach (
        [
            'php' => mbb_t('PHP (bundled; no Node directory required)'),
            'node' => mbb_t('Node (private server runtime)'),
        ]
        as $value => $label
    ) {
        echo '<p><label><input type="radio" name="converter[backend]" value="' .
            $value .
            '"' .
            ($backend === $value ? ' checked' : '') .
            '> ' .
            esc_html($label) .
            '</label></p>';
    }
    echo mbb_t('<p><label for="mbb-converter-path">Private Node directory</label> ');
    echo '<input id="mbb-converter-path" class="regular-text code" name="converter[runtime_path]" value="' .
        esc_attr($configuration['path']) .
        '"' .
        ($configuration['managed'] ? ' readonly' : '') .
        '></p>';
    if ($configuration['managed']) {
        echo mbb_t(
            '<p class="description">MARKBRIDGE_RUNTIME is server-managed and overrides only the Node directory. An invalid constant does not fall back to the database directory.</p>',
        );
    }
    echo mbb_t(
        '<p class="description">Selecting PHP preserves the existing valid Node directory for later switching and does not use the directory entered here.</p>',
    );
    submit_button(mbb_t('Verify and apply conversion backend'));
    echo '</fieldset></form>';
    if ($managed) {
        echo mbb_t(
            '<p>MARKBRIDGE_CONVERTER_BACKEND is defined. The backend is server-managed and cannot be overridden here.</p>',
        );
    }
    echo mbb_t(
        '<p><a href="https://github.com/wzf2000/MarkBridge/wiki/Runtime">Node runtime preparation and configuration</a></p>',
    );
}

function mbb_converter_candidate_diagnostics($backend, $diagnostics)
{
    echo mbb_t('<h2>Unapplied candidate diagnostics: ') . esc_html($backend) . '</h2>';
    echo mbb_t(
        '<p>These results describe the failed candidate, not the currently active backend.</p><table class="widefat striped"><tbody>',
    );
    foreach ($diagnostics['checks'] as $check) {
        echo '<tr><th>' .
            esc_html($check['label']) .
            '</th><td>' .
            ($check['ok'] ? mbb_t('Passed') : mbb_t('Failed')) .
            '</td><td>' .
            esc_html($check['message']) .
            '</td></tr>';
    }
    echo '</tbody></table>';
}
