const { test, expect } = require('@playwright/test'),
  fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const plugin = path.resolve(__dirname, '../../plugin'),
  html = fs.readFileSync(path.join(__dirname, 'fixtures/component.html'), 'utf8'),
  sha = crypto.createHash('sha256').update(html).digest('hex');
async function load(
  page,
  {
    status = 'available',
    digest = sha,
    behavior = 'complete',
    instances = 1,
    budgets = {},
    supportsUiLocale,
    locale = 'zh_CN',
  } = {},
) {
  await page.goto('/health');
  await page.route('**/component/frame-123456789abc.html.txt', (route) =>
    route.fulfill({ contentType: 'text/plain', body: html }),
  );
  const config = {
    status,
    component: 'fixture',
    componentVersion: '0.1.0',
    params: { value: 42, behavior },
    provider: {
      ...(supportsUiLocale === undefined ? {} : { supportsUiLocale }),
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
      resource: {
        url: new URL('/component/frame-123456789abc.html.txt', page.url()).href,
        sha256: digest,
      },
    },
  };
  await page.setContent(
    `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${fs.readFileSync(path.join(plugin, 'teaching.css'), 'utf8')}</style><article>${Array.from({ length: instances }, (_, i) => `<div id="demo-${i}" data-mbb-teaching="component" data-mbb-teaching-config='${JSON.stringify(config)}'><div class="mbb-teaching-body"><p class="fallback">Static author explanation.</p></div></div>`).join('')}</article>`,
  );
  await page.evaluate((p) => {
    window.MBBComponents = [p];
  }, config.provider);
  await page.addScriptTag({ url: '/fixture-localization.js?locale=' + locale });
  await page.evaluate((value) => {
    window.MBB_UI_LOCALE = value;
  }, locale);
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
  await expect(page.locator('.mbb-component-status')).toHaveClass(/mbb-component-complete/);
  await page.getByRole('button', { name: '关闭交互预览' }).click();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '启动交互演示' })).toBeFocused();
  await expect(page.locator('.fallback')).toBeVisible();
  await expect(page.locator('[role=status]')).toBeEmpty();
  await expect(page.getByRole('button', { name: '启动交互演示' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});
test('missing provider, 404 and failed digest remain static and support explicit retry', async ({
  page,
}) => {
  await load(page, { status: 'missing' });
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.locator('[role=status]')).toContainText('组件缺失');
  await expect(page.locator('iframe')).toHaveCount(0);
  await load(page);
  await page.route('**/component/frame-123456789abc.html.txt', (r) =>
    r.fulfill({ status: 404, body: 'Missing' }),
  );
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.locator('[role=status]')).toContainText('资源不可用');
  await page.unroute('**/component/frame-123456789abc.html.txt');
  await page.route('**/component/frame-123456789abc.html.txt', (r) =>
    r.fulfill({ contentType: 'text/plain', body: html }),
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
  await expect(page.locator('#task-export')).toHaveText(
    'ERROR: Parameters have not been applied. Apply or discard the parameter input before saving.',
  );
  // The synthetic output must not enlarge the mobile layout viewport or misalign pointer targets.
  expect(await page.evaluate(() => innerWidth)).toBe(page.viewportSize().width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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
  await page.route('**/component/frame-123456789abc.html.txt', (route) =>
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
  await page.route('**/component/frame-123456789abc.html.txt', (route) =>
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
  await expect(page.locator('[data-mbb-component-state=ready]')).toHaveCount(1);
  await expect(page.locator('[role=status]')).toBeEmpty();
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

test('legacy init stays closed; trusted opt-in sends only the closed UI locale without changing parameters', async ({
  page,
}) => {
  for (const scenario of [
    { locale: 'zh_CN' },
    { supportsUiLocale: false, locale: 'zh_CN' },
    { supportsUiLocale: true, locale: 'zh_CN' },
    { supportsUiLocale: true, locale: 'en_US' },
    { supportsUiLocale: true, locale: 'unknown' },
  ]) {
    await load(page, scenario);
    await page.locator('[data-mbb-teaching=component] button').first().click();
    const frame = page.frameLocator('iframe');
    await expect(frame.locator('#status')).toHaveText('Ready');
    const init = JSON.parse(await frame.locator('#init').textContent());
    const keys = [
      'protocol',
      'session',
      'type',
      'params',
      'execution',
      'component',
      'componentVersion',
      'budgets',
    ];
    if (scenario.supportsUiLocale === true) keys.push('uiLocale');
    expect(Object.keys(init).sort()).toEqual(keys.sort());
    expect(init.params).toEqual({ value: 42, behavior: 'complete' });
    if (scenario.supportsUiLocale === true)
      expect(init.uiLocale).toBe(scenario.locale === 'zh_CN' ? 'zh_CN' : 'en_US');
  }
});

// Controlled transport keeps the AbortSignal observable during both header waits
// and streaming reads. Other fixture and browser security tests use native fetch.
async function transport(page, mode) {
  await page.evaluate((mode) => {
    const nativeFetch = window.fetch;
    window.resourceRequests = [];
    window.fetch = async (url, options) => {
      if (!String(url).includes('/component/frame-123456789abc.html.txt'))
        return nativeFetch(url, options);
      if (!resourceRequests.length) window.resourceStarted = performance.now();
      const record = { method: options.method || 'GET', aborted: false };
      resourceRequests.push(record);
      options.signal.addEventListener('abort', () => {
        record.aborted = true;
        window.lastResourceAbortMs = performance.now() - resourceStarted;
      });
      const index = resourceRequests.length;
      if (mode === 'stall' || (mode === 'retry' && index === 1))
        return new Promise((resolve, reject) =>
          options.signal.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          ),
        );
      if (mode === 'body') {
        return new Response(
          new ReadableStream({
            start(controller) {
              options.signal.addEventListener('abort', () =>
                controller.error(new DOMException('Aborted', 'AbortError')),
              );
            },
          }),
          { status: 200 },
        );
      }
      return nativeFetch(url, options);
    };
  }, mode);
}

test('one pre-header retry keeps the shared startup deadline and creates only one iframe', async ({
  page,
}) => {
  await load(page, { budgets: { startupMs: 900 } });
  await transport(page, 'retry');
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.frameLocator('iframe').locator('#status')).toHaveText('Ready');
  await expect(page.locator('iframe')).toHaveCount(1);
  expect(await page.evaluate(() => resourceRequests)).toEqual([
    { method: 'GET', aborted: true },
    { method: 'GET', aborted: true },
  ]);
});

test('fast resources and definite HTTP, redirect, digest and size failures never retry', async ({
  page,
}) => {
  for (const outcome of ['ready', '404', 'redirect', 'digest', 'size']) {
    await load(page, {
      ...(outcome === 'digest' ? { digest: '0'.repeat(64) } : {}),
      ...(outcome === 'size' ? { budgets: { resourceBytes: 100 } } : {}),
    });
    let calls = 0;
    await page.route('**/component/frame-123456789abc.html.txt', (route) => {
      calls++;
      return route.fulfill(
        outcome === '404'
          ? { status: 404, body: 'Missing' }
          : outcome === 'redirect'
            ? { status: 302, headers: { location: '/health' } }
            : { contentType: 'text/plain', body: html },
      );
    });
    await page.getByRole('button', { name: '启动交互演示' }).click();
    if (outcome === 'ready')
      await expect(page.frameLocator('iframe').locator('#status')).toHaveText('Ready');
    else {
      await expect(page.getByRole('button', { name: '启动交互演示' })).toBeVisible();
      await expect(page.locator('iframe')).toHaveCount(0);
      await expect(page.locator('[role=status]')).toContainText('静态替代内容');
    }
    expect(calls, outcome).toBe(1);
  }
});

test('close, suspension and config replacement cancel either pending header attempt without late frames', async ({
  page,
}) => {
  for (const action of ['close', 'suspend', 'config']) {
    for (const attempt of [1, 2]) {
      await load(page, { budgets: { startupMs: 900 } });
      await transport(page, 'stall');
      await page.getByRole('button', { name: '启动交互演示' }).click();
      await expect.poll(() => page.evaluate(() => resourceRequests.length)).toBe(attempt);
      if (action === 'close') await page.getByRole('button', { name: '关闭交互预览' }).click();
      else if (action === 'suspend')
        await page.evaluate(() =>
          dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })),
        );
      else
        await page.locator('#demo-0').evaluate((node) => {
          const config = JSON.parse(node.dataset.mbbTeachingConfig);
          config.params.value++;
          node.dataset.mbbTeachingConfig = JSON.stringify(config);
        });
      await expect(page.locator('iframe')).toHaveCount(0);
      await expect
        .poll(() => page.evaluate(() => resourceRequests.every((r) => r.aborted)))
        .toBe(true);
      await page.waitForTimeout(350);
      expect(await page.evaluate(() => resourceRequests.length)).toBe(attempt);
      expect(await page.evaluate(() => MarkBridgeComponents.frameCount())).toBe(0);
      await expect(page.getByRole('button', { name: '启动交互演示' })).toBeEnabled();
    }
  }
});

