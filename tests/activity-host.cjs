const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  vm = require('node:vm');
const source = fs.readFileSync('plugin/components.js', 'utf8'),
  start = source.indexOf('    const receive = (event) => {'),
  end = source.indexOf("    window.addEventListener('message', receive);", start);
assert(start > 0 && end > start);
function context(options = {}) {
  const calls = [],
    sourceWindow = {},
    node = {
      isConnected: true,
      dataset: { mbbTeachingConfig: 'signature' },
      closest: () => null,
      getClientRects: () => [{}],
    },
    target = {
      isConnected: true,
      closest: () => node,
      scrollIntoView() {
        calls.push('scroll');
      },
      focus() {
        calls.push('focus');
      },
    };
  const c = {
    status: { textContent: '' },
    PROTOCOL: 'mbb-component/v1',
    budgets: { traceFrames: 8192, traceBytes: 524288 },
    frame: { contentWindow: sourceWindow, style: {} },
    session: 'session',
    config: { activity: {} },
    signature: 'signature',
    node,
    activityHandles: new Map([['handle', target]]),
    window: {
      MarkBridgeTeaching: {
        revealTarget() {
          calls.push('reveal');
        },
      },
    },
    performance: { now: () => c.clock },
    clock: 0,
    ready: true,
    startupDeadline: 5000,
    runDeadline: 2000,
    runId: null,
    T: (s) => s,
    TextEncoder,
    clearTimeout() {},
    failure: (message, code) => calls.push(code),
    automaticStarting: new Set(),
    pumpReaders() {
      calls.push('pump');
    },
    loading: false,
    startup: null,
    ...options,
  };
  vm.createContext(c);
  vm.runInContext(source.slice(start, end) + '\nglobalThis.receiveActivity=receive;', c);
  return {
    c,
    calls,
    send(type, extra = {}) {
      c.receiveActivity({
        source: sourceWindow,
        data: { protocol: 'mbb-component/v1', session: 'session', type, ...extra },
      });
    },
  };
}
let t = context({ ready: false, clock: 5001 });
t.send('ready');
assert.deepEqual(t.calls, ['RUN_BUDGET']);
assert.equal(t.c.ready, false);
t = context({ ready: false, clock: 4999 });
t.send('ready');
assert.equal(t.c.ready, true);
t = context({ clock: 60000 });
t.send('reveal-target', { handle: 'handle' });
assert.deepEqual(
  t.calls,
  ['reveal', 'scroll', 'focus'],
  'Ready reader must not expire while thinking',
);
t = context({ runId: 'run', clock: 2001 });
t.send('complete', { runId: 'run', frameCount: 0, outputBytes: 0 });
assert.deepEqual(
  t.calls,
  ['RUN_BUDGET'],
  'Synchronous terminal deadline must reject a late complete before timer callback',
);
t = context();
t.send('reveal-target', { handle: 'unknown' });
t.send('reveal-target', { handle: 'handle', selector: 'body' });
assert.deepEqual(t.calls, []);
t = context({ frame: null });
t.send('reveal-target', { handle: 'handle' });
assert.deepEqual(t.calls, [], 'Closed frame must reject old handles');
t = context();
t.c.node.dataset.mbbTeachingConfig = 'replaced';
t.send('reveal-target', { handle: 'handle' });
assert.deepEqual(t.calls, []);
console.log(
  'Actual host handler: synchronous startup/run terminal deadlines, indefinite ready thinking, closed/replaced session and bounded reveal handles passed.',
);
// The same terminal guard applies to immutable legacy payloads, not just v2 activities.
t = context({ config: {}, runId: 'run', clock: 2001 });
t.send('complete', { runId: 'run', frameCount: 1, outputBytes: 1 });
assert.deepEqual(t.calls, ['RUN_BUDGET']);
t = context({ config: {}, runId: 'run', clock: 1900 });
t.c.JSON = {
  stringify(value) {
    t.c.clock += 201;
    return JSON.stringify(value);
  },
};
t.send('complete', { runId: 'run', frameCount: 1, outputBytes: 1 });
assert.deepEqual(
  t.calls,
  ['RUN_BUDGET'],
  'Legacy terminal validation cannot overrun synchronously',
);
t = context({ config: {}, ready: false, clock: 4900 });
t.c.JSON = {
  stringify(value) {
    t.c.clock += 101;
    return JSON.stringify(value);
  },
};
t.send('ready');
assert.deepEqual(t.calls, ['RUN_BUDGET']);
