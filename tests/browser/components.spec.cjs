const { test, expect } = require('@playwright/test'),
  fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const plugin = path.resolve(__dirname, '../../plugin'),
  html = fs.readFileSync(path.join(__dirname, 'fixtures/component.html'), 'utf8'),
  sha = crypto.createHash('sha256').update(html).digest('hex');
async function load(
  page,
  { status = 'available', digest = sha, behavior = 'complete', instances = 1, budgets = {} } = {},
) {
  await page.goto('/health');
  await page.route('**/component/frame.html', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  );
  const config = {
    status,
    component: 'fixture',
    componentVersion: '0.1.0',
    params: { value: 42, behavior },
    provider: {
      id: 'fixture',
      version: '0.1.0',
      protocolVersion: 1,
      minMarkBridge: '1.9.0-dev.1',
      budgets: {
        resourceBytes: 524288,
        startupMs: 5000,
        wallMs: 2000,
        traceFrames: 8192,
        traceBytes: 524288,
        ...budgets,
      },
      title: 'Fixed fixture',
      resource: { url: new URL('/component/frame.html', page.url()).href, sha256: digest },
    },
  };
  await page.setContent(
    `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${fs.readFileSync(path.join(plugin, 'teaching.css'), 'utf8')}</style><article>${Array.from({ length: instances }, (_, i) => `<div id="demo-${i}" data-mbb-teaching="component" data-mbb-teaching-config='${JSON.stringify(config)}'><div class="mbb-teaching-body"><p class="fallback">Static author explanation.</p></div></div>`).join('')}</article>`,
  );
  await page.evaluate((p) => {
    window.MBBComponents = [p];
  }, config.provider);
  await page.addScriptTag({ content: fs.readFileSync(path.join(plugin, 'components.js'), 'utf8') });
}
test('generic fixed provider uses opaque iframe, enforced CSP and public data, retains static fallback', async ({
  page,
}) => {
  await load(page);
  await page.getByRole('button', { name: '启动交互演示' }).click();
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#status')).toHaveText('Ready');
  await expect(frame.locator('#params')).toContainText('"value":42');
  await expect(page.locator('.fallback')).toBeVisible();
  await expect(page.locator('iframe')).toHaveAttribute('sandbox', 'allow-scripts');
  expect(await page.locator('iframe').evaluate((n) => n.contentDocument)).toBe(null);
  expect(
    await frame.locator('body').evaluate(() => {
      try {
        document.cookie;
        return false;
      } catch (e) {
        return e.name === 'SecurityError';
      }
    }),
  ).toBe(true);
  expect(
    await frame.locator('body').evaluate(async () => {
      try {
        await fetch('https://invalid.example/');
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
  await frame.locator('#run').click();
  await expect(frame.locator('#status')).toHaveText('Complete');
  expect(await page.evaluate(() => MarkBridgeComponents.activeCount())).toBe(0);
  await page.getByRole('button', { name: '关闭交互预览' }).click();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '启动交互演示' })).toBeFocused();
  await expect(page.locator('.fallback')).toBeVisible();
});
test('missing provider, 404 and failed digest remain static and support explicit retry', async ({
  page,
}) => {
  await load(page, { status: 'missing' });
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.locator('[role=status]')).toContainText('组件缺失');
  await expect(page.locator('iframe')).toHaveCount(0);
  await load(page);
  await page.route('**/component/frame.html', (r) => r.fulfill({ status: 404, body: 'Missing' }));
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.locator('[role=status]')).toContainText('资源不可用');
  await page.unroute('**/component/frame.html');
  await page.route('**/component/frame.html', (r) =>
    r.fulfill({ contentType: 'text/html', body: html }),
  );
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.frameLocator('iframe').locator('#status')).toHaveText('Ready');
  await load(page, { digest: '0'.repeat(64) });
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.locator('[role=status]')).toContainText('摘要不匹配');
  await expect(page.getByRole('button', { name: '启动交互演示' })).toBeEnabled();
});
test('watchdog terminates hanging trusted worker, and shared running budget rejects third instance', async ({
  page,
}) => {
  await load(page, { behavior: 'hang', instances: 3 });
  for (let i = 0; i < 3; i++) {
    await page.locator(`#demo-${i} > .mbb-component-controls > button`).first().click();
    await expect(page.frameLocator(`#demo-${i} iframe`).locator('#status')).toHaveText('Ready');
  }
  for (let i = 0; i < 3; i++) await page.frameLocator(`#demo-${i} iframe`).locator('#run').click();
  await expect(page.frameLocator('#demo-2 iframe').locator('#status')).toHaveText('Busy');
  expect(await page.evaluate(() => MarkBridgeComponents.activeCount())).toBe(2);
  await expect(page.locator('#demo-0 iframe')).toHaveCount(0);
  await expect(page.locator('#demo-0 [role=status]')).toContainText('超过时间预算');
  await expect(page.locator('.fallback')).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => MarkBridgeComponents.activeCount())).toBe(0);
});
test('foreign and late messages fail closed; navigation and removed shells discard sessions', async ({
  page,
}) => {
  await load(page);
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.frameLocator('iframe').locator('#status')).toHaveText('Ready');
  await page.evaluate(() =>
    dispatchEvent(
      new MessageEvent('message', {
        data: { protocol: 'mbb-component/v1', session: '0'.repeat(32), type: 'resize', height: 1 },
        source: window,
      }),
    ),
  );
  expect(await page.locator('iframe').evaluate((n) => parseFloat(n.style.height))).toBe(320);
  await page.route('**/component/navigation.html', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<p>New document</p>' }),
  );
  await page
    .frameLocator('iframe')
    .locator('body')
    .evaluate(() => (location.href = '/component/navigation.html'));
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.locator('[role=status]')).toContainText('未授权导航');
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.frameLocator('iframe').locator('#status')).toHaveText('Ready');
  await page.locator('#demo-0').evaluate((n) => n.remove());
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(await page.evaluate(() => MarkBridgeComponents.activeCount())).toBe(0);
});

