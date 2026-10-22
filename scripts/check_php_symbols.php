<?php
/** First-party PHP declaration inventory; never execute plugin files or vendor autoloaders. */
namespace MarkBridge\Checks;
function php_symbols(string $source, string $file): array
{
    $tokens = token_get_all($source, TOKEN_PARSE);
    $namespace = '';
    $stack = [];
    $pending = null;
    $previous = null;
    $out = [];
    $significant = static fn($t) => !is_array($t) ||
        !in_array($t[0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true);
    foreach ($tokens as $i => $token) {
        if (!$significant($token)) {
            continue;
        }
        $kind = is_array($token) ? $token[0] : null;
        $text = is_array($token) ? $token[1] : $token;
        if ($kind === T_NAMESPACE) {
            $name = '';
            for ($j = $i + 1; isset($tokens[$j]); $j++) {
                $next = $tokens[$j];
                if ($next === ';' || $next === '{') {
                    break;
                }
                if ($significant($next)) {
                    $name .= is_array($next) ? $next[1] : $next;
                }
            }
            $pending = ['kind' => 'namespace', 'previous' => $namespace];
            $namespace = trim($name, '\\');
        } elseif (
            in_array($kind, [T_CLASS, T_INTERFACE, T_TRAIT, T_ENUM], true) &&
            $previous !== T_DOUBLE_COLON
        ) {
            $pending = ['kind' => 'class'];
            for ($j = $i + 1; isset($tokens[$j]) && !$significant($tokens[$j]); $j++) {
            }
            if (is_array($tokens[$j] ?? null) && $tokens[$j][0] === T_STRING) {
                $out[] = [
                    'kind' => 'class',
                    'name' => ltrim($namespace . '\\' . $tokens[$j][1], '\\'),
                    'file' => $file,
                    'line' => $token[2],
                ];
            }
        } elseif ($kind === T_FUNCTION && $previous !== T_USE) {
            $classAt = $functionAt = -1;
            foreach ($stack as $at => $scope) {
                if ($scope['kind'] === 'class') {
                    $classAt = $at;
                }
                if ($scope['kind'] === 'function') {
                    $functionAt = $at;
                }
            }
            for ($j = $i + 1; isset($tokens[$j]); $j++) {
                $next = $tokens[$j];
                if (!$significant($next) || (is_array($next) ? $next[1] : $next) === '&') {
                    continue;
                }
                break;
            }
            if (
                ($classAt < 0 || $functionAt > $classAt) &&
                is_array($tokens[$j] ?? null) &&
                $tokens[$j][0] === T_STRING
            ) {
                $out[] = [
                    'kind' => 'function',
                    'name' => ltrim($namespace . '\\' . $tokens[$j][1], '\\'),
                    'file' => $file,
                    'line' => $token[2],
                ];
            }
            $pending = ['kind' => 'function'];
        }
        if ($text === '{' || in_array($kind, [T_CURLY_OPEN, T_DOLLAR_OPEN_CURLY_BRACES], true)) {
            $stack[] = $pending ?? ['kind' => 'block'];
            $pending = null;
        } elseif ($text === '}') {
            $scope = array_pop($stack);
            if (($scope['kind'] ?? null) === 'namespace') {
                $namespace = $scope['previous'];
            }
        } elseif ($text === ';') {
            $pending = null;
        }
        $previous = $kind ?? $text;
    }
    return $out;
}
function unique_php_symbols(array $symbols): void
{
    $seen = [];
    foreach ($symbols as $symbol) {
        $key = $symbol['kind'] . ':' . strtolower($symbol['name']);
        if (isset($seen[$key])) {
            $first = $seen[$key];
            throw new \RuntimeException(
                'Duplicate PHP ' .
                    $symbol['kind'] .
                    ' ' .
                    $symbol['name'] .
                    ': ' .
                    $first['file'] .
                    ':' .
                    $first['line'] .
                    ' and ' .
                    $symbol['file'] .
                    ':' .
                    $symbol['line'],
            );
        }
        $seen[$key] = $symbol;
    }
}
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    $root = dirname(__DIR__) . '/plugin';
    $symbols = [];
    $files = 0;
    $iterator = new \RecursiveIteratorIterator(
        new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS),
    );
    foreach ($iterator as $file) {
        $relative = substr($file->getPathname(), strlen($root) + 1);
        if (
            $file->getExtension() !== 'php' ||
            preg_match('~(?:^|/)(?:vendor|scoped)(?:/|$)~', $relative)
        ) {
            continue;
        }
        $files++;
        array_push(
            $symbols,
            ...php_symbols(file_get_contents($file->getPathname()), 'plugin/' . $relative),
        );
    }
    unique_php_symbols($symbols);
    echo 'First-party PHP global symbols unique: ' .
        count($symbols) .
        ' declarations across ' .
        $files .
        " files.\n";
}
