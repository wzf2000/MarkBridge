<?php
// Pure registry contracts use only a newly created synthetic directory.
$directory = sys_get_temp_dir() . '/mbb-registry-' . bin2hex(random_bytes(8));
mkdir($directory);
mkdir($directory . '/fixture');
define('WP_PLUGIN_DIR', $directory);
function add_action(...$args) {}
function apply_filters($name, $value, ...$args)
{
    if ($name === 'markbridge_validate_component_params') {
        if (($GLOBALS['domain_result'] ?? null) === 'throw') {
            throw new RuntimeException('Synthetic validator failure');
        }
        return $GLOBALS['domain_result'] ?? $value;
    }
    return $value;
}
function wp_normalize_path($path)
{
    return str_replace('\\', '/', $path);
}
function plugins_url($name, $file)
{
    return 'http://markbridge.invalid/plugins/' . basename(dirname($file)) . '/' . $name;
}
class WP_Error
{
    public function __construct(public string $code) {}
}
function mbb_error($code, ...$args)
{
    return new WP_Error($code);
}
function site_url()
{
    return 'http://markbridge.invalid';
}
function wp_json_encode($value, $flags = 0)
{
    return json_encode($value, $flags);
}
function current_user_can($capability, ...$args)
{
    return $GLOBALS['author_allowed'] ?? false;
}
function get_current_user_id()
{
    return 1;
}
class WP_REST_Response
{
    public function __construct(public $data, public $status = 200) {}
    public function header(...$args) {}
}
function esc_html($text)
{
    return htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
}
require dirname(__DIR__) . '/plugin/components.php';
require dirname(__DIR__) . '/sdk/examples/indexed-components/provider.php';
function registry_assert($ok, $message)
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}
$file = $directory . '/fixture/frame.html';
file_put_contents($file, '<!doctype html><p>Fixed fixture</p>');
$provider = [
    'version' => '0.1.0',
    'protocolVersion' => 1,
    'minMarkBridge' => '1.6.0',
    'budgets' => [
        'resourceBytes' => 524288,
        'startupMs' => 5000,
        'wallMs' => 2000,
        'traceFrames' => 8192,
        'traceBytes' => 524288,
    ],
    'title' => 'Fixture',
    'schema' => [
        'type' => 'object',
        'additionalProperties' => false,
        'required' => ['n'],
        'properties' => ['n' => ['type' => 'number', 'minimum' => 0, 'maximum' => 64]],
    ],
    'defaults' => ['n' => 3],
    'resource' => [
        'file' => $file,
        'url' => plugins_url('frame.html', $file),
        'sha256' => hash_file('sha256', $file),
    ],
];
function catalog_render($params, $context)
{
    return [
        'schema' => 1,
        'tree' => [['tag' => 'p', 'attrs' => [], 'children' => ['Static indexed result']]],
    ];
}
function catalog_assert($ok, $message)
{
    registry_assert($ok, $message);
}
try {
    catalog_assert(
        mbb_sdk_register_indexed($file, hash_file('sha256', $file)),
        'Indexed declaration rejected',
    );
    catalog_assert(count(mbb_component_index_entries()) === 40, 'Index lost versions');
    catalog_assert(empty($GLOBALS['mbb_component_resolved']), 'Declaration eagerly resolved');
    $cacheBefore = $GLOBALS['mbb_component_resolved'] ?? [];
    catalog_assert(
        mbb_component_serialized_providers('<!-- wp:mbb/component {bad} -->') === [],
        'Malformed ordinary-post comment broke dependency discovery',
    );
    catalog_assert(
        mbb_component_serialized_providers(
            '<!-- wp:mbb/component {"id":"broken","component":[],"componentVersion":"1.0.0","params":{}} -->',
        ) === [],
        'Invalid ordinary-post shape reached typed resolver',
    );
    catalog_assert(
        ($GLOBALS['mbb_component_resolved'] ?? []) === $cacheBefore,
        'Malformed frontend dependency invoked a factory',
    );
    catalog_assert(
        mbb_component_serialized_providers(
            '<!-- wp:mbb/component {"component":"sdk-indexed-counter","componentVersion":"1.0.0"} -->',
        ) === [],
        'Missing ordinary-post instance identity reached legacy parser',
    );
    $GLOBALS['author_allowed'] = false;
    catalog_assert(
        mbb_component_catalog_page() instanceof WP_Error,
        'Anonymous/unauthorized catalog exposed',
    );
    $GLOBALS['author_allowed'] = true;
    $page = mbb_component_catalog_page(['page' => 2, 'per_page' => 20]);
    catalog_assert(
        count($page->data['items']) === 20 && $page->data['items'][0]['version'] === '1.20.0',
        'Catalog pagination incorrect',
    );
    catalog_assert(empty($GLOBALS['mbb_component_resolved']), 'Catalog eagerly resolved factories');
    catalog_assert(
        mbb_component_catalog_page(['per_page' => 51]) instanceof WP_Error,
        'Excessive page accepted',
    );
    $fp = mbb_component_registry_fingerprint();
    catalog_assert(
        mbb_component_descriptor_response([
            'component' => 'sdk-indexed-counter',
            'version' => '1.39.0',
            'fingerprint' => 'stale',
        ]) instanceof WP_Error,
        'Stale registry fingerprint accepted',
    );
    $descriptor = mbb_component_descriptor_response([
        'component' => 'sdk-indexed-counter',
        'version' => '1.39.0',
        'fingerprint' => $fp,
    ]);
    catalog_assert(
        isset($descriptor->data['provider']['schema']) &&
            !str_contains(json_encode($descriptor->data), $directory),
        'Descriptor missing schema or leaked local path',
    );

    catalog_assert(
        !markbridge_register_teaching_component(
            'sdk-indexed-counter',
            mbb_sdk_indexed_definition('1.0.0', $file, $provider['resource']['sha256']),
        ),
        'Cross-API duplicate accepted',
    );
    for ($i = 0; $i < 40; $i++) {
        $p = mbb_component_provider('sdk-indexed-counter', '1.' . $i . '.0');
        catalog_assert($p && $p['status'] === 'available', 'Exact indexed version missing');
    }
    catalog_assert(count(mbb_component_registry()) === 0, 'Resolution mutated legacy registry');
    catalog_assert(
        count($GLOBALS['mbb_component_resolved']) === 40,
        'Cache did not memoize exact keys',
    );
    catalog_assert(
        mbb_component_provider('sdk-indexed-counter', '9.9.9') === null,
        'Undeclared version resolved',
    );
    $projected = [];
    for ($i = 0; $i < 40; $i++) {
        $version = '2.' . $i . '.0';
        $p = mbb_sdk_indexed_definition($version, $file, $provider['resource']['sha256']);
        $projected[] = [
            'version' => $version,
            'title' => $p['title'],
            'fingerprint' => markbridge_teaching_component_fingerprint('projected', $p),
        ];
    }
    catalog_assert(
        markbridge_register_teaching_component_catalog(
            'projected',
            ['title' => 'Projected', 'defaultVersion' => '2.0.0', 'versions' => $projected],
            static function ($id, $version) use ($file, $provider) {
                catalog_assert(
                    mbb_register_component_projection($id, $version, [
                        'contract' => 'mbb-component-projection/v1',
                        'version' => '1.0.0',
                        'render' => 'catalog_render',
                        'files' => [
                            [
                                'file' => realpath(__FILE__),
                                'sha256' => hash_file('sha256', __FILE__),
                            ],
                        ],
                    ]),
                    'Lazy projection registration rejected',
                );
                return mbb_sdk_indexed_definition($version, $file, $provider['resource']['sha256']);
            },
        ),
        'Projected index rejected',
    );
    $components = [];
    for ($i = 0; $i < 40; $i++) {
        catalog_assert(
            mbb_component_projection_fingerprint('projected', '2.' . $i . '.0') !== null,
            'Projection lookup failed before lazy resolve',
        );
        $components[] = ['component' => 'projected', 'version' => '2.' . $i . '.0'];
    }
    catalog_assert(
        count($GLOBALS['mbb_indexed_projection_renderers']) === 40 &&
            empty($GLOBALS['mbb_projection_renderers']),
        'Indexed projections consumed legacy cap',
    );
    mbb_component_publication_budget($components);
    // Two articles with 20 versions each can share a publication containing 40 exact dependencies.
    foreach (array_chunk($components, 20) as $chapter) {
        $serialized = '';
        foreach ($chapter as $i => $c) {
            $attrs = [
                'id' => 'chapter-' . $i,
                'component' => $c['component'],
                'componentVersion' => $c['version'],
                'params' => ['n' => 1],
            ];
            $serialized .=
                '<!-- wp:mbb/component ' .
                json_encode($attrs) .
                ' --><p>Static</p><!-- /wp:mbb/component -->';
        }
        $plan = mbb_component_projection_plan($serialized);
        catalog_assert(
            count($plan) === 20 &&
                !array_filter($plan, static fn($p) => $p['state'] !== 'available'),
            'Chapter projection plan failed',
        );
    }
    $raw = '';
    for ($i = 0; $i < 33; $i++) {
        $a = [
            'id' => 'fixture-' . $i,
            'component' => 'sdk-indexed-counter',
            'componentVersion' => '1.' . $i . '.0',
            'params' => ['n' => 1],
        ];
        $raw .=
            '<!-- wp:mbb/component ' .
            json_encode($a) .
            ' --><div>Static</div><!-- /wp:mbb/component -->';
    }
    catalog_assert(
        !mbb_component_document_within_budget($raw),
        '33 distinct article versions accepted',
    );
    catalog_assert(
        mbb_component_admit($raw, $raw) instanceof WP_Error,
        'Unchanged fast path bypassed budget',
    );
    file_put_contents($file, 'changed');
    catalog_assert(
        mbb_component_provider('sdk-indexed-counter', '1.0.0')['status'] === 'resource-integrity',
        'Cached status hid file replacement',
    );
    file_put_contents($file, '<!doctype html><p>Fixed fixture</p>');
    $bad = mbb_sdk_indexed_definition('2.0.0', $file, $provider['resource']['sha256']);
    $pin = markbridge_teaching_component_fingerprint('broken', $bad);
    catalog_assert(
        markbridge_register_teaching_component_catalog(
            'broken',
            [
                'title' => 'Broken',
                'defaultVersion' => '2.0.0',
                'versions' => [['version' => '2.0.0', 'title' => 'Broken', 'fingerprint' => $pin]],
            ],
            static function () use ($bad) {
                $bad['defaults']['n'] = 2;
                return $bad;
            },
        ),
        'Bad factory index declaration',
    );
    catalog_assert(
        mbb_component_provider('broken', '2.0.0') === null,
        'Changed factory definition accepted',
    );
    $before = mbb_component_registry_fingerprint();
    $overflow = [];
    for ($i = 0; $i < 65; $i++) {
        $overflow[] = [
            'version' => '3.' . $i . '.0',
            'title' => 'Overflow',
            'fingerprint' => str_repeat('a', 64),
        ];
    }
    catalog_assert(
        !markbridge_register_teaching_component_catalog(
            'overflow',
            ['title' => 'Overflow', 'defaultVersion' => '3.0.0', 'versions' => $overflow],
            static fn() => [],
        ),
        '65 versions accepted',
    );
    catalog_assert(
        mbb_component_registry_fingerprint() === $before,
        'Rejected declaration partially committed',
    );
    $p = mbb_sdk_indexed_definition('1.0.0', $file, $provider['resource']['sha256']);
    $moved = $p;
    $moved['resource']['file'] = '/different/local/path';
    $moved['resource']['url'] = 'https://other.invalid/frame';
    catalog_assert(
        markbridge_teaching_component_fingerprint('portable', $p) ===
            markbridge_teaching_component_fingerprint('portable', $moved),
        'Deployment paths entered portable pin',
    );
    $moved['defaults']['n'] = 2;
    catalog_assert(
        markbridge_teaching_component_fingerprint('portable', $p) !==
            markbridge_teaching_component_fingerprint('portable', $moved),
        'Defaults absent from pin',
    );
    $activity = mbb_sdk_indexed_definition('6.0.0', $file, $provider['resource']['sha256']);
    $activity['activityVersion'] = 1;
    $entry = [
        'version' => '6.0.0',
        'title' => $activity['title'],
        'fingerprint' => markbridge_teaching_component_fingerprint('activity-indexed', $activity),
        'activityVersion' => 1,
    ];
    catalog_assert(
        markbridge_register_teaching_component_catalog(
            'activity-indexed',
            ['title' => 'Activities', 'defaultVersion' => '6.0.0', 'versions' => [$entry]],
            static fn() => $activity,
        ),
        'Indexed activity metadata rejected',
    );
    $beforeFactories = count($GLOBALS['mbb_component_resolved']);
    $entries = mbb_component_index_entries();
    catalog_assert(
        ($entries['activity-indexed@6.0.0']['activityVersion'] ?? null) === 1,
        'Indexed lightweight activity capability missing',
    );
    catalog_assert(
        count($GLOBALS['mbb_component_resolved']) === $beforeFactories,
        'Lightweight capability discovery resolved a factory',
    );
    catalog_assert(
        mbb_component_provider('activity-indexed', '6.0.0')['activityVersion'] === 1,
        'Exact declared activity failed resolution',
    );
    $badEntry = $entry;
    $badEntry['fingerprint'] = markbridge_teaching_component_fingerprint(
        'activity-mismatch',
        $activity,
    );
    unset($badEntry['activityVersion']);
    catalog_assert(
        markbridge_register_teaching_component_catalog(
            'activity-mismatch',
            ['title' => 'Mismatch', 'defaultVersion' => '6.0.0', 'versions' => [$badEntry]],
            static fn() => $activity,
        ),
        'Omitted-capability declaration rejected too early',
    );
    catalog_assert(
        mbb_component_provider('activity-mismatch', '6.0.0') === null,
        'Resolver silently acquired undeclared activity capability',
    );
    $badEntry['activityVersion'] = 2;
    catalog_assert(
        !markbridge_register_teaching_component_catalog(
            'bad-activity',
            ['title' => 'Bad activity', 'defaultVersion' => '6.0.0', 'versions' => [$badEntry]],
            static fn() => $activity,
        ),
        'Unknown activity version accepted',
    );
    catalog_assert(
        markbridge_register_teaching_component('activity-legacy', $activity),
        'Legacy activity rejected',
    );
    catalog_assert(
        (mbb_component_index_entries()['activity-legacy@6.0.0']['activityVersion'] ?? null) === 1,
        'Legacy lightweight activity capability missing',
    );
    $legacyLater = mbb_sdk_indexed_definition('0.1.0', $file, $provider['resource']['sha256']);
    catalog_assert(
        markbridge_register_teaching_component('sdk-indexed-counter', $legacyLater),
        'Later legacy version rejected',
    );
    catalog_assert(
        mbb_component_default_versions()['sdk-indexed-counter'] === '1.0.0',
        'Later legacy registration replaced indexed default',
    );
    catalog_assert(
        markbridge_register_teaching_component('legacy-first', $legacyLater),
        'Legacy-first fixture rejected',
    );
    $new = mbb_sdk_indexed_definition('9.0.0', $file, $provider['resource']['sha256']);
    catalog_assert(
        markbridge_register_teaching_component_catalog(
            'legacy-first',
            [
                'title' => 'Later indexed',
                'defaultVersion' => '9.0.0',
                'versions' => [
                    [
                        'version' => '9.0.0',
                        'title' => $new['title'],
                        'fingerprint' => markbridge_teaching_component_fingerprint(
                            'legacy-first',
                            $new,
                        ),
                    ],
                ],
            ],
            static fn() => $new,
        ),
        'Later indexed registration rejected',
    );
    catalog_assert(
        mbb_component_default_versions()['legacy-first'] === '0.1.0',
        'Indexed registration replaced legacy default',
    );
    $stable = mbb_component_registry_fingerprint();
    $GLOBALS['mbb_component_defaults']['legacy-first'] = '9.0.0';
    catalog_assert(
        $stable !== mbb_component_registry_fingerprint(),
        'Default version absent from directory fingerprint',
    );
    $GLOBALS['mbb_component_defaults']['legacy-first'] = '0.1.0';
    $recursive = mbb_sdk_indexed_definition('4.0.0', $file, $provider['resource']['sha256']);
    catalog_assert(
        markbridge_register_teaching_component_catalog(
            'recursive',
            [
                'title' => 'Recursive',
                'defaultVersion' => '4.0.0',
                'versions' => [
                    [
                        'version' => '4.0.0',
                        'title' => $recursive['title'],
                        'fingerprint' => markbridge_teaching_component_fingerprint(
                            'recursive',
                            $recursive,
                        ),
                    ],
                ],
            ],
            static function () use ($recursive) {
                mbb_component_provider('recursive', '4.0.0');
                return $recursive;
            },
        ),
        'Recursive declaration rejected too early',
    );
    catalog_assert(
        mbb_component_provider('recursive', '4.0.0') === null,
        'Recursive factory was accepted',
    );
    $mutating = mbb_sdk_indexed_definition('5.0.0', $file, $provider['resource']['sha256']);
    catalog_assert(
        markbridge_register_teaching_component_catalog(
            'mutating',
            [
                'title' => 'Mutating',
                'defaultVersion' => '5.0.0',
                'versions' => [
                    [
                        'version' => '5.0.0',
                        'title' => $mutating['title'],
                        'fingerprint' => markbridge_teaching_component_fingerprint(
                            'mutating',
                            $mutating,
                        ),
                    ],
                ],
            ],
            static function () use ($mutating, $provider) {
                markbridge_register_teaching_component('added-during-resolution', $provider);
                return $mutating;
            },
        ),
        'Mutating declaration rejected too early',
    );
    catalog_assert(
        mbb_component_descriptor_response([
            'component' => 'mutating',
            'version' => '5.0.0',
            'fingerprint' => mbb_component_registry_fingerprint(),
        ]) instanceof WP_Error,
        'Factory registry mutation passed descriptor fingerprint check',
    );
    $GLOBALS['mbb_components'] = [];
    $GLOBALS['mbb_component_indexes'] = [];
    $GLOBALS['mbb_component_factories'] = [];
    $GLOBALS['mbb_component_resolved'] = [];
    for ($i = 0; $i < 32; $i++) {
        catalog_assert(
            markbridge_register_teaching_component('legacy-' . $i, $provider),
            'Legacy capacity changed',
        );
    }
    catalog_assert(
        !markbridge_register_teaching_component('legacy-overflow', $provider),
        'Legacy 32 cap raised',
    );
    $GLOBALS['mbb_components'] = [];
    $GLOBALS['mbb_component_indexes'] = [];
    $GLOBALS['mbb_component_defaults'] = [];
    $versions = [];
    for ($i = 0; $i < 64; $i++) {
        $versions[] = [
            'version' => '1.' . $i . '.0',
            'title' => 'Bounded version',
            'fingerprint' => str_repeat('a', 64),
        ];
    }
    for ($i = 0; $i < 4; $i++) {
        catalog_assert(
            markbridge_register_teaching_component_catalog(
                'capacity-' . $i,
                ['title' => 'Capacity', 'defaultVersion' => '1.0.0', 'versions' => $versions],
                static fn() => [],
            ),
            '256-key representative index rejected',
        );
    }
    catalog_assert(
        count(mbb_component_index_entries()) === 256,
        'Union capacity counter incorrect',
    );
    $fullFingerprint = mbb_component_registry_fingerprint();
    catalog_assert(
        !markbridge_register_teaching_component_catalog(
            'capacity-overflow',
            ['title' => 'Overflow', 'defaultVersion' => '1.0.0', 'versions' => [$versions[0]]],
            static fn() => [],
        ),
        '257th indexed key accepted',
    );
    catalog_assert(
        !markbridge_register_teaching_component('legacy-overflow', $provider),
        'Legacy path bypassed union cap',
    );
    catalog_assert(
        $fullFingerprint === mbb_component_registry_fingerprint(),
        'Rejected union declaration mutated registry',
    );
    $GLOBALS['mbb_component_indexes'] = [];
    $GLOBALS['mbb_component_defaults'] = [];
    for ($i = 0; $i < 64; $i++) {
        catalog_assert(
            markbridge_register_teaching_component_catalog(
                'type-' . $i,
                ['title' => 'Type', 'defaultVersion' => '1.0.0', 'versions' => [$versions[0]]],
                static fn() => [],
            ),
            '64-type representative index rejected',
        );
    }
    catalog_assert(
        !markbridge_register_teaching_component_catalog(
            'type-overflow',
            ['title' => 'Overflow', 'defaultVersion' => '1.0.0', 'versions' => [$versions[0]]],
            static fn() => [],
        ),
        '65th type accepted',
    );
    $GLOBALS['mbb_component_indexes'] = [];
    $GLOBALS['mbb_component_defaults'] = [];
    foreach ($versions as &$v) {
        $v['title'] = str_repeat('x', 800);
    }
    unset($v);
    $boundedVersions = array_slice($versions, 0, 30);
    for ($i = 0; $i < 4; $i++) {
        catalog_assert(
            markbridge_register_teaching_component_catalog(
                'byte-capacity-' . $i,
                ['title' => 'Bytes', 'defaultVersion' => '1.0.0', 'versions' => $boundedVersions],
                static fn() => [],
            ),
            'Within-budget aggregate rejected',
        );
    }
    catalog_assert(
        !markbridge_register_teaching_component_catalog(
            'byte-capacity-overflow',
            ['title' => 'Bytes', 'defaultVersion' => '1.0.0', 'versions' => $boundedVersions],
            static fn() => [],
        ),
        'Union index byte budget bypassed',
    );
    catalog_assert(
        count(mbb_component_index_entries()) === 120,
        'Over-budget aggregate partly registered',
    );
    $GLOBALS['mbb_component_indexes'] = [];
    $GLOBALS['mbb_component_defaults'] = [];
    // One declared type is itself constrained by its 32 KiB atomic payload budget.
    catalog_assert(
        !markbridge_register_teaching_component_catalog(
            'bytes-overflow',
            ['title' => 'Overflow', 'defaultVersion' => '1.0.0', 'versions' => $versions],
            static fn() => [],
        ),
        'Oversized declaration accepted',
    );
    catalog_assert(
        empty(mbb_component_index_entries()),
        'Oversized declaration partially installed',
    );
    echo "Indexed exact definitions, pins, lazy cache, article budget and legacy compatibility passed\n";
} finally {
    unlink($file);
    rmdir(dirname($file));
    rmdir($directory);
}
