<?php

declare(strict_types=1);

use MarkBridge\Probe\ConversionError;
use MarkBridge\Probe\Converter;

require_once __DIR__ . '/Converter.php';

try {
    $raw = stream_get_contents(STDIN, Converter::MAX_BYTES * 6 + 1024);
    if ($raw === false || strlen($raw) >= Converter::MAX_BYTES * 6 + 1024) {
        throw new ConversionError('INPUT_LIMIT', 'JSON input is too large');
    }
    $request = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    if (!is_array($request) || !isset($request['mode']) || !is_string($request['mode'])) {
        throw new ConversionError(
            'REQUEST',
            'Expected a JSON object with mode and source or serialized',
        );
    }
    $converter = new Converter();
    $result = match ($request['mode']) {
        'markdown' => isset($request['source']) && is_string($request['source'])
            ? $converter->fromMarkdown($request['source'])
            : throw new ConversionError('REQUEST', 'Markdown mode requires a string source'),
        'blocks' => isset($request['serialized']) && is_string($request['serialized'])
            ? $converter->fromBlocks($request['serialized'])
            : throw new ConversionError('REQUEST', 'Blocks mode requires a string serialized'),
        default => throw new ConversionError('REQUEST', 'Unknown conversion mode'),
    };
} catch (ConversionError $error) {
    $result = ['ok' => false, 'code' => $error->errorCode, 'message' => $error->getMessage()];
} catch (JsonException $error) {
    $result = ['ok' => false, 'code' => 'JSON', 'message' => 'Invalid JSON'];
} catch (Throwable $error) {
    $result = ['ok' => false, 'code' => 'INTERNAL', 'message' => $error->getMessage()];
}

echo json_encode(
    $result,
    JSON_UNESCAPED_UNICODE |
        JSON_UNESCAPED_SLASHES |
        JSON_INVALID_UTF8_SUBSTITUTE |
        JSON_THROW_ON_ERROR,
) . "\n";
