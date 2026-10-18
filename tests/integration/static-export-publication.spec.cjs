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
// Explicit cross-repository client projections; no WordPress authorization claim.
const subsupExpressions = ['x_i^2', 'x_{i_j}^{n^2}', '\\sum_{i=1}^{n} x_i^2'];
const subsupBody = subsupExpressions
  .map(
    (tex, i) =>
      '<pre id="subsup-' + i + '" class="wp-block-mbb-math"><code>' + tex + '</code></pre>',
  )
  .join('');

test('optional retained publication input projects through the real Publisher and reopens offline', async ({
  page,
  browser,
}, info) => {
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

test('optional frozen Publisher renders subsup formulas across chapters into a scriptless book', async ({
  page,
  browser,
}, info) => {
  const publisher = path.resolve(process.env.MARKBRIDGE_TEST_PUBLISHER_ROOT),
    fixture = require(path.join(publisher, 'tests/browser/fixtures.cjs')),
    ZIP = require(path.join(publisher, 'plugin/zip.js'));
  await fixture.setup(page);
  await fixture.input(page);
  const encoded = await page.evaluate(async (body) => {
    const enc = new TextEncoder(),
      files = MBBPublisherZIP.read(new Uint8Array(await bookInput.blob.arrayBuffer())),
      manifest = JSON.parse(new TextDecoder().decode(files.get('manifest.json'))),
      digest = async (bytes) =>
        [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
          .map((n) => n.toString(16).padStart(2, '0'))
          .join('');
    for (const chapter of manifest.chapters) {
      const bytes = enc.encode(body + new TextDecoder().decode(files.get(chapter.path)));
      files.set(chapter.path, bytes);
      chapter.bodyBytes = bytes.length;
      chapter.bodySha256 = await digest(bytes);
    }
    const mb = enc.encode(JSON.stringify(manifest));
    files.set('manifest.json', mb);
    const input = MBBPublisherZIP.write(files),
      output = await MarkBridgePublisher.build(input, {
        prepared: {
          client: MBB_PUBLISHER.client,
          snapshot_sha256: await digest(mb),
          artifact: { bytes: input.size, sha256: await digest(await input.arrayBuffer()) },
        },
      }),
      raw = new Uint8Array(await output.blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < raw.length; i += 8192)
      binary += String.fromCharCode(...raw.subarray(i, i + 8192));
    return btoa(binary);
  }, subsupBody);
  const bytes = Buffer.from(encoded, 'base64'),
    directory = info.outputPath('subsup-book');
  await fs.writeFile(info.outputPath('subsup-book.zip'), bytes);
  for (const [name, value] of ZIP.read(bytes)) {
    const file = path.join(directory, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, value);
  }
  const context = await browser.newContext({
    javaScriptEnabled: false,
    offline: true,
    viewport: info.project.use.viewport,
  });
  try {
    const offline = await context.newPage();
    await offline.goto(pathToFileURL(path.join(directory, 'index.html')).href);
    expect(await offline.locator('mjx-msubsup').count()).toBeGreaterThanOrEqual(6);
    expect(await offline.locator('[data-semantic-collapsed],script').count()).toBe(0);
    for (const tex of subsupExpressions)
      expect(
        await offline
          .locator('.mbb-typeset')
          .evaluateAll(
            (nodes, tex) => nodes.filter((n) => n.getAttribute('aria-label') === tex).length,
            tex,
          ),
      ).toBe(2);
    await offline.evaluate(() => document.fonts.ready);
    await offline.screenshot({ path: info.outputPath('subsup-book.png'), fullPage: true });
  } finally {
    await context.close();
  }
});
