<?php
// Trusted, data-only derived views. Never alter canonical source or saved HTML.
require_once __DIR__ . '/relation-map.php';
require_once __DIR__ . '/relation-map-documents.php';
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}
const MBB_PROJECTION_BYTES = 131072;
function mbb_projection_closed($v, array $keys, array $optional = []): bool
{
    return is_array($v) &&
        !array_diff(array_keys($v), array_merge($keys, $optional)) &&
        !array_diff($keys, array_keys($v));
}
function mbb_projection_finite($v, float $lo, float $hi): bool
{
    return (is_int($v) || is_float($v)) && is_finite((float) $v) && $v >= $lo && $v <= $hi;
}
function mbb_projection_text($v, int $max = 1024): bool
{
    return is_string($v) &&
        preg_match('//u', $v) === 1 &&
        strlen($v) <= $max &&
        !preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/', $v);
}
function mbb_projection_json(mixed $value): string
{
    require_once __DIR__ . '/includes/php-converter/Worker.php';
    return \MarkBridge\Probe\Teaching::encode($value);
}
function mbb_projection_normalize($node)
{
    if (is_string($node)) {
        return $node;
    }
    $node['attrs'] = (object) $node['attrs'];
    $node['children'] = array_map('mbb_projection_normalize', $node['children']);
    return $node;
}
function mbb_projection_tree(array $value): array
{
    if (
        !mbb_projection_closed($value, ['schema', 'tree']) ||
        !mbb_projection_finite($value['schema'], 1, 1) ||
        !is_array($value['tree']) ||
        !array_is_list($value['tree'])
    ) {
        throw new RuntimeException('projection_tree');
    }
    $profile = json_decode(
        file_get_contents(__DIR__ . '/projections-profile.json'),
        true,
        16,
        JSON_THROW_ON_ERROR,
    );
    $nodes = 0;
    $keys = [];
    $refs = [];
    $walk = static function ($node, $depth, $svg = false) use (
        &$walk,
        &$nodes,
        &$keys,
        &$refs,
        $profile,
    ) {
        if (++$nodes > 4096 || $depth > 16) {
            throw new RuntimeException('projection_structure');
        }
        if (is_string($node)) {
            if (!mbb_projection_text($node, 16384)) {
                throw new RuntimeException('projection_text');
            }
            return;
        }
        if (
            !mbb_projection_closed($node, ['tag', 'attrs', 'children'], ['key']) ||
            !is_string($node['tag']) ||
            !(is_array($node['attrs']) || $node['attrs'] instanceof stdClass) ||
            !is_array($node['children']) ||
            !array_is_list($node['children'])
        ) {
            throw new RuntimeException('projection_node');
        }
        $svg = $svg || $node['tag'] === 'svg';
        if (!in_array($node['tag'], $profile[$svg ? 'svg' : 'html'], true)) {
            throw new RuntimeException('projection_tag');
        }
        if (array_key_exists('key', $node)) {
            if (
                !is_string($node['key']) ||
                !preg_match('/\A[A-Za-z][A-Za-z0-9_-]{0,47}\z/D', $node['key']) ||
                isset($keys[$node['key']])
            ) {
                throw new RuntimeException('projection_key');
            }
            $keys[$node['key']] = true;
        }
        foreach ($node['attrs'] as $k => $v) {
            if (
                $svg &&
                isset($profile['attributeTags'][$k]) &&
                !in_array($node['tag'], $profile['attributeTags'][$k], true)
            ) {
                throw new RuntimeException('projection_attribute_tag');
            }
            $ok = false;
            if ($k === 'class') {
                $ok = is_string($v) && in_array($v, $profile['classes'], true);
            } elseif ($k === 'labelledby') {
                $ok = is_array($v) && array_is_list($v) && count($v) > 0 && count($v) <= 8;
                foreach ($ok ? $v : [] as $r) {
                    if (!is_string($r)) {
                        $ok = false;
                        break;
                    }
                    $refs[] = $r;
                }
            } elseif (in_array($k, $profile['text'], true)) {
                $ok = mbb_projection_text($v, 1024);
            } elseif ($k === 'role') {
                $ok = in_array($v, ['img', 'region', 'note'], true);
            } elseif (!$svg && $k === 'scope' && $node['tag'] === 'th') {
                $ok = in_array($v, ['row', 'col'], true);
            } elseif (
                !$svg &&
                in_array($k, ['colspan', 'rowspan'], true) &&
                in_array($node['tag'], ['td', 'th'], true)
            ) {
                $ok = mbb_projection_finite($v, 1, 16) && floor((float) $v) === (float) $v;
            } elseif ($svg && in_array($k, $profile['coordinates'], true)) {
                $ok = mbb_projection_finite($v, -1000000, 1000000);
            } elseif ($svg && in_array($k, $profile['sizes'], true)) {
                $ok = mbb_projection_finite($v, 0, 4096);
            } elseif ($svg && in_array($k, $profile['colors'], true)) {
                $ok = is_string($v) && preg_match('/\A(?:none|#[a-fA-F0-9]{6})\z/D', $v);
            } elseif ($svg && $k === 'stroke-width') {
                $ok = mbb_projection_finite($v, 0, 16);
            } elseif ($svg && $k === 'font-size') {
                $ok = mbb_projection_finite($v, 8, 32);
            } elseif ($svg && $k === 'text-anchor') {
                $ok = in_array($v, ['start', 'middle', 'end'], true);
            } elseif ($svg && $k === 'viewBox' && $node['tag'] === 'svg') {
                $ok =
                    is_array($v) &&
                    array_is_list($v) &&
                    count($v) === 4 &&
                    mbb_projection_finite($v[0], -1000000, 1000000) &&
                    mbb_projection_finite($v[1], -1000000, 1000000) &&
                    mbb_projection_finite($v[2], 1, 4096) &&
                    mbb_projection_finite($v[3], 1, 4096);
            } elseif (
                $svg &&
                $k === 'points' &&
                in_array($node['tag'], ['polyline', 'polygon'], true)
            ) {
                $ok = is_array($v) && array_is_list($v) && count($v) >= 1 && count($v) <= 256;
                foreach ($ok ? $v : [] as $pair) {
                    if (
                        !is_array($pair) ||
                        !array_is_list($pair) ||
                        count($pair) !== 2 ||
                        !mbb_projection_finite($pair[0], -1000000, 1000000) ||
                        !mbb_projection_finite($pair[1], -1000000, 1000000)
                    ) {
                        $ok = false;
                        break;
                    }
                }
            }
            if (!$ok) {
                throw new RuntimeException('projection_attribute');
            }
        }
        foreach ($node['children'] as $child) {
            $walk($child, $depth + 1, $svg);
        }
    };
    foreach ($value['tree'] as $node) {
        $walk($node, 0);
    }
    foreach ($refs as $r) {
        if (!isset($keys[$r])) {
            throw new RuntimeException('projection_idref');
        }
    }
    $value['tree'] = array_map('mbb_projection_normalize', $value['tree']);
    if (strlen(mbb_projection_json($value)) > MBB_PROJECTION_BYTES) {
        throw new RuntimeException('projection_bytes');
    }
    return array_keys($keys);
}
function mbb_register_component_projection(
    string $component,
    string $componentVersion,
    array $d,
): bool {
    $key = $component . '@' . $componentVersion;
    $indexed = isset($GLOBALS['mbb_component_resolving'][$key]);
    $namespace = $indexed ? 'mbb_indexed_projection_renderers' : 'mbb_projection_renderers';
    if (
        !preg_match('/\A[a-z][a-z0-9-]{0,63}\z/D', $component) ||
        !preg_match('/\A\d+\.\d+\.\d+\z/D', $componentVersion) ||
        isset($GLOBALS[$namespace][$key]) ||
        count($GLOBALS[$namespace] ?? []) >= ($indexed ? 256 : 32) ||
        !mbb_projection_closed($d, ['contract', 'version', 'render', 'files']) ||
        $d['contract'] !== 'mbb-component-projection/v1' ||
        !is_string($d['version']) ||
        !preg_match('/\A\d+\.\d+\.\d+\z/D', $d['version']) ||
        !is_callable($d['render']) ||
        !is_array($d['files']) ||
        !array_is_list($d['files']) ||
        count($d['files']) < 1 ||
        count($d['files']) > 8
    ) {
        return false;
    }
    try {
        $r = is_array($d['render'])
            ? new ReflectionMethod($d['render'][0], $d['render'][1])
            : new ReflectionFunction(Closure::fromCallable($d['render']));
        $callback = realpath($r->getFileName() ?: '');
        $seen = [];
        $total = 0;
        foreach ($d['files'] as $f) {
            if (
                !mbb_projection_closed($f, ['file', 'sha256']) ||
                !is_string($f['file']) ||
                is_link($f['file']) ||
                realpath($f['file']) !== $f['file'] ||
                !is_file($f['file']) ||
                isset($seen[$f['file']]) ||
                !is_string($f['sha256']) ||
                !preg_match('/\A[a-f0-9]{64}\z/D', $f['sha256']) ||
                !hash_equals($f['sha256'], (string) hash_file('sha256', $f['file']))
            ) {
                return false;
            }
            $seen[$f['file']] = true;
            $total += filesize($f['file']);
        }
        if (!$callback || !isset($seen[$callback]) || $total > 2097152) {
            return false;
        }
    } catch (Throwable) {
        return false;
    }
    $GLOBALS[$namespace][$key] = $d;
    return true;
}
function mbb_component_projection_fingerprint(string $component, string $version): ?string
{
    $provider = function_exists('mbb_component_provider')
        ? mbb_component_provider($component, $version)
        : null;
    if (
        in_array($provider['readerMode'] ?? null, ['relation-map/v1', 'relation-map/v2'], true) &&
        ($provider['status'] ?? null) === 'available'
    ) {
        $files = [];
        foreach (
            [
                'relation-map.php',
                'relation-map-v2.php',
                'relation-map-v2.js',
                'relation-map-documents.php',
                'relation-map.js',
                'relation-map.css',
                'languages/messages.json',
                'projections.php',
                'projections.js',
            ]
            as $file
        ) {
            $files[$file] = hash_file('sha256', __DIR__ . '/' . $file);
        }
        return hash(
            'sha256',
            json_encode(
                [
                    $component,
                    $version,
                    markbridge_teaching_component_fingerprint($component, $provider),
                    $files,
                ],
                JSON_THROW_ON_ERROR,
            ),
        );
    }
    $d =
        $GLOBALS['mbb_projection_renderers'][$component . '@' . $version] ??
        ($GLOBALS['mbb_indexed_projection_renderers'][$component . '@' . $version] ?? null);
    if (!$d) {
        return null;
    }
    $files = [];
    $provider = function_exists('mbb_component_provider')
        ? mbb_component_provider($component, $version)
        : null;
    if (($provider['protocolVersion'] ?? null) === 2) {
        try {
            mbb_component_v2_check($provider);
            $files[] = mbb_component_identity($provider);
        } catch (Throwable) {
            return null;
        }
    }
    foreach ($d['files'] as $f) {
        if (
            !is_file($f['file']) ||
            is_link($f['file']) ||
            !hash_equals($f['sha256'], (string) hash_file('sha256', $f['file']))
        ) {
            return null;
        }
        $files[] = [$f['sha256'], filesize($f['file'])];
    }
    foreach (
        ['projections.php', 'projections.js', 'projections-profile.json', 'projections.css']
        as $name
    ) {
        $files[] = hash_file('sha256', __DIR__ . '/' . $name);
    }
    return hash(
        'sha256',
        json_encode([$d['contract'], $d['version'], $files], JSON_THROW_ON_ERROR),
    );
}
/** A fresh, per-document plan; failures never replace authored content or data. */
function mbb_component_projection_plan(
    string $serialized,
    string $locale = 'en',
    int $budget = 524288,
): array {
    if (
        function_exists('mbb_component_document_within_budget') &&
        !mbb_component_document_within_budget($serialized)
    ) {
        throw new RuntimeException('component_limit');
    }
    $items = [];
    $total = 0;
    foreach (mbb_component_descriptors($serialized) as $id => $a) {
        $fingerprint = mbb_component_projection_fingerprint($a->component, $a->componentVersion);
        $tree = null;
        $provider = mbb_component_provider($a->component, $a->componentVersion);
        if (($a->params->format ?? null) === 'relation-map/v2') {
            $view = mbb_relation_map_v2_view(
                $a->params,
                (string) (function_exists('get_the_ID') ? get_the_ID() : 0) . ':' . $id,
            );
            $native = [
                'schema' => 'relation-map/public-v2',
                'map' => $view['map'],
                'edgeIds' => $view['edgeIds'],
                'locale' => str_starts_with($locale, 'zh') ? 'zh' : 'en',
                'interactive' =>
                    ($provider['readerMode'] ?? null) === 'relation-map/v2' &&
                    ($provider['status'] ?? null) === 'available',
            ];
            $size = strlen(mbb_projection_json($native));
            if ($total + $size > $budget) {
                throw new RuntimeException('projection_aggregate');
            }
            $total += $size;
            $items[] = [
                'target' => $id,
                'component' => $a->component,
                'version' => $a->componentVersion,
                'fingerprint' => $fingerprint,
                'state' => 'author-fallback',
                'params' => $view['map'] ?? (object) [],
                'projection' => $native,
            ];
            continue;
        }
        if (mbb_relation_map_valid($a->params)) {
            $native = mbb_relation_map_envelope($a->params, $locale);
            $size = strlen(mbb_projection_json($native));
            if ($total + $size > $budget) {
                throw new RuntimeException('projection_aggregate');
            }
            $total += $size;
            $items[] = [
                'target' => $id,
                'component' => $a->component,
                'version' => $a->componentVersion,
                'fingerprint' => $fingerprint,
                'state' =>
                    ($provider['readerMode'] ?? null) === 'relation-map/v1' &&
                    ($provider['status'] ?? null) === 'available'
                        ? 'available'
                        : 'author-fallback',
                'params' => $a->params,
                'projection' => $native,
            ];
            continue;
        }
        $state =
            isset(
                $GLOBALS['mbb_projection_renderers'][$a->component . '@' . $a->componentVersion],
            ) ||
            isset(
                $GLOBALS['mbb_indexed_projection_renderers'][
                    $a->component . '@' . $a->componentVersion
                ],
            ) ||
            !$provider ||
            $provider['status'] !== 'available'
                ? 'unavailable'
                : 'author-fallback';
        if ($fingerprint) {
            try {
                $provider = mbb_component_provider($a->component, $a->componentVersion);
                if (
                    !$provider ||
                    $provider['status'] !== 'available' ||
                    !mbb_component_schema($a->params, $provider['schema']) ||
                    !mbb_component_domain_valid(
                        $a->component,
                        $a->componentVersion,
                        $a->params,
                        $a->activity ?? null,
                    )
                ) {
                    throw new RuntimeException('projection_params');
                }
                $d =
                    $GLOBALS['mbb_projection_renderers'][
                        $a->component . '@' . $a->componentVersion
                    ] ??
                    $GLOBALS['mbb_indexed_projection_renderers'][
                        $a->component . '@' . $a->componentVersion
                    ];
                $tree = $d['render'](json_decode(mbb_component_json($a->params)), [
                    'locale' => $locale,
                ]);
                if (!is_array($tree)) {
                    throw new RuntimeException('projection_tree');
                }
                mbb_projection_tree($tree);
                $tree['tree'] = array_map('mbb_projection_normalize', $tree['tree']);
                $size = strlen(mbb_projection_json($tree));
                if ($total + $size > $budget) {
                    throw new RuntimeException('projection_aggregate');
                }
                $total += $size;
                if (
                    $fingerprint !==
                    mbb_component_projection_fingerprint($a->component, $a->componentVersion)
                ) {
                    throw new RuntimeException('projection_changed');
                }
                $state = 'available';
            } catch (Throwable) {
                $tree = null;
                $provider = mbb_component_provider($a->component, $a->componentVersion);
                $state =
                    isset(
                        $GLOBALS['mbb_projection_renderers'][
                            $a->component . '@' . $a->componentVersion
                        ],
                    ) ||
                    isset(
                        $GLOBALS['mbb_indexed_projection_renderers'][
                            $a->component . '@' . $a->componentVersion
                        ],
                    ) ||
                    !$provider ||
                    $provider['status'] !== 'available'
                        ? 'unavailable'
                        : 'author-fallback';
            }
        }
        $items[] = [
            'target' => $id,
            'component' => $a->component,
            'version' => $a->componentVersion,
            'fingerprint' => $fingerprint,
            'state' => $state,
            'params' => $a->params,
            'projection' => $tree,
        ];
    }
    foreach ($items as &$item) {
        if (
            $item['state'] === 'available' &&
            $item['fingerprint'] !==
                mbb_component_projection_fingerprint($item['component'], $item['version'])
        ) {
            $item['state'] = 'unavailable';
            $item['projection'] = null;
        }
    }
    unset($item);
    return $items;
}
/** Keep only canonical wire between chapters, not a large persistent PHP AST. */
function mbb_component_projection_wire(string $serialized, string $locale, int &$remaining): array
{
    $items = mbb_component_projection_plan($serialized, $locale, max(0, min(524288, $remaining)));
    foreach ($items as $item) {
        if (is_array($item['projection'])) {
            $remaining -= strlen(mbb_projection_json($item['projection']));
        }
    }
    $data = mbb_projection_json($items);
    if (strlen($data) > 1048576) {
        throw new RuntimeException('projection_plan_bytes');
    }
    return [
        'schema' => 1,
        'encoding' => 'json-utf8',
        'bytes' => strlen($data),
        'sha256' => hash('sha256', $data),
        'data' => $data,
    ];
}
function mbb_projection_insert(DOMDocument $doc, DOMElement $root, array $items): void
{
    $xpath = new DOMXPath($doc);
    $used = [];
    foreach ($xpath->query('.//*[@id]', $root) as $node) {
        if (isset($used[$node->getAttribute('id')])) {
            throw new RuntimeException('projection_duplicate_body_id');
        }
        $used[$node->getAttribute('id')] = true;
    }
    $total = 0;
    foreach ($items as $item) {
        $targets = [];
        foreach ($xpath->query('.//*[@id]', $root) as $n) {
            if ($n->getAttribute('id') === $item['target']) {
                $targets[] = $n;
            }
        }
        if (count($targets) !== 1) {
            continue;
        }
        $target = $targets[0];
        $wrapper = $doc->createElement('section');
        $wrapper->setAttribute('class', 'mbb-projection');
        $wrapper->setAttribute('data-mbb-generated', '');
        // libxml reconciles namespaces when a detached subtree is attached. Build
        // each node in its connected parent so SVG never gains default: aliases
        // that HTML readers would interpret as unknown, non-SVG elements.
        if ($item['state'] === 'available') {
            $target->insertBefore($wrapper, $target->firstChild);
        } else {
            $target->appendChild($wrapper);
        }
        try {
            if (($item['projection']['schema'] ?? null) === 'relation-map/public-v2') {
                $view = $item['projection'];
                if (
                    !in_array($item['state'], ['available', 'author-fallback'], true) ||
                    !mbb_component_equal($view['map'] ?? (object) [], $item['params'])
                ) {
                    throw new RuntimeException('relation_map_projection');
                }
                // Consume the fresh final plan: an earlier render_block result is never authority.
                foreach (iterator_to_array($target->childNodes) as $child) {
                    if (
                        $child instanceof DOMElement &&
                        $child !== $wrapper &&
                        ($child->getAttribute('class') === 'mbb-projection' ||
                            $child->hasAttribute('data-mbb-relation-notice'))
                    ) {
                        $target->removeChild($child);
                    }
                }
                $target->setAttribute(
                    'data-mbb-teaching-config',
                    mbb_component_json([
                        'reader' => 'relation-map/public-v2',
                        'publicView' => $view['map'],
                        'edgeIds' => $view['edgeIds'],
                        'status' =>
                            $view['interactive'] && $view['map'] ? 'available' : 'unavailable',
                    ]),
                );
                $notice = $doc->createElement('p');
                $notice->setAttribute('data-mbb-generated', '');
                $notice->setAttribute('data-mbb-relation-notice', '');
                $notice->appendChild(
                    $doc->createTextNode(
                        mbb_relation_map_message(
                            'Some articles may be unavailable.',
                            $view['locale'],
                        ),
                    ),
                );
                $target->insertBefore($notice, $wrapper);
                if ($view['map']) {
                    mbb_relation_map_append(
                        $doc,
                        $wrapper,
                        mbb_relation_map_envelope($view['map'], $view['locale']),
                    );
                }
                $bytes = strlen($doc->saveHTML($wrapper)) + strlen($doc->saveHTML($notice));
                if ($bytes > MBB_PROJECTION_BYTES || $total + $bytes > 524288) {
                    throw new RuntimeException('projection_output');
                }
                $total += $bytes;
                continue;
            }
            if (($item['projection']['schema'] ?? null) === 'relation-map/v1') {
                if (
                    !in_array($item['state'], ['available', 'author-fallback'], true) ||
                    !mbb_component_equal($item['projection']['map'], $item['params'])
                ) {
                    throw new RuntimeException('relation_map_projection');
                }
                mbb_relation_map_append($doc, $wrapper, $item['projection']);
                $bytes = strlen($doc->saveHTML($wrapper));
                if ($bytes > MBB_PROJECTION_BYTES || $total + $bytes > 524288) {
                    throw new RuntimeException('projection_output');
                }
                $total += $bytes;
                continue;
            }
            if ($item['state'] !== 'available' || !is_array($item['projection'])) {
                throw new RuntimeException('projection_unavailable');
            }
            $keys = mbb_projection_tree($item['projection']);
            $map = [];
            foreach ($keys as $key) {
                $n = 0;
                $id = 'mbb-proj-' . $key;
                while (isset($used[$id])) {
                    $id = 'mbb-proj-' . ++$n . '-' . $key;
                }
                $used[$id] = true;
                $map[$key] = $id;
            }
            $make = static function (DOMNode $parent, $node, $svg = false) use (
                &$make,
                $doc,
                $map,
            ) {
                if (is_string($node)) {
                    $parent->appendChild($doc->createTextNode($node));
                    return;
                }
                $svg = $svg || $node['tag'] === 'svg';
                $out = $svg
                    ? $doc->createElementNS('http://www.w3.org/2000/svg', $node['tag'])
                    : $doc->createElement($node['tag']);
                if (isset($node['key'])) {
                    $out->setAttribute('id', $map[$node['key']]);
                }
                foreach ($node['attrs'] as $k => $v) {
                    if ($k === 'labelledby') {
                        $k = 'aria-labelledby';
                        $v = implode(' ', array_map(fn($r) => $map[$r], $v));
                    } elseif ($k === 'label') {
                        $k = 'aria-label';
                    } elseif ($k === 'points') {
                        $v = implode(' ', array_map(fn($p) => implode(',', $p), $v));
                    } elseif (is_array($v)) {
                        $v = implode(' ', $v);
                    }
                    $out->setAttribute($k, (string) $v);
                }
                $parent->appendChild($out);
                foreach ($node['children'] as $child) {
                    $make($out, $child, $svg);
                }
            };
            foreach ($item['projection']['tree'] as $node) {
                $make($wrapper, $node);
            }
            $bytes = strlen($doc->saveHTML($wrapper));
            if ($bytes > MBB_PROJECTION_BYTES || $total + $bytes > 524288) {
                throw new RuntimeException('projection_output');
            }
            $total += $bytes;
        } catch (Throwable) {
            while ($wrapper->firstChild) {
                $wrapper->removeChild($wrapper->firstChild);
            }
            if ($item['state'] !== 'author-fallback') {
                $p = $doc->createElement('p');
                $p->appendChild(
                    $doc->createTextNode(
                        function_exists('mbb_t')
                            ? mbb_t(
                                'Static view unavailable. The original explanation remains readable.',
                            )
                            : 'Static view unavailable. The original explanation remains readable.',
                    ),
                );
                $wrapper->appendChild($p);
            }
        }
        if (!$wrapper->hasChildNodes()) {
            $target->removeChild($wrapper);
        }
    }
}
function mbb_component_static_document(
    string $html,
    string $serialized,
    string $locale = 'en',
): string {
    $doc = new DOMDocument('1.0', 'UTF-8');
    $old = libxml_use_internal_errors(true);
    try {
        $doc->loadHTML(
            '<?xml encoding="UTF-8"?><div id="mbb-projection-root">' . $html . '</div>',
            LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET,
        );
    } finally {
        libxml_clear_errors();
        libxml_use_internal_errors($old);
    }
    $root = (new DOMXPath($doc))->query('//*[@id="mbb-projection-root"]')->item(0);
    if (!$root) {
        return $html;
    }
    mbb_projection_insert($doc, $root, mbb_component_projection_plan($serialized, $locale));
    $out = '';
    foreach ($root->childNodes as $n) {
        $out .= $doc->saveHTML($n);
    }
    return $out;
}

