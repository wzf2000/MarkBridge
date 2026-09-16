// Server conversion uses the site's pinned WordPress scripts in a network-disabled DOM.
const fs = require('fs'),
  path = require('path'),
  vm = require('vm');
const ROOT = process.argv[2];
if (!ROOT || !path.isAbsolute(ROOT) || fs.realpathSync(ROOT) !== ROOT) process.exit(1);
const { JSDOM, VirtualConsole } = require(path.join(ROOT, 'node_modules/jsdom'));
(async () => {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 2000000) throw Error('INPUT_LIMIT');
  }
  const data = JSON.parse(input),
    dom = new JSDOM(fs.readFileSync(ROOT + '/run/worker-bootstrap.html', 'utf8'), {
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
  try {
    for (const s of w.document.querySelectorAll('script')) {
      if (s.src) {
        const u = new URL(s.src),
          name = decodeURIComponent(u.pathname);
        if (name === '/wp-admin/js/editor.min.js') continue;
        if (
          u.origin !== 'http://markbridge.invalid' ||
          (!name.startsWith('/wp-includes/js/') &&
            name !== '/wp-content/plugins/markdown-block-bridge/kernel.js')
        )
          throw Error('SCRIPT_DENIED');
        const file = path.resolve(ROOT + '/site', '.' + name);
        if (!file.startsWith(ROOT + '/site/')) throw Error('PATH_DENIED');
        vm.runInContext(fs.readFileSync(file, 'utf8'), dom.getInternalVMContext(), {
          filename: name,
          timeout: 5000,
        });
      } else vm.runInContext(s.textContent, dom.getInternalVMContext(), { timeout: 5000 });
    }
    const convert = (item) => {
      const source =
        item.mode === 'blocks' ? w.MBB.exportDocument(item.base, item.serialized) : item.source;
      return w.MBB.importDocument(source, item.documentId);
    };
    let document;
    if (data.mode === 'batch') {
      if (!Array.isArray(data.items) || data.items.length > 5) throw Error('BATCH_LIMIT');
      document = data.items.map((item) => {
        try {
          return { ok: true, document: convert(item) };
        } catch (e) {
          return { ok: false, code: e.code || 'CONVERSION', message: e.message };
        }
      });
    } else document = convert(data);
    process.stdout.write(JSON.stringify({ ok: true, document }));
  } catch (e) {
    process.stdout.write(
      JSON.stringify({
        ok: false,
        code: e.code || 'CONVERSION',
        message: e.message,
        location: e.location || '',
      }),
    );
  } finally {
    w.close();
  }
})().catch(() => {
  process.stdout.write(
    JSON.stringify({ ok: false, code: 'WORKER_FAILED', message: '转换服务未完成，原内容未写入。' }),
  );
  process.exitCode = 1;
});
