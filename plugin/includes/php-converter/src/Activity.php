<?php
namespace MarkBridge\Probe;

/** Provider-independent v2 component relationships. Answers belong to providers. */
final class Activity
{
    private static function closed(mixed $v, array $keys): bool
    {
        return $v instanceof \stdClass &&
            count(get_object_vars($v)) === count($keys) &&
            !array_diff($keys, array_keys(get_object_vars($v)));
    }
    private static function id(mixed $v): bool
    {
        return is_string($v) && preg_match('/^[A-Za-z][A-Za-z0-9_-]{0,63}$/D', $v) === 1;
    }
    private static function bad(): never
    {
        throw new ConversionError(
            'ACTIVITY_RELATION',
            'Activity relations require a closed map of unique local static targets',
        );
    }
    public static function relations(mixed $v): array
    {
        if (
            !self::closed($v, [
                'schema',
                'prompt',
                'options',
                'hints',
                'feedback',
                'explanation',
            ]) ||
            ($v->schema !== 1 && $v->schema !== 1.0) ||
            !self::id($v->prompt) ||
            !self::id($v->explanation) ||
            !is_array($v->options) ||
            !array_is_list($v->options) ||
            count($v->options) > 8 ||
            !is_array($v->hints) ||
            !array_is_list($v->hints) ||
            count($v->hints) > 3 ||
            !self::closed($v->feedback, ['correct', 'incorrect']) ||
            !self::id($v->feedback->correct) ||
            !self::id($v->feedback->incorrect)
        ) {
            self::bad();
        }
        foreach ($v->hints as $target) {
            if (!self::id($target)) {
                self::bad();
            }
        }
        $keys = [];
        $targets = [$v->prompt];
        foreach ($v->options as $option) {
            if (
                !self::closed($option, ['key', 'target']) ||
                !is_string($option->key) ||
                !preg_match('/^[a-z][a-z0-9_-]{0,15}$/D', $option->key) ||
                isset($keys[$option->key]) ||
                !self::id($option->target)
            ) {
                self::bad();
            }
            $keys[$option->key] = true;
            $targets[] = $option->target;
        }
        $targets = [
            ...$targets,
            ...$v->hints,
            $v->feedback->correct,
            $v->feedback->incorrect,
            $v->explanation,
        ];
        if (count(array_unique($targets)) !== count($targets)) {
            self::bad();
        }
        return $targets;
    }
    public static function validate(array $block): void
    {
        $a = $block['attributes'] ?? ($block['attrs'] ?? []);
        if (
            ($a['version'] ?? 1) !== 2 ||
            ($block['name'] ?? ($block['blockName'] ?? '')) !== 'mbb/component'
        ) {
            return;
        }
        $targets = self::relations($a['activity']);
        $parts = [];
        $walk = static function (array $list) use (&$walk, &$parts) {
            foreach ($list as $child) {
                $name = $child['name'] ?? ($child['blockName'] ?? '');
                if ($name === 'mbb/component') {
                    continue;
                }
                if ($name === 'mbb/collapse') {
                    $parts[($child['attributes'] ?? $child['attrs'])['id']] =
                        $child['attributes'] ?? $child['attrs'];
                }
                $walk($child['innerBlocks'] ?? ($child['children'] ?? []));
            }
        };
        $walk($block['innerBlocks'] ?? ($block['children'] ?? []));
        foreach ($targets as $target) {
            if (!isset($parts[$target])) {
                throw new ConversionError(
                    'ACTIVITY_TARGET',
                    'Activity targets must exist within their own component; prompts and options must be direct open static parts',
                );
            }
        }
        $direct = [];
        foreach ($block['innerBlocks'] ?? ($block['children'] ?? []) as $child) {
            if (($child['name'] ?? ($child['blockName'] ?? '')) === 'mbb/collapse') {
                $part = $child['attributes'] ?? $child['attrs'];
                $direct[$part['id']] = $part;
            }
        }
        foreach (
            [
                $a['activity']->prompt,
                ...array_map(static fn($o) => $o->target, $a['activity']->options),
            ]
            as $target
        ) {
            if (($direct[$target]['open'] ?? null) !== true) {
                throw new ConversionError(
                    'ACTIVITY_TARGET',
                    'Activity targets must exist within their own component; prompts and options must be direct open static parts',
                );
            }
        }
    }
}