/** Recognize only the native non-body password form, never an article fragment. */
function mbb_projection_password_form(string $html): bool
{
    $doc = new DOMDocument('1.0', 'UTF-8');
    $old = libxml_use_internal_errors(true);
    try {
        $doc->loadHTML(
            '<?xml encoding="UTF-8"?><div id="mbb-password-root">' . $html . '</div>',
            LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET,
        );
    } finally {
        libxml_clear_errors();
        libxml_use_internal_errors($old);
    }
    $root = (new DOMXPath($doc))->query('//*[@id="mbb-password-root"]')->item(0);
    if (!$root) {
        return false;
    }
    $form = null;
    foreach ($root->childNodes as $node) {
        if ($node->nodeType === XML_TEXT_NODE && trim($node->textContent) === '') {
            continue;
        }
        if (!($node instanceof DOMElement) || $form || $node->tagName !== 'form') {
            return false;
        }
        $form = $node;
    }
    if (
        !$form ||
        !in_array(
            'post-password-form',
            preg_split('/\s+/', trim($form->getAttribute('class'))),
            true,
        ) ||
        strtolower($form->getAttribute('method')) !== 'post'
    ) {
        return false;
    }
    foreach ($form->getElementsByTagName('input') as $input) {
        if (
            $input->getAttribute('name') === 'post_password' &&
            strtolower($input->getAttribute('type')) === 'password'
        ) {
            return true;
        }
    }
    return false;
}

