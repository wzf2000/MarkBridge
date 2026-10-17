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

const subsupExpressions = ['x_i^2', 'x_{i_j}^{n^2}', '\\sum_{i=1}^{n} x_i^2'];
const subsupBody = subsupExpressions
  .map(
    (tex, i) =>
      '<pre id="subsup-' + i + '" class="wp-block-mbb-math"><code>' + tex + '</code></pre>',
  )
  .join('');

test('pinned subsup and largeop formulas retain real CHTML offline without collapse bookkeeping', async ({
  page,
  browser,
}, info) => {
  await setup(page);
  const value = await (await page.request.get('/static-export-descriptor')).json();
  value.body = subsupBody + value.body;
  const result = await page.evaluate(async (value) => {
    const rendered = await MBB_MATH.preview(value.body),
      doc = new DOMParser().parseFromString(rendered, 'text/html');
    return {
      subsup: doc.querySelectorAll('mjx-msubsup[data-semantic-collapsed]').length,
      html: await (await MarkBridgeStaticExport.build(value)).text(),
    };
  }, value);
  expect(result.subsup).toBeGreaterThan(0);
  expect(result.html).not.toContain('data-semantic-collapsed');
  const file = info.outputPath('subsup.html');
  await fs.writeFile(file, result.html);
  const context = await browser.newContext({
    javaScriptEnabled: false,
    offline: true,
    viewport: info.project.use.viewport,
  });
  try {
    const offline = await context.newPage();
    await offline.goto(pathToFileURL(file).href);
    for (const [i, tex] of subsupExpressions.entries()) {
      await expect(offline.locator('#subsup-' + i + ' mjx-container')).toBeVisible();
      await expect(offline.locator('#subsup-' + i + ' .mbb-typeset')).toHaveAttribute(
        'aria-label',
        tex,
      );
    }
    expect(await offline.locator('mjx-msubsup').count()).toBeGreaterThan(0);
    expect(await offline.locator('script').count()).toBe(0);
    await offline.evaluate(() => document.fonts.ready);
    await offline.screenshot({ path: info.outputPath('subsup.png'), fullPage: true });
  } finally {
    await context.close();
  }
});

test('subsup collapse stripping rejects unsafe values, other nodes and authored attributes', async ({
  page,
}) => {
  await setup(page);
  const value = await (await page.request.get('/static-export-descriptor')).json();
  value.body = subsupBody + value.body;
  const result = await page.evaluate(async (value) => {
    const original = MBB_MATH.preview,
      rendered = await original(value.body),
      errors = [];
    try {
      for (const [tag, key, attribute] of [
        ['mjx-msubsup', 'data-semantic-collapsed', 'javascript:bad()'],
        ['mjx-msubsup', 'data-semantic-collapsed', '(1 invalid)'],
        ['mjx-msubsup', 'data-semantic-collapsed', ''],
        ['mjx-msubsup', 'data-semantic-collapsed', '1'.repeat(8193)],
        ['mjx-msubsup', 'data-semantic-unknown', '(3 (c 2) 0 1)'],
        ['mjx-mi', 'data-semantic-collapsed', '(3 (c 2) 0 1)'],
        ['span', 'data-semantic-collapsed', '(3 (c 2) 0 1)'],
      ]) {
        const doc = new DOMParser().parseFromString(rendered, 'text/html');
        doc.querySelector(tag).setAttribute(key, attribute);
        MBB_MATH.preview = async () => doc.body.innerHTML;
        try {
          await MarkBridgeStaticExport.build(value);
          errors.push('accepted');
        } catch {
          errors.push('refused');
        }
      }
      MBB_MATH.preview = original;
      for (const body of [
        '<span data-semantic-collapsed="(3 (c 2) 0 1)">author</span>',
        '<mjx-msubsup data-semantic-collapsed="(3 (c 2) 0 1)">author</mjx-msubsup>',
      ]) {
        try {
          await MarkBridgeStaticExport.build({ ...value, body: value.body + body });
          errors.push('accepted');
        } catch {
          errors.push('refused');
        }
      }
    } finally {
      MBB_MATH.preview = original;
    }
    return errors;
  }, value);
  expect(result).toEqual(Array(9).fill('refused'));
});

test('optional frozen Publisher renders subsup formulas across chapters into a scriptless book', async ({
  page,
  browser,
}, info) => {
  test.skip(
    !process.env.MARKBRIDGE_TEST_PUBLISHER_ROOT,
    'Supply the fixed Publisher source root; this verifies client projection, not server authorization.',
  );
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
