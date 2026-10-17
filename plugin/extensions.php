<?php
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}
function mbb_register_extension_manifest(string $id, array $d): bool
{
    if (
        !preg_match('/\A[a-z][a-z0-9-]{0,63}\z/D', $id) ||
        isset($GLOBALS['mbb_extension_manifests'][$id]) ||
        count($GLOBALS['mbb_extension_manifests'] ?? []) >= 32 ||
        !mbb_projection_closed($d, ['version', 'title', 'minMarkBridge', 'capabilities']) ||
        !is_string($d['version']) ||
        strlen($d['version']) > 48 ||
        !preg_match('/\A\d+\.\d+\.\d+(?:-[a-z0-9.]+)?\z/D', $d['version']) ||
        !mbb_projection_text($d['title'], 200) ||
        !is_string($d['minMarkBridge']) ||
        strlen($d['minMarkBridge']) > 48 ||
        !preg_match('/\A\d+\.\d+\.\d+(?:-dev\.\d+)?\z/D', $d['minMarkBridge']) ||
        !is_array($d['capabilities']) ||
        !array_is_list($d['capabilities']) ||
        count($d['capabilities']) > 8 ||
        array_filter($d['capabilities'], fn($v) => !is_string($v)) ||
        array_diff($d['capabilities'], [
            'components',
            'author-tools',
            'publication-client',
            'static-projection',
            'library',
        ])
    ) {
        return false;
    }
    $GLOBALS['mbb_extension_manifests'][$id] = $d;
    return true;
}
function mbb_extensions_permission(): bool
{
    mbb_references_fresh_user();
    return get_current_user_id() > 0 && current_user_can('manage_options');
}
function mbb_extensions_response($value, int $status = 200)
{
    $r = new WP_REST_Response($value, $status);
    $r->header('Cache-Control', 'private, no-store, max-age=0');
    return $r;
}
function mbb_extensions_catalog($request = null)
{
    if (!mbb_extensions_permission()) {
        return mbb_error(
            'extension_unavailable',
            mbb_t('This extension information is unavailable.'),
            404,
        );
    }
    $items = [];
    foreach (mbb_component_registry() as $p) {
        $items[] = [
            'component' => $p['id'],
            'version' => $p['version'],
            'title' => $p['title'],
            'status' => $p['status'],
            'protocolVersion' => $p['protocolVersion'],
            'minMarkBridge' => $p['minMarkBridge'],
            'resourceSha256' => $p['resource']['sha256'],
            'projectionFingerprint' => mbb_component_projection_fingerprint(
                $p['id'],
                $p['version'],
            ),
        ];
    }
    preg_match(
        '/^ \* Version: ([^ \r\n]+)/m',
        file_get_contents(__DIR__ . '/markdown-block-bridge.php'),
        $version,
    );
    $extensions = [];
    foreach ($GLOBALS['mbb_extension_manifests'] ?? [] as $id => $extension) {
        $extensions[$id] = $extension + [
            'status' => version_compare($version[1] ?? '0.0.0', $extension['minMarkBridge'], '<')
                ? 'version-incompatible'
                : 'available',
        ];
    }
    $value = [
        'schema' => 1,
        'extensions' => $extensions ?: (object) [],
        'components' => $items,
        'capacity' => ['used' => count($items), 'limit' => 32],
        'rejections' => $GLOBALS['mbb_component_rejections'] ?? [],
    ];
    if (!mbb_extensions_permission()) {
        return mbb_error(
            'extension_unavailable',
            mbb_t('This extension information is unavailable.'),
            404,
        );
    }
    if (strlen(mbb_projection_json($value)) > 131072) {
        return mbb_error(
            'extension_catalog_limit',
            mbb_t('The installed extension catalog exceeds its display budget.'),
            413,
        );
    }
    return mbb_extensions_response($value);
}
function mbb_extensions_usage_ids(string $raw): array
{
    try {
        if (strlen($raw) > 4096) {
            throw new InvalidArgumentException('request');
        }
        require_once __DIR__ . '/includes/php-converter/Worker.php';
        \MarkBridge\Probe\Teaching::json($raw);
        $data = json_decode($raw, false, 8, JSON_THROW_ON_ERROR);
        if (
            !($data instanceof stdClass) ||
            array_keys(get_object_vars($data)) !== ['post_ids'] ||
            !is_array($data->post_ids) ||
            !array_is_list($data->post_ids) ||
            count($data->post_ids) < 1 ||
            count($data->post_ids) > 50
        ) {
            throw new InvalidArgumentException('request');
        }
        $ids = [];
        foreach ($data->post_ids as $id) {
            if (!is_int($id) || $id < 1 || isset($ids[$id])) {
                throw new InvalidArgumentException('request');
            }
            $ids[$id] = true;
        }
        return $ids;
    } catch (Throwable $e) {
        throw new InvalidArgumentException('request', 0, $e);
    }
}
function mbb_extensions_usage_fresh(int $owner, array $stamps): bool
{
    foreach ($stamps as $id => $stamp) {
        mbb_references_fresh_user();
        $p = mbb_references_fresh_post($id);
        if (
            get_current_user_id() !== $owner ||
            !current_user_can('manage_options') ||
            !$p ||
            !current_user_can('edit_post', $id) ||
            !hash_equals($stamp, mbb_token($p))
        ) {
            return false;
        }
    }
    return mbb_extensions_permission() && get_current_user_id() === $owner;
}
function mbb_extensions_usage($r)
{
    try {
        if (!mbb_extensions_permission()) {
            throw new RuntimeException('unavailable');
        }
        $owner = get_current_user_id();
        $ids = mbb_extensions_usage_ids($r->get_body());
        $groups = [];
        $stamps = [];
        foreach (array_keys($ids) as $id) {
            $s = mbb_references_snapshot($id, true);
            $stamps[$id] = mbb_token($s['post']);
            foreach (mbb_component_descriptors($s['document']['serialized']) as $a) {
                if (
                    !is_string($a->component) ||
                    !preg_match('/\A[a-z][a-z0-9-]{0,63}\z/D', $a->component) ||
                    !is_string($a->componentVersion) ||
                    !preg_match('/\A\d+\.\d+\.\d+\z/D', $a->componentVersion) ||
                    strlen($a->componentVersion) > 48
                ) {
                    throw new RuntimeException('limit');
                }
                $key = $a->component . '@' . $a->componentVersion;
                if (!isset($groups[$key])) {
                    $groups[$key] = [
                        'component' => $a->component,
                        'version' => $a->componentVersion,
                        'count' => 0,
                        'posts' => [],
                    ];
                }
                $groups[$key]['count']++;
                $groups[$key]['posts'][$id] = ['id' => $id, 'title' => $s['post']->post_title];
                if (count($groups) > 64 || strlen(mbb_projection_json($groups)) > 131072) {
                    throw new RuntimeException('limit');
                }
            }
        }
        foreach ($groups as &$group) {
            $group['posts'] = array_values($group['posts']);
        }
        unset($group);
        $value = ['schema' => 1, 'scope' => 'selected-posts', 'groups' => array_values($groups)];
        if (strlen(mbb_projection_json($value)) > 131072) {
            throw new RuntimeException('limit');
        }
        // No partial old titles survive a later query's capability/session/body change.
        if (!mbb_extensions_usage_fresh($owner, $stamps)) {
            throw new RuntimeException('unavailable');
        }
        return mbb_extensions_response($value);
    } catch (InvalidArgumentException | JsonException $e) {
        return mbb_error('extension_request', mbb_t('Choose 1 to 50 distinct article IDs.'), 422);
    } catch (Throwable $e) {
        if (isset($owner, $stamps) && !mbb_extensions_usage_fresh($owner, $stamps)) {
            return mbb_error(
                'extension_unavailable',
                mbb_t('This extension information is unavailable.'),
                404,
            );
        }
        if ($e->getMessage() === 'limit') {
            return mbb_error(
                'extension_usage_limit',
                mbb_t('The selected scope exceeds the usage report limit. Choose fewer articles.'),
                413,
            );
        }
        if (str_contains($e->getMessage(), 'Duplicate teaching JSON')) {
            return mbb_error(
                'extension_request',
                mbb_t('Choose 1 to 50 distinct article IDs.'),
                422,
            );
        }
        return mbb_error(
            'extension_unavailable',
            mbb_t('This extension information is unavailable.'),
            404,
        );
    }
}
function mbb_extensions_settings_page(bool $embedded = false): void
{
    if (!mbb_extensions_permission()) {
        return;
    }
    echo '<section><h2>' .
        esc_html(mbb_t('Installed extensions')) .
        '</h2><p>' .
        esc_html(
            mbb_t(
                'Compatibility is based on installed exact versions. No extension is downloaded or enabled here.',
            ),
        ) .
        '</p>';
    $response = mbb_extensions_catalog();
    if (is_wp_error($response)) {
        return;
    }
    $data = $response->get_data();
    echo '<ul>';
    foreach ($data['extensions'] as $id => $extension) {
        echo '<li><strong>' .
            esc_html($extension['title']) .
            '</strong> · ' .
            esc_html($extension['version']) .
            ' <small>' .
            esc_html($id) .
            '</small> · ' .
            esc_html($extension['status']) .
            '<details><summary>' .
            esc_html(mbb_t('Compatibility details')) .
            '</summary><p>' .
            esc_html(mbb_t('Minimum MarkBridge')) .
            ': ' .
            esc_html($extension['minMarkBridge']) .
            '</p></details></li>';
    }
    echo '</ul>';
    echo '<table class="widefat striped"><thead><tr><th>' .
        esc_html(mbb_t('Component')) .
        '</th><th>' .
        esc_html(mbb_t('Version')) .
        '</th><th>' .
        esc_html(mbb_t('Status')) .
        '</th></tr></thead><tbody>';
    foreach ($data['components'] as $item) {
        echo '<tr><td>' .
            esc_html($item['title']) .
            '<br><small>' .
            esc_html($item['component']) .
            '</small></td><td>' .
            esc_html($item['version']) .
            '</td><td>' .
            esc_html($item['status']) .
            '<details><summary>' .
            esc_html(mbb_t('Compatibility details')) .
            '</summary><dl><dt>' .
            esc_html(mbb_t('Minimum MarkBridge')) .
            '</dt><dd>' .
            esc_html($item['minMarkBridge']) .
            '</dd><dt>' .
            esc_html(mbb_t('Protocol')) .
            '</dt><dd>' .
            esc_html((string) $item['protocolVersion']) .
            '</dd><dt>' .
            esc_html(mbb_t('Resource SHA-256')) .
            '</dt><dd><code>' .
            esc_html($item['resourceSha256']) .
            '</code></dd></dl></details></td></tr>';
    }
    echo '</tbody></table>';
    if ($data['rejections']) {
        echo '<details><summary>' . esc_html(mbb_t('Rejected registrations')) . '</summary><ul>';
        foreach ($data['rejections'] as $r) {
            echo '<li>' . esc_html($r['id']) . ' · ' . esc_html($r['reason']) . '</li>';
        }
        echo '</ul></details>';
    }
    echo '<h2>' .
        esc_html(mbb_t('Selected article usage')) .
        '</h2><p>' .
        esc_html(
            mbb_t(
                'This report covers only the article IDs you select, not a site-wide inventory. Every article requires current editing permission.',
            ),
        ) .
        '</p><form method="post" class="mbb-extension-scope">';
    wp_nonce_field('mbb_extension_usage');
    $input = is_string($_POST['article_ids'] ?? null) ? wp_unslash($_POST['article_ids']) : '';
    echo '<label for="mbb-extension-ids">' .
        esc_html(mbb_t('Article IDs (comma separated, up to 50)')) .
        '</label><input id="mbb-extension-ids" name="article_ids" type="text" maxlength="1000" value="' .
        esc_attr($input) .
        '">';
    submit_button(mbb_t('Check selected articles'));
    echo '</form>';
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        check_admin_referer('mbb_extension_usage');
        $parts = preg_split('/\s*,\s*/', trim($input));
        $ids = [];
        foreach ($parts as $part) {
            if (!preg_match('/\A[1-9][0-9]{0,9}\z/D', $part)) {
                $ids = [];
                break;
            }
            $ids[] = (int) $part;
        }
        $request = new WP_REST_Request('POST', '/mbb/v1/extensions/usage');
        $request->set_body(json_encode(['post_ids' => $ids]));
        $result = mbb_extensions_usage($request);
        if (is_wp_error($result)) {
            echo '<p role="alert">' . esc_html($result->get_error_message()) . '</p>';
        } else {
            echo '<ul>';
            foreach ($result->get_data()['groups'] as $g) {
                echo '<li><strong>' .
                    esc_html($g['component'] . ' ' . $g['version']) .
                    '</strong> · ' .
                    esc_html((string) $g['count']) .
                    '<ul>';
                foreach ($g['posts'] as $p) {
                    echo '<li>' .
                        esc_html($p['title']) .
                        ' <small>#' .
                        esc_html((string) $p['id']) .
                        '</small></li>';
                }
                echo '</ul></li>';
            }
            echo '</ul>';
        }
    }
    echo '</section>';
}
add_action(
    'init',
    static function () {
        do_action('markbridge_register_extensions');
    },
    8,
);
add_filter('mbb_admin_settings_tabs', static function ($tabs) {
    $tabs['extensions'] = [
        'label' => mbb_t('Extensions'),
        'render' => 'mbb_extensions_settings_page',
    ];
    return $tabs;
});
add_action('rest_api_init', static function () {
    register_rest_route('mbb/v1', '/extensions', [
        'methods' => 'GET',
        'permission_callback' => 'mbb_extensions_permission',
        'callback' => 'mbb_extensions_catalog',
    ]);
    register_rest_route('mbb/v1', '/extensions/usage', [
        'methods' => 'POST',
        'permission_callback' => 'mbb_extensions_permission',
        'callback' => 'mbb_extensions_usage',
    ]);
});
add_filter(
    'rest_post_dispatch',
    static function ($response, $server, $r) {
        if (preg_match('~\A/mbb/v1/extensions(?:/usage)?\z~', $r->get_route())) {
            $response = rest_ensure_response($response);
            $response->header('Cache-Control', 'private, no-store, max-age=0');
        }
        return $response;
    },
    10,
    3,
);
