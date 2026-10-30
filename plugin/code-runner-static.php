<?php
// A data-only, exact-version reading contract. No execution or network capability.
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}
require_once __DIR__ . '/includes/i18n.php';
function mbb_code_runner_model($value): ?stdClass
{
    try {
        $p = is_array($value) ? (object) $value : $value;
        if (
            !($p instanceof stdClass) ||
            count(get_object_vars($p)) !== 5 ||
            array_diff(array_keys(get_object_vars($p)), [
                'version',
                'language',
                'title',
                'sourceChunks',
                'stdinChunks',
            ]) ||
            ($p->version ?? null) !== 1 ||
            !in_array($p->language ?? null, ['python', 'cpp'], true) ||
            !is_string($p->title ?? null) ||
            strlen($p->title) < 1 ||
            strlen($p->title) > 160 ||
            preg_match('//u', $p->title) !== 1 ||
            preg_match('/[\x00-\x1f\x7f]/', $p->title)
        ) {
            return null;
        }
        foreach (['sourceChunks' => 8, 'stdinChunks' => 4] as $field => $max) {
            $a = $p->$field ?? null;
            if (!is_array($a) || !array_is_list($a) || count($a) < 1 || count($a) > $max) {
                return null;
            }
            foreach ($a as $s) {
                if (
                    !is_string($s) ||
                    strlen($s) > 1024 ||
                    preg_match('//u', $s) !== 1 ||
                    preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/', $s)
                ) {
                    return null;
                }
            }
        }
        return strlen(
            json_encode(
                $p,
                JSON_THROW_ON_ERROR |
                    JSON_UNESCAPED_UNICODE |
                    JSON_UNESCAPED_SLASHES |
                    JSON_UNESCAPED_LINE_TERMINATORS,
            ),
        ) <= 16384
            ? $p
            : null;
    } catch (Throwable) {
        return null;
    }
}
/** Extract only the fixed already-rendered body; never render children a second time. */
function mbb_code_runner_explanation(string $html, bool $derived = false): ?string
{
    $pattern = $derived
        ? '~\A<section class="mbb-code-runner-static" id="[^"]*"><h3>[^<]*</h3><p>[^<]*</p><div class="mbb-code-runner-explanation">([\s\S]*)</div><pre><code>[^<]*</code></pre><p>[^<]*</p><pre>[^<]*</pre></section>\z~D'
        : '~\A\s*<div\b[^>]*>\s*(?:<p data-mbb-generated="" class="mbb-component-params">[A-Za-z0-9+/=]*</p>\s*)?<div class="mbb-teaching-body">([\s\S]*)</div>\s*</div>\s*\z~D';
    return preg_match($pattern, $html, $match) === 1 ? $match[1] : null;
}
function mbb_code_runner_render(string $html, array $attrs): string
{
    $explanation = mbb_code_runner_explanation($html);
    if ($explanation === null) {
        return $html;
    }
    return mbb_code_runner_static($attrs, $explanation) ?? $html;
}
function mbb_code_runner_static(array $attrs, string $explanation = ''): ?string
{
    if (
        ($attrs['component'] ?? '') !== 'code-runner' ||
        ($attrs['componentVersion'] ?? '') !== '0.1.0'
    ) {
        return null;
    }
    if (
        !is_string($attrs['id'] ?? null) ||
        !preg_match('/\A[A-Za-z][A-Za-z0-9_-]{0,63}\z/D', $attrs['id'])
    ) {
        return null;
    }
    $p = mbb_code_runner_model($attrs['params'] ?? null);
    if (!$p) {
        return null;
    }
    $escape = static fn($s) => htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    return '<section class="mbb-code-runner-static" id="' .
        $escape($attrs['id'] ?? '') .
        '"><h3>' .
        $escape($p->title) .
        '</h3><p>' .
        ($p->language === 'python' ? 'Python' : 'C++20') .
        ' · ' .
        $escape(
            mbb_t(
                'One source file and the standard library. The example remains readable when execution is unavailable.',
            ),
        ) .
        '</p><div class="mbb-code-runner-explanation">' .
        $explanation .
        '</div><pre><code>' .
        $escape(implode('', $p->sourceChunks)) .
        '</code></pre><p>' .
        $escape(mbb_t('Standard input')) .
        '</p><pre>' .
        $escape(implode('', $p->stdinChunks)) .
        '</pre></section>';
}
