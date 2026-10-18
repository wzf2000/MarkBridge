<?php
// Closed, portable collection configuration. No article body or authorization lives here.
if (!defined('ABSPATH') && PHP_SAPI !== 'cli') {
    exit();
}
const MBB_COLLECTION_LIMITS = [
    'collections' => 16,
    'chapters' => 10,
    'configBytes' => 16384,
    'catalogBytes' => 262144,
    'documentBytes' => 262144,
    'articleExportBytes' => 33554432,
    'resources' => 64,
    'resourceBytes' => 16777216,
    'imageBytes' => 8388608,
    'artifactBytes' => 25165824,
    'ownerJobs' => 2,
    'siteJobs' => 4,
    'slotBytes' => 67108864,
    'ttlSeconds' => 900,
    'externalDocuments' => 16,
    'references' => 256,
];
function mbb_collections_json($value): string
{
    return json_encode(
        $value,
        JSON_UNESCAPED_UNICODE |
            JSON_UNESCAPED_SLASHES |
            JSON_UNESCAPED_LINE_TERMINATORS |
            JSON_THROW_ON_ERROR,
    );
}
function mbb_collections_closed($value, array $keys): bool
{
    return is_array($value) &&
        !array_is_list($value) &&
        count($value) === count($keys) &&
        !array_diff(array_keys($value), $keys);
}
function mbb_collections_config($value): array
{
    if (
        !mbb_collections_closed($value, [
            'schema',
            'title',
            'lang',
            'rights',
            'cover',
            'privateOptIn',
            'chapters',
        ]) ||
        $value['schema'] !== 1 ||
        !is_bool($value['privateOptIn']) ||
        (!is_null($value['cover']) && (!is_int($value['cover']) || $value['cover'] < 1)) ||
        !is_array($value['chapters']) ||
        !array_is_list($value['chapters']) ||
        count($value['chapters']) > MBB_COLLECTION_LIMITS['chapters']
    ) {
        throw new InvalidArgumentException('Invalid collection configuration');
    }
    foreach (['title' => 400, 'rights' => 2000, 'lang' => 35] as $key => $max) {
        if (
            !is_string($value[$key]) ||
            !mb_check_encoding($value[$key], 'UTF-8') ||
            strlen($value[$key]) > $max ||
            preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/', $value[$key])
        ) {
            throw new InvalidArgumentException('Invalid collection text');
        }
    }
    if (
        trim($value['title']) === '' ||
        !preg_match('/^[a-zA-Z]{2,8}(?:-[a-zA-Z0-9]{1,8})*$/D', $value['lang'])
    ) {
        throw new InvalidArgumentException('Invalid collection title or language');
    }
    $ids = [];
    $keys = [];
    foreach ($value['chapters'] as $chapter) {
        if (
            !mbb_collections_closed($chapter, ['key', 'post_id']) ||
            !is_string($chapter['key']) ||
            !preg_match('/^C_[a-f0-9]{32}$/D', $chapter['key']) ||
            !is_int($chapter['post_id']) ||
            $chapter['post_id'] < 1 ||
            isset($ids[$chapter['post_id']]) ||
            isset($keys[$chapter['key']])
        ) {
            throw new InvalidArgumentException('Invalid or duplicate collection chapter');
        }
        $ids[$chapter['post_id']] = true;
        $keys[$chapter['key']] = true;
    }
    if (strlen(mbb_collections_json($value)) > MBB_COLLECTION_LIMITS['configBytes']) {
        throw new InvalidArgumentException('Collection configuration exceeds its budget');
    }
    return $value;
}
function mbb_collections_id(mixed $value): bool
{
    return is_string($value) && preg_match('/^B_[a-f0-9]{32}$/D', $value) === 1;
}
function mbb_collections_token(mixed $value): bool
{
    return is_string($value) && preg_match('/^[a-f0-9]{64}$/D', $value) === 1;
}
