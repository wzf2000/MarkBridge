const { test, expect } = require('@playwright/test');
const fs = require('node:fs'),
  path = require('node:path');
const plugin = path.resolve(__dirname, '../../plugin');
async function load(page, params = {}, resourceOverrides = {}) {
  const response = await page.request.get('/resource-v2-fixture');
  const { provider } = await response.json();
  if (resourceOverrides === null) delete provider.resources.bundleUrl;
  else Object.assign(provider.resources, resourceOverrides);
  await page.goto('/health');
  await page.setContent(
    `<meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; frame-src 'self'; connect-src 'self'; style-src 'unsafe-inline'"><style>${fs.readFileSync(path.join(plugin, 'teaching.css'), 'utf8')} body{font:16px/1.7 system-ui;margin:16px}article{max-width:760px;margin:auto}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:6px;text-align:left}</style><article><h1>公开资源交互与静态说明</h1><p>合成固定资源；无 WordPress 数据库。</p><div id="demo" data-mbb-teaching="component"><div class="mbb-teaching-body"><h2>作者静态解释</h2><table><caption>固定公开数据</caption><tr><th>项目</th><th>数值</th></tr><tr><td>样本 A</td><td>42</td></tr></table></div></div></article>`,
  );
  await page.locator('#demo').evaluate(
    (node, p) => {
      node.dataset.mbbTeachingConfig = JSON.stringify({
        status: 'available',
        component: p.id,
        componentVersion: p.version,
        params: p.testParams,
      });
      window.MBBComponents = [p];
    },
    { ...provider, testParams: params },
  );
  await page.addScriptTag({ url: '/fixture-localization.js?locale=zh_CN' });
  await page.addScriptTag({ url: '/plugin/component-resources.js' });
  await page.addScriptTag({ url: '/plugin/components.js' });
  return provider;
}
test('v2 HTTP opaque frame under strict parent CSP transfers pinned data, denies network/WASM/Worker and reuses raw cache', async ({
  page,
}, info) => {
  const provider = await load(page);
  const before = (await (await page.request.get('/resource-v2-fixture')).json()).count;
  await page.getByRole('button', { name: '启动交互演示' }).click();
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#status')).toHaveText('公开资源已校验');
  await expect(frame.locator('#data')).toHaveText('{"value":42}');
  await expect(page.locator('iframe')).toHaveAttribute('src', provider.frameUrl);
  expect(await page.locator('iframe').getAttribute('srcdoc')).toBe(null);
  expect(await page.locator('iframe').evaluate((n) => n.contentDocument)).toBe(null);
  const denied = await frame.locator('body').evaluate(async () => {
    const result = {};
    try {
      await fetch('/health', { mode: 'no-cors', credentials: 'omit' });
      result.network = false;
    } catch {
      result.network = true;
    }
    try {
      await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
      result.wasm = false;
    } catch {
      result.wasm = true;
    }
    try {
      result.worker = await new Promise((resolve) => {
        const url = URL.createObjectURL(new Blob(['postMessage(1)'], { type: 'text/javascript' }));
        const worker = new Worker(url);
        const done = (value) => {
          worker.terminate();
          URL.revokeObjectURL(url);
          resolve(value);
        };
        worker.onmessage = () => done(false);
        worker.onerror = (event) => {
          event.preventDefault();
          done(true);
        };
        setTimeout(() => done(false), 500);
      });
    } catch {
      result.worker = true;
    }
    try {
      document.cookie;
      result.cookie = false;
    } catch {
      result.cookie = true;
    }
    return result;
  });
  expect(denied).toEqual({ network: true, wasm: true, worker: true, cookie: true });
  await frame.getByRole('button', { name: '计算固定数据' }).click();
  await expect(frame.locator('#status')).toHaveText('计算完成');
  await expect(page.locator('.mbb-component-status')).toHaveClass(/mbb-component-complete/);
  await page.screenshot({ path: info.outputPath('resources-v2.png'), fullPage: true });
  await page.getByRole('button', { name: '关闭交互预览' }).click();
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.frameLocator('iframe').locator('#status')).toHaveText('公开资源已校验');
  const after = (await (await page.request.get('/resource-v2-fixture')).json()).count;
  expect(after.bundle - before.bundle).toBe(1);
  expect(after.manifest - before.manifest).toBe(0);
  expect(after.data - before.data).toBe(0);
  expect(after.program - before.program).toBe(0);
  expect(after.binary - before.binary).toBe(0);
  expect(after.frame - before.frame).toBe(2);
});
test('v2 startup cancellation and bad pin retain static content; top-level frame cannot self initialize', async ({
  page,
}) => {
  const provider = await load(page);
  await page.route('**/component-resources/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    try {
      await route.continue();
    } catch {}
  });
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await page.getByRole('button', { name: '关闭交互预览' }).click();
  await page.waitForTimeout(400);
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '作者静态解释' })).toBeVisible();
  await page.unroute('**/component-resources/**');
  await page.route('**/component-resources/**', async (route) => {
    const response = await route.fetch();
    const body = await response.body();
    body[12] ^= 1;
    await route.fulfill({ response, body });
  });
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.locator('#demo')).toHaveAttribute('data-mbb-failure-code', 'MANIFEST_SHA');
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.goto(provider.frameUrl);
  await page.evaluate(() =>
    postMessage({ protocol: 'mbb-component/v2', session: 'a'.repeat(32), type: 'init' }, '*'),
  );
  await expect(page.locator('#status')).toHaveText('等待宿主');
});

