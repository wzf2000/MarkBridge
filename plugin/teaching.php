<?php
// Frontend enhancement never changes stored markup or paragraph identity.
add_action('init', static function () {
    $schemas = json_decode(
        file_get_contents(__DIR__ . '/includes/php-converter/block-capabilities.json'),
        true,
    );
    foreach (['collapse', 'steps', 'step', 'code-compare', 'component', 'code-tabs'] as $kind) {
        $attrs = [];
        foreach ($schemas['mbb/' . $kind] as $key => $type) {
            $attrs[$key] = ['type' => $type === 'integer' ? 'number' : $type];
        }
        register_block_type('mbb/' . $kind, ['api_version' => 3, 'attributes' => $attrs]);
    }
});
function mbb_enqueue_teaching_assets()
{
    wp_enqueue_script(
        'mbb-components',
        plugins_url(mbb_asset('components.js'), __FILE__),
        [],
        substr(hash_file('sha256', __DIR__ . '/components.js'), 0, 12),
        true,
    );
    static $registryAttached = false;
    if (!$registryAttached) {
        $registryAttached = true;
        wp_add_inline_script(
            'mbb-components',
            'window.MBBComponents=' .
                mbb_component_json(
                    mbb_component_available(),
                    JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT,
                ) .
                ';',
            'before',
        );
    }
    wp_enqueue_script(
        'mbb-teaching',
        plugins_url(mbb_asset('teaching.js'), __FILE__),
        [],
        substr(hash_file('sha256', __DIR__ . '/teaching.js'), 0, 12),
        true,
    );
    wp_enqueue_style(
        'mbb-teaching',
        plugins_url(mbb_asset('teaching.css'), __FILE__),
        [],
        substr(hash_file('sha256', __DIR__ . '/teaching.css'), 0, 12),
    );
}
add_filter(
    'render_block',
    static function ($html, $block) {
        $name = $block['blockName'] ?? '';
        if ($name === 'core/details' && empty($block['attrs']['name'])) {
            if (!is_admin()) {
                mbb_enqueue_teaching_assets();
            }
            return preg_replace(
                '/^(\s*)<details\b/',
                '$1<details data-mbb-teaching="native-details"',
                $html,
                1,
            );
        }
        if (!str_starts_with($name, 'mbb/')) {
            return $html;
        }
        $kind = substr($name, 4);
        if (
            !in_array(
                $kind,
                ['collapse', 'steps', 'step', 'code-compare', 'component', 'code-tabs'],
                true,
            )
        ) {
            return $html;
        }
        if (!is_admin()) {
            mbb_enqueue_teaching_assets();
        }
        // Validated block attributes travel separately from escaped code/text markup.
        $attrs = $block['attrs'] ?? [];
        $config = array_intersect_key(
            $attrs,
            array_flip([
                'open',
                'mode',
                'previous',
                'next',
                'full',
                'leftHighlights',
                'rightHighlights',
            ]),
        );
        if ($kind === 'code-tabs') {
            $config = array_intersect_key($attrs, array_flip(['defaultTab', 'tabs']));
        }
        if ($kind === 'component') {
            $paramsConsistent = true;
            if (
                preg_match(
                    '/<p data-mbb-generated="" class="mbb-component-params">([A-Za-z0-9+\/=]*)<\/p>/',
                    $html,
                    $m,
                )
            ) {
                $params = json_decode(base64_decode($m[1], true), false, 16);
                $paramsConsistent =
                    json_decode(base64_decode($m[1], true), true, 16) ===
                    ($attrs['params'] ?? null);
                if ($params instanceof stdClass) {
                    $attrs['params'] = $params;
                }
            }
            $p = mbb_component_registry()[$attrs['component'] ?? ''] ?? null;
            $config = [
                'component' => $attrs['component'] ?? '',
                'componentVersion' => $attrs['componentVersion'] ?? '',
                'params' => $attrs['params'] ?? (object) [],
                'status' => !$p
                    ? 'missing'
                    : ($p['version'] !== ($attrs['componentVersion'] ?? '')
                        ? 'incompatible'
                        : $p['status']),
            ];
            if (
                $config['status'] === 'available' &&
                (!$paramsConsistent ||
                    !mbb_component_pure_params($config['params']) ||
                    !mbb_component_schema($config['params'], $p['schema']))
            ) {
                $config['status'] = 'invalid-params';
            }
            if ($config['status'] === 'available') {
                $config['provider'] = mbb_component_public($p);
            }
        }
        if ($kind === 'steps') {
            $config['mode'] = apply_filters(
                'markbridge_teaching_steps_mode',
                $config['mode'] ?? 'full',
                $block,
            );
        }
        return preg_replace(
            '/^(\s*)<div\b/',
            '$1<div data-mbb-teaching="' .
                esc_attr($kind) .
                '" data-mbb-teaching-config="' .
                esc_attr(mbb_component_json($config)) .
                '"',
            $html,
            1,
        );
    },
    10,
    2,
);

add_action(
    'wp_enqueue_scripts',
    static function () {
        global $wp_query;
        foreach ($wp_query->posts ?? [] as $post) {
            if (
                is_object($post) &&
                preg_match(
                    '/<!-- wp:mbb\/(collapse|steps|step|code-compare|component|code-tabs)\b/',
                    $post->post_content ?? '',
                )
            ) {
                mbb_enqueue_teaching_assets();
                break;
            }
        }
    },
    10,
);

add_action('enqueue_block_assets', static function () {
    if (is_admin()) {
        wp_enqueue_style(
            'mbb-teaching',
            plugins_url(mbb_asset('teaching.css'), __FILE__),
            [],
            substr(hash_file('sha256', __DIR__ . '/teaching.css'), 0, 12),
        );
    }
});