test('real WordPress iframe canvas exposes parent inspector interactive preview and preserves edit bytes', async ({
  page,
}) => {
  await page.goto('/component-editor');
  await expect(page.locator('iframe[name="editor-canvas"]')).toBeVisible();
  await expect(
    page.frameLocator('iframe[name="editor-canvas"]').getByText('Editable static fallback.'),
  ).toBeVisible();
  await page.evaluate(() =>
    taskRegistry.dispatch('core/block-editor').selectBlock(taskBlocks[0].clientId),
  );
  await page.getByRole('button', { name: '启动交互演示' }).click();
  const interactive = page.frameLocator('.mbb-component-controls iframe');
  await expect(interactive.locator('#status')).toHaveText('Ready');
  await expect(page.locator('.mbb-component-controls iframe')).toHaveAttribute(
    'sandbox',
    'allow-scripts',
  );
  const json = page.getByRole('textbox', { name: '参数 JSON（纯数据）', exact: true });
  const choose = page.getByLabel('登记的教学组件', { exact: true });
  await choose.selectOption('fixture-second@0.1.0');
  await expect(json).toHaveValue(/"value": 99/);
  await choose.selectOption('fixture@0.1.0');
  await expect(json).toHaveValue(/"value": 42/);
  await page.evaluate(() =>
    taskRegistry.dispatch('core/block-editor').updateBlockAttributes(taskBlocks[0].clientId, {
      params: { value: 41, behavior: 'complete' },
    }),
  );
  await expect(json).toHaveValue(/"value": 41/);
  await json.fill('{"value":43,"behavior":"complete"}');
  await page.getByRole('button', { name: '应用参数', exact: true }).click();
  await expect(page.locator('.mbb-component-controls iframe')).toHaveCount(0);
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(
    page.frameLocator('.mbb-component-controls iframe').locator('#params'),
  ).toContainText('"value":43');
  await json.fill('{"value":');
  await page.getByRole('button', { name: '应用参数', exact: true }).click();
  await page.locator('#export-tasks').click();
  await expect(page.locator('#task-export')).toContainText('ERROR: 参数尚未应用');
  await page.evaluate(() => taskRegistry.dispatch('core/block-editor').clearSelectedBlock());
  await page.evaluate(() =>
    taskRegistry.dispatch('core/block-editor').selectBlock(taskBlocks[0].clientId),
  );
  await expect(page.getByRole('textbox', { name: '参数 JSON（纯数据）', exact: true })).toHaveValue(
    '{"value":',
  );
  await page.getByRole('button', { name: '撤销参数输入', exact: true }).click();
  await page.locator('#export-tasks').click();
  await expect(page.locator('#task-export')).toContainText('"value":43');
  await expect(page.locator('#task-export')).toContainText('Editable static fallback');
});

