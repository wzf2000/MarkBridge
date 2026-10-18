const { test, expect } = require('@playwright/test'),
  fs = require('node:fs'),
  path = require('node:path');
test('self-contained SDK resource runs a real Worker through the generic opaque host grant', async ({
  page,
}) => {
  await page.goto('/health');
  const m = JSON.parse(fs.readFileSync('sdk/template/manifest.json')),
    resource = fs.readFileSync(path.join('sdk/template/assets', m.file));
  await page.route('**/sdk/' + m.file, (route) =>
    route.fulfill({ body: resource, contentType: 'text/plain' }),
  );
  const provider = {
    id: 'sdk-bounded-sum',
    version: '0.1.0',
    title: 'SDK bounded sum',
    protocolVersion: 1,
    minMarkBridge: '2.9.0-dev.1',
    budgets: {
      resourceBytes: 524288,
      startupMs: 5000,
      wallMs: 2000,
      traceFrames: 8192,
      traceBytes: 524288,
    },
    resource: { url: new URL('/sdk/' + m.file, page.url()).href, sha256: m.sha256 },
  };
  const config = {
    status: 'available',
    component: provider.id,
    componentVersion: provider.version,
    params: { values: [1, 2, 3] },
    provider,
  };
  await page.setContent(
    '<div id="sample" data-mbb-teaching="component"><div class="mbb-teaching-body"><p>Original static explanation.</p></div></div>',
  );
  await page.evaluate(
    ({ provider, config }) => {
      MBBComponents = [provider];
      MBB_UI_LOCALE = 'en_US';
      document.querySelector('#sample').dataset.mbbTeachingConfig = JSON.stringify(config);
    },
    { provider, config },
  );
  await page.addScriptTag({ path: path.resolve('plugin/components.js') });
  await page.getByRole('button', { name: 'Start interactive demonstration', exact: true }).click();
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('output')).toContainText('Ready');
  await frame.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(frame.locator('output')).toHaveText('6');
  expect(await page.evaluate(() => MarkBridgeComponents.activeCount())).toBe(0);
  await expect(page.locator('iframe')).toHaveAttribute('sandbox', 'allow-scripts');
  expect(await page.locator('iframe').evaluate((n) => n.contentDocument)).toBe(null);
  await page.getByRole('button', { name: 'Close interactive preview', exact: true }).click();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByText('Original static explanation.')).toBeVisible();
});
