<?php
// Frontend enhancement never changes stored markup or paragraph identity.
add_action('init', static function () {
    $schemas = json_decode(
        file_get_contents(__DIR__ . '/includes/php-converter/block-capabilities.json'),
        true,
    );
    foreach (['collapse', 'steps', 'step', 'code-compare'] as $kind) {
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
        if (!str_starts_with($name, 'mbb/')) {
            return $html;
        }
        $kind = substr($name, 4);
        if (!in_array($kind, ['collapse', 'steps', 'step', 'code-compare'], true)) {
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
        if ($kind === 'steps') {
            $config['mode'] = apply_filters(
                'markbridge_teaching_steps_mode',
                $config['mode'] ?? 'full',
                $block,
            );
        }
        return preg_replace(
            '/^<div\b/',
            '<div data-mbb-teaching="' .
                esc_attr($kind) .
                '" data-mbb-teaching-config="' .
                esc_attr(wp_json_encode($config)) .
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
                    '/<!-- wp:mbb\/(collapse|steps|step|code-compare)\b/',
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
