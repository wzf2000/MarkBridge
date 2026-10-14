<?php
// A synthetic gettext boundary for PHP model tests; this is not a WordPress locale test.
function __($message, $domain = 'default')
{
    static $catalog;
    $catalog ??= json_decode(
        file_get_contents(__DIR__ . '/../../plugin/languages/messages.json'),
        true,
        32,
        JSON_THROW_ON_ERROR,
    );
    return $domain === 'markbridge' && ($GLOBALS['mbb_test_locale'] ?? 'zh_CN') === 'zh_CN'
        ? $catalog[$message] ?? $message
        : $message;
}
