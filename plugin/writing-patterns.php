<?php
// The same canonical pattern JSON is instantiated by the browser and server tests.
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}
function mbb_instantiate_writing_pattern(string $id, ?string $instance = null): string
{
    $patterns = json_decode(file_get_contents(__DIR__ . '/writing-patterns.json'), true);
    foreach ($patterns as $pattern) {
        if ($pattern['id'] !== $id) {
            continue;
        }
        if (empty($pattern['instantiate'])) {
            return $pattern['source'];
        }
        $instance ??= 'pattern-' . bin2hex(random_bytes(12));
        if (!preg_match('/^[A-Za-z][A-Za-z0-9_-]{2,39}$/D', $instance)) {
            throw new InvalidArgumentException('Invalid writing pattern instance');
        }
        return str_replace('{{instance}}', $instance, $pattern['source']);
    }
    throw new InvalidArgumentException('Unknown writing pattern');
}
