<?php

declare(strict_types=1);

// Build-only: use Composer's regenerated classmap data, not its shared runtime classes.
$directory = dirname(__DIR__) . '/plugin/includes/php-converter/scoped';
$prefix = 'MarkBridge\\Vendor\\ConverterV1\\';
$map = require $directory . '/vendor/composer/autoload_classmap.php';
unset($map['Composer\\InstalledVersions']); // No converter code uses Composer's package API.
$relative = static function (string $path) use ($directory): string {
    if (!str_starts_with($path, $directory . '/vendor/') || !is_file($path) || is_link($path)) {
        throw new RuntimeException('Invalid isolated autoload path');
    }
    return substr($path, strlen($directory));
};
foreach ($map as $class => &$path) {
    if (!str_starts_with($class, $prefix)) {
        throw new RuntimeException('An unisolated dependency remains in the classmap: ' . $class);
    }
    $path = $relative($path);
}
unset($path);
$files = array_map(
    $relative,
    array_values(require $directory . '/vendor/composer/autoload_files.php'),
);
$loader = <<<'PHP'
<?php
// Generated from PHP-Scoper output and Composer's authoritative classmap.
(static function (): void {
    $map = __MAP__;
    spl_autoload_register(static function (string $class) use ($map): void {
        if (isset($map[$class])) {
            require __DIR__ . $map[$class];
        }
    }, true, true);
    foreach (__FILES__ as $file) {
        require_once __DIR__ . $file;
    }
})();
PHP;
file_put_contents(
    $directory . '/autoload.php',
    strtr($loader, ['__MAP__' => var_export($map, true), '__FILES__' => var_export($files, true)]) .
        "\n",
);
// Composer's generated runtime is intentionally omitted: no shared ClassLoader,
// InstalledVersions or package-name file-hash cache can affect this converter.
foreach (new DirectoryIterator($directory . '/vendor/composer') as $file) {
    if ($file->isFile() && !in_array($file->getFilename(), ['LICENSE', 'installed.json'], true)) {
        unlink($file->getPathname());
    }
}
unlink($directory . '/vendor/autoload.php');
if (is_file($directory . '/vendor/scoper-autoload.php')) {
    unlink($directory . '/vendor/scoper-autoload.php');
}
echo 'Isolated autoload map verified: ' . count($map) . " classes\n";
