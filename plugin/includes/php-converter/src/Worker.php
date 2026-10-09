<?php

declare(strict_types=1);

namespace MarkBridge\Probe;

require_once __DIR__ . '/Converter.php';

/** WordPress-independent adapter for the existing server worker document contract. */
final class Worker
{
    public static function convert(array $request): array
    {
        try {
            if (($request['mode'] ?? null) === 'batch') {
                $items = $request['items'] ?? null;
                if (!is_array($items) || !array_is_list($items) || count($items) > 5) {
                    throw new ConversionError('BATCH_LIMIT', 'A batch requires at most five items');
                }
                $results = [];
                foreach ($items as $item) {
                    $result =
                        is_array($item) && ($item['mode'] ?? null) !== 'batch'
                            ? self::convert($item)
                            : [
                                'ok' => false,
                                'code' => 'REQUEST',
                                'message' => 'Invalid batch item',
                            ];
                    // The existing worker exposes location only for the outer error.
                    unset($result['location']);
                    $results[] = $result;
                }
                return ['ok' => true, 'document' => $results];
            }
            return ['ok' => true, 'document' => self::document($request)];
        } catch (ConversionError $error) {
            return [
                'ok' => false,
                'code' => $error->errorCode,
                'message' => $error->getMessage(),
                'location' => '',
            ];
        } catch (\JsonException $error) {
            return [
                'ok' => false,
                'code' => 'JSON',
                'message' => 'Invalid block JSON',
                'location' => '',
            ];
        } catch (\Throwable $error) {
            // Public conversion errors never expose dependency paths or internals.
            return [
                'ok' => false,
                'code' => 'CONVERSION',
                'message' => 'PHP 转换服务未完成，原内容未写入。',
                'location' => '',
            ];
        }
    }

    private static function string(array $request, string $field): string
    {
        if (!isset($request[$field]) || !is_string($request[$field])) {
            throw new ConversionError('REQUEST', 'Expected a string ' . $field);
        }
        return $request[$field];
    }

    private static function document(array $request): array
    {
        $documentId = self::string($request, 'documentId');
        if (trim($documentId) === '') {
            throw new ConversionError('DOCUMENT_ID', 'A nonempty documentId is required');
        }
        $converter = new Converter();
        switch ($request['mode'] ?? null) {
            case 'markdown':
                $result = $converter->fromMarkdown(self::string($request, 'source'));
                break;
            case 'paired_restore':
                $result = $converter->restorePair(
                    self::string($request, 'source'),
                    self::string($request, 'serialized'),
                    $documentId,
                );
                break;
            case 'blocks':
                $base = $request['base'] ?? null;
                if (
                    !is_array($base) ||
                    ($base['schema'] ?? null) !== 1 ||
                    ($base['origin'] ?? null) !== 'markdown_import' ||
                    !in_array($base['converter'] ?? null, ['0.1.2', '0.2.0'], true)
                ) {
                    throw new ConversionError(
                        'DOCUMENT_MODEL',
                        'Unsupported base document schema, converter or origin',
                    );
                }
                if (self::string($base, 'documentId') !== $documentId) {
                    throw new ConversionError(
                        'DOCUMENT_ID',
                        'Request and base documentId must match',
                    );
                }
                $verified = $converter->restorePair(
                    self::string($base, 'source'),
                    self::string($base, 'serialized'),
                    $documentId,
                );
                $serialized = self::string($request, 'serialized');
                if ($converter->equivalentSerialized($serialized, $verified['serialized'])) {
                    $result = $verified;
                } else {
                    // The base proves provenance only. An edited snapshot must
                    // pass today's real reverse and import paths independently.
                    $reverse = $converter->fromBlocks($serialized);
                    $result = $converter->fromMarkdown($reverse['source']);
                }
                break;
            default:
                throw new ConversionError('REQUEST', 'Unknown conversion mode');
        }
        return [
            'schema' => 1,
            'converter' => '0.2.0',
            'origin' => 'markdown_import',
            'documentId' => $documentId,
            'source' => $result['source'],
            'serialized' => $result['serialized'],
        ];
    }
}
