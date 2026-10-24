<?php
require dirname(__DIR__) . '/scripts/check_php_symbols.php';
use function MarkBridge\Checks\php_symbols;
use function MarkBridge\Checks\unique_php_symbols;
$valid = [
    '<?php namespace A; function shared() {} class Same { function method(){} }',
    '<?php namespace B { function shared() {} trait Same { function method(){} } } namespace { $x = new class { function method(){} }; $name = Foo::class; function local() { function nested() {} } }',
    '<?php class First { function same(){} } class Second { function same(){} function outer(){ function nestedGlobal() {} } }',
];
$symbols = [];
foreach ($valid as $i => $text) {
    array_push($symbols, ...php_symbols($text, 'valid-' . $i));
}
unique_php_symbols($symbols);
foreach (
    [
        [
            '<?php function mbb_resource_file(array $ctx, array $item): string {}',
            '<?php function mbb_resource_file(string $root, string $path, int $max): string {}',
        ],
        [
            '<?php namespace X; function Collision() {}',
            '<?php namespace x { function collision() {} }',
        ],
        ['<?php class Collision {}', '<?php trait collision {}'],
    ]
    as $pair
) {
    try {
        unique_php_symbols([
            ...php_symbols($pair[0], 'first.php'),
            ...php_symbols($pair[1], 'second.php'),
        ]);
        throw new LogicException('Duplicate declaration was not detected.');
    } catch (RuntimeException $e) {
        if (!str_contains($e->getMessage(), 'Duplicate PHP')) {
            throw $e;
        }
    }
}
echo "PHP symbol scanner namespace/method/anonymous-class and original resource collision regressions passed.\n";
