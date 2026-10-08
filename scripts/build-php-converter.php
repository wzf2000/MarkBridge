<?php

declare(strict_types=1);

// Build-time only: dependencies are installed from composer.lock before this runs.
$root = dirname(__DIR__);
$directory = $root . '/plugin/includes/php-converter';
$lock = json_decode(
    file_get_contents($directory . '/composer.lock'),
    true,
    512,
    JSON_THROW_ON_ERROR,
);
$installed = json_decode(
    file_get_contents($directory . '/scoped/vendor/composer/installed.json'),
    true,
    512,
    JSON_THROW_ON_ERROR,
);
$expected = [];
foreach ($lock['packages'] as $package) {
    $expected[$package['name']] = $package['version'];
}
$actual = [];
foreach ($installed['packages'] as $package) {
    $actual[$package['name']] = $package['version'];
}
ksort($expected);
ksort($actual);
if ($expected !== $actual || !empty($installed['dev'])) {
    throw new RuntimeException(
        'Install the exact locked PHP dependencies without development packages',
    );
}
$licenses = [
    'composer/LICENSE',
    'dflydev/dot-access-data/LICENSE',
    'league/commonmark/LICENSE',
    'league/config/LICENSE.md',
    'nette/schema/license.md',
    'nette/utils/license.md',
    'psr/event-dispatcher/LICENSE',
    'symfony/deprecation-contracts/LICENSE',
    'symfony/polyfill-php80/LICENSE',
];
foreach ($licenses as $license) {
    if (!is_file($directory . '/scoped/vendor/' . $license)) {
        throw new RuntimeException('Missing PHP dependency license: ' . $license);
    }
}
$files = [];
$iterator = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($directory . '/scoped', FilesystemIterator::SKIP_DOTS),
);
foreach ($iterator as $file) {
    if ($file->isLink() || !$file->isFile()) {
        throw new RuntimeException('PHP conversion dependencies must be regular files');
    }
    $name = 'includes/php-converter/' . substr($file->getPathname(), strlen($directory) + 1);
    $files[$name] = hash_file('sha256', $file->getPathname());
}
ksort($files);
$inputs = json_decode(
    file_get_contents($directory . '/scoped/build-inputs.json'),
    true,
    512,
    JSON_THROW_ON_ERROR,
);
if (!is_array($inputs) || count($inputs) !== 12) {
    throw new RuntimeException('Missing PHP isolation input stamp; run npm run build:php');
}
foreach ($inputs as $name => $digest) {
    if (!hash_equals($digest, hash_file('sha256', $root . '/' . $name))) {
        throw new RuntimeException('Stale PHP isolation output; run npm run build:php');
    }
}
foreach (
    [
        'Converter.php',
        'Worker.php',
        'MathExtension.php',
        'Footnotes.php',
        'DisplayBoundaries.php',
        'composer.json',
        'composer.lock',
    ]
    as $name
) {
    $files['includes/php-converter/' . $name] = hash_file('sha256', $directory . '/' . $name);
}
ksort($files);
ksort($inputs);
$manifest = [
    'schema' => 2,
    'prefix' => 'MarkBridge\\Vendor\\ConverterV1',
    'scoper' => '0.18.19',
    'files' => $files,
    'build_inputs' => $inputs,
];
file_put_contents(
    $root . '/plugin/php-converter-manifest.json',
    json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . "\n",
);
echo 'PHP conversion library and locked dependencies verified: ' . count($files) . " files\n";
