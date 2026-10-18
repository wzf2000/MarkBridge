const { test, expect } = require('@playwright/test');
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const plugin = path.resolve(__dirname, '../../plugin');
const html = fs.readFileSync(path.join(__dirname, 'fixtures/component.html'), 'utf8');
async function component(
  page,
  {
    admin = true,
    sha,
    body = html,
    behavior = 'complete',
    status = 200,
    type = 'text/plain',
    delay = 0,
    startupMs = 5000,
  } = {},
) {
  let requests = 0;
  await page.goto('/health');
  await page.route('**/component/diagnostic.html.txt', async (route) => {
    requests++;
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      await route.fulfill({ status, contentType: type, body });
    } catch {
      /* A canceled request cannot revive the preview. */
    }
  });
  const provider = {
    id: 'fixture',
    version: '0.1.0',
    title: 'Fixed fixture',
    protocolVersion: 1,
    budgets: {
      resourceBytes: 524288,
      startupMs,
      wallMs: 2000,
      traceFrames: 8192,
      traceBytes: 524288,
    },
    resource: {
      url: new URL('/component/diagnostic.html.txt', page.url()).href,
      sha256: sha ?? crypto.createHash('sha256').update(body).digest('hex'),
    },
  };
  const config = {
    component: 'fixture',
    componentVersion: '0.1.0',
    status: 'available',
    params: { value: 42, behavior },
  };
  await page.setContent(
    `<meta name="viewport" content="width=device-width,initial-scale=1"><article><div id="example" data-mbb-teaching="component" data-mbb-teaching-config='${JSON.stringify(config)}'><div class="mbb-teaching-body"><p>Static explanation.</p></div></div></article>`,
  );
  await page.addStyleTag({ path: path.join(plugin, 'teaching.css') });
  await page.addStyleTag({ path: path.join(plugin, 'diagnostics.css') });
  await page.addScriptTag({ url: '/fixture-localization.js?locale=en_US' });
  await page.evaluate(
    ({ provider, admin }) => {
      window.MBBComponents = [provider];
      window.MBB_DIAGNOSTICS_CONFIG = { version: '2.1.0-rc.1', canCopy: admin };
    },
    { provider, admin },
  );
  await page.addScriptTag({ path: path.join(plugin, 'diagnostics.js') });
  await page.addScriptTag({ path: path.join(plugin, 'components.js') });
  return () => requests;
}
for (const [code, options] of [
  ['DIGEST', { sha: '0'.repeat(64) }],
  ['HTTP', { status: 503 }],
  ['RESOURCE_TYPE', { type: 'application/json' }],
]) {
  test(`component ${code} is distinct and never silently retried`, async ({ page }, info) => {
    const requests = await component(page, options);
    await page.getByRole('button', { name: 'Start interactive demonstration' }).click();
    await expect(page.locator('#example')).toHaveAttribute('data-mbb-failure-code', code);
    expect(requests()).toBe(1);
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.getByText('Static explanation.')).toBeVisible();
    const details = page.locator('.mbb-diagnostic');
    await expect(details).not.toHaveAttribute('open', '');
    await details.locator('summary').click();
    const summary = JSON.parse(await details.locator('textarea').inputValue());
    expect(summary.code).toBe(code);
    expect(summary.stage).toBe(code === 'DIGEST' ? 'integrity' : 'resource');
    expect(summary.pluginVersion).toBe('2.1.0-rc.1');
    expect(JSON.stringify(summary)).not.toMatch(
      /https?:|Static explanation|cookie|nonce|session|params|sha256/i,
    );
    await page.evaluate(() =>
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async () => {
            throw Error('denied');
          },
        },
      }),
    );
    await details.getByRole('button', { name: 'Copy diagnostic summary' }).click();
    await expect(details.getByRole('status')).toContainText('manually');
    if (code === 'DIGEST')
      await page.screenshot({ path: info.outputPath('component-diagnostic.png') });
  });
}
test('ordinary readers retain recovery without technical chrome, ready and close stay quiet', async ({
  page,
}) => {
  await component(page, { admin: false });
  await page.getByRole('button', { name: 'Start interactive demonstration' }).click();
  await expect(page.locator('#example')).toHaveAttribute('data-mbb-component-state', 'ready');
  await expect(page.locator('.mbb-component-status')).toBeEmpty();
  await page.getByRole('button', { name: 'Close interactive preview' }).click();
  await expect(page.locator('.mbb-component-status')).toBeEmpty();
  await expect(page.locator('.mbb-diagnostic')).toHaveCount(0);
  await component(page, { admin: false, sha: '0'.repeat(64) });
  await page.getByRole('button', { name: 'Start interactive demonstration' }).click();
  await expect(page.locator('#example')).toHaveAttribute('data-mbb-failure-code', 'DIGEST');
  await expect(page.locator('.mbb-diagnostic')).toHaveCount(0);
});
test('cancellation is not reported as a failure and late resources do not restore closed UI', async ({
  page,
}) => {
  await component(page, { delay: 250 });
  await page.getByRole('button', { name: 'Start interactive demonstration' }).click();
  await page.getByRole('button', { name: 'Close interactive preview' }).click();
  await page.waitForTimeout(350);
  await expect(page.locator('#example')).toHaveAttribute('data-mbb-component-state', 'closed');
  await expect(page.locator('.mbb-diagnostic,iframe')).toHaveCount(0);
  await expect(page.locator('.mbb-component-status')).toBeEmpty();
});
test('diagnostic output rejects accidental extra fields and stores nothing', async ({ page }) => {
  await page.goto('/front');
  await expect.poll(() => page.evaluate(() => !!window.MBB_DIAGNOSTICS)).toBe(true);
  const text = await page.evaluate(() => {
    window.MBB_DIAGNOSTICS_CONFIG = { canCopy: true, version: '2.1.0-rc.1' };
    const node = document.createElement('div');
    document.body.append(node);
    MBB_DIAGNOSTICS.show(node, {
      feature: 'math',
      stage: 'font',
      code: 'FONT',
      elapsedMs: 23,
      body: 'PRIVATE',
      url: 'https://private.example',
      cookie: 'SECRET',
      component: 'not a valid identifier',
      stagesMs: { font: 21, secret: 'PRIVATE' },
    });
    return node.querySelector('textarea').value;
  });
  expect(text).not.toMatch(/PRIVATE|SECRET|https?:|cookie|body|url/);
  const data = JSON.parse(text);
  expect(data.stage).toBe('font');
  expect(data.stagesMs).toEqual({ font: 20 });
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
test('formula resource failure preserves TeX and explicit retry restores rendering', async ({
  page,
}, info) => {
  let broken = true;
  let engineLoads = 0;
  page.on('request', (request) => {
    if (
      request.resourceType() === 'document' &&
      /\/math-engine(?:-[a-f0-9]{12})?\.html$/.test(new URL(request.url()).pathname)
    )
      engineLoads++;
  });
  let blockedRequests = 0;
  await page.route('**/vendor/mathjax-4.1.3/tex-chtml.js', (route) => {
    if (broken) {
      blockedRequests++;
      return route.abort();
    }
    return route.continue();
  });
  await page.goto('/front');
  await page.evaluate(() => {
    window.MBB_DIAGNOSTICS_CONFIG = { canCopy: true, version: '2.1.0-rc.1' };
  });
  const formula = page.locator('#inline-line .mbb-math');
  await expect(formula).toHaveAttribute('data-mbb-math-error', 'true');
  const tex = await formula.getAttribute('data-mbb-tex');
  // Concurrent formulas must stay in initialization until the shared engine is ready.
  const concurrent = page.locator('pre.wp-block-mbb-math').first();
  await expect(concurrent).toHaveAttribute('data-mbb-math-error', 'true');
  await concurrent.click();
  const concurrentDialog = page.locator('.mbb-math-reader');
  await concurrentDialog.locator('.mbb-diagnostic summary').click();
  expect(
    JSON.parse(await concurrentDialog.locator('.mbb-diagnostic textarea').inputValue()).stage,
  ).toBe('initialization');
  await concurrentDialog.getByRole('button', { name: /Close|关闭/, exact: true }).click();
  await expect(concurrentDialog).toBeHidden();
  // dialog.close() restores its opener on the asynchronous close event.
  await expect(concurrent).toBeFocused();
  await formula.focus();
  await expect(formula).toBeFocused();
  await page.keyboard.press('Enter');
  const dialog = page.locator('.mbb-math-reader');
  await expect(dialog.locator('.mbb-math-reader-source')).toHaveValue(tex);
  await dialog.locator('.mbb-diagnostic summary').click();
  const record = JSON.parse(await dialog.locator('.mbb-diagnostic textarea').inputValue());
  expect(record.code).toBe('NETWORK');
  expect(record.stage).toBe('initialization');
  expect(JSON.stringify(record)).not.toContain(tex);
  await page.screenshot({ path: info.outputPath('formula-diagnostic.png') });
  expect(blockedRequests).toBeGreaterThanOrEqual(1);
  expect(engineLoads).toBe(1);
  broken = false;
  // WebKit's protocol interception cannot continue MathJax's blob imports.
  // End the injected outage before measuring real resource recovery.
  await page.unroute('**/vendor/mathjax-4.1.3/tex-chtml.js');
  await dialog.getByRole('button', { name: /Retry formula|重新排版公式/ }).click();
  await expect(dialog.locator('.mbb-math-reader-render mjx-container')).toBeVisible();
  await expect(dialog.locator('.mbb-diagnostic')).toHaveCount(0);
  await expect(formula).not.toHaveAttribute('data-mbb-math-error');
  expect(engineLoads).toBe(2);
});

test('a new accepted execution clears the previous failure in the same iframe', async ({
  page,
}) => {
  const recoverable = html
    .replace(
      "params?.behavior === 'error' ?",
      "params?.behavior === 'error' && !window.fixtureFailed ?",
    )
    .replace('worker.onerror = () => {', 'worker.onerror = () => { window.fixtureFailed = true;')
    .replace('self.postMessage("done")', 'setTimeout(() => self.postMessage("done"), 400)');
  expect(recoverable).not.toBe(html);
  const requests = await component(page, { body: recoverable, behavior: 'error' });
  await page.getByRole('button', { name: 'Start interactive demonstration' }).click();
  const example = page.locator('#example');
  await expect(example).toHaveAttribute('data-mbb-component-state', 'ready');
  expect(requests()).toBe(1);
  // Resource bytes and digest are already verified. Disable the fixture route
  // before real blob Workers start; WebKit interception cannot load their URLs.
  await page.unroute('**/component/diagnostic.html.txt');
  const frame = page.frameLocator('.mbb-component-frame');
  const run = frame.getByRole('button', { name: 'Run fixed fixture' });
  await run.click();
  await expect(example).toHaveAttribute('data-mbb-failure-code', 'EXECUTION');
  await expect(page.locator('.mbb-diagnostic')).toHaveCount(1);
  // Capture the actual frame node: a reload/relaunch must not make the test pass.
  await page.locator('iframe').evaluate((node) => {
    window.reviewOriginalFrame = node;
  });
  await run.click();
  await expect(frame.locator('#status')).toHaveText('Running');
  await expect(example).not.toHaveAttribute('data-mbb-failure-code');
  await expect(page.locator('.mbb-diagnostic')).toHaveCount(0);
  await expect(frame.locator('#status')).toHaveText('Complete');
  await expect(example).not.toHaveAttribute('data-mbb-failure-code');
  await expect(page.locator('.mbb-diagnostic')).toHaveCount(0);
  expect(await page.locator('iframe').evaluate((node) => node === window.reviewOriginalFrame)).toBe(
    true,
  );
});

test('failed formula retry restores its focus unless the reader chose another control', async ({
  page,
}) => {
  let release;
  let hold = false;
  await page.route('**/vendor/mathjax-4.1.3/tex-chtml.js', async (route) => {
    if (hold)
      await new Promise((resolve) => {
        release = resolve;
      });
    await route.abort();
  });
  await page.goto('/front');
  const formula = page.locator('#inline-line .mbb-math');
  await expect(formula).toHaveAttribute('data-mbb-math-error', 'true');
  await formula.focus();
  await page.keyboard.press('Enter');
  const dialog = page.locator('.mbb-math-reader');
  const retry = dialog.locator('[data-mbb-reader-action="retry"]');
  const source = dialog.locator('.mbb-math-reader-source');
  const original = await source.inputValue();
  for (const chooseOtherControl of [false, true]) {
    hold = true;
    release = undefined;
    await retry.click();
    await expect(retry).toBeDisabled();
    await expect.poll(() => typeof release).toBe('function');
    if (chooseOtherControl) await source.focus();
    hold = false;
    release();
    await expect(retry).toBeEnabled();
    await expect(formula).toHaveAttribute('data-mbb-math-error', 'true');
    await expect(source).toHaveValue(original);
    await expect(chooseOtherControl ? source : retry).toBeFocused();
  }
  await page.keyboard.press('Escape');
  await expect(formula).toBeFocused();
});
