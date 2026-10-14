<?php

declare(strict_types=1);

// Standalone CLI conversion and model tests remain supported; direct web access requires WordPress.
if (!defined('ABSPATH')) {
    if (PHP_SAPI !== 'cli') {
        exit();
    }
}

// Public entry; the isolated implementation is generated from src at build time.
require_once __DIR__ . '/scoped/src/DisplayBoundaries.php';
