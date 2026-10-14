<?php
require_once __DIR__ . '/i18n.php';
if (!defined('ABSPATH')) {
    exit();
}

// Public diagnostics contain only parser coordinates, never snippets or paths.
function mbb_conversion_position($location)
{
    if (!is_string($location) || strlen($location) > 512) {
        return [];
    }
    if (preg_match('/^line:([1-9][0-9]*)(?::([1-9][0-9]*))?$/D', $location, $match)) {
        $position = ['kind' => 'source', 'line' => (int) $match[1], 'scope' => 'block'];
        if (isset($match[2])) {
            $position['column'] = (int) $match[2];
            $position['scope'] = 'point';
        }
        return $position;
    }
    if (
        preg_match(
            '/^blocks((?:\[[0-9]+\])+)(?:\.attributes(?:\.([a-zA-Z][a-zA-Z0-9_-]{0,63}))?)?$/D',
            $location,
            $match,
        )
    ) {
        preg_match_all('/\[([0-9]+)\]/', $match[1], $indices);
        return [
            'kind' => 'block',
            'path' => array_map('intval', $indices[1]),
            'attribute' => $match[2] ?? (str_contains($location, '.attributes') ? '' : null),
        ];
    }
    // Legacy Node offsets are explicitly serialized character offsets, not source lines.
    if (preg_match('/^serialized:([0-9]+)$/D', $location, $match)) {
        return ['kind' => 'serialized', 'offset' => (int) $match[1]];
    }
    return [];
}

function mbb_conversion_location_label($position)
{
    if (($position['kind'] ?? '') === 'source') {
        return isset($position['column'])
            ? sprintf(
                mbb_t('Markdown line %1$s, column %2$s'),
                $position['line'],
                $position['column'],
            )
            : sprintf(mbb_t('Block at Markdown line %1$s'), $position['line']);
    }
    if (($position['kind'] ?? '') === 'block') {
        $path = implode(' → ', array_map(static fn($index) => $index + 1, $position['path']));
        return $position['attribute'] !== null
            ? sprintf(mbb_t('Block %1$s, attribute %2$s'), $path, $position['attribute'])
            : sprintf(mbb_t('Block %1$s'), $path);
    }
    return ($position['kind'] ?? '') === 'serialized'
        ? sprintf(mbb_t('Near serialized block character %1$s'), $position['offset'] + 1)
        : '';
}

function mbb_conversion_hint($code)
{
    if (str_starts_with($code, 'FOOTNOTE')) {
        return mbb_t(
            'Check named footnote references and definitions. Each definition must be unique, referenced, and placed at the end of the document.',
        );
    }
    if (in_array($code, ['UNCLOSED_MATH', 'MATH_DELIMITER', 'MATH_MISMATCH'], true)) {
        return mbb_t(
            'Check formula delimiters and TeX source. Each block formula delimiter $$ must occupy its own line.',
        );
    }
    if (
        in_array($code, ['INPUT_LIMIT', 'STRUCTURE_LIMIT', 'INPUT_ENCODING', 'INVALID_INPUT'], true)
    ) {
        return mbb_t('Reduce document size or nesting and use UTF-8 text without NUL.');
    }
    if (in_array($code, ['ROUNDTRIP', 'LOSSY_ROUNDTRIP', 'BLOCK_ATTRIBUTES'], true)) {
        return mbb_t(
            'Check this block\'s styles, attributes, and nesting. A supported block type does not imply support for all formatting. Download Markdown to preserve the candidate if needed.',
        );
    }
    if (str_contains($code, 'HTML') || str_contains($code, 'STYLE') || str_contains($code, 'URL')) {
        return mbb_t(
            'Use supported text formatting and safe links. Do not include scripts, event attributes, or unsupported HTML.',
        );
    }
    return mbb_t(
        'Check the indicated position and use supported blocks and formatting. The candidate is preserved; correct it and preview again.',
    );
}

function mbb_conversion_failure($result)
{
    $worker_code = $result['code'] ?? null;
    $valid_code = is_string($worker_code) && preg_match('/^[A-Z][A-Z0-9_]{0,63}$/D', $worker_code);
    $code = $valid_code ? $worker_code : 'CONVERSION';
    $position = mbb_conversion_position($result['location'] ?? '');
    $label = mbb_conversion_location_label($position);
    $hint = mbb_conversion_hint($code);
    return new WP_Error(
        $valid_code ? $worker_code : 'conversion',
        mbb_conversion_message($result) . ($label ? ' (' . $label . ')' : '') . '. ' . $hint,
        [
            'status' => 422,
            'conversion_code' => $code,
            'location' => $position ? $result['location'] : '',
            'position' => $position,
            'hint' => $hint,
        ],
    );
}

function mbb_conversion_message(array $result): string
{
    $message = $result['message'] ?? 'Conversion failed';
    if (
        !is_string($message) ||
        strlen($message) > 8192 ||
        !mb_check_encoding($message, 'UTF-8') ||
        str_contains($message, "\0")
    ) {
        return mbb_t('Conversion failed');
    }
    // Derive the descriptor from trusted, bounded English text. Never trust an arbitrary REST msgid.
    static $messages;
    $messages ??= json_decode(
        file_get_contents(__DIR__ . '/php-converter/diagnostics.json'),
        true,
        32,
        JSON_THROW_ON_ERROR,
    );
    $id = $result['message_id'] ?? null;
    if ($id === null && in_array($message, $messages, true)) {
        return mbb_t($message);
    }
    $args = $result['message_args'] ?? [];
    if (
        is_string($id) &&
        in_array($id, $messages, true) &&
        is_array($args) &&
        array_is_list($args) &&
        count($args) <= 8
    ) {
        foreach ($args as $arg) {
            if (
                !is_string($arg) ||
                strlen($arg) > 128 ||
                !preg_match(
                    '/^[a-zA-Z][a-zA-Z0-9_-]{0,63}(?:\/[a-zA-Z][a-zA-Z0-9_-]{0,63})?$/D',
                    $arg,
                )
            ) {
                return mbb_t('Conversion failed');
            }
        }
        try {
            if (
                (!$args || preg_match('/^(?:Unsupported |Expected |Block )/', $id)) &&
                sprintf($id, ...$args) === $message
            ) {
                return sprintf(mbb_t($id), ...$args);
            }
        } catch (Throwable $error) {
            // Invalid descriptors retain the precise bounded English detail.
        }
    }
    return mbb_t('Conversion failed');
}
