const { test, expect } = require('@playwright/test');
async function load(page) {
  await page.addInitScript(() => {
    addEventListener('message', (e) => {
      if (e.data?.type === 'init') window.probeInit = e.data;
    });
  });
  await page.goto('/health');
  const { provider } = await (await page.request.get('/execution-v2-fixture')).json();
  await page.setContent(
    `<meta http-equiv="Content-Security-Policy" content="default-src 'self';script-src 'self' 'unsafe-inline';worker-src 'none';frame-src 'self';connect-src 'self';style-src 'unsafe-inline'"><h1>Local fixed execution profile</h1><div id="demo" data-mbb-teaching="component"><div class="mbb-teaching-body"><p>Author static explanation remains.</p></div></div>`,
  );
  await page.locator('#demo').evaluate((n, p) => {
    window.MBBComponents = [p];
    n.dataset.mbbTeachingConfig = JSON.stringify({
      status: 'available',
      component: p.id,
      componentVersion: p.version,
      params: {},
    });
  }, provider);
  await page.addScriptTag({ url: '/fixture-localization.js?locale=en_US' });
  await page.addScriptTag({ url: '/plugin/component-resources.js' });
  await page.addScriptTag({ url: '/plugin/components.js' });
  await page.getByRole('button', { name: 'Start interactive demonstration', exact: true }).click();
  await expect(page.frameLocator('iframe').locator('#status')).toHaveText('ready');
  return provider;
}
test('only execution HTTP profile permits fixed Worker/WASM; strict parent and inherited Worker network/eval remain denied', async ({
  page,
}) => {
  const p = await load(page),
    frame = page.frameLocator('iframe');
  expect(
    await page.evaluate(async () => {
      try {
        await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
  const response = await page.request.get(p.frameUrl);
  expect(response.headers()['content-security-policy']).toContain("'wasm-unsafe-eval'");
  expect(response.headers()['content-security-policy']).not.toContain("'unsafe-eval'");
  await frame.getByRole('button', { name: 'Run fixed probe' }).click();
  await expect(frame.locator('#status')).toHaveText(
    '{"compiled":true,"networkBlocked":true,"evalBlocked":true}',
  );
  expect((await (await page.request.get('/execution-v2-fixture')).json()).network).toBe(0);
  expect(await page.evaluate(() => MarkBridgeComponents.activeCount())).toBe(0);
});
test('profile-only reported compile/run limits retain frame, release grant and reject late completion', async ({
  page,
}) => {
  await load(page);
  const frame = page.frameLocator('iframe');
  for (const code of ['RUN_LIMIT', 'COMPILE_LIMIT']) {
    const runId = code === 'RUN_LIMIT' ? 'a'.repeat(32) : 'b'.repeat(32);
    await frame.locator('body').evaluate(
      (n, runId) =>
        parent.postMessage(
          {
            protocol: 'mbb-component/v2',
            session: probeInit.session,
            type: 'run-request',
            runId,
          },
          '*',
        ),
      runId,
    );
    await expect.poll(() => page.evaluate(() => MarkBridgeComponents.activeCount())).toBe(1);
    await frame.locator('body').evaluate(
      (n, { code, runId }) =>
        parent.postMessage(
          {
            protocol: 'mbb-component/v2',
            session: probeInit.session,
            type: 'error',
            runId,
            code,
          },
          '*',
        ),
      { code, runId },
    );
    await expect(page.locator('#demo')).toHaveAttribute('data-mbb-failure-code', 'RUN_BUDGET');
    await expect(page.locator('.mbb-component-status')).toHaveText(
      'Execution exceeded its time budget and was terminated.',
    );
    await expect(page.locator('iframe')).toHaveCount(1);
    expect(await page.evaluate(() => MarkBridgeComponents.activeCount())).toBe(0);
    await frame.locator('body').evaluate(
      (n, runId) =>
        parent.postMessage(
          {
            protocol: 'mbb-component/v2',
            session: probeInit.session,
            type: 'complete',
            runId,
            frameCount: 0,
            outputBytes: 0,
            summary: {},
          },
          '*',
        ),
      runId,
    );
    await expect(page.locator('.mbb-component-status')).not.toHaveClass(/mbb-component-complete/);
  }
});
