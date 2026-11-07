const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

(async () => {
  const created = [],
    revoked = [];
  class TestURL extends URL {
    static createObjectURL(blob) {
      assert.equal(blob.type, 'text/javascript');
      const url = 'blob:test-' + created.length;
      created.push({ url, blob });
      return url;
    }
    static revokeObjectURL(url) {
      revoked.push(url);
    }
  }
  class TestWorker extends EventTarget {
    constructor(url) {
      super();
      if (TestWorker.fail) throw Error('Worker unavailable');
      this.url = url;
    }
  }
  const context = {
    URL: TestURL,
    Blob,
    Worker: TestWorker,
    location: { href: 'https://example.test/math-engine.html', origin: 'https://example.test' },
    addEventListener() {},
  };
  context.window = context;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../plugin/math-engine.js'), 'utf8'),
    context,
  );
  let initialized = false;
  Object.assign(context.MathJax.startup, {
    adaptor: {},
    defaultReady() {
      initialized = true;
    },
  });
  context.MathJax.startup.ready();
  assert(initialized);
  const factory = context.MathJax.startup.adaptor.createWorker;
  const listener = () => {};
  const options = {
    path: 'https://example.test/vendor/sre',
    maps: 'https://example.test/maps',
    worker: 'speech-worker.js',
  };
  const worker = await factory(listener, options);
  assert.equal(worker.onmessage, listener);
  assert.equal(revoked.length, 0, 'A newly constructed worker must retain its bootstrap URL');
  worker.dispatchEvent(new Event('message'));
  assert.deepEqual(revoked, [worker.url]);
  worker.dispatchEvent(new Event('error'));
  assert.equal(revoked.length, 1, 'Cleanup is idempotent across ready/error events');
  const failed = await factory(listener, options);
  failed.dispatchEvent(new Event('error'));
  assert.equal(revoked.at(-1), failed.url);
  TestWorker.fail = true;
  await assert.rejects(factory(listener, options), /Worker unavailable/);
  assert.equal(revoked.at(-1), created.at(-1).url);
  const bootstrap = await created[0].blob.text();
  assert(bootstrap.includes('importScripts("https://example.test/vendor/sre/speech-worker.js")'));
  assert(bootstrap.includes('self.maps = "https://example.test/maps"'));
  console.log('Math speech worker URL lifetime: ready, error and constructor failure passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
