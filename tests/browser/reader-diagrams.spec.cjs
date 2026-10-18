const { test, expect } = require('@playwright/test');
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const plugin = path.resolve(__dirname, '../../plugin');
const html = fs.readFileSync(path.join(__dirname, 'fixtures/reader-diagram.html'), 'utf8');
const sha = crypto.createHash('sha256').update(html).digest('hex');
async function load(
  page,
  { reader = true, mode = 'diagram', count = 1, digest = sha, hidden = false } = {},
) {
  await page.goto('/health');
  let requests = 0;
  await page.route('**/component/reader-frame.html.txt', (r) => {
    requests++;
    return r.fulfill({ contentType: 'text/plain', body: html });
  });
  const provider = {
    id: 'reader',
    version: '0.1.0',
    protocolVersion: 1,
    title: 'Reader fixture',
    readerMode: mode,
    budgets: {
      resourceBytes: 524288,
      startupMs: 5000,
      wallMs: 2000,
      traceFrames: 8192,
      traceBytes: 524288,
    },
    resource: { url: new URL('/component/reader-frame.html.txt', page.url()).href, sha256: digest },
  };
  const config = {
    component: 'reader',
    componentVersion: '0.1.0',
    status: 'available',
    params: { value: 42 },
  };
  await page.setContent(
    `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${fs.readFileSync(path.join(plugin, 'teaching.css'), 'utf8')}\n${fs.readFileSync(path.join(plugin, 'reader-diagrams.css'), 'utf8')}article{max-width:800px;margin:auto}.gap{height:1100px}</style><article>${Array.from({ length: count }, (_, i) => `<section ${hidden ? 'hidden' : ''} id="wrap-${i}"><div id="reader-${i}" data-mbb-teaching="component" data-mbb-teaching-config='${JSON.stringify(config)}'><div class="mbb-teaching-body"><p>Readable fallback ${i}</p></div></div></section><div class="gap"></div>`).join('')}</article>`,
  );
  await page.evaluate(
    ({ provider, reader }) => {
      window.MBBComponents = [provider];
      window.MBB_COMPONENTS_READER = reader;
    },
    { provider, reader },
  );
  await page.addScriptTag({ content: fs.readFileSync(path.join(plugin, 'components.js'), 'utf8') });
  return () => requests;
}
test('reader diagrams open automatically and quietly; explicit collapse remains closed', async ({
  page,
}) => {
  await load(page);
  const box = page.locator('#reader-0');
  await expect(box.frameLocator('iframe').locator('#status')).toHaveText('Complete');
  await expect(box.locator('.mbb-component-status')).toBeEmpty();
  await expect(box.locator('iframe')).toHaveAttribute('sandbox', 'allow-scripts');
  await box.getByRole('button', { name: 'Collapse diagram' }).click();
  await expect(box.locator('iframe')).toHaveCount(0);
  await expect(box.getByRole('button', { name: 'Show diagram' })).toBeFocused();
  await page.evaluate(() => {
    scrollTo(0, 1000);
    scrollTo(0, 0);
    dispatchEvent(new Event('pageshow'));
  });
  await expect(box.getByRole('button', { name: 'Show diagram' })).toBeVisible();
  expect(await box.locator('iframe').count()).toBe(0);
  await box.getByRole('button', { name: 'Show diagram' }).click();
  await expect(box.frameLocator('iframe').locator('#status')).toHaveText('Complete');
});
test('editor and algorithm components retain explicit start; article cannot grant reader mode', async ({
  page,
}) => {
  for (const options of [{ reader: false }, { mode: null }, { mode: 'algorithm' }]) {
    await load(page, options);
    await expect(
      page.getByRole('button', { name: 'Start interactive demonstration' }),
    ).toBeVisible();
    expect(await page.locator('iframe').count()).toBe(0);
  }
});
test('hidden diagrams wait for reveal; scrolling through many graphs releases frames without shifting their height', async ({
  page,
}) => {
  await load(page, { count: 7, hidden: true });
  expect(await page.locator('iframe').count()).toBe(0);
  await page.evaluate(() =>
    document.querySelectorAll('[hidden]').forEach((n) => (n.hidden = false)),
  );
  await page.evaluate(() => document.dispatchEvent(new Event('mbb:teaching-change')));
  const first = page.locator('#reader-0');
  await expect(first.frameLocator('iframe').locator('#status')).toHaveText('Complete');
  const height = await first
    .locator('.mbb-component-controls')
    .evaluate((n) => n.getBoundingClientRect().height);
  for (let i = 1; i < 7; i++) {
    await page.locator('#reader-' + i).scrollIntoViewIfNeeded();
    await expect(
      page
        .locator('#reader-' + i)
        .frameLocator('iframe')
        .locator('#status'),
    ).toHaveText('Complete');
    expect(await page.locator('iframe').count()).toBeLessThanOrEqual(4);
  }
  await expect(first.locator('iframe')).toHaveCount(0);
  expect(
    Math.abs(
      (await first
        .locator('.mbb-component-controls')
        .evaluate((n) => n.getBoundingClientRect().height)) - height,
    ),
  ).toBeLessThanOrEqual(1);
  await first.scrollIntoViewIfNeeded();
  await expect(first.frameLocator('iframe').locator('#status')).toHaveText('Complete');
  expect(
    Math.abs(
      (await first
        .locator('.mbb-component-controls')
        .evaluate((n) => n.getBoundingClientRect().height)) - height,
    ),
  ).toBeLessThanOrEqual(1);
});
test('digest failure does not auto-loop; reader can explicitly retry verified resources', async ({
  page,
}) => {
  const requests = await load(page, { digest: '0'.repeat(64) });
  await expect(page.locator('[data-mbb-failure-code]')).toHaveAttribute(
    'data-mbb-failure-code',
    'DIGEST',
  );
  const before = requests();
  await page.evaluate(() => {
    dispatchEvent(new Event('resize'));
    dispatchEvent(new Event('pageshow'));
  });
  await expect(page.getByRole('button', { name: 'Show diagram' })).toBeVisible();
  expect(requests()).toBe(before);
  await page.evaluate((sha) => {
    window.MBBComponents[0].resource.sha256 = sha;
  }, sha);
  await page.getByRole('button', { name: 'Show diagram' }).click();
  await expect(page.frameLocator('iframe').locator('#status')).toHaveText('Complete');
});
