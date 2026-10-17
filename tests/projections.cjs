const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm'),
  cp = require('node:child_process');
const profile = JSON.parse(fs.readFileSync('plugin/projections-profile.json'));
const c = { TextEncoder };
vm.createContext(c);
vm.runInContext(
  fs
    .readFileSync('plugin/projections.js', 'utf8')
    .replace('__MBB_PROJECTION_PROFILE__', JSON.stringify(profile)),
  c,
);
const cases = JSON.parse(fs.readFileSync('tests/fixtures/projections.json'));
for (const f of cases) {
  let ok = true;
  try {
    c.MarkBridgeProjection.validate(f.value);
  } catch {
    ok = false;
  }
  assert.equal(ok, f.valid, f.name);
}
const php = cp.spawnSync('php', ['tests/projections.php', '--cases'], { encoding: 'utf8' });
assert.equal(php.status, 0, php.stderr);
assert.deepEqual(JSON.parse(php.stdout), cases);
const source = fs.readFileSync('plugin/projections.js', 'utf8');
assert.ok(!source.includes('items.length>128'), 'no new document component count cap');
console.log('Typed projection JS/PHP shared closed cases and UTF8/number JSON passed');
