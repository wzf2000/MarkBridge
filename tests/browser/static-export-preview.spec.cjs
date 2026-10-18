const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const plugin = path.resolve(__dirname, '../../plugin');
test.skip(!process.env.MARKBRIDGE_TEST_RUNTIME, 'Needs the prepared real core editor runtime.');
async function start(page) {
  await page.goto('/recovery-editor?locale=en_US&staticExport');
  await page.waitForFunction(() => window.MarkBridgeExport && window.MBB_MATH?.preview);
  await page.addScriptTag({ path: path.join(plugin, 'static-code.js') });
  await page.addScriptTag({ path: path.join(plugin, 'static-export.js') });
  await page.evaluate(() => {
    const base = location.origin + '/plugin/vendor/prism/';
    window.MBB_STATIC_CODE = {
      core: base + 'components/prism-core.min.js',
      autoloader: base + 'plugins/autoloader/prism-autoloader.min.js',
      languages: base + 'components/',
      known: ['python', 'javascript', 'js', 'none'],
    };
    const create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL);
    window.previewObjects = { created: [], revoked: [] };
    URL.createObjectURL = (blob) => {
      const url = create(blob);
      previewObjects.created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      previewObjects.revoked.push(url);
      return revoke(url);
    };
    const build = MarkBridgeStaticExport.build;
    window.staticBuildCalls = 0;
    MarkBridgeStaticExport.build = (...args) => {
      staticBuildCalls++;
      return build(...args);
    };
  });
  await page.evaluate(() => MarkBridgeExport.open(12));
  await expect(page.locator('#mbb-export-preview')).toBeEnabled();
  await page.locator('#mbb-export-format').selectOption('html');
}
async function prepare(page) {
  await page.locator('#mbb-export-preview').click();
  await expect(page.locator('#mbb-export-confirm')).toBeEnabled();
  return page.frameLocator('#mbb-export-html-preview iframe');
}
test('real static HTML preview uses final typography/code/table and an opaque no-script frame', async ({
  page,
}, info) => {
  const external = [];
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== '127.0.0.1')
      external.push(request.url());
  });
  await start(page);
  const frame = await prepare(page);
  await expect(page.locator('#mbb-export-projected-source')).toBeHidden();
  await expect(
    page.getByRole('heading', { name: 'Static HTML preview', exact: true }),
  ).toBeVisible();
  const iframe = page.locator('#mbb-export-html-preview iframe');
  await expect(iframe).toHaveAttribute('sandbox', '');
  await expect(iframe).toHaveAttribute('referrerpolicy', 'no-referrer');
  await expect(frame.locator('h1')).toContainText('Offline article');
  await expect(frame.locator('.mbb-static-code .token.keyword').first()).toBeVisible();
  await expect(frame.locator('table th').first()).toHaveCSS('font-weight', '600');
  await expect(frame.locator('a[href="#preview-code"]')).toBeVisible();
  await expect(frame.getByText('External reference', { exact: true })).not.toHaveAttribute('href');
  await expect(frame.getByText('External reference', { exact: true })).toHaveAttribute(
    'title',
    'External reference',
  );
  expect(
    await page.evaluate(
      () => document.querySelector('#mbb-export-html-preview iframe').contentDocument,
    ),
  ).toBeNull();
  expect(await frame.locator('script,iframe,form').count()).toBe(0);
  const policies = await frame
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .evaluateAll((nodes) => nodes.map((n) => n.content));
  expect(policies.every((p) => p.includes("script-src 'none'"))).toBe(true);
  await frame.getByText('External reference', { exact: true }).click();
  expect(external).toEqual([]);
  await frame.locator('a[href="#preview-code"]').click();
  expect(await frame.locator('body').evaluate(() => location.hash)).toBe('#preview-code');
  await page.screenshot({
    path: info.outputPath('static-export-reading-preview.png'),
    fullPage: true,
  });
  const old = await iframe.getAttribute('src');
  await page.locator('#mbb-export-format').selectOption('markdown');
  await expect(iframe).toHaveCount(0);
  expect(await page.evaluate((url) => previewObjects.revoked.includes(url), old)).toBe(true);
  await expect(page.locator('#mbb-export-confirm')).toBeDisabled();
  await expect(page.locator('#mbb-export-projected-source')).toBeVisible();
  await page.locator('#mbb-export-preview').click();
  await expect(page.locator('#mbb-export-projected-source')).toHaveValue('# Original Markdown\n');
});
test('confirm still performs a protected request and rebuilds download with original external links', async ({
  page,
}) => {
  const protectedRequests = [];
  page.on('request', (req) => {
    if (req.url().includes('/download'))
      protectedRequests.push({ headers: req.headers(), body: req.postDataJSON() });
  });
  await start(page);
  await prepare(page);
  expect(await page.evaluate(() => staticBuildCalls)).toBe(1);
  const object = await page.locator('#mbb-export-html-preview iframe').getAttribute('src');
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#mbb-export-confirm').click();
  const download = await downloadEvent;
  const html = fs.readFileSync(await download.path(), 'utf8');
  expect(await page.evaluate(() => staticBuildCalls)).toBe(2);
  expect(html).toContain('href="https://example.invalid/reference"');
  expect(html).not.toContain('<script');
  expect(protectedRequests).toHaveLength(1);
  expect(protectedRequests[0].body.receipt).toBe('d'.repeat(64));
  expect(protectedRequests[0].headers['x-wp-nonce']).toBe('synthetic-nonce-not-for-storage');
  await expect(page.locator('#mbb-export-html-preview iframe')).toHaveCount(0);
  expect(await page.evaluate((url) => previewObjects.revoked.includes(url), object)).toBe(true);
});
test('cancel, replacement and failed previews cannot expose a late frame or leave confirm enabled', async ({
  page,
}) => {
  await start(page);
  await page.evaluate(() => {
    const build = MarkBridgeStaticExport.build;
    window.previewBlocked = false;
    MarkBridgeStaticExport.build = async (...args) => {
      window.previewBlocked = true;
      await new Promise((resolve) => (window.releasePreview = resolve));
      // Resolve despite cancellation to exercise the UI's independent epoch check.
      const result = await build(args[0], {});
      window.previewReleased = true;
      return result;
    };
  });
  let downloads = 0;
  page.on('download', () => downloads++);
  await page.locator('#mbb-export-preview').click();
  await page.waitForFunction(() => window.previewBlocked);
  await expect(page.locator('#mbb-export-confirm')).toBeDisabled();
  await page.locator('#mbb-export-cancel').click();
  await page.evaluate(() => releasePreview());
  await page.waitForFunction(() => window.previewReleased);
  await expect(page.locator('#mbb-export-html-preview iframe')).toHaveCount(0);
  expect(downloads).toBe(0);
  expect(await page.evaluate(() => previewObjects.created.length)).toBe(0);
  // Open a new session, prepare successfully, then make the replacement fail.
  await page.evaluate(() => {
    MarkBridgeStaticExport.build = async () =>
      new Blob(
        [
          '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="script-src \'none\'"></head><body>Prepared</body></html>',
        ],
        { type: 'text/html' },
      );
    return MarkBridgeExport.open(12);
  });
  await prepare(page);
  const previous = await page.locator('#mbb-export-html-preview iframe').getAttribute('src');
  await page.evaluate(() => {
    MarkBridgeStaticExport.build = async () => {
      throw Error('Fixture preview failure');
    };
  });
  await page.locator('#mbb-export-preview').click();
  await expect(page.locator('#mbb-export-dialog [role=status]')).toContainText(
    'Fixture preview failure',
  );
  await expect(page.locator('#mbb-export-confirm')).toBeDisabled();
  await expect(page.locator('#mbb-export-html-preview iframe')).toHaveCount(0);
  expect(await page.evaluate((url) => previewObjects.revoked.includes(url), previous)).toBe(true);
});