test('v2 accepts near-limit pure params without changing the 16KiB author limit', async ({
  page,
}) => {
  await load(page, { text: 'x'.repeat(16360) });
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.frameLocator('iframe').locator('#status')).toHaveText('公开资源已校验');
});

test('default v2 budget-like provider errors do not inherit execution-profile budget semantics', async ({
  page,
}) => {
  await page.addInitScript(() =>
    addEventListener('message', (e) => {
      if (e.data?.type === 'init') window.probeInit = e.data;
    }),
  );
  await load(page);
  await page.getByRole('button', { name: '启动交互演示' }).click();
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#status')).toHaveText('公开资源已校验');
  const runId = 'd'.repeat(32);
  await frame.locator('body').evaluate(
    (n, id) =>
      parent.postMessage(
        {
          protocol: probeInit.protocol,
          session: probeInit.session,
          type: 'run-request',
          runId: id,
        },
        '*',
      ),
    runId,
  );
  await expect.poll(() => page.evaluate(() => MarkBridgeComponents.activeCount())).toBe(1);
  await frame.locator('body').evaluate(
    (n, id) =>
      parent.postMessage(
        {
          protocol: probeInit.protocol,
          session: probeInit.session,
          type: 'error',
          runId: id,
          code: 'COMPILE_LIMIT',
        },
        '*',
      ),
    runId,
  );
  await expect(page.locator('#demo')).toHaveAttribute('data-mbb-failure-code', 'EXECUTION');
  await expect(page.locator('iframe')).toHaveCount(1);
  expect(await page.evaluate(() => MarkBridgeComponents.activeCount())).toBe(0);
});

test('cold bundle plus slow HTTP navigation stays within the unchanged startup deadline', async ({
  page,
}, info) => {
  await load(page);
  let downloads = 0;
  await page.route('**/component-resources/**', async (route) => {
    downloads++;
    await new Promise((resolve) => setTimeout(resolve, 1600));
    await route.continue();
  });
  await page.route('**/component-frame/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1700));
    await route.continue();
  });
  const start = Date.now();
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.locator('#demo')).toHaveAttribute('data-mbb-component-state', 'ready');
  expect(Date.now() - start).toBeGreaterThan(3000);
  expect(downloads).toBe(1);
  await page.screenshot({ path: info.outputPath('cold-resource-ready.png'), fullPage: true });
});

test('navigation cannot reset the total deadline and a late load cannot revive the frame', async ({
  page,
}) => {
  await load(page);
  await page.route('**/component-resources/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1700));
    await route.continue();
  });
  await page.route('**/component-frame/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3500));
    try {
      await route.continue();
    } catch {}
  });
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.locator('#demo')).toHaveAttribute('data-mbb-failure-code', 'STARTUP_TIMEOUT');
  await page.waitForTimeout(400);
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '作者静态解释' })).toBeVisible();
});

