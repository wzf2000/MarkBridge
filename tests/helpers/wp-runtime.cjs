module.exports = function loadRuntime() {
  // The pinned runtime supplies WordPress scripts; always load the candidate kernel under test.
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  const runtime = process.env.MARKBRIDGE_TEST_RUNTIME;
  assert(runtime, 'Set MARKBRIDGE_TEST_RUNTIME to a prepared runtime.');
  const { JSDOM, VirtualConsole } = require(path.join(runtime, 'node_modules/jsdom'));
  const dom = new JSDOM(fs.readFileSync(path.join(runtime, 'run/worker-bootstrap.html'), 'utf8'), {
    url: 'http://markbridge.invalid',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole(),
  });
  const w = dom.window;
  w.fetch = () => new Promise(() => {});
  w.TextEncoder = TextEncoder;
  w.TextDecoder = TextDecoder;
  w.matchMedia = () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  });
  w.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  for (const script of w.document.querySelectorAll('script')) {
    let text = script.textContent;
    if (script.src) {
      const url = new URL(script.src);
      if (url.pathname === '/wp-admin/js/editor.min.js') continue;
      assert.equal(url.origin, 'http://markbridge.invalid');
      const file =
        url.pathname === '/wp-content/plugins/markdown-block-bridge/kernel.js'
          ? path.resolve(__dirname, '../../plugin/kernel.js')
          : path.resolve(runtime, 'site', '.' + decodeURIComponent(url.pathname));
      if (!file.endsWith('/plugin/kernel.js'))
        assert(file.startsWith(path.resolve(runtime, 'site') + path.sep));
      text = fs.readFileSync(file, 'utf8');
    }
    vm.runInContext(text, dom.getInternalVMContext(), { timeout: 5000 });
  }
  return { window: w, close: () => w.close(), runtime };
};
