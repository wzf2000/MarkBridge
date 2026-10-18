const { test, expect } = require('@playwright/test');
const path = require('node:path');
const descriptor = async (page) => (await page.request.get('/static-export-descriptor')).json();
test('static HTML uses real CHTML, data images and fonts; reopens offline with the complete article', async ({
  page,
  context,
}, info) => {
  await page.goto('/front?locale=en_US');
  await expect(page.locator('#inline-line mjx-container')).toBeVisible();
  await page.addScriptTag({ path: path.resolve('plugin/static-export.js') });
  const result = await page.evaluate(
    async (value) => {
      const blob = await MarkBridgeStaticExport.build(value);
      return { text: await blob.text(), type: blob.type };
    },
    await descriptor(page),
  );
  expect(result.type).toContain('text/html');
  expect(result.text).not.toMatch(
    /PRIVATE_|<script|<iframe|<form|srcset=|data-mbb-teaching|mbb-component-params/,
  );
  const hash = require('node:crypto').createHash('sha256').update(result.text).digest('hex');
  await require('node:fs/promises').writeFile(info.outputPath('offline.sha256'), hash + '\n');
  await require('node:fs/promises').writeFile(info.outputPath('offline.html'), result.text);
  const offline = await context.newPage();
  await context.setOffline(true);
  const requests = [];
  offline.on('request', (r) => {
    if (/^https?:/.test(r.url())) requests.push(r.url());
  });
  await offline.goto('data:text/html;base64,' + Buffer.from(result.text).toString('base64'));
  await expect(offline.locator('mjx-container[jax="CHTML"]')).toHaveCount(2);
  await expect(offline.locator('mjx-speech').first()).toHaveAttribute('aria-label', /a over d/);
  await expect
    .poll(() => offline.locator('img').evaluate((n) => n.complete && n.naturalWidth > 0))
    .toBe(true);
  expect(await offline.locator('details:not([open])').count()).toBe(0);
  for (const text of [
    'Stage one',
    'Stage two',
    'Author fallback complete',
    'Hidden body complete',
    'Complete proof',
    'JavaScript',
    'Python',
    'Footnote body',
    'Equation 1',
    'Offline equation',
    'First paper',
    'Second paper',
  ])
    await expect(offline.locator('body')).toContainText(text);
  await offline.evaluate(() => document.fonts.ready);
  expect(
    await offline.evaluate(() => [...document.fonts].some((font) => font.status === 'loaded')),
  ).toBe(true);
  await expect(offline.locator('#references li').first()).toHaveAttribute('value', '1');
  await expect(offline.locator('#references li').first()).toContainText('Second paper');
  await expect(offline.locator('a[href="#eq-static"]')).toHaveText('Equation 1');
  expect(requests).toEqual([]);
  expect(await offline.locator('script,iframe,form,button,input,select,textarea').count()).toBe(0);
  await offline.screenshot({ path: info.outputPath('offline.png'), fullPage: true });
});
test('descriptor tampering, raw formulas and cancellation fail closed without download', async ({
  page,
}) => {
  await page.goto('/front?locale=en_US');
  await expect(page.locator('#inline-line mjx-container')).toBeVisible();
  await page.addScriptTag({ path: path.resolve('plugin/static-export.js') });
  const errors = await page.evaluate(
    async (value) => {
      const out = [];
      for (const candidate of [
        { ...value, body: value.body + '<script>bad()</script>' },
        { ...value, images: value.images.map((x) => ({ ...x, key: 'a'.repeat(64) })) },
        { ...value, body: value.body + '<a href="javascript:bad()">bad</a>' },
      ]) {
        try {
          await MarkBridgeStaticExport.build(candidate);
          out.push('accepted');
        } catch (e) {
          out.push(e.message);
        }
      }
      const large = new Uint8Array(7 * 1024 * 1024);
      large.set(Uint8Array.from(atob(value.images[0].data), (c) => c.charCodeAt(0)));
      const key = [...new Uint8Array(await crypto.subtle.digest('SHA-256', large))]
        .map((x) => x.toString(16).padStart(2, '0'))
        .join('');
      let binary = '';
      for (let i = 0; i < large.length; i += 4096)
        binary += String.fromCharCode(...large.subarray(i, i + 4096));
      try {
        await MarkBridgeStaticExport.build({
          ...value,
          body: ('<img src="mbb-static:' + key + '">').repeat(4),
          images: [{ key, mime: 'image/png', bytes: large.length, data: btoa(binary) }],
        });
        out.push('accepted');
      } catch (e) {
        out.push(e.message);
      }
      const original = MBB_MATH.preview;
      MBB_MATH.preview = async (html) => html;
      try {
        await MarkBridgeStaticExport.build(value);
        out.push('accepted');
      } catch (e) {
        out.push(e.message);
      } finally {
        MBB_MATH.preview = original;
      }
      try {
        await MarkBridgeStaticExport.build(value, { cancelled: () => true });
        out.push('accepted');
      } catch (e) {
        out.push(e.message);
      }
      return out;
    },
    await descriptor(page),
  );
  expect(errors).toHaveLength(6);
  expect(errors).not.toContain('accepted');
});

test('existing export dialog adds HTML and a late typesetting result cannot download after cancel', async ({
  page,
}, info) => {
  test.skip(!process.env.MARKBRIDGE_TEST_RUNTIME, 'Needs the prepared real core editor scripts.');
  const requests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/static-export-fixture/export')) requests.push(url.pathname);
  });
  await page.goto('/recovery-editor?locale=en_US&staticExport');
  await page.waitForFunction(
    () => window.MarkBridgeExport && document.querySelector('#mbb-export-open'),
  );
  await page.addScriptTag({ path: path.resolve('plugin/static-export.js') });
  await page.locator('#mbb-more > summary').click();
  await page.locator('#mbb-export-open').click();
  await expect(page.locator('#mbb-export-preview')).toBeEnabled();
  await page.locator('#mbb-export-format').selectOption('html');
  await page.locator('#mbb-export-preview').click();
  await expect(page.locator('#mbb-export-confirm')).toBeEnabled();
  await expect(page.locator('#mbb-export-dialog [role=status]')).toContainText('Static HTML');
  await page.screenshot({ path: info.outputPath('html-export-dialog.png'), fullPage: true });
  await page.evaluate(() => {
    const original = MBB_MATH.preview;
    const build = MarkBridgeStaticExport.build;
    MarkBridgeStaticExport.build = (...args) =>
      build(...args).finally(() => (window.staticFinished = true));
    MBB_MATH.preview = async (html) => {
      window.staticRendering = true;
      await new Promise((resolve) => (window.finishStatic = resolve));
      return original(html);
    };
  });
  let downloads = 0;
  page.on('download', () => downloads++);
  await page.locator('#mbb-export-confirm').click();
  await page.waitForFunction(() => window.staticRendering);
  await page.locator('#mbb-export-cancel').click();
  await page.evaluate(() => finishStatic());
  await page.waitForFunction(() => window.staticFinished);
  await page.waitForFunction(() => !document.querySelector('#mbb-export-dialog').open);
  expect(downloads).toBe(0);
  expect(requests.some((p) => p.endsWith('/download'))).toBe(true);
});