test('headers clear the soft timer but body cancellation remains linked to close and deadline', async ({
  page,
}) => {
  for (const action of ['close', 'deadline']) {
    await load(page, { budgets: { startupMs: 900 } });
    await transport(page, 'body');
    await page.getByRole('button', { name: '启动交互演示' }).click();
    await expect.poll(() => page.evaluate(() => resourceRequests.length)).toBe(1);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => resourceRequests[0].aborted)).toBe(false);
    if (action === 'close') await page.getByRole('button', { name: '关闭交互预览' }).click();
    else await expect(page.locator('[role=status]')).toContainText('初始化超时');
    await expect.poll(() => page.evaluate(() => resourceRequests[0].aborted)).toBe(true);
    expect(await page.evaluate(() => resourceRequests.length)).toBe(1);
    expect(await page.evaluate(() => MarkBridgeComponents.frameCount())).toBe(0);
  }
});

test('two stalled header requests terminate within the original shared budget', async ({
  page,
}) => {
  await load(page, { budgets: { startupMs: 900 } });
  await transport(page, 'stall');
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.locator('[role=status]')).toContainText('初始化超时');
  const elapsed = await page.evaluate(() => lastResourceAbortMs);
  expect(elapsed).toBeGreaterThanOrEqual(850);
  expect(elapsed).toBeLessThanOrEqual(1050);
  await expect(page.locator('.fallback')).toBeVisible();
  expect(await page.evaluate(() => resourceRequests)).toEqual([
    { method: 'GET', aborted: true },
    { method: 'GET', aborted: true },
  ]);
  expect(await page.evaluate(() => MarkBridgeComponents.frameCount())).toBe(0);
});

