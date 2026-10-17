const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises'),
  path = require('node:path'),
  { pathToFileURL } = require('node:url');

async function setup(page) {
  // /front uses mbb_math_configuration() and the shipped engine, CHTML and fonts.
  await page.goto('/front?locale=en_US');
  await expect(page.locator('#inline-line mjx-container')).toBeVisible();
  await page.addScriptTag({ path: path.resolve('plugin/static-export.js') });
}
const operators =
  '<h2 id="operators">Divergence <span class="mbb-math" data-mbb-tex="\\operatorname{KL}">\\operatorname{KL}</span></h2>' +
  '<pre class="wp-block-mbb-math"><code>\\operatorname{KL}(P\\|Q)=\\sum_i P_i\\log\\frac{P_i}{Q_i}</code></pre>';

test('pinned CHTML operator glyph noic survives heading/full-text static export offline', async ({
  page,
  browser,
}, info) => {
  await setup(page);
  const value = await (await page.request.get('/static-export-descriptor')).json();
  value.body = operators + value.body;
  const html = await page.evaluate(async (value) => {
    const rendered = await MBB_MATH.preview(value.body),
      doc = new DOMParser().parseFromString(rendered, 'text/html'),
      markers = [...doc.querySelectorAll('[noic]')];
    if (
      !markers.length ||
      markers.some((n) => n.localName !== 'mjx-c' || n.getAttribute('noic') !== 'true')
    )
      throw Error('Pinned renderer noic contract changed');
    return (await MarkBridgeStaticExport.build(value)).text();
  }, value);
  const file = info.outputPath('operators.html');
  await fs.writeFile(file, html);
  const context = await browser.newContext({
    javaScriptEnabled: false,
    offline: true,
    viewport: info.project.use.viewport,
  });
  const offline = await context.newPage();
  await offline.goto(pathToFileURL(file).href);
  await expect(offline.locator('#operators mjx-container')).toBeVisible();
  expect(await offline.locator('mjx-c[noic="true"]').count()).toBeGreaterThan(0);
  expect(await offline.locator('mjx-container').count()).toBe(4);
  await offline.evaluate(() => document.fonts.ready);
  expect(await offline.evaluate(() => [...document.fonts].some((f) => f.status === 'loaded'))).toBe(
    true,
  );
  expect(await offline.locator('body').textContent()).not.toContain('\\operatorname');
  await offline.screenshot({ path: info.outputPath('operators.png'), fullPage: true });
  await context.close();
});

test('noic remains closed to its exact rendered node/value and cannot admit authored markup', async ({
  page,
}) => {
  await setup(page);
  const value = await (await page.request.get('/static-export-descriptor')).json();
  value.body = operators + value.body;
  const errors = await page.evaluate(async (value) => {
    const original = MBB_MATH.preview,
      rendered = await original(value.body),
      errors = [];
    try {
      for (const [tag, attribute] of [
        ['mjx-c', ''],
        ['mjx-c', 'false'],
        ['mjx-c', 'TRUE'],
        ['mjx-c', 'javascript:bad()'],
        ['mjx-mi', 'true'],
        ['span', 'true'],
      ]) {
        const doc = new DOMParser().parseFromString(rendered, 'text/html'),
          node = doc.querySelector(tag);
        if (!node) throw Error('Missing negative fixture node: ' + tag);
        node.setAttribute('noic', attribute);
        MBB_MATH.preview = async () => doc.body.innerHTML;
        try {
          await MarkBridgeStaticExport.build(value);
          errors.push('accepted');
        } catch (error) {
          errors.push(error.message);
        }
      }
      MBB_MATH.preview = original;
      for (const authored of ['<mjx-c noic="true"></mjx-c>', '<span noic="true">author</span>']) {
        try {
          await MarkBridgeStaticExport.build({ ...value, body: value.body + authored });
          errors.push('accepted');
        } catch (error) {
          errors.push(error.message);
        }
      }
    } finally {
      MBB_MATH.preview = original;
    }
    return errors;
  }, value);
  expect(errors).toHaveLength(8);
  expect(errors).not.toContain('accepted');
});

