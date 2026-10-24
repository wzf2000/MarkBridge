const assert = require('node:assert/strict'),
  cp = require('node:child_process'),
  path = require('node:path'),
  R = require('../plugin/component-resources.js');
const item = (id, type, extension, extra = {}) => ({
  id,
  path: 'assets/0.1.0/' + id + '.' + extension,
  type,
  bytes: 100,
  sha256: 'a'.repeat(64),
  deps: [],
  license: 'GPL-3.0-or-later',
  version: '0.1.0',
  ...extra,
});
const worker = item('worker', 'javascript', 'js'),
  moduleItem = item('module', 'webassembly', 'wasm');
const m = (resources) => ({ schema: 'mbb-resources/v2', version: '0.1.0', resources });
const valid = [
  { profile: 'fixed-wasm/v1', manifest: m([worker, moduleItem]) },
  { profile: 'fixed-wasm/v1', manifest: m([worker, moduleItem, item('data', 'json', 'json')]) },
  {
    profile: 'fixed-wasm/v1',
    manifest: m([
      { ...worker, bytes: 1048576 },
      { ...moduleItem, bytes: 1048576 },
    ]),
  },
  { profile: null, manifest: m([item('data', 'json', 'json')]) },
];
const invalid = [
  { profile: null, manifest: m([worker, moduleItem]) },
  ...['unknown', 'public-data/v1', true, 2, {}, []].map((profile) => ({
    profile,
    manifest: m([worker, moduleItem]),
  })),
  ...[
    [worker],
    [moduleItem],
    [worker, moduleItem, item('second', 'webassembly', 'wasm')],
    [worker, moduleItem, item('second', 'javascript', 'js')],
    [worker, { ...moduleItem, type: 'public-data' }],
    [worker, { ...moduleItem, path: 'assets/0.1.0/module.bin' }],
    [worker, { ...moduleItem, bytes: 1048577 }],
    [worker, { ...moduleItem, path: 'assets/0.1.0/../module.wasm' }],
    [
      { ...worker, deps: ['module'] },
      { ...moduleItem, deps: ['worker'] },
    ],
  ].map((resources) => ({ profile: 'fixed-wasm/v1', manifest: m(resources) })),
];
const cases = [...valid, ...invalid];
const result = cases.map((c) => {
  try {
    return { ok: true, value: R.manifest(c.manifest, c.profile) };
  } catch (e) {
    return { ok: false, code: e.code };
  }
});
assert(result.slice(0, valid.length).every((x) => x.ok));
assert(result.slice(valid.length).every((x) => !x.ok));
const php = JSON.parse(
  cp.execFileSync(
    process.env.MARKBRIDGE_TEST_PHP || 'php',
    [path.join(__dirname, 'component-execution-model.php')],
    { input: JSON.stringify(cases), encoding: 'utf8' },
  ),
);
assert.deepEqual(php, result);
console.log(
  'Execution profile PHP/JS closed profile, default WASM refusal, exact Worker/module count, extension/dependency and unchanged byte budgets passed.',
);
