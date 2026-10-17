<?php
// Pure bounded CSL-JSON interchange. No network, database writes or server Node.
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}
function mbb_csl_library(): void
{
    if (!class_exists('MarkBridge\\Probe\\Bibliography')) {
        require_once __DIR__ . '/includes/php-converter/Worker.php';
    }
}
function mbb_csl_parse(string $source, array $keyMap = []): array
{
    mbb_csl_library();
    return \MarkBridge\Probe\Bibliography::parseCSL($source, $keyMap);
}
function mbb_csl_candidate(
    array $existing,
    array $report,
    string $mode,
    array $referencedKeys,
    bool $ackLoss = false,
    bool $ackKeys = false,
): array {
    mbb_csl_library();
    return \MarkBridge\Probe\Bibliography::candidate(
        $existing,
        $report,
        $mode,
        $referencedKeys,
        $ackLoss,
        $ackKeys,
    );
}
function mbb_csl_export(array $entries): array
{
    mbb_csl_library();
    return \MarkBridge\Probe\Bibliography::exportCSL($entries);
}
function mbb_bibliography_entry_hash(mixed $entry): string
{
    mbb_csl_library();
    return \MarkBridge\Probe\Bibliography::hash($entry);
}