test('late iframe load callbacks cannot initialize or kill a replacement preview', async ({
  page,
}) => {
  await load(page);
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.frameLocator('iframe').locator('#status')).toHaveText('Ready');
  await page.locator('iframe').evaluate((frame) => {
    window.oldComponentLoad = frame.onload;
  });
  await page.getByRole('button', { name: '关闭交互预览' }).click();
  await page.getByRole('button', { name: '启动交互演示' }).click();
  await expect(page.frameLocator('iframe').locator('#status')).toHaveText('Ready');
  const initial = await page.frameLocator('iframe').locator('#init').textContent();
  await page.evaluate(() => {
    oldComponentLoad();
    oldComponentLoad();
  });
  await expect(page.locator('iframe')).toHaveCount(1);
  await expect(page.frameLocator('iframe').locator('#init')).toHaveText(initial);
  await expect(page.frameLocator('iframe').locator('#status')).toHaveText('Ready');
  // A second load of the current frame still signals unauthorized navigation.
  await page.locator('iframe').evaluate((frame) => frame.onload());
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.locator('[role=status]')).toContainText('未授权导航');
});

test('activity controls follow all direct prompt and option bodies when role order differs from DOM order', async ({
  page,
}) => {
  await load(page);
  await page.evaluate(() => {
    const node = document.getElementById('demo-0'),
      config = JSON.parse(node.dataset.mbbTeachingConfig);
    config.activity = {
      schema: 1,
      prompt: 'question',
      options: [
        { key: 'c', target: 'option-c' },
        { key: 'b', target: 'option-b' },
        { key: 'a', target: 'option-a' },
      ],
      hints: ['hint'],
      feedback: { correct: 'yes', incorrect: 'no' },
      explanation: 'solution',
    };
    config.provider.activityVersion = 1;
    node.innerHTML =
      '<div class="mbb-teaching-body">' +
      ['question', 'option-a', 'option-b', 'option-c', 'hint', 'yes', 'no', 'solution']
        .map((id) => '<section id="' + id + '"><p>' + id + '</p></section>')
        .join('') +
      '</div>';
    node.dataset.mbbTeachingConfig = JSON.stringify(config);
    MarkBridgeComponents.scan();
  });
  const controls = page.locator('#demo-0 > .mbb-teaching-body > .mbb-component-controls');
  await expect(controls).toBeVisible();
  expect(await controls.evaluate((n) => n.previousElementSibling.id)).toBe('option-c');
  expect(await controls.evaluate((n) => n.nextElementSibling.id)).toBe('hint');
  expect(
    await page
      .locator('#demo-0 > .mbb-teaching-body > section')
      .evaluateAll((list) => list.map((n) => n.id)),
  ).toEqual(['question', 'option-a', 'option-b', 'option-c', 'hint', 'yes', 'no', 'solution']);
});
