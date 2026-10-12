<?php
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
        return 'Markdown 第 ' .
            $position['line'] .
            ' 行' .
            (isset($position['column']) ? '，第 ' . $position['column'] . ' 列' : '所在区块');
    }
    if (($position['kind'] ?? '') === 'block') {
        $label =
            '第 ' .
            implode(' → ', array_map(static fn($index) => $index + 1, $position['path'])) .
            ' 个区块';
        if ($position['attribute'] !== null) {
            $label .=
                '，属性' . ($position['attribute'] === '' ? '' : ' ' . $position['attribute']);
        }
        return $label;
    }
    if (($position['kind'] ?? '') === 'serialized') {
        return '区块序列化内容第 ' . ($position['offset'] + 1) . ' 个字符附近';
    }
    return '';
}

function mbb_conversion_hint($code)
{
    if (str_starts_with($code, 'FOOTNOTE')) {
        return '请核对命名脚注的引用和定义；定义需唯一、被引用，并放在文末。';
    }
    if (in_array($code, ['UNCLOSED_MATH', 'MATH_DELIMITER', 'MATH_MISMATCH'], true)) {
        return '请核对公式分隔符和 TeX 源码；块公式的 $$ 应分别独占一行。';
    }
    if (
        in_array($code, ['INPUT_LIMIT', 'STRUCTURE_LIMIT', 'INPUT_ENCODING', 'INVALID_INPUT'], true)
    ) {
        return '请减少文档大小或嵌套层数，并使用不含 NUL 的 UTF-8 文本。';
    }
    if (in_array($code, ['ROUNDTRIP', 'LOSSY_ROUNDTRIP', 'BLOCK_ATTRIBUTES'], true)) {
        return '请检查此区块的样式、属性和嵌套；支持区块类型并不表示支持全部格式。可先下载 Markdown 保留候选。';
    }
    if (str_contains($code, 'HTML') || str_contains($code, 'STYLE') || str_contains($code, 'URL')) {
        return '请使用受支持的文本格式和安全链接；不要包含脚本、事件属性或不支持的 HTML。';
    }
    return '请检查标示位置，使用受支持的区块和格式；当前候选保留，请修正后重新预览。';
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
        ($result['message'] ?? '转换失败') . ($label ? '（' . $label . '）' : '') . '。' . $hint,
        [
            'status' => 422,
            'conversion_code' => $code,
            'location' => $position ? $result['location'] : '',
            'position' => $position,
            'hint' => $hint,
        ],
    );
}