test('closing a delayed bundle then reopening starts a fresh generation without stale adoption', async ({
  page,
}) => {
  await load(page);
  let requests = 0;
  await page.route('**/component-resources/**', async (route) => {
    if (++requests === 1) await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      await route.continue();
    } catch {}
  });
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect.poll(() => requests).toBe(1);
  await page.getByRole('button', { name: '关闭交互预览' }).click();
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.locator('#demo')).toHaveAttribute('data-mbb-component-state', 'ready');
  await page.waitForTimeout(600);
  await expect(page.locator('iframe')).toHaveCount(1);
  expect(requests).toBe(2);
});

test('v2 keeps the no-bundle descriptor compatible with the original fixed resource path', async ({
  page,
}) => {
  await load(page, {}, null);
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.locator('#demo')).toHaveAttribute('data-mbb-component-state', 'ready');
});

test('slow bundle body is canceled by the unchanged cumulative download limit', async ({
  page,
}) => {
  const { provider } = await (await page.request.get('/resource-v2-fixture')).json();
  await load(
    page,
    {},
    { bundleUrl: new URL('/resource-v2-slow-bundle', provider.resources.bundleUrl).href },
  );
  const started = Date.now();
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.locator('#demo')).toHaveAttribute('data-mbb-failure-code', /.+/);
  expect(Date.now() - started).toBeGreaterThan(2300);
  expect(Date.now() - started).toBeLessThan(4500);
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('init to ready still has its own 1.5 second limit after navigation', async ({ page }) => {
  await load(page);
  await page.route('**/component-frame/**', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      "send('ready');",
      "setTimeout(() => send('ready'), 1800);",
    );
    await route.fulfill({ response, body });
  });
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.locator('#demo')).toHaveAttribute('data-mbb-failure-code', 'TRANSFER_TIMEOUT');
  await page.waitForTimeout(400);
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('bundle length and HTTP redirects fail closed and retry without a partial cache', async ({
  page,
}) => {
  for (const mode of ['length', 'redirect']) {
    await load(page);
    let requests = 0;
    await page.route('**/component-resources/**', async (route) => {
      requests++;
      if (mode === 'redirect')
        await route.fulfill({ status: 302, headers: { Location: '/health' } });
      else {
        const response = await route.fetch();
        const body = await response.body();
        await route.fulfill({ response, body: body.subarray(0, -1) });
      }
    });
    await page.getByRole('button', { name: '启动交互演示' }).click();
    await expect(page.locator('#demo')).toHaveAttribute(
      'data-mbb-failure-code',
      mode === 'length' ? 'BUNDLE_LENGTH' : 'NETWORK',
    );
    await expect(page.locator('iframe')).toHaveCount(0);
    await page.unroute('**/component-resources/**');
    await page.route('**/component-resources/**', async (route) => {
      requests++;
      await route.continue();
    });
    await page.getByRole('button', { name: '启动交互演示' }).click();
    await expect(page.locator('#demo')).toHaveAttribute('data-mbb-component-state', 'ready');
    expect(requests).toBe(2);
    await page.unroute('**/component-resources/**');
  }
});

test('v2 late frame callbacks cannot replace the current session and second navigation is denied', async ({
  page,
}) => {
  await load(page);
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.locator('#demo')).toHaveAttribute('data-mbb-component-state', 'ready');
  await page.locator('iframe').evaluate((frame) => {
    window.previousV2Load = frame.onload;
  });
  await page.getByRole('button', { name: '关闭交互预览' }).click();
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.locator('#demo')).toHaveAttribute('data-mbb-component-state', 'ready');
  await page.evaluate(() => previousV2Load());
  await expect(page.locator('iframe')).toHaveCount(1);
  await page.locator('iframe').evaluate((frame) => frame.onload());
  await expect(page.locator('#demo')).toHaveAttribute('data-mbb-failure-code', 'NAVIGATION');
  await expect(page.locator('iframe')).toHaveCount(0);
});