// The containing post and session are checked outside renderer failure recovery.
if (function_exists('add_filter')) {
    add_filter(
        'the_content',
        static function ($html) {
            if (!is_string($html) || !function_exists('get_post')) {
                return $html;
            }
            $post = get_post();
            if (
                !$post ||
                !function_exists('mbb_managed') ||
                !mbb_managed($post->ID) ||
                !str_contains($post->post_content, '<!-- wp:mbb/component ')
            ) {
                return $html;
            }
            if (function_exists('post_password_required') && post_password_required($post)) {
                if (mbb_projection_password_form($html)) {
                    return $html;
                }
                // A caller passing actual locked body must not gain a rendering bypass.
                return '<p>' .
                    esc_html(mbb_t('The article is unavailable or changed. Reload to continue.')) .
                    '</p>';
            }
            $id = $post->ID;
            mbb_references_fresh_user();
            clean_post_cache($id);
            $baseline = get_post($id);
            if (!$baseline || !mbb_references_readable($baseline)) {
                return '<p>' .
                    esc_html(mbb_t('The article is unavailable or changed. Reload to continue.')) .
                    '</p>';
            }
            // WP_Query changes a protected draft's display date for preview. Compare
            // a clone against fresh persisted state; never normalize body/autosave
            // changes or mutate the query's post, database, or final CAS baseline.
            $view = clone $post;
            if (
                function_exists('is_preview') &&
                is_preview() &&
                current_user_can('edit_post', $id) &&
                in_array($baseline->post_status, ['draft', 'pending'], true) &&
                $view->post_status === $baseline->post_status
            ) {
                $view->post_date = $baseline->post_date;
            }
            $token = mbb_token($baseline);
            if (!hash_equals($token, mbb_token($view))) {
                return '<p>' .
                    esc_html(mbb_t('The article is unavailable or changed. Reload to continue.')) .
                    '</p>';
            }
            $out = mbb_component_static_document(
                $html,
                $post->post_content,
                function_exists('get_locale') ? get_locale() : 'en',
            );
            mbb_references_fresh_user();
            clean_post_cache($id);
            $fresh = get_post($id);
            if (
                !$fresh ||
                !mbb_references_readable($fresh) ||
                !hash_equals($token, mbb_token($fresh))
            ) {
                return '<p>' .
                    esc_html(mbb_t('The article is unavailable or changed. Reload to continue.')) .
                    '</p>';
            }
            if (function_exists('wp_enqueue_style')) {
                wp_enqueue_style(
                    'mbb-projections',
                    plugins_url(mbb_asset('projections.css'), __FILE__),
                    [],
                    substr(hash_file('sha256', __DIR__ . '/projections.css'), 0, 12),
                );
            }
            return $out;
        },
        20,
    );
}
