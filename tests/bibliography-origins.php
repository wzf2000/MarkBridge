<?php
require __DIR__ . '/../plugin/includes/php-converter/Worker.php';
use MarkBridge\Probe\Bibliography;
use MarkBridge\Probe\Teaching;
$fixture = json_decode(
    file_get_contents(__DIR__ . '/fixtures/bibliography-origins.json'),
    true,
    32,
    JSON_THROW_ON_ERROR,
);
if (
    Bibliography::canonical($fixture['entry']) !== $fixture['canonical'] ||
    Bibliography::hash($fixture['entry']) !== $fixture['hash']
) {
    throw new RuntimeException('Shared UTF-8 golden mismatch');
}
$renamed = $fixture['entry'];
$renamed['key'] = 'Renamed';
if (Bibliography::hash($renamed) !== $fixture['hash']) {
    throw new RuntimeException('Article key must be excluded');
}
$origin = [
    'key' => $fixture['entry']['key'],
    'namespace' => 'L_' . str_repeat('a', 32),
    'item' => 'I_' . str_repeat('b', 32),
    'version' => 1,
    'hash' => $fixture['hash'],
];
Bibliography::attrs([
    'style' => 'numeric',
    'entries' => [$fixture['entry']],
    'origins' => [$origin],
]);
$changed = $fixture['entry'];
$changed['title'] = 'Local change';
Bibliography::attrs(['style' => 'numeric', 'entries' => [$changed], 'origins' => [$origin]]);
if (Bibliography::hash($changed) === $origin['hash']) {
    throw new RuntimeException('Changed content must differ');
}
try {
    Teaching::json('{"origins":{}}');
    throw new RuntimeException('Object accepted');
} catch (\MarkBridge\Probe\ConversionError $e) {
}
echo 'Shared bibliography origins golden hash, Unicode/line separators, renamed key, modified snapshot and JSON shape passed on PHP ' .
    PHP_VERSION .
    "\n";
