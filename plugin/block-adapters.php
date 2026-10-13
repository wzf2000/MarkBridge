<?php
// Trusted PHP registrations describe static content only. Article/REST data cannot register adapters.
require_once __DIR__ . '/includes/php-converter/Converter.php';
function mbb_block_adapters(): array
{
    $items = array_values($GLOBALS['mbb_block_adapters'] ?? []);
    return \MarkBridge\Probe\BlockAdapters::validateDescriptors($items);
}
function mbb_block_adapter_snapshot(): string
{
    return \MarkBridge\Probe\Teaching::encode(mbb_block_adapters());
}
function mbb_block_adapter_inline_json(): string
{
    return json_encode(
        json_decode(mbb_block_adapter_snapshot(), false, 32, JSON_THROW_ON_ERROR),
        JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR,
    );
}
function mbb_block_adapter_digest(): string
{
    return hash('sha256', mbb_block_adapter_snapshot());
}
function mbb_register_block_adapter($descriptor): bool
{
    try {
        // Re-encode at the trusted boundary to reject non-JSON values and preserve object/array types.
        $json = \MarkBridge\Probe\Teaching::encode($descriptor);
        $d = \MarkBridge\Probe\BlockAdapters::validateDescriptors('[' . $json . ']')[0];
        $existing = $GLOBALS['mbb_block_adapters'] ?? [];
        if (isset($existing[$d['name']]) || count($existing) >= 16) {
            return false;
        }
        foreach ($existing as $other) {
            if ($other['blockName'] === $d['blockName']) {
                return false;
            }
        }
        if (
            class_exists('WP_Block_Type_Registry') &&
            WP_Block_Type_Registry::get_instance()->is_registered($d['blockName'])
        ) {
            return false;
        }
        $attrs = ['mbbAdapterVersion' => ['type' => 'string']];
        foreach ($d['attributes'] as $key => $field) {
            $attrs[$key] = [
                'type' =>
                    $field['type'] === 'integer'
                        ? 'number'
                        : ($field['type'] === 'boolean'
                            ? 'boolean'
                            : 'string'),
            ];
        }
        if (
            function_exists('register_block_type') &&
            !register_block_type($d['blockName'], [
                'api_version' => 3,
                'attributes' => $attrs,
                'supports' => [
                    'className' => false,
                    'customClassName' => false,
                    'html' => false,
                    'anchor' => false,
                ],
            ])
        ) {
            return false;
        }
        $GLOBALS['mbb_block_adapters'][$d['name']] = $d;
        return true;
    } catch (Throwable $error) {
        return false;
    }
}
function mbb_unregister_block_adapter(string $name): bool
{
    $d = $GLOBALS['mbb_block_adapters'][$name] ?? null;
    if (!$d) {
        return false;
    }
    unset($GLOBALS['mbb_block_adapters'][$name]);
    if (function_exists('unregister_block_type')) {
        unregister_block_type($d['blockName']);
    }
    return true;
}
function mbb_block_adapter_names(): array
{
    return array_column(mbb_block_adapters(), 'blockName');
}
function mbb_document_has_adapters(string $serialized): bool
{
    // An actual block comment is required; literal code/Markdown text is not a registry dependency.
    foreach (parse_blocks($serialized) as $block) {
        if (
            array_key_exists('mbbAdapterVersion', $block['attrs'] ?? []) ||
            mbb_document_has_adapters_in($block['innerBlocks'] ?? [])
        ) {
            return true;
        }
    }
    return false;
}
function mbb_document_has_adapters_in(array $blocks): bool
{
    foreach ($blocks as $block) {
        if (
            array_key_exists('mbbAdapterVersion', $block['attrs'] ?? []) ||
            mbb_document_has_adapters_in($block['innerBlocks'] ?? [])
        ) {
            return true;
        }
    }
    return false;
}
function mbb_block_adapter_confirm($request, array $candidate)
{
    // Never re-parse or refresh the candidate's captured registry identity here.
    $captured = $candidate['_adapter_registry_digest'] ?? null;
    $required = $candidate['adapter_digest'] ?? null;
    if (
        !is_string($captured) ||
        !hash_equals($captured, mbb_block_adapter_digest()) ||
        ($required !== null &&
            (!is_string($request['adapter_digest'] ?? null) ||
                !hash_equals($captured, $request['adapter_digest']) ||
                !hash_equals($captured, $required)))
    ) {
        return mbb_error(
            'adapter_conflict',
            '静态区块登记已变化或尚未确认，请保留候选并重新预览。',
        );
    }
    return true;
}
function mbb_enqueue_block_adapter_snapshot(): void
{
    static $attached = false;
    if (!$attached && wp_script_is('mbb-kernel', 'enqueued')) {
        $attached = true;
        wp_add_inline_script(
            'mbb-kernel',
            'window.MBB_ADAPTERS=' . mbb_block_adapter_inline_json() . ';',
            'before',
        );
    }
}
add_action('enqueue_block_editor_assets', 'mbb_enqueue_block_adapter_snapshot', 20);

add_filter(
    'render_block',
    static function ($html, $block) {
        $version = $block['attrs']['mbbAdapterVersion'] ?? null;
        if ($version === null) {
            return $html;
        }
        foreach (mbb_block_adapters() as $descriptor) {
            if (
                $descriptor['blockName'] === ($block['blockName'] ?? '') &&
                $descriptor['version'] === $version
            ) {
                return $html;
            }
        }
        return '<p class="mbb-adapter-unavailable" data-mbb-generated="" role="status">静态区块适配包或版本不可用；已保存内容与配置保留，转换和配对恢复暂不可用。</p>' .
            $html;
    },
    20,
    2,
);
