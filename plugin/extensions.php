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
        !preg_match('/\A\d+\.\d+\.\d+(?:-(?:dev|rc)\.\d+)?\z/D', $d['minMarkBridge']) ||
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
/** Resource ownership is derived from the verified local plugin directory, never article data. */
function mbb_extensions_component_owner(array $provider): array
{
    $file = realpath($provider['resource']['file'] ?? '');
    $root = defined('WP_PLUGIN_DIR') ? realpath(WP_PLUGIN_DIR) : false;
    if (!$file || !$root || !str_starts_with($file, $root . DIRECTORY_SEPARATOR)) {
        return ['id' => '', 'title' => mbb_t('Other registered providers')];
    }
    $directory = explode(DIRECTORY_SEPARATOR, substr($file, strlen($root) + 1))[0];
    if (
        !function_exists('get_plugins') &&
        defined('ABSPATH') &&
        is_readable(ABSPATH . 'wp-admin/includes/plugin.php')
    ) {
        require_once ABSPATH . 'wp-admin/includes/plugin.php';
    }
    foreach (function_exists('get_plugins') ? get_plugins() : [] as $entry => $headers) {
        if (str_starts_with($entry, $directory . '/')) {
            return [
                'id' => $directory,
                'title' => wp_strip_all_tags($headers['Name'] ?: $directory),
            ];
        }
    }
    return ['id' => $directory, 'title' => $directory];
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
    $page = max(1, (int) ($request['page'] ?? 1));
    $perPage = min(50, max(1, (int) ($request['per_page'] ?? 20)));
    $all = function_exists('mbb_component_index_entries')
        ? array_values(mbb_component_index_entries())
        : array_map(
            static fn($p) => [
                'id' => $p['id'],
                'version' => $p['version'],
                'title' => $p['title'],
                'status' => $p['status'],
            ],
            array_values(mbb_component_registry()),
        );
    $items = [];
    foreach (array_slice($all, ($page - 1) * $perPage, $perPage) as $entry) {
        $legacy = null;
        foreach (mbb_component_registry() as $p) {
            if ($p['id'] === $entry['id'] && $p['version'] === $entry['version']) {
                $legacy = $p;
                break;
            }
        }
        $items[] = [
            'provider' => $legacy
                ? mbb_extensions_component_owner($legacy)
                : ['id' => 'indexed', 'title' => mbb_t('Indexed component versions')],
            'component' => $entry['id'],
            'version' => $entry['version'],
            'title' => $entry['title'],
            'status' => $entry['status'],
            'protocolVersion' => $legacy['protocolVersion'] ?? '—',
            'minMarkBridge' => $legacy['minMarkBridge'] ?? '—',
            'resourceSha256' => $legacy['resource']['sha256'] ?? '—',
            'projectionFingerprint' => null,
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
        'capacity' => ['used' => count($all), 'limit' => 256],
        'page' => $page,
        'perPage' => $perPage,
        'total' => count($all),
        'rejections' => $GLOBALS['mbb_component_rejections'] ?? [],
    ];
    if (!mbb_extensions_permission()) {
        return mbb_error(
            'extension_unavailable',
            mbb_t('This extension information is unavailable.'),
            404,
        );
    }
    if (strlen(mbb_projection_json($value)) > 32768) {
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
        if (strlen(mbb_projection_json($value)) > 32768) {
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
/** Keep scan positions server-side: signed JSON alone would disclose inaccessible IDs. */
function mbb_extensions_article_cursor(int $after, string $query): string
{
    $key = 'mbb_ext_articles_' . get_current_user_id();
    $stored = get_transient($key);
    $now = time();
    $entries = is_array($stored)
        ? array_filter(
            $stored,
            static fn($entry) => is_array($entry) &&
                is_int($entry['expires'] ?? null) &&
                $entry['expires'] > $now,
        )
        : [];
    while (count($entries) >= 8) {
        array_shift($entries);
    }
    $token = bin2hex(random_bytes(24));
    $entries[$token] = [
        'after' => $after,
        'query' => hash('sha256', $query),
        'owner' => mbb_references_operation_owner(),
        'expires' => $now + 900,
    ];
    if (!set_transient($key, $entries, 900)) {
        throw new RuntimeException('cursor');
    }
    return $token;
}
function mbb_extensions_article_cursor_after(string $token, string $query): int
{
    if (!preg_match('/^[a-f0-9]{48}$/D', $token)) {
        throw new InvalidArgumentException('cursor');
    }
    $stored = get_transient('mbb_ext_articles_' . get_current_user_id());
    $entry = is_array($stored) ? $stored[$token] ?? null : null;
    if (
        !is_array($entry) ||
        !is_int($entry['after'] ?? null) ||
        $entry['after'] < 0 ||
        !is_int($entry['expires'] ?? null) ||
        $entry['expires'] <= time() ||
        !is_string($entry['owner'] ?? null) ||
        !hash_equals($entry['owner'], mbb_references_operation_owner()) ||
        !is_string($entry['query'] ?? null) ||
        !hash_equals($entry['query'], hash('sha256', $query))
    ) {
        throw new InvalidArgumentException('cursor');
    }
    return $entry['after'];
}
/** Discover managed articles without projecting or returning their bodies. */
function mbb_extensions_articles($request)
{
    try {
        global $wpdb;
        if (!mbb_extensions_permission()) {
            throw new RuntimeException('unavailable');
        }
        $owner = get_current_user_id();
        $query = $request['q'] ?? '';
        $cursor = $request['cursor'] ?? '';
        if (
            !is_string($query) ||
            strlen($query) > 200 ||
            !is_string($cursor) ||
            strlen($cursor) > 4096
        ) {
            throw new InvalidArgumentException('request');
        }
        $after = 0;
        if ($cursor !== '') {
            $after = mbb_extensions_article_cursor_after($cursor, $query);
        }
        // At most 200 managed candidates per request, with one ID for continuation.
        // Titles are inspected only after the current user's per-article permission check.
        $ids = $wpdb->get_col(
            $wpdb->prepare(
                "SELECT p.ID FROM {$wpdb->posts} p WHERE p.ID > %d AND p.post_type IN ('post','page') AND p.post_status NOT IN ('trash','auto-draft') AND EXISTS (SELECT 1 FROM {$wpdb->postmeta} m WHERE m.post_id=p.ID AND m.meta_key='_mbb_origin' AND m.meta_value='markdown_import') ORDER BY p.ID ASC LIMIT 201",
                $after,
            ),
        );
        $items = [];
        $nextAfter = null;
        foreach (array_slice($ids, 0, 200) as $rawId) {
            $id = (int) $rawId;
            $after = $id;
            mbb_references_fresh_user();
            $post = mbb_references_fresh_post($id);
            if (get_current_user_id() !== $owner || !current_user_can('manage_options')) {
                throw new RuntimeException('unavailable');
            }
            if (
                !$post ||
                !mbb_managed($id) ||
                !current_user_can('edit_post', $id) ||
                !in_array($post->post_type, ['post', 'page'], true) ||
                in_array($post->post_status, ['trash', 'auto-draft'], true)
            ) {
                continue;
            }
            if ($query !== '' && stripos($post->post_title, $query) === false) {
                continue;
            }
            if (count($items) === 20) {
                $nextAfter = $items[19]['id'];
                break;
            }
            $items[] = [
                'id' => $id,
                'title' => wp_html_excerpt(wp_strip_all_tags($post->post_title), 160, '…'),
                'status' => $post->post_status,
            ];
        }
        if ($nextAfter === null && count($ids) > 200) {
            $nextAfter = $after;
        }
        // Recheck all returned titles and capabilities before returning a single item.
        foreach ($items as $item) {
            mbb_references_fresh_user();
            $post = mbb_references_fresh_post($item['id']);
            if (
                get_current_user_id() !== $owner ||
                !current_user_can('manage_options') ||
                !$post ||
                !mbb_managed($item['id']) ||
                !current_user_can('edit_post', $item['id']) ||
                !in_array($post->post_type, ['post', 'page'], true) ||
                $post->post_status !== $item['status'] ||
                wp_html_excerpt(wp_strip_all_tags($post->post_title), 160, '…') !== $item['title']
            ) {
                throw new RuntimeException('unavailable');
            }
        }
        if (!mbb_extensions_permission() || get_current_user_id() !== $owner) {
            throw new RuntimeException('unavailable');
        }
        $value = [
            'schema' => 1,
            'items' => $items,
            'cursor' =>
                $nextAfter === null ? null : mbb_extensions_article_cursor($nextAfter, $query),
        ];
        if (!mbb_extensions_permission() || get_current_user_id() !== $owner) {
            throw new RuntimeException('unavailable');
        }
        if (strlen(mbb_projection_json($value)) > 32768) {
            throw new RuntimeException('limit');
        }
        return mbb_extensions_response($value);
    } catch (InvalidArgumentException $error) {
        return mbb_error('extension_request', mbb_t('The article search input is invalid.'), 422);
    } catch (Throwable $error) {
        return mbb_error(
            'extension_unavailable',
            mbb_t('This extension information is unavailable.'),
            404,
        );
    }
}
function mbb_extensions_article_discovery(): void
{
    $messages = [
        'loading' => mbb_t('Searching managed articles…'),
        'failed' => mbb_t('Article search failed. Try again.'),
        'empty' => mbb_t('No matching articles in this page.'),
        'continue' => mbb_t('No matching articles in this scan. Continue to the next page.'),
        'limit' => mbb_t('Choose up to 50 articles.'),
        'invalid' => mbb_t('Correct the article IDs before adding a search result.'),
        'untitled' => mbb_t('Untitled article'),
        'statuses' => [
            'publish' => mbb_t('Published'),
            'draft' => mbb_t('Draft'),
            'private' => mbb_t('Private'),
            'pending' => mbb_t('Pending review'),
            'future' => mbb_t('Scheduled'),
        ],
    ];
    echo '<details class="mbb-extension-discovery"><summary>' .
        esc_html(mbb_t('Find articles by title')) .
        '</summary><div data-mbb-extension-discovery data-url="' .
        esc_url(rest_url('mbb/v1/extensions/articles')) .
        '" data-messages="' .
        esc_attr(json_encode($messages)) .
        '" data-nonce="' .
        esc_attr(wp_create_nonce('wp_rest')) .
        '">' .
        '<div class="mbb-extension-search-row"><label for="mbb-extension-search">' .
        esc_html(mbb_t('Article title')) .
        '</label><input id="mbb-extension-search" type="search" maxlength="200">' .
        '<button type="button" class="button" data-mbb-search>' .
        esc_html(mbb_t('Search articles')) .
        '</button></div>' .
        '<p data-mbb-search-status role="status" aria-live="polite"></p><ul data-mbb-search-results></ul>' .
        '<div class="mbb-extension-search-pagination"><button type="button" class="button" data-mbb-search-previous disabled>' .
        esc_html(mbb_t('Previous page')) .
        '</button> ' .
        '<button type="button" class="button" data-mbb-search-next disabled>' .
        esc_html(mbb_t('Next page')) .
        '</button></div></div></details>';
}
function mbb_extensions_settings_page(bool $embedded = false): void
{
    if (!mbb_extensions_permission()) {
        return;
    }
    echo '<section class="mbb-extension-catalog"><h2>' .
        esc_html(mbb_t('Installed extensions')) .
        '</h2><p>' .
        esc_html(
            mbb_t(
                'Compatibility is based on installed exact versions. No extension is downloaded or enabled here.',
            ),
        ) .
        '</p>';
    $page = max(1, (int) ($_GET['mbb_component_page'] ?? 1));
    $response = mbb_extensions_catalog(['page' => $page]);
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
    echo '<p>' .
        esc_html(
            mbb_t(
                'One provider plugin can include many component types. Exact versions are compatibility records, not separate plugins or questions.',
            ),
        ) .
        '</p>';
    $groups = [];
    foreach ($data['components'] as $item) {
        $groups[$item['provider']['id']]['provider'] = $item['provider'];
        $groups[$item['provider']['id']]['types'][$item['component']][] = $item;
    }
    foreach ($groups as $group) {
        echo '<section class="mbb-provider-group"><h3>' .
            esc_html($group['provider']['title']) .
            '</h3>';
        foreach ($group['types'] as $component => $items) {
            echo '<details class="mbb-component-versions"><summary><strong>' .
                esc_html($items[0]['title']) .
                '</strong> <code>' .
                esc_html($component) .
                '</code></summary>';
            echo '<table class="widefat striped"><thead><tr><th>' .
                esc_html(mbb_t('Version')) .
                '</th><th>' .
                esc_html(mbb_t('Status')) .
                '</th></tr></thead><tbody>';
            foreach ($items as $item) {
                echo '<tr><td>' .
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
                    '</dt><dd><code style="overflow-wrap:anywhere;word-break:break-word">' .
                    esc_html($item['resourceSha256']) .
                    '</code></dd></dl></details></td></tr>';
            }
            echo '</tbody></table></details>';
        }
        echo '</section>';
    }
    if ($page > 1) {
        echo '<a class="button" href="' .
            esc_url(add_query_arg('mbb_component_page', $page - 1)) .
            '">' .
            esc_html(mbb_t('Previous page')) .
            '</a> ';
    }
    if ($page * $data['perPage'] < $data['total']) {
        echo '<a class="button" href="' .
            esc_url(add_query_arg('mbb_component_page', $page + 1)) .
            '">' .
            esc_html(mbb_t('Next page')) .
            '</a>';
    }
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
    mbb_extensions_article_discovery();
    $input = is_string($_POST['article_ids'] ?? null) ? wp_unslash($_POST['article_ids']) : '';
    echo '<label for="mbb-extension-ids">' .
        esc_html(mbb_t('Article IDs (comma separated, up to 50)')) .
        '</label><input id="mbb-extension-ids" name="article_ids" type="text" maxlength="1000" value="' .
        esc_attr($input) .
        '">';
    submit_button(mbb_t('Check selected articles'));
    echo '</form>';
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
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
    register_rest_route('mbb/v1', '/extensions/articles', [
        'methods' => 'GET',
        'permission_callback' => 'mbb_extensions_permission',
        'callback' => 'mbb_extensions_articles',
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
        if (preg_match('~\A/mbb/v1/extensions(?:/(?:usage|articles))?\z~', $r->get_route())) {
            $response = rest_ensure_response($response);
            $response->header('Cache-Control', 'private, no-store, max-age=0');
        }
        return $response;
    },
    10,
    3,
);
