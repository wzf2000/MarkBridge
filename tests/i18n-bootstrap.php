<?php
// UI validation must work before converter prerequisites are available.
require_once __DIR__ . '/../plugin/includes/i18n.php';
if (
    !mbb_safe_translation('Close', '关闭') ||
    mbb_safe_translation('Close', "\xff") ||
    mbb_safe_translation('Close', '<img onerror="bad">') ||
    mbb_safe_translation('<a title="1 > 0">Read</a>', '<a title="1 > 0" onclick="bad">阅读</a>')
) {
    throw new RuntimeException('UI translation bootstrap safety regressed');
}
echo "UI translation validation passed independently of mb_check_encoding.\n";
