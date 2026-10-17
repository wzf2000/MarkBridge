// Reusable no-network resource/conformance check. Run with an explicit provider directory.
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const root = path.resolve(process.argv[2] || __dirname),
  m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
assert.match(m.file, /^[a-z0-9-]+-[a-f0-9]{12}\.html\.txt$/);
assert.equal(path.basename(m.file), m.file);
const file = path.join(root, 'assets', m.file),
  data = fs.readFileSync(file);
assert.ok(data.length <= 524288);
assert.equal(crypto.createHash('sha256').update(data).digest('hex'), m.sha256);
assert.ok(m.file.includes(m.sha256.slice(0, 12)));
const source = fs.readFileSync(path.join(root, 'provider.js'), 'utf8');
assert.match(source, /performance\.now\(\)\s*>\s*deadline/);
assert.ok(!/fetch\(|localStorage|document\.cookie|eval\(|new Function/.test(source));
const vm = require('node:vm');
function runtime() {
  const controls = new Map(
      ['output', '#run', '#stop'].map((k) => [k, { textContent: '', disabled: false }]),
    ),
    messages = [];
  let receive,
    worker,
    clock = 0,
    advance = 0;
  const parent = { postMessage: (m) => messages.push(m) },
    c = {
      document: { querySelector: (s) => controls.get(s) },
      parent,
      performance: { now: () => clock },
      TextEncoder,
      structuredClone,
      Uint8Array,
      Blob,
      crypto: { getRandomValues: (v) => v.fill(1) },
      URL: { createObjectURL: () => '', revokeObjectURL() {} },
      setTimeout: () => 1,
      clearTimeout() {},
      addEventListener: (name, f) => (receive = f),
      Worker: class {
        constructor() {
          worker = this;
        }
        postMessage() {}
        terminate() {}
      },
      String: (v) => {
        clock += advance;
        return String(v);
      },
    };
  vm.createContext(c);
  vm.runInContext(source, c);
  const send = (data) =>
    receive({
      source: parent,
      data: { protocol: 'mbb-component/v1', session: 'session', ...data },
    });
  send({ type: 'init', params: { values: [1, 2, 3] } });
  assert.equal(messages[0].type, 'ready');
  controls.get('#run').onclick();
  const runId = messages.at(-1).runId;
  send({ type: 'grant', runId });
  return {
    messages,
    controls,
    finish(ms, cost = 0) {
      clock = ms;
      advance = cost;
      worker.onmessage({ data: 6 });
    },
    stop() {
      controls.get('#stop').onclick();
    },
    send,
    runId,
  };
}
let r = runtime();
r.finish(1999);
assert.equal(r.messages.at(-1).type, 'complete');
assert.equal(r.controls.get('output').textContent, '6');
r = runtime();
r.finish(2001);
assert.equal(r.messages.at(-1).code, 'RUN_LIMIT');
assert.ok(!r.messages.some((m) => m.type === 'complete'));
r = runtime();
r.finish(1900, 201);
assert.equal(r.messages.at(-1).code, 'RUN_LIMIT');
assert.ok(!r.messages.some((m) => m.type === 'complete'));
r = runtime();
r.stop();
r.finish(1);
assert.equal(r.messages.at(-1).type, 'stopped');
assert.ok(!r.messages.some((m) => m.type === 'complete'));
console.log(
  'Provider conformance: real resource fingerprint, ready/session/grant, successful run, pre/post validation and commit deadline, cancel/late discard passed',
);