test('changing format during a late build and preparing again releases every preview URL', async ({
  page,
}) => {
  await start(page);
  await page.evaluate(() => {
    window.originalStaticBuild = MarkBridgeStaticExport.build;
    MarkBridgeStaticExport.build = async () => {
      window.formatBuildPending = true;
      await new Promise((resolve) => (window.releaseFormatBuild = resolve));
      window.formatBuildFinished = true;
      return new Blob(['<!doctype html><p>Late preview</p>'], { type: 'text/html' });
    };
  });
  await page.locator('#mbb-export-preview').click();
  await page.waitForFunction(() => window.formatBuildPending);
  await expect(page.locator('#mbb-export-format')).toBeEnabled();
  await page.locator('#mbb-export-format').selectOption('markdown');
  await page.evaluate(() => releaseFormatBuild());
  await page.waitForFunction(() => window.formatBuildFinished);
  await expect(page.locator('#mbb-export-html-preview iframe')).toHaveCount(0);
  await expect(page.locator('#mbb-export-confirm')).toBeDisabled();
  expect(await page.evaluate(() => previewObjects.created.length)).toBe(0);
  await page.evaluate(() => {
    MarkBridgeStaticExport.build = originalStaticBuild;
  });
  await page.locator('#mbb-export-format').selectOption('html');
  await prepare(page);
  const first = await page.locator('#mbb-export-html-preview iframe').getAttribute('src');
  await prepare(page);
  const second = await page.locator('#mbb-export-html-preview iframe').getAttribute('src');
  expect(second).not.toBe(first);
  expect(await page.evaluate((url) => previewObjects.revoked.includes(url), first)).toBe(true);
  await page.locator('#mbb-export-cancel').click();
  await expect(page.locator('#mbb-export-html-preview iframe')).toHaveCount(0);
  expect(await page.evaluate((url) => previewObjects.revoked.includes(url), second)).toBe(true);
});