test('four preview slots, hidden stages, configuration replacement and page lifecycle release resources', async ({
  page,
}) => {
  await load(page, { instances: 5 });
  for (let i = 0; i < 4; i++) {
    await page.locator(`#demo-${i} > .mbb-component-controls > button`).first().click();
    await expect(page.frameLocator(`#demo-${i} iframe`).locator('#status')).toHaveText('Ready');
  }
  await page.locator('#demo-4 > .mbb-component-controls > button').first().click();
  await expect(page.locator('#demo-4 [role=status]')).toContainText('已打开 4 个');
  expect(await page.evaluate(() => MarkBridgeComponents.frameCount())).toBe(4);
  await page.locator('#demo-0').evaluate((node) => {
    node.hidden = true;
    document.dispatchEvent(new CustomEvent('mbb:teaching-change'));
  });
  await expect(page.locator('#demo-0 iframe')).toHaveCount(0);
  await page.locator('#demo-4 > .mbb-component-controls > button').first().click();
  await expect(page.frameLocator('#demo-4 iframe').locator('#status')).toHaveText('Ready');
  await page.locator('#demo-4').evaluate((node) => {
    const cfg = JSON.parse(node.dataset.mbbTeachingConfig);
    cfg.params.value = 43;
    node.dataset.mbbTeachingConfig = JSON.stringify(cfg);
  });
  await expect(page.locator('#demo-4 iframe')).toHaveCount(0);
  await page.locator('#demo-4 > .mbb-component-controls > button').first().click();
  await expect(page.frameLocator('#demo-4 iframe').locator('#params')).toContainText('43');
  await page.evaluate(() =>
    dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })),
  );
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(await page.evaluate(() => MarkBridgeComponents.frameCount())).toBe(0);
  await page.evaluate(() =>
    dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
  );
  await page.locator('#demo-4 > .mbb-component-controls > button').first().click();
  await expect(page.frameLocator('#demo-4 iframe').locator('#status')).toHaveText('Ready');
});
test('bounded streaming and initialization timeout fail without losing static content', async ({
  page,
}) => {
  await load(page);
  await page.route('**/component/frame.html', (route) =>
    route.fulfill({ contentType: 'text/html', body: 'x'.repeat(512 * 1024 + 1) }),
  );
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.locator('[role=status]')).toContainText('资源过大');
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(await page.evaluate(() => MarkBridgeComponents.frameCount())).toBe(0);
  await load(page);
  const broken = '<p>Fixed resource with no protocol handshake</p>';
  const digest = require('node:crypto').createHash('sha256').update(broken).digest('hex');
  await page.locator('#demo-0').evaluate((node, digest) => {
    const cfg = JSON.parse(node.dataset.mbbTeachingConfig);
    cfg.provider.resource.sha256 = digest;
    window.MBBComponents[0].resource.sha256 = digest;
    node.dataset.mbbTeachingConfig = JSON.stringify(cfg);
  }, digest);
  await page.route('**/component/frame.html', (route) =>
    route.fulfill({ contentType: 'text/html', body: broken }),
  );
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.locator('[role=status]')).toContainText('初始化超时');
  await expect(page.locator('.fallback')).toBeVisible();
  await expect(page.getByRole('button', { name: '启动交互演示' })).toBeEnabled();
  expect(await page.evaluate(() => MarkBridgeComponents.frameCount())).toBe(0);
});