test('optional retained publication input projects through the real Publisher and reopens offline', async ({
  page,
  browser,
}, info) => {
  test.skip(
    !process.env.MARKBRIDGE_TEST_PUBLICATION_INPUTS || !process.env.MARKBRIDGE_TEST_PUBLISHER_ROOT,
    'Supply a retained synthetic input ZIP and the fixed Publisher source root. This checks projection, not server authorization.',
  );
  await setup(page);
  const publisher = path.resolve(process.env.MARKBRIDGE_TEST_PUBLISHER_ROOT),
    Z = require(path.join(publisher, 'plugin/zip.js')),
    archive = await fs.readFile(process.env.MARKBRIDGE_TEST_PUBLICATION_INPUTS),
    input = Z.read(archive),
    manifestBytes = input.get('manifest.json'),
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes)),
    digest = (bytes) => require('node:crypto').createHash('sha256').update(bytes).digest('hex');
  await page.evaluate(
    ({ client, css, notice }) => {
      window.MBB_PUBLISHER = { client, css, notice, locale: 'en_US', messages: {} };
      window.MBB_STATIC_CODE = {
        core: location.origin + '/plugin/vendor/prism/components/prism-core.min.js',
        autoloader:
          location.origin + '/plugin/vendor/prism/plugins/autoloader/prism-autoloader.min.js',
        languages: location.origin + '/plugin/vendor/prism/components/',
        known: ['javascript', 'python', 'clike'],
      };
    },
    {
      client: manifest.renderer.client,
      css: await fs.readFile(path.join(publisher, 'plugin/book.css'), 'utf8'),
      notice: await fs.readFile(path.join(publisher, 'plugin/NOTICE.txt'), 'utf8'),
    },
  );
  await page.addScriptTag({ path: path.resolve('plugin/static-code.js') });
  await page.addScriptTag({ path: path.join(publisher, 'plugin/zip.js') });
  await page.addScriptTag({ path: path.join(publisher, 'plugin/publisher.js') });
  const encoded = await page.evaluate(
    async ({ bytes, prepared }) => {
      const blob = new Blob([Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0))]),
        output = await MarkBridgePublisher.build(blob, { prepared }),
        data = new Uint8Array(await output.blob.arrayBuffer());
      let binary = '';
      for (let i = 0; i < data.length; i += 8192)
        binary += String.fromCharCode(...data.subarray(i, i + 8192));
      return btoa(binary);
    },
    {
      bytes: archive.toString('base64'),
      prepared: {
        client: manifest.renderer.client,
        snapshot_sha256: digest(manifestBytes),
        artifact: { bytes: archive.length, sha256: digest(archive) },
      },
    },
  );
  const result = Buffer.from(encoded, 'base64'),
    directory = info.outputPath('book');
  await fs.writeFile(info.outputPath('book.zip'), result);
  for (const [name, bytes] of Z.read(result)) {
    const file = path.join(directory, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, bytes);
  }
  const context = await browser.newContext({
      javaScriptEnabled: false,
      offline: true,
      viewport: info.project.use.viewport,
    }),
    offline = await context.newPage(),
    network = [];
  offline.on('request', (request) => {
    if (/^https?:/.test(request.url())) network.push(request.url());
  });
  await offline.goto(pathToFileURL(path.join(directory, 'index.html')).href);
  await expect(offline.locator('h1 mjx-container').first()).toBeVisible();
  expect(await offline.locator('mjx-c[noic="true"]').count()).toBeGreaterThan(0);
  await offline.evaluate(() => document.fonts.ready);
  expect(await offline.evaluate(() => [...document.fonts].some((f) => f.status === 'loaded'))).toBe(
    true,
  );
  expect(await offline.locator('body').textContent()).not.toContain('\\operatorname');
  expect(await offline.locator('script').count()).toBe(0);
  expect(
    await offline
      .locator('img')
      .evaluateAll((nodes) => nodes.every((n) => n.complete && n.naturalWidth > 0)),
  ).toBe(true);
  expect(network).toEqual([]);
  await offline.screenshot({ path: info.outputPath('book.png'), fullPage: true });
  await context.close();
});
