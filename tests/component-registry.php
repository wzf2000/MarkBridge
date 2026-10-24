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
function current_user_can($capability)
{
    return $GLOBALS['diagnostic_admin'] ?? false;
}
function esc_html($text)
{
    return htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
}
require dirname(__DIR__) . '/plugin/components.php';
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
try {
    registry_assert(
        markbridge_register_teaching_component('fixture', $provider),
        'Valid provider rejected',
    );
    registry_assert(
        !markbridge_register_teaching_component('fixture', $provider),
        'Duplicate provider replaced existing resource',
    );
    registry_assert(
        mbb_component_registry()['fixture']['defaults']->n === 3,
        'Duplicate changed defaults',
    );
    $next_provider = $provider;
    $next_provider['version'] = '0.2.0';
    registry_assert(
        markbridge_register_teaching_component('fixture', $next_provider),
        'A distinct exact version was rejected',
    );
    registry_assert(
        !markbridge_register_teaching_component('fixture', $next_provider),
        'Duplicate exact version replaced its provider',
    );
    registry_assert(
        mbb_component_provider('fixture', '0.1.0')['version'] === '0.1.0' &&
            mbb_component_provider('fixture', '0.2.0')['version'] === '0.2.0' &&
            mbb_component_provider('fixture', '0.3.0') === null &&
            mbb_component_registry()['fixture']['version'] === '0.1.0',
        'Exact-version resolution changed the legacy default or guessed a version',
    );
    registry_assert(markbridge_teaching_supports_ui_locale(), 'Locale capability probe missing');
    foreach ([false, 1, 'throw'] as $domainResult) {
        $GLOBALS['domain_result'] = $domainResult;
        registry_assert(
            !mbb_component_domain_valid('fixture', '0.1.0', (object) ['n' => 3]),
            'Domain validator failure was not closed',
        );
    }
    unset($GLOBALS['domain_result']);
    registry_assert(
        mbb_component_domain_valid('fixture', '0.1.0', (object) ['n' => 3]),
        'Default domain admission failed',
    );
    registry_assert(
        !array_key_exists(
            'supportsUiLocale',
            mbb_component_public(mbb_component_registry()['fixture']),
        ),
        'Legacy DTO gained an optional field',
    );
    foreach ([true, false] as $flag) {
        $localeProvider = $provider;
        $localeProvider['supportsUiLocale'] = $flag;
        $localeId = $flag ? 'locale-enabled' : 'locale-disabled';
        registry_assert(
            markbridge_register_teaching_component($localeId, $localeProvider) &&
                mbb_component_public(mbb_component_registry()[$localeId])['supportsUiLocale'] ===
                    $flag,
            'Trusted locale capability was not preserved',
        );
    }
    foreach ([null, 1, 'true', []] as $flag) {
        $localeProvider = $provider;
        $localeProvider['supportsUiLocale'] = $flag;
        registry_assert(
            !markbridge_register_teaching_component('bad-locale', $localeProvider),
            'Nonboolean locale capability accepted',
        );
    }
    registry_assert(markbridge_teaching_supports_reader_diagrams(), 'Reader diagram probe missing');
    $diagramProvider = $provider;
    $diagramProvider['readerMode'] = 'diagram';
    registry_assert(
        markbridge_register_teaching_component('reader-diagram', $diagramProvider) &&
            mbb_component_public(mbb_component_registry()['reader-diagram'])['readerMode'] ===
                'diagram',
        'Trusted reader diagram capability missing',
    );
    registry_assert(
        !array_key_exists('readerMode', mbb_component_public(mbb_component_registry()['fixture'])),
        'Legacy provider gained automatic presentation',
    );
    foreach ([null, true, 'auto', 'algorithm', []] as $badMode) {
        $badDiagram = $provider;
        $badDiagram['readerMode'] = $badMode;
        registry_assert(
            !markbridge_register_teaching_component('bad-reader', $badDiagram),
            'Unrecognized automatic presentation accepted',
        );
    }
    $numeric = $provider;
    $numeric['schema'] = [
        'type' => 'object',
        'additionalProperties' => false,
        'required' => ['1', '01'],
        'properties' => ['1' => ['type' => 'string'], '01' => ['type' => 'string']],
    ];
    $numeric['defaults'] = json_decode('{"1":"numeric","01":"leading"}');
    registry_assert(
        markbridge_register_teaching_component('numeric-keys', $numeric) &&
            mbb_component_registry()['numeric-keys']['defaults']->{'1'} === 'numeric' &&
            mbb_component_registry()['numeric-keys']['defaults']->{'01'} === 'leading',
        'Distinct JSON numeric property names collapsed during registration',
    );
    $numeric['schema']['required'] = ['1', '1'];
    registry_assert(
        !markbridge_register_teaching_component('duplicate-required', $numeric),
        'Repeated required property accepted',
    );
    foreach (
        [
            ['type' => 'string', 'pattern' => '^safe$'],
            ['type' => 'object', 'properties' => [], 'additionalProperties' => true],
            ['type' => 'array', 'minItems' => 5, 'maxItems' => 1, 'items' => ['type' => 'number']],
            [
                'type' => 'object',
                'properties' => [],
                'required' => ['missing'],
                'additionalProperties' => false,
            ],
            ['type' => 'number', 'minimum' => null],
        ]
        as $schema
    ) {
        registry_assert(
            !mbb_component_schema_definition($schema),
            'Unsupported schema silently ignored',
        );
    }
    foreach (
        [NAN, INF, (object) ['n' => NAN], (object) ['n' => 65], (object) ['n' => '3']]
        as $defaults
    ) {
        $bad = $provider;
        $bad['defaults'] = $defaults;
        registry_assert(
            !markbridge_register_teaching_component('bad-default', $bad),
            'Bad defaults accepted or interrupted the page',
        );
    }
    $textFile = $directory . '/fixture/frame-123456789abc.html.txt';
    copy($file, $textFile);
    $textProvider = $provider;
    $textProvider['minMarkBridge'] = '2.0.3';
    $textProvider['resource']['file'] = $textFile;
    $textProvider['resource']['url'] = plugins_url(basename($textFile), $textFile);
    registry_assert(
        markbridge_register_teaching_component('text-payload', $textProvider) &&
            mbb_component_registry()['text-payload']['status'] === 'available',
        'Exact HTML text payload rejected',
    );
    $wrongText = $textProvider;
    $wrongText['resource']['sha256'] = str_repeat('0', 64);
    registry_assert(
        markbridge_register_teaching_component('text-integrity', $wrongText) &&
            mbb_component_registry()['text-integrity']['status'] === 'resource-integrity',
        'Text payload digest mismatch became available',
    );
    $limitedText = $textProvider;
    $limitedText['budgets']['resourceBytes'] = 1;
    registry_assert(
        markbridge_register_teaching_component('text-limit', $limitedText) &&
            mbb_component_registry()['text-limit']['status'] === 'resource-limit',
        'Text payload bypassed resource budget',
    );
    foreach (['frame.txt', 'frame.html.txt.js', 'frame.HTML.txt'] as $name) {
        $invalidText = $textProvider;
        $invalidText['resource']['file'] = $directory . '/fixture/' . $name;
        $invalidText['resource']['url'] = plugins_url($name, $invalidText['resource']['file']);
        registry_assert(
            !markbridge_register_teaching_component('invalid-text', $invalidText),
            'Arbitrary text suffix accepted',
        );
    }
    $escapedText = $textProvider;
    $escapedText['resource']['file'] = $directory . '/outside.html.txt';
    copy($file, $escapedText['resource']['file']);
    $escapedText['resource']['url'] = plugins_url(
        'outside.html.txt',
        $escapedText['resource']['file'],
    );
    registry_assert(
        !markbridge_register_teaching_component('outside-text', $escapedText),
        'Text payload escaped plugin directory',
    );
    unlink($escapedText['resource']['file']);
    $remoteText = $textProvider;
    $remoteText['resource']['url'] = 'https://invalid.example/frame.html.txt';
    registry_assert(
        !markbridge_register_teaching_component('remote-text', $remoteText),
        'Text payload accepted a remote URL',
    );
    $bad = $provider;
    $bad['resource']['url'] = 'https://invalid.example/frame.html';
    registry_assert(
        !markbridge_register_teaching_component('bad-url', $bad),
        'Remote resource accepted',
    );
    $bad = $provider;
    $bad['resource']['sha256'] = '0';
    registry_assert(
        !markbridge_register_teaching_component('bad-hash', $bad),
        'Malformed digest accepted',
    );
    $bad = $provider;
    $bad['resource']['sha256'] = str_repeat('0', 64);
    registry_assert(
        markbridge_register_teaching_component('bad-integrity', $bad),
        'Known bad integrity should remain diagnostic',
    );
    registry_assert(
        mbb_component_registry()['bad-integrity']['status'] === 'resource-integrity',
        'Digest failure enabled provider',
    );
    ini_set('serialize_precision', '14');
    registry_assert(
        mbb_component_json(1.000000000000001) !== mbb_component_json(1.000000000000002),
        'Distinct floats collapsed in public data',
    );
    registry_assert(ini_get('serialize_precision') === '14', 'Precision setting was not restored');
    registry_assert(
        mbb_component_schema(1.0, ['type' => 'number', 'enum' => [1]]),
        'JSON numeric enum rejected same numeric value',
    );
    registry_assert(
        mbb_component_schema((object) ['n' => 1], [
            'type' => 'object',
            'additionalProperties' => false,
            'properties' => ['n' => ['type' => 'number']],
            'enum' => [(object) ['n' => 1.0]],
        ]),
        'JSON object enum used object identity',
    );
    $original = $GLOBALS['mbb_components'];
    $GLOBALS['mbb_components'] = [];
    $base =
        '<!-- wp:mbb/component {"id":"near","component":"fixture","componentVersion":"0.1.0","version":1,"params":{"n":1.000000000000001}} -->';
    $candidate = str_replace('1.000000000000001', '1.000000000000002', $base);
    registry_assert(
        mbb_component_admit($candidate, $base) instanceof WP_Error,
        'Missing provider accepted distinct near floats',
    );
    $activity = (object) [
        'schema' => 1,
        'prompt' => 'question',
        'options' => [
            (object) ['key' => 'a', 'target' => 'a'],
            (object) ['key' => 'b', 'target' => 'b'],
        ],
        'hints' => [],
        'feedback' => (object) ['correct' => 'yes', 'incorrect' => 'no'],
        'explanation' => 'solution',
    ];
    $attrs = (object) [
        'id' => 'check',
        'component' => 'fixture',
        'componentVersion' => '0.1.0',
        'version' => 2,
        'params' => (object) ['n' => 3],
        'activity' => $activity,
    ];
    $comment = static fn($a) => '<!-- wp:mbb/component ' . json_encode($a) . ' -->';
    $activityBase = $comment($attrs);
    registry_assert(
        mbb_component_admit($activityBase . '<p>edited static text</p>', $activityBase) === true,
        'Missing provider blocked unchanged activity text',
    );
    $attrs->activity->options[0]->key = 'changed';
    registry_assert(
        mbb_component_admit($comment($attrs), $activityBase) instanceof WP_Error,
        'Missing provider accepted relation-only semantic change',
    );
    $GLOBALS['mbb_components'] = $original;
    registry_assert(
        mbb_component_admit($comment($attrs), $activityBase) instanceof WP_Error,
        'Non-opt-in provider accepted activity semantics',
    );
    $GLOBALS['mbb_components']['fixture']['activityVersion'] = 1;
    $GLOBALS['domain_result'] = false;
    registry_assert(
        mbb_component_admit($comment($attrs), $activityBase) instanceof WP_Error,
        'Activity-only change skipped provider domain validation',
    );
    unset($GLOBALS['domain_result']);
    registry_assert(
        mbb_component_admit($comment($attrs), $activityBase) === true,
        'Opt-in provider domain could not admit activity semantics',
    );
    $GLOBALS['mbb_components'] = $original;
    registry_assert(
        !mbb_component_schema((object) ['n' => '3'], $provider['schema']),
        'Numeric string was coerced',
    );
    foreach (["\u{2028}", "\u{2029}"] as $separator) {
        registry_assert(
            mbb_component_pure_params((object) ['text' => str_repeat($separator, 3000)]),
            'Line separators were counted as escaped source bytes',
        );
        registry_assert(
            !mbb_component_pure_params((object) ['text' => str_repeat($separator, 6000)]),
            'Line separator byte limit was ignored',
        );
    }
    foreach (
        [
            ['type' => 'string', 'enum' => ['valid', "\xFF"]],
            [
                'type' => 'object',
                'properties' => ["\xFF" => ['type' => 'string']],
                'additionalProperties' => false,
            ],
        ]
        as $badSchema
    ) {
        $bad = $provider;
        $bad['schema'] = [
            'type' => 'object',
            'properties' => ['optional' => $badSchema],
            'additionalProperties' => false,
        ];
        $bad['defaults'] = (object) [];
        registry_assert(
            !markbridge_register_teaching_component('bad-utf8', $bad),
            'Invalid schema UTF8 poisoned public registry',
        );
    }
    registry_assert(
        is_string(mbb_component_json(mbb_component_available())),
        'Rejected provider poisoned public JSON',
    );
    $unsupported = $provider;
    $unsupported['protocolVersion'] = 3;
    registry_assert(
        markbridge_register_teaching_component('future-protocol', $unsupported),
        'Incompatible provider could not retain diagnostics',
    );
    registry_assert(
        mbb_component_registry()['future-protocol']['status'] === 'protocol-incompatible',
        'Protocol mismatch was usable',
    );
    $future = $provider;
    $future['minMarkBridge'] = '999.0.0';
    registry_assert(
        markbridge_register_teaching_component('future-core', $future) &&
            mbb_component_registry()['future-core']['status'] === 'version-incompatible',
        'Future minimum version was usable',
    );
    $candidate = $provider;
    preg_match(
        '/^ \* Version: ([^ \r\n]+)/m',
        file_get_contents(dirname(__DIR__) . '/plugin/markdown-block-bridge.php'),
        $headerVersion,
    );
    $currentVersion = $headerVersion[1];
    $baseVersion = explode('-', $currentVersion, 2)[0];
    $candidate['minMarkBridge'] = str_contains($currentVersion, '-')
        ? $baseVersion . '-dev.1'
        : $currentVersion;
    registry_assert(
        markbridge_register_teaching_component('candidate', $candidate) &&
            mbb_component_registry()['candidate']['status'] === 'available',
        'Current core rejected its same-base candidate floor',
    );
    $stable = $provider;
    $stable['minMarkBridge'] = $baseVersion;
    registry_assert(
        markbridge_register_teaching_component('stable-only', $stable) &&
            mbb_component_registry()['stable-only']['status'] ===
                (str_contains($currentVersion, '-') ? 'version-incompatible' : 'available'),
        'Candidate claimed stable compatibility',
    );
    $lowerStable = $provider;
    $lowerStable['minMarkBridge'] = '1.9.0';
    registry_assert(
        markbridge_register_teaching_component('lower-stable', $lowerStable) &&
            mbb_component_registry()['lower-stable']['status'] === 'available',
        'Current core rejected the supported lower stable version',
    );
    $savedRegistry = mbb_component_registry();
    $rc = (int) substr(strrchr($currentVersion, '.'), 1);
    foreach (
        [
            [$baseVersion . '-dev.1', 'available'],
            ['1.9.0', 'available'],
            [
                $baseVersion . '-rc.' . max(1, $rc - 1),
                str_contains($currentVersion, '-dev.') ? 'version-incompatible' : 'available',
            ],
            [$currentVersion, 'available'],
            [
                $baseVersion . '-rc.' . ($rc + 1),
                str_contains($currentVersion, '-') ? 'version-incompatible' : 'available',
            ],
            [
                $baseVersion,
                str_contains($currentVersion, '-') ? 'version-incompatible' : 'available',
            ],
            ['99.0.0-rc.1', 'version-incompatible'],
        ]
        as [$floor, $status]
    ) {
        $floorProvider = $provider;
        $floorProvider['minMarkBridge'] = $floor;
        registry_assert(
            markbridge_register_teaching_component('rc-floor', $floorProvider) &&
                mbb_component_provider('rc-floor', '0.1.0')['status'] === $status,
            'Incorrect RC floor compatibility: ' . $floor,
        );
        $GLOBALS['mbb_components'] = $savedRegistry;
    }
    foreach (
        [
            '2.9.0-rc',
            '2.9.0-rc.x',
            '2.9.0-rc.1.extra',
            '2.9.0-beta.1',
            '2.9.0-RC.1',
            '2.9.0+meta',
            "2.9.0-rc.1\n",
        ]
        as $floor
    ) {
        $floorProvider = $provider;
        $floorProvider['minMarkBridge'] = $floor;
        registry_assert(
            !markbridge_register_teaching_component('invalid-floor', $floorProvider),
            'Invalid RC minimum accepted',
        );
    }
    $floorProvider = $provider;
    $floorProvider['version'] = '0.1.0-rc.1';
    registry_assert(
        !markbridge_register_teaching_component('rc-implementation', $floorProvider),
        'RC minimum widened exact component implementation versions',
    );
    foreach (mbb_component_budget_limits() as $key => $max) {
        foreach ([0, -1, $max + 1, '1', 1.0] as $badValue) {
            $bad = $provider;
            $bad['budgets'][$key] = $badValue;
            registry_assert(
                !markbridge_register_teaching_component('bad-budget', $bad),
                'Budget type or hard limit ignored: ' . $key,
            );
        }
    }
    $bad = $provider;
    $bad['unexpected'] = true;
    registry_assert(
        !markbridge_register_teaching_component('bad-field', $bad),
        'Unknown SDK field ignored',
    );
    $bad = $provider;
    unset($bad['budgets']['wallMs']);
    registry_assert(
        !markbridge_register_teaching_component('missing-budget', $bad),
        'Missing runtime budget accepted',
    );
    $limited = $provider;
    $limited['budgets']['resourceBytes'] = 1;
    registry_assert(
        markbridge_register_teaching_component('limited', $limited) &&
            mbb_component_registry()['limited']['status'] === 'resource-limit',
        'Resource exceeded declared budget',
    );
    $missing = $provider;
    $missing['resource']['file'] = dirname($file) . '/missing.html';
    $missing['resource']['url'] = plugins_url('missing.html', $missing['resource']['file']);
    registry_assert(
        markbridge_register_teaching_component('missing-file', $missing) &&
            mbb_component_registry()['missing-file']['status'] === 'resource-unavailable',
        'Missing local resource lost its diagnostic',
    );
    $GLOBALS['diagnostic_admin'] = false;
    ob_start();
    mbb_component_diagnostics_page();
    $html = ob_get_clean();
    registry_assert($html === '', 'Unauthenticated diagnostics exposed provider data');
    $GLOBALS['diagnostic_admin'] = true;
    ob_start();
    mbb_component_diagnostics_page();
    $html = ob_get_clean();
    registry_assert(
        str_contains($html, 'future-protocol') &&
            str_contains($html, 'protocol-incompatible') &&
            !str_contains($html, $directory) &&
            !str_contains($html, 'http://'),
        'Diagnostics leaked paths or omitted status',
    );
    registry_assert(
        count(mbb_component_available()) < count(mbb_component_registry()),
        'Unavailable providers entered author menu',
    );
    while (count(mbb_component_registry()) < 32) {
        registry_assert(
            markbridge_register_teaching_component(
                'capacity-' . count(mbb_component_registry()),
                $provider,
            ),
            'Provider capacity setup failed',
        );
    }
    registry_assert(
        !markbridge_register_teaching_component('capacity-overflow', $provider),
        'Provider registry was unbounded',
    );
    echo "Registry closed schemas, strong types, bounded local resources, conflicts and registration failure recovery passed.\n";
} finally {
    if (isset($textFile) && is_file($textFile)) {
        unlink($textFile);
    }
    unlink($file);
    rmdir($directory . '/fixture');
    rmdir($directory);
}
