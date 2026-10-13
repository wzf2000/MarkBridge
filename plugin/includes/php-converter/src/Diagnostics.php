<?php
declare(strict_types=1);
namespace MarkBridge\Probe;

// Standalone CLI conversion and model tests remain supported; direct web access requires WordPress.
if (!defined('ABSPATH')) {
    if (PHP_SAPI !== 'cli') {
        exit();
    }
}

final class Diagnostics
{
    public static function describe(string $message): array
    {
        static $known;
        $known ??= array_fill_keys(
            json_decode(
                file_get_contents(dirname(__DIR__) . '/diagnostics.json'),
                true,
                32,
                JSON_THROW_ON_ERROR,
            ),
            true,
        );
        if (
            strlen($message) > 8192 ||
            !mb_check_encoding($message, 'UTF-8') ||
            str_contains($message, "\0")
        ) {
            return ['id' => null, 'args' => []];
        }
        if (isset($known[$message])) {
            return ['id' => $message, 'args' => []];
        }
        $patterns = array_keys($known);
        usort(
            $patterns,
            static fn($a, $b) => strlen(preg_replace('/%[1-8]\$s/', '', $b)) <=>
                strlen(preg_replace('/%[1-8]\$s/', '', $a)),
        );
        foreach ($patterns as $id) {
            if (!preg_match('/^(?:Unsupported |Expected |Block .* cannot )/', $id)) {
                continue;
            }
            if (!preg_match('/%[1-8]\$s/', $id)) {
                continue;
            }
            $regex =
                '~^' .
                preg_replace('/%[1-8]\\\\\$s/', '([\\s\\S]{0,1024})', preg_quote($id, '~')) .
                '$~D';
            if (preg_match($regex, $message, $matches)) {
                $args = array_slice($matches, 1);
                if (count($args) <= 8 && sprintf($id, ...$args) === $message) {
                    return ['id' => $id, 'args' => $args];
                }
            }
        }
        return ['id' => null, 'args' => []];
    }
}
