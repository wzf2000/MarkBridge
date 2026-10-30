<?php
require dirname(__DIR__) . '/plugin/code-runner-static.php';
function static_check($value, $message)
{
    if (!$value) {
        throw new RuntimeException($message);
    }
}
$p = (object) [
    'version' => 1,
    'language' => 'python',
    'title' => '示例 <script>',
    'sourceChunks' => ["\xef\xbb\xbfprint('<img>')\r\n  "],
    'stdinChunks' => ["1 2\r\n"],
];
$a = [
    'id' => 'example',
    'component' => 'code-runner',
    'componentVersion' => '0.1.0',
    'params' => $p,
];
$html = mbb_code_runner_static($a);
static_check(
    str_contains(
        $html,
        htmlspecialchars($p->sourceChunks[0], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'),
    ),
    'Code changed or not escaped',
);
static_check(
    !str_contains($html, 'data-mbb-teaching') && !str_contains($html, '<script>'),
    'Executable host markup',
);
$p->sourceChunks = ['updated'];
static_check(
    str_contains(mbb_code_runner_static($a), '<code>updated</code>'),
    'Changed parameters not reflected',
);
$explanation =
    '<p id="question">题意与 $x^2$ 公式</p><ul><li>第一项<ul><li>嵌套项</li></ul></li></ul>' .
    '<div class="equation"><span class="math">\\(x + 1\\)</span></div><pre><code>&lt;解释代码&gt;</code></pre>';
$original =
    '<div id="example" class="wp-block-mbb-component"><p data-mbb-generated="" class="mbb-component-params">e30=</p>' .
    '<div class="mbb-teaching-body">' .
    $explanation .
    '</div></div>';
$rendered = mbb_code_runner_render($original, $a);
static_check(
    mbb_code_runner_explanation($original) === $explanation,
    'Original explanation bytes changed',
);
static_check(
    mbb_code_runner_explanation($rendered, true) === $explanation,
    'Derived explanation bytes changed',
);
static_check(substr_count($rendered, 'id="question"') === 1, 'Explanation rendered twice');
$unknown = '<div class="other-wrapper">' . $explanation . '</div>';
static_check(mbb_code_runner_render($unknown, $a) === $unknown, 'Unknown rendered structure lost');
$a['componentVersion'] = '0.2.0';
static_check(mbb_code_runner_static($a) === null, 'Unknown version guessed');
$a['componentVersion'] = '0.1.0';
foreach (
    [
        ['url', 'https://example.invalid'],
        ['language', 'javascript'],
        ['sourceChunks', [str_repeat('x', 1025)]],
        ['stdinChunks', ["\0"]],
    ]
    as [$k, $v]
) {
    $bad = clone $p;
    $bad->$k = $v;
    $a['params'] = $bad;
    static_check(mbb_code_runner_static($a) === null, 'Malformed model accepted');
}
echo "Static Runner contract without provider passed\n";
