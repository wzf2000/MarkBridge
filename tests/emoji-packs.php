<?php
// Run with wp eval-file in a disposable installation; uses only generated data.
if (!defined('WP_CLI') || !WP_CLI || wp_get_environment_type() !== 'local') {
    exit(1);
}
$archive = getenv('MARKBRIDGE_TEST_EMOJI');
function emoji_expect_failure($callback)
{
    try {
        $callback();
    } catch (RuntimeException $error) {
        return;
    }
    throw new RuntimeException('Expected pack rejection.');
}
$key = mbb_emoji_import($archive);
mbb_emoji_select($key);
if (!isset(mbb_emoji_config()['smile'])) {
    throw new RuntimeException('Installed image is unavailable.');
}
emoji_expect_failure(fn() => mbb_emoji_delete($key));
emoji_expect_failure(fn() => mbb_emoji_select('missing'));
if (get_option('markbridge_emoji_active') !== $key) {
    throw new RuntimeException('Failed switch changed selection.');
}
$attacks = [
    '../escape.php' => '<?php echo 1;',
    'extra.php' => '<?php echo 1;',
    'huge.png' => str_repeat('x', 262145),
    'link.png' => 'smile.png',
];
foreach ($attacks as $name => $bytes) {
    $tmp = wp_tempnam();
    copy($archive, $tmp);
    $zip = new ZipArchive();
    $zip->open($tmp);
    $zip->addFromString($name, $bytes);
    if ($name === 'link.png') {
        $zip->setExternalAttributesName($name, ZipArchive::OPSYS_UNIX, 0120777 << 16);
    }
    $zip->close();
    emoji_expect_failure(fn() => mbb_emoji_import($tmp));
    unlink($tmp);
}
$block_update = static fn($value, $old) => $old;
add_filter('pre_update_option_markbridge_emoji_active', $block_update, 10, 2);
emoji_expect_failure(fn() => mbb_emoji_select(''));
remove_filter('pre_update_option_markbridge_emoji_active', $block_update, 10);
if (get_option('markbridge_emoji_active') !== $key) {
    throw new RuntimeException('Rejected database update changed selection.');
}
foreach (['checksum', 'mime', 'executable'] as $attack) {
    $tmp = wp_tempnam();
    copy($archive, $tmp);
    $zip = new ZipArchive();
    $zip->open($tmp);
    $manifest = json_decode($zip->getFromName('manifest.json'), true);
    $bytes = $zip->getFromName('smile.png');
    if ($attack === 'checksum') {
        $manifest['emoji']['smile']['sha256'] = str_repeat('0', 64);
    } else {
        $bytes = $attack === 'mime' ? '<svg onload="alert(1)"></svg>' : $bytes . '<?php echo 1;';
        $manifest['emoji']['smile']['sha256'] = hash('sha256', $bytes);
        $zip->addFromString('smile.png', $bytes);
    }
    $zip->addFromString('manifest.json', wp_json_encode($manifest));
    $zip->close();
    emoji_expect_failure(fn() => mbb_emoji_import($tmp));
    unlink($tmp);
}
mbb_emoji_select('');
mbb_emoji_delete($key);
if (get_option('markbridge_emoji_packs', []) || mbb_emoji_config()) {
    throw new RuntimeException('Pack removal failed.');
}
echo "Emoji import, selection, failure preservation, unsafe archives and removal passed.\n";