test('registered budgets govern resource bytes and execution, and article resource URLs have no authority', async ({
  page,
}) => {
  await load(page, { budgets: { resourceBytes: 100 } });
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.locator('[role=status]')).toContainText('资源过大');
  await expect(page.locator('iframe')).toHaveCount(0);
  await load(page, { behavior: 'hang', budgets: { wallMs: 150 } });
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await page.frameLocator('iframe').locator('#run').click();
  await expect(page.locator('[role=status]')).toContainText('超过时间预算');
  expect(await page.evaluate(() => MarkBridgeComponents.activeCount())).toBe(0);
  await load(page);
  await page.locator('#demo-0').evaluate((node) => {
    const cfg = JSON.parse(node.dataset.mbbTeachingConfig);
    cfg.provider.resource.url = 'https://invalid.example/article-chosen.html';
    cfg.provider.resource.sha256 = '0'.repeat(64);
    node.dataset.mbbTeachingConfig = JSON.stringify(cfg);
  });
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.frameLocator('iframe').locator('#status')).toHaveText('Ready');
});
test('over-budget summaries and messages terminate the session without removing static author text', async ({
  page,
}) => {
  await load(page, { behavior: 'hang' });
  await page.evaluate(() => {
    window.fixtureMessage = {};
    window.addEventListener('message', (event) => {
      if (
        event.source !== document.querySelector('iframe')?.contentWindow ||
        event.data?.protocol !== 'mbb-component/v1'
      )
        return;
      window.fixtureMessage.session = event.data.session;
      if (event.data.type === 'run-request') window.fixtureMessage.runId = event.data.runId;
    });
  });
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.frameLocator('iframe').locator('#status')).toHaveText('Ready');
  const beforeRun = await page.evaluate(() => window.fixtureMessage);
  await page
    .frameLocator('iframe')
    .locator('body')
    .evaluate(
      (element, meta) =>
        parent.postMessage(
          {
            protocol: 'mbb-component/v1',
            session: meta.session,
            type: 'complete',
            runId: null,
            frameCount: 1,
            outputBytes: 4,
          },
          '*',
        ),
      beforeRun,
    );
  await expect(page.locator('[role=status]')).toContainText('已就绪');
  const frame = page.frameLocator('iframe');
  await frame.locator('#run').click();
  await expect(frame.locator('#status')).toHaveText('Running');
  const runMeta = await page.evaluate(() => window.fixtureMessage);
  await frame.locator('body').evaluate(
    (element, meta) =>
      parent.postMessage(
        {
          protocol: 'mbb-component/v1',
          session: meta.session,
          type: 'complete',
          runId: meta.runId,
          frameCount: 8193,
          outputBytes: 1,
        },
        '*',
      ),
    runMeta,
  );
  await expect(page.locator('[role=status]')).toContainText('执行摘要超过预算');
  await expect(page.locator('.fallback')).toBeVisible();
  expect(await page.evaluate(() => MarkBridgeComponents.activeCount())).toBe(0);
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.frameLocator('iframe').locator('#status')).toHaveText('Ready');
  const freshMeta = await page.evaluate(() => window.fixtureMessage);
  await page
    .frameLocator('iframe')
    .locator('body')
    .evaluate(
      (element, meta) =>
        parent.postMessage(
          {
            protocol: 'mbb-component/v1',
            session: meta.session,
            type: 'resize',
            height: 400,
            payload: 'x'.repeat(9000),
          },
          '*',
        ),
      freshMeta,
    );
  await expect(page.locator('[role=status]')).toContainText('消息超过预算');
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(await page.evaluate(() => MarkBridgeComponents.frameCount())).toBe(0);
});

test('oversized initialization envelopes fail closed before public data is sent', async ({
  page,
}) => {
  await load(page);
  await page.locator('#demo-0').evaluate((node) => {
    const version = '1'.repeat(22000) + '.0.0';
    window.MBBComponents[0].version = version;
    const cfg = JSON.parse(node.dataset.mbbTeachingConfig);
    cfg.componentVersion = version;
    node.dataset.mbbTeachingConfig = JSON.stringify(cfg);
  });
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.locator('[role=status]')).toContainText('初始化信封超过预算');
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.locator('.fallback')).toBeVisible();
  expect(await page.evaluate(() => MarkBridgeComponents.frameCount())).toBe(0);
});

test('a first dynamically inserted teaching component uses the prepublished server registry', async ({
  page,
}) => {
  await page.goto('/component-dynamic');
  expect(
    await page.evaluate(
      () => Array.isArray(window.MBBComponents) && window.MBBComponents[0]?.id === 'fixture',
    ),
  ).toBe(true);
  expect(await page.evaluate(() => !!window.MarkBridgeComponents)).toBe(false);
  await page.locator('#dynamic').evaluate((node) => {
    const element = document.createElement('div');
    element.dataset.mbbTeaching = 'component';
    element.dataset.mbbTeachingConfig = JSON.stringify({
      component: 'fixture',
      componentVersion: '0.1.0',
      params: { value: 42, behavior: 'complete' },
      status: 'available',
    });
    element.innerHTML = '<div class="mbb-teaching-body"><p>Dynamic static fallback</p></div>';
    node.append(element);
  });
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.frameLocator('iframe').locator('#status')).toHaveText('Ready');
  await expect(page.getByText('Dynamic static fallback')).toBeVisible();
});
