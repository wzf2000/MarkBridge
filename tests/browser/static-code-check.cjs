const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('@playwright/test');
const plugin = path.resolve(__dirname, '../../plugin');
const evidence = process.env.MARKBRIDGE_STATIC_CODE_EVIDENCE || '/tmp/markbridge-static-code';
const port = Number(process.env.MARKBRIDGE_STATIC_CODE_PORT || 18856);
const origin = 'http://127.0.0.1:' + port;
const requests = [];
let failPython = false,
  delayPython = false;
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, origin).pathname;
  requests.push(pathname);
  if (pathname === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><title>Static code fixture</title>');
    return;
  }
  if (pathname === '/plugin/vendor/prism/components/prism-python.min.js' && failPython) {
    res.writeHead(404);
    res.end();
    return;
  }
  const file = path.resolve(plugin, '.' + pathname.replace(/^\/plugin/, ''));
  if (
    !pathname.startsWith('/plugin/') ||
    !file.startsWith(plugin + path.sep) ||
    !fs.existsSync(file)
  ) {
    res.writeHead(404);
    res.end();
    return;
  }
  const send = () => {
    res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : 'application/javascript');
    res.end(fs.readFileSync(file));
  };
  if (delayPython && pathname.endsWith('/prism-python.min.js')) setTimeout(send, 200);
  else send();
});
const source = {
  python:
    '# 中文与空白\r\ndef welcome(name):\r\n\tmessage = "你好 " + name\r\n\r\n\treturn message\r\n',
  javascript:
    '// JavaScript version\nconst values = [1, 2, 3];\n\nconsole.log(values.map(value => value * 2));\n',
  long: 'const longLine = "' + 'long phrase '.repeat(80) + '";\n\nconsole.log(longLine);',
  unknown: '  <script>window.__articleCodeRan = true</script>\r\n\tunknown syntax\u00a0  ',
  large: 'x'.repeat(32769),
  math: '\\frac{a}{b}',
};
async function setup(page) {
  await page.goto(origin);
  await page.addScriptTag({ url: origin + '/plugin/static-code.js' });
  await page.evaluate(
    ({ origin }) => {
      window.MBB_STATIC_CODE = {
        core: origin + '/plugin/vendor/prism/components/prism-core.min.js',
        autoloader: origin + '/plugin/vendor/prism/plugins/autoloader/prism-autoloader.min.js',
        languages: origin + '/plugin/vendor/prism/components/',
        known: ['javascript', 'js', 'python', 'py', 'text', 'plain', 'plaintext', 'none'],
      };
    },
    { origin },
  );
}
async function documentFor(page, sources) {
  await page.evaluate((sources) => {
    window.detached = document.implementation.createHTMLDocument('静态代码与表格');
    const root = detached.body;
    root.setAttribute('data-mbb-content-view', '');
    root.innerHTML =
      '<h1>代码与表格</h1><p>正文采用适合长篇阅读的衬线字体。代码保留全部语言版本、缩进与空行。</p><div class="wp-block-mbb-code-tabs"><section class="mbb-code-tab"><p class="mbb-code-tab-title">Python 版本</p><pre><code id="python" class="language-python"></code></pre></section><section class="mbb-code-tab" hidden><p class="mbb-code-tab-title">JavaScript 版本</p><pre><code id="javascript" class="language-js"></code></pre></section></div><h2>长行与未知语言</h2><pre><code id="long" class="language-javascript"></code></pre><pre><code id="unknown" class="language-unavailable"></code></pre><figure class="wp-block-table"><table><thead><tr><th>语言</th><th>阶段</th><th>较长说明</th></tr></thead><tbody><tr><td>Python</td><td>预处理</td><td>中文段落与适当留白</td></tr><tr><td>JavaScript</td><td>呈现</td><td>long_identifier_without_breaks_'.repeat(
        1,
      ) +
      'segment'.repeat(28) +
      '</td></tr><tr><td>纯文本</td><td>保留</td><td>未知语法仍可完整阅读</td></tr></tbody></table></figure><pre class="wp-block-mbb-math"><code id="math"></code></pre>';
    for (const [key, value] of Object.entries(sources)) {
      const code = root.querySelector('#' + key);
      if (code) code.textContent = value;
    }
  }, sources);
}
async function finalize(page) {
  const css = fs.readFileSync(path.join(plugin, 'static-export.css'), 'utf8');
  return page.evaluate(
    (css) =>
      '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\';script-src \'none\';connect-src \'none\';style-src \'unsafe-inline\'"><style>' +
      css +
      '</style></head>' +
      detached.body.outerHTML.replace(/\r/g, '&#13;') +
      '</html>',
    css,
  );
}
(async () => {
  fs.mkdirSync(evidence, { recursive: true });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const browser = await chromium.launch({
    executablePath: process.env.MARKBRIDGE_CHROMIUM_PATH,
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await setup(page);
    await documentFor(page, source);
    await page.evaluate(() =>
      MarkBridgeStaticCode.render(detached.body, { cancelled: () => false }),
    );
    const result = await page.evaluate(() =>
      [...detached.querySelectorAll('pre>code')].map((code) => ({
        id: code.id,
        text: code.textContent,
        tokens: code.querySelectorAll('.token').length,
        lines: code.parentElement.querySelectorAll('.mbb-static-code-numbers>span').length,
        gutterOutside: !code.querySelector('.mbb-static-code-numbers'),
        safe: [...code.querySelectorAll('*')].every(
          (el) => el.tagName === 'SPAN' && [...el.attributes].every((a) => a.name === 'class'),
        ),
      })),
    );
    for (const block of result) {
      assert.equal(block.text, source[block.id], `${block.id} exact text`);
      assert(block.gutterOutside && block.safe);
    }
    assert(result.find((b) => b.id === 'python').tokens > 0);
    assert(result.find((b) => b.id === 'javascript').tokens > 0);
    assert.equal(result.find((b) => b.id === 'python').lines, 5);
    assert.equal(result.find((b) => b.id === 'unknown').tokens, 0);
    assert.equal(result.find((b) => b.id === 'math').lines, 0);
    assert.equal(await page.evaluate(() => window.__articleCodeRan), undefined);
    assert(
      requests.every(
        (url) =>
          url === '/' ||
          url === '/plugin/static-code.js' ||
          /^\/plugin\/vendor\/prism\/(components\/prism-[a-z0-9-]+\.min\.js|plugins\/autoloader\/prism-autoloader\.min\.js)$/.test(
            url,
          ),
      ),
    );
    const final = await finalize(page);
    fs.writeFileSync(path.join(evidence, 'static-code-offline.html'), final);
    assert(!final.includes('<script'));
    const offline = await browser.newContext({ javaScriptEnabled: false });
    const view = await offline.newPage();
    for (const [width, media] of [
      [1440, 'screen'],
      [390, 'screen'],
      [390, 'print'],
    ]) {
      await view.setViewportSize({ width, height: 900 });
      await view.setContent(final);
      await view.emulateMedia({ media });
      assert(
        await view.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${width}/${media}: page overflow`,
      );
      assert.equal(await view.locator('.mbb-code-tab').count(), 2);
      assert(await view.locator('.mbb-code-tab').nth(1).isVisible());
      assert.equal(await view.locator('#python').textContent(), source.python);
      assert.equal(await view.locator('#unknown').textContent(), source.unknown);
      if (media === 'screen') {
        assert(
          await view
            .locator('#long')
            .evaluate((el) => el.parentElement.scrollWidth > el.parentElement.clientWidth),
        );
        assert.equal(
          await view
            .locator('.mbb-static-code-numbers')
            .first()
            .evaluate((el) => getComputedStyle(el).userSelect),
          'none',
        );
        assert.equal(
          await view.locator('#python').evaluate((el) => getComputedStyle(el).fontFamily),
          await view
            .locator('#python')
            .evaluate((el) => getComputedStyle(el.parentElement).fontFamily),
        );
      } else {
        assert.equal(
          await view.locator('#long').evaluate((el) => getComputedStyle(el).whiteSpace),
          'pre-wrap',
        );
        assert(await view.locator('#long').evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
        assert.equal(
          await view.locator('table').evaluate((el) => getComputedStyle(el).display),
          'table',
        );
      }
      await view.screenshot({
        path: path.join(evidence, `static-code-${width}-${media}.png`),
        fullPage: true,
      });
    }
    await offline.close();
    // Every displayed physical line gets a gutter row, including interior blank lines.
    await documentFor(page, { python: '\n'.repeat(120) + 'print("last")' });
    await page.evaluate(() => MarkBridgeStaticCode.render(detached.body, {}));
    assert.equal(
      await page.evaluate(
        () =>
          detached
            .querySelector('#python')
            .parentElement.querySelectorAll('.mbb-static-code-numbers>span').length,
      ),
      121,
    );
    // An unexpected tokenizer result must never become HTML or active attributes.
    await documentFor(page, { python: source.python });
    await page.evaluate(async () => {
      const tokenize = Prism.tokenize;
      Prism.tokenize = (source) => [{ type: 'string" onclick="bad', content: source }];
      try {
        await MarkBridgeStaticCode.render(detached.body, {});
      } finally {
        Prism.tokenize = tokenize;
      }
    });
    assert.equal(
      await page.evaluate(() => detached.querySelector('#python').textContent),
      source.python,
    );
    assert.equal(await page.evaluate(() => detached.querySelectorAll('#python *').length), 0);
    // Over-budget code gets plain styling, without tokenization or text loss.
    await documentFor(page, { python: source.large });
    await page.evaluate(() => MarkBridgeStaticCode.render(detached.body, {}));
    assert.equal(
      await page.evaluate(() => detached.querySelector('#python').textContent),
      source.large,
    );
    assert.equal(await page.evaluate(() => detached.querySelector('#python .token')), null);
    // A loaded page engine keeps its manual flag and existing autoloader path.
    const flags = await page.evaluate(async () => {
      Prism.manual = false;
      const old = Prism.plugins.autoloader.languages_path;
      await MarkBridgeStaticCode.render(detached.body, {});
      return { manual: Prism.manual, path: Prism.plugins.autoloader.languages_path, old };
    });
    assert.equal(flags.manual, false);
    assert.equal(flags.path, flags.old);
    // A foreign existing loader path must not be changed or requested by this helper.
    await documentFor(page, { python: source.python });
    const requestCount = requests.length;
    const loaderState = await page.evaluate(async () => {
      const path = Prism.plugins.autoloader.languages_path;
      Prism.plugins.autoloader.languages_path = 'https://example.invalid/components/';
      MBB_STATIC_CODE.known.push('ruby');
      detached.querySelector('#python').className = 'language-ruby';
      await MarkBridgeStaticCode.render(detached.body, {});
      const state = {
        path: Prism.plugins.autoloader.languages_path,
        tokens: detached.querySelectorAll('#python .token').length,
      };
      Prism.plugins.autoloader.languages_path = path;
      return state;
    });
    assert.equal(requests.length, requestCount);
    assert.equal(loaderState.path, 'https://example.invalid/components/');
    assert.equal(loaderState.tokens, 0);
    // A resource failure still preserves text and line numbers.
    const failure = await browser.newPage();
    failPython = true;
    await setup(failure);
    await documentFor(failure, { python: source.python });
    await failure.evaluate(() => MarkBridgeStaticCode.render(detached.body, {}));
    assert.equal(
      await failure.evaluate(() => detached.querySelector('#python').textContent),
      source.python,
    );
    assert.equal(
      await failure
        .locator('body')
        .evaluate(() => detached.querySelectorAll('#python .token').length),
      0,
    );
    await failure.close();
    failPython = false;
    // Cancellation during lazy grammar loading must leave the detached root unchanged.
    const cancel = await browser.newPage();
    delayPython = true;
    await setup(cancel);
    await documentFor(cancel, { python: source.python });
    const unchanged = await cancel.evaluate(async () => {
      const before = detached.body.outerHTML;
      window.cancelled = false;
      setTimeout(() => (window.cancelled = true), 60);
      await MarkBridgeStaticCode.render(detached.body, { cancelled: () => window.cancelled });
      return before === detached.body.outerHTML;
    });
    assert(unchanged);
    await cancel.close();
    delayPython = false;
    // Untrusted resource paths cannot cause a request; text still gets safe presentation.
    const invalid = await browser.newPage();
    await setup(invalid);
    await documentFor(invalid, { python: source.python });
    const before = requests.length;
    await invalid.evaluate(async () => {
      MBB_STATIC_CODE.core = 'https://example.invalid/prism-core.min.js';
      await MarkBridgeStaticCode.render(detached.body, {});
    });
    assert.equal(requests.length, before);
    await invalid.close();
    fs.writeFileSync(
      path.join(evidence, 'static-code-results.json'),
      JSON.stringify({ blocks: result, requests, flags, cancelledUnchanged: unchanged }, null, 2) +
        '\n',
    );
    console.log(
      'Static code: real local Prism, exact CRLF/text, all language versions, failure/cancel/budgets and no-JS desktop/mobile/print checks passed.',
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
