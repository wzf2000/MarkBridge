<?php
/** Fixed-descriptor model: no WordPress DB or external requests. */
function home_url($path = '/')
{
    return 'https://static-fixture.invalid' . $path;
}
function mbb_t($s)
{
    return $s;
}
function mbb_component_json($s)
{
    return json_encode($s, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
}
function mbb_export_throw($code, $message): never
{
    throw new RuntimeException($code . ':' . $message);
}
require dirname(__DIR__) . '/plugin/technical.php';
require dirname(__DIR__) . '/plugin/static-export.php';
$fixture = json_decode(
    file_get_contents(__DIR__ . '/fixtures/static-export.json'),
    true,
    64,
    JSON_THROW_ON_ERROR,
);
$png = base64_decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
);
$file = tempnam(sys_get_temp_dir(), 'mbb-static-test-');
file_put_contents($file, $png);
$sha = hash('sha256', $png);
$name = 'images/' . $sha . '.png';
$snapshot = [
    'document' => ['serialized' => $fixture['serialized']],
    'post' => (object) ['post_title' => $fixture['title']],
];
$files = [
    $name => [
        'file' => $file,
        'id' => 123,
        'url' => 'https://static-fixture.invalid/image.png',
        'sha256' => $sha,
    ],
];
$resources = [['path' => $name, 'bytes' => strlen($png), 'mime' => 'image/png', 'sha256' => $sha]];
$mappings = [['from' => 'https://static-fixture.invalid/image.png', 'to' => $name]];
try {
    $value = mbb_static_export_descriptor($snapshot, $files, $resources, $mappings);
    if (($argv[1] ?? '') === '--descriptor') {
        echo mbb_component_json($value);
        return;
    }
    if ($value !== mbb_static_export_descriptor($snapshot, $files, $resources, $mappings)) {
        throw new RuntimeException('Non-deterministic descriptor/digest inputs');
    }
    $json = mbb_component_json($value);
    foreach (
        [
            'PRIVATE_',
            'nonce=',
            '123',
            '<script',
            '<iframe',
            'data-mbb-teaching',
            'mbb-component-params',
            'post_content',
        ]
        as $needle
    ) {
        if (str_contains($json, $needle)) {
            throw new RuntimeException('Sensitive/executable marker: ' . $needle);
        }
    }
    foreach (
        [
            'Author fallback complete',
            'Stage two',
            'Hidden body complete',
            'Complete proof',
            'JavaScript',
            'Python',
            'Footnote body',
            'Equation 1',
            'First paper',
            'Second paper',
            'open=""',
        ]
        as $needle
    ) {
        if (!str_contains($value['body'], $needle)) {
            throw new RuntimeException('Missing static body ' . $needle);
        }
    }
    foreach (
        [
            '<img src="https://external.invalid/a.png">',
            '<script>alert(1)</script>',
            '<p onclick="bad()">bad</p>',
            '<form><input></form>',
            '<img src="x" srcset="x 1x">',
            '<a href="javascript:alert(1)">bad</a>',
            '<ol><li value="0">bad</li></ol>',
            '<ol><li value="65">bad</li></ol>',
            '<p value="1">bad</p>',
        ]
        as $bad
    ) {
        try {
            mbb_static_export_descriptor(
                ['document' => ['serialized' => $bad], 'post' => $snapshot['post']],
                $files,
                $resources,
                $mappings,
            );
            throw new LogicException('Unsafe input accepted');
        } catch (RuntimeException $e) {
            if ($e instanceof LogicException) {
                throw $e;
            }
        }
    }
    $external = 'https://external.invalid/a.png';
    $linked = mbb_static_export_descriptor(
        [
            'document' => [
                'serialized' =>
                    '<figure><a href="https://reading.invalid/paper"><img src="' .
                    $external .
                    '" alt="External chart"></a><figcaption>Caption retained</figcaption></figure>',
            ],
            'post' => $snapshot['post'],
        ],
        [],
        [],
        [],
        [['url' => $external]],
    );
    if (
        str_contains($linked['body'], '<img') ||
        !str_contains($linked['body'], 'Caption retained') ||
        !str_contains($linked['body'], 'mbb-external-image-link') ||
        !str_contains($linked['body'], 'noreferrer')
    ) {
        throw new RuntimeException('External image was not a linked, caption-preserving fallback');
    }
    [$linkedDoc, $linkedXpath] = mbb_static_export_fragment($linked['body']);
    if ($linkedXpath->query('//a/a')->length || $linkedXpath->query('//a')->length !== 2) {
        throw new RuntimeException('Authored image link became nested or lost');
    }
    foreach (
        [
            'https://static-fixture.invalid/unverified.png',
            'https://user:password@external.invalid/image.png',
            'javascript:alert(1)',
            'data:image/png;base64,AAA',
            '//external.invalid/image.png',
        ]
        as $unsafeImage
    ) {
        try {
            mbb_static_export_descriptor(
                [
                    'document' => [
                        'serialized' =>
                            '<img src="' . htmlspecialchars($unsafeImage, ENT_QUOTES) . '">',
                    ],
                    'post' => $snapshot['post'],
                ],
                [],
                [],
                [],
                [['url' => $unsafeImage]],
            );
            throw new LogicException('Unverified or unsafe image link accepted');
        } catch (RuntimeException $e) {
            if ($e instanceof LogicException) {
                throw $e;
            }
        }
    }
    $table = mbb_static_export_body(
        '<table><tr><th id="head" scope="col">Value</th></tr><tr><td headers="head">42</td></tr></table>',
    );
    if (!str_contains($table, 'headers="head"') || !str_contains($table, 'scope="col"')) {
        throw new RuntimeException('Table associations lost');
    }
    foreach (
        ['<p headers="head">x</p>', '<th scope="invalid">x</th>', '<td headers="a&lt;b">x</td>']
        as $unsafe
    ) {
        try {
            mbb_static_export_body($unsafe);
            throw new LogicException('Unsafe table attribute accepted');
        } catch (RuntimeException $e) {
            if ($e instanceof LogicException) {
                throw $e;
            }
        }
    }
    file_put_contents($file, $png . 'changed');
    try {
        mbb_static_export_descriptor($snapshot, $files, $resources, $mappings);
        throw new LogicException('Changed resource accepted');
    } catch (RuntimeException $e) {
        if ($e instanceof LogicException) {
            throw $e;
        }
    }
    echo "Static descriptor: deterministic full fallback/stages/proof/code/footnotes, closed images, metadata removal and changed resource rejection passed\n";
} finally {
    unlink($file);
}
