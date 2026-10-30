const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const plugin = path.resolve(__dirname, '../../plugin');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fixture = (delay) => `<!doctype html><p>Fixed reader</p><script>
addEventListener('message', (event) => {
  const data = event.data;
  if (event.source === parent && data?.protocol === 'mbb-component/v1' && data.type === 'init') {
    setTimeout(() => parent.postMessage({protocol: data.protocol, session: data.session, type: 'ready'}, '*'), ${delay});
  }
});</script>`;
async function load(
  page,
  { resourceDelay = 0, initDelay = 0, held = null, badDigest = false, holdDigest = false } = {},
) {
  await page.goto('/health');
  const html = fixture(initDelay);
  await page.route('**/component/v1-preparation.html.txt', async (route) => {
    if (held) await held;
    else if (resourceDelay) await wait(resourceDelay);
    await route.fulfill({ contentType: 'text/plain', body: html }).catch(() => {});
  });
  const provider = {
    id: 'delayed-reader',
    version: '0.1.0',
    protocolVersion: 1,
    title: 'Fixed delayed reader',
    readerMode: 'diagram',
    budgets: {
      resourceBytes: 524288,
      startupMs: 5000,
      wallMs: 2000,
      traceFrames: 8192,
      traceBytes: 524288,
    },
    resource: {
      url: new URL('/component/v1-preparation.html.txt', page.url()).href,
      sha256: badDigest ? '0'.repeat(64) : crypto.createHash('sha256').update(html).digest('hex'),
    },
  };
  const config = {
    component: provider.id,
    componentVersion: provider.version,
    status: 'available',
    params: {},
  };
  await page.setContent(
    `<section id="stage"><div id="demo" data-mbb-teaching="component" data-mbb-teaching-config='${JSON.stringify(config)}'><div class="mbb-teaching-body">Static fallback</div></div></section>`,
  );
  await page.evaluate(
    ({ provider, holdDigest }) => {
      window.MBBComponents = [provider];
      window.MBB_COMPONENTS_READER = true;
      if (holdDigest) {
        const digest = crypto.subtle.digest.bind(crypto.subtle);
        let first = true;
        crypto.subtle.digest = (...args) => {
          if (!first) return digest(...args);
          first = false;
          document.body.dataset.digestHeld = 'true';
          return new Promise((resolve, reject) => {
            window.releaseDigest = () => digest(...args).then(resolve, reject);
          });
        };
      }
    },
    { provider, holdDigest },
  );
  await page.addScriptTag({ content: fs.readFileSync(path.join(plugin, 'components.js'), 'utf8') });
  return page.locator('#demo');
}
test('v1 automatic reader gets a full init budget after resource preparation exceeds five seconds', async ({
  page,
}) => {
  const start = Date.now();
  const node = await load(page, { resourceDelay: 5500, initDelay: 3000 });
  await expect(node).toHaveAttribute('data-mbb-component-state', 'ready', { timeout: 14000 });
  expect(Date.now() - start).toBeGreaterThan(8000);
  await expect(node.locator('iframe')).toHaveAttribute('sandbox', 'allow-scripts');
});
test('v1 preparation has one fifteen second deadline and late bytes cannot create a frame', async ({
  page,
}) => {
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const start = Date.now();
  const node = await load(page, { held });
  try {
    await expect(node).toHaveAttribute('data-mbb-failure-code', 'STARTUP_TIMEOUT', {
      timeout: 18000,
    });
    expect(Date.now() - start).toBeGreaterThan(14500);
    expect(Date.now() - start).toBeLessThan(18000);
    release();
    await page.waitForTimeout(250);
    await expect(node.locator('iframe')).toHaveCount(0);
    await expect(node).toHaveAttribute('data-mbb-component-state', 'closed');
  } finally {
    release();
  }
});
test('v1 initialization still stops after five seconds instead of receiving the preparation budget', async ({
  page,
}) => {
  const start = Date.now();
  const node = await load(page, { initDelay: 6500 });
  await expect(node.locator('iframe')).toHaveCount(1);
  await expect(node).toHaveAttribute('data-mbb-failure-code', 'STARTUP_TIMEOUT', { timeout: 6500 });
  expect(Date.now() - start).toBeGreaterThan(4500);
  expect(Date.now() - start).toBeLessThan(6500);
  await expect(node.locator('iframe')).toHaveCount(0);
});
for (const operation of ['cancel', 'hide']) {
  test(`v1 ${operation} during the digest discards its late result`, async ({ page }) => {
    const node = await load(page, { holdDigest: true });
    await expect(page.locator('body')).toHaveAttribute('data-digest-held', 'true');
    if (operation === 'cancel')
      await node.getByRole('button', { name: 'Collapse diagram' }).click();
    else
      await page.evaluate(() => {
        document.querySelector('#stage').hidden = true;
        document.dispatchEvent(new Event('mbb:teaching-change'));
      });
    await page.evaluate(() => window.releaseDigest());
    await page.waitForTimeout(250);
    await expect(node.locator('iframe')).toHaveCount(0);
    if (operation === 'hide') {
      await page.evaluate(() => {
        document.querySelector('#stage').hidden = false;
        document.dispatchEvent(new Event('mbb:teaching-change'));
        dispatchEvent(new Event('resize'));
      });
      await expect(node).toHaveAttribute('data-mbb-component-state', 'ready');
    } else await expect(node.getByRole('button', { name: 'Show diagram' })).toBeVisible();
  });
}
test('v1 digest failure never enters initialization', async ({ page }) => {
  const node = await load(page, { badDigest: true });
  await expect(node).toHaveAttribute('data-mbb-failure-code', 'DIGEST');
  await expect(node.locator('iframe')).toHaveCount(0);
});
