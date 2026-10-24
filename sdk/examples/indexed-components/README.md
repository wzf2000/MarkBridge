# Indexed exact counter fixture

This executable PHP sample declares 40 lightweight exact versions without eagerly resolving any.
It is a synthetic SDK fixture, not a production extension or a performance benchmark.

Load `provider.php` after Main 3.4 in an owned local WordPress fixture. Place a fixed bounded HTML
resource inside a child plugin directory. During the fixture build, record its SHA-256 as a literal
in the trusted fixture entry, then register at the existing component registration stage:

```php
require '/path/to/sdk/examples/indexed-components/provider.php';
add_action('markbridge_register_teaching_components', static function () {
  mbb_sdk_register_indexed(__DIR__ . '/counter.html', FIXED_BUILD_SHA256, 40);
});
```

`FIXED_BUILD_SHA256` is the build's fixed 64-hex digest, not a request parameter and not an init-time
hash of the installed file. The definition helper is
`mbb_sdk_indexed_definition($version, $file, $expectedSha256)`. Each version accepts `{n: 0..10}` and
preserves authored static content. Replace the single HTML with your reviewed fixed implementation
when exercising an interactive frame. This example does not grant execution or networking permissions.

Run `php tests/component-catalog.php` from the main repository to exercise the sample with a newly
created temporary plugin resource. The test also verifies 40 lazy typed projections across two
20-version chapter plans and retention of the independent legacy 32-entry registries.
