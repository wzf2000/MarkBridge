const { test, expect } = require('@playwright/test');
test.skip(
  !process.env.MARKBRIDGE_TEST_RUNTIME,
  'Needs the sanitized real WordPress editor runtime.',
);
async function open(page, plain = false) {
  await page.route('**/component-editor*', async (route) => {
    const response = await route.fetch();
    const html = (await response.text()).replace(
      'const e = wp.element.createElement;',
      'window.MBBComponentCatalog=' +
        JSON.stringify({
          fingerprint: 'fixed-index',
          postId: 901,
          url: plain ? '/index.php?rest_route=/catalog-fixture/' : '/catalog-fixture/',
          defaults: { fixture: '0.1.0' },
        }) +
        ';const e = wp.element.createElement;',
    );
    await route.fulfill({ response, body: html });
  });
  await page.route('**/catalog-fixture/catalog?*', async (route) => {
    const query = new URL(route.request().url()).searchParams;
    const pageNo = Number(query.get('page'));
    const items = Array.from({ length: 40 }, (_, i) => ({
      id: 'fixture',
      version: '1.' + i + '.0',
      title: 'Indexed fixture',
      fingerprint: 'a'.repeat(64),
    }));
    await route.fulfill({
      json: {
        fingerprint: 'fixed-index',
        items: items.slice((pageNo - 1) * 20, pageNo * 20),
        page: pageNo,
        perPage: 20,
        total: 40,
        defaults: { fixture: '0.1.0' },
      },
    });
  });
  if (plain)
    await page.route('**/index.php?*', async (route) => {
      const url = new URL(route.request().url());
      const path = url.searchParams.get('rest_route');
      if (path === '/catalog-fixture/catalog') {
        const pageNo = Number(url.searchParams.get('page'));
        const items = Array.from({ length: 40 }, (_, i) => ({
          id: 'fixture',
          version: '1.' + i + '.0',
          title: 'Indexed fixture',
        }));
        await route.fulfill({
          json: {
            fingerprint: 'fixed-index',
            items: items.slice((pageNo - 1) * 20, pageNo * 20),
            page: pageNo,
            perPage: 20,
            total: 40,
            defaults: { fixture: '0.1.0' },
          },
        });
      } else if (path?.startsWith('/catalog-fixture/descriptor/fixture/')) {
        await route.fulfill({
          json: { fingerprint: 'fixed-index', provider: provider(path.split('/').at(-1)) },
        });
      } else await route.fulfill({ status: 404, body: 'Invalid REST route' });
    });
  await page.goto('/component-editor?locale=en_US');
  await expect(page.locator('iframe[name="editor-canvas"]')).toBeVisible();
  await page.evaluate(() =>
    taskRegistry.dispatch('core/block-editor').selectBlock(taskBlocks[0].clientId),
  );
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeEnabled();
}
function provider(version) {
  return {
    id: 'fixture',
    version,
    title: 'Indexed fixture',
    protocolVersion: 1,
    schema: {
      type: 'object',
      properties: {
        value: { type: 'integer', minimum: 0, maximum: 100 },
        behavior: { type: 'string' },
      },
      required: ['value', 'behavior'],
      additionalProperties: false,
    },
    defaults: { value: 10, behavior: 'complete' },
    budgets: {
      resourceBytes: 524288,
      startupMs: 5000,
      wallMs: 2000,
      traceFrames: 8192,
      traceBytes: 524288,
    },
    resource: { url: '/component-fixture.html', sha256: '0'.repeat(64) },
  };
}
test('paged exact selection resolves only the requested version and preserves a newer attribute edit', async ({
  page,
}) => {
  let release, started;
  const startedPromise = new Promise((resolve) => {
    started = resolve;
  });
  await page.route('**/catalog-fixture/descriptor/**', async (route) => {
    const version = new URL(route.request().url()).pathname.split('/').at(-1);
    if (version === '1.39.0') {
      started();
      await new Promise((resolve) => {
        release = resolve;
      });
    }
    await route.fulfill({ json: { fingerprint: 'fixed-index', provider: provider(version) } });
  });
  await open(page);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  const select = page.getByRole('combobox', { name: 'Registered teaching component', exact: true });
  await expect(select.locator('option[value="fixture@1.39.0"]')).toHaveCount(1);
  await select.selectOption('fixture@1.39.0');
  await startedPromise;
  await page.evaluate(() =>
    taskRegistry.dispatch('core/block-editor').updateBlockAttributes(taskBlocks[0].clientId, {
      params: { value: 77, behavior: 'complete' },
    }),
  );
  release();
  await expect(page.getByText('Loading component description…', { exact: true })).toHaveCount(0);
  const attrs = await page.evaluate(
    () => taskRegistry.select('core/block-editor').getBlock(taskBlocks[0].clientId).attributes,
  );
  expect(attrs.componentVersion).toBe('0.1.0');
  expect(attrs.params.value).toBe(77);
  await select.selectOption('fixture@1.38.0');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          taskRegistry.select('core/block-editor').getBlock(taskBlocks[0].clientId).attributes
            .componentVersion,
      ),
    )
    .toBe('1.38.0');
  expect(await page.evaluate(() => MBBComponents.length)).toBe(4); // two initial + only two selected exact versions
});

test('an existing legacy author resolves its fixed upgrade target and applies only after explicit confirmation', async ({
  page,
}, info) => {
  const requested = [];
  await page.route('**/catalog-fixture/descriptor/**', async (route) => {
    const version = new URL(route.request().url()).pathname.split('/').at(-1);
    requested.push(version);
    await route.fulfill({ json: { fingerprint: 'fixed-index', provider: provider(version) } });
  });
  await open(page);
  await page.evaluate(() => {
    MarkBridgeComponentAuthors.register({
      apiVersion: 1,
      component: 'fixture',
      componentVersion: '0.1.0',
      supports: () => true,
      upgrade: {
        componentVersion: '1.39.0',
        migrate: (params) => ({ ...params, value: params.value + 1 }),
      },
    });
    taskRegistry.dispatch('core/block-editor').updateBlockAttributes(taskBlocks[0].clientId, {
      params: { value: 42, behavior: 'complete' },
    });
  });
  const upgrade = page.getByRole('button', {
    name: 'Upgrade diagram to use the visual editor',
    exact: true,
  });
  await expect(upgrade).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        taskRegistry.select('core/block-editor').getBlock(taskBlocks[0].clientId).attributes
          .componentVersion,
    ),
  ).toBe('0.1.0');
  await upgrade.click();
  await expect(
    page.getByText('Unapplied component version change:', { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        taskRegistry.select('core/block-editor').getBlock(taskBlocks[0].clientId).attributes
          .componentVersion,
    ),
  ).toBe('0.1.0');
  await page.getByRole('button', { name: 'Apply parameters', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          taskRegistry.select('core/block-editor').getBlock(taskBlocks[0].clientId).attributes
            .componentVersion,
      ),
    )
    .toBe('1.39.0');
  expect(requested).toEqual(['1.39.0']);
  await page.screenshot({
    path: info.outputPath('indexed-upgrade-' + info.project.name + '.png'),
    fullPage: true,
  });
});

test('Plain WordPress REST URLs keep route and query parameters separate through page two and exact resolution', async ({
  page,
}) => {
  const urls = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/index.php') urls.push(new URL(r.url()));
  });
  await open(page, true);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  const select = page.getByRole('combobox', { name: 'Registered teaching component', exact: true });
  await expect(select.locator('option[value="fixture@1.38.0"]')).toHaveCount(1);
  await select.selectOption('fixture@1.38.0');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          taskRegistry.select('core/block-editor').getBlock(taskBlocks[0].clientId).attributes
            .componentVersion,
      ),
    )
    .toBe('1.38.0');
  expect(urls.map((u) => u.searchParams.get('rest_route'))).toContain(
    '/catalog-fixture/descriptor/fixture/1.38.0',
  );
  expect(
    urls.every(
      (u) =>
        !u.searchParams.get('rest_route').includes('?') && u.searchParams.get('post_id') === '901',
    ),
  ).toBe(true);
});

test('late activity template resolution preserves a changed template and source selection', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => {
    window.activityCalls = [];
    window.activityInserts = [];
    window.activitySelection = [0, 0];
    window.MarkBridgeComponentAuthors = {
      templates: () => [
        { component: 'a', componentVersion: '1.0.0' },
        { component: 'b', componentVersion: '1.0.0' },
      ],
    };
    window.MarkBridgeComponentCatalog = {
      scope: () => 'fixed',
      resolve: () =>
        new Promise((resolve) => {
          window.releaseActivity = resolve;
        }),
    };
    window.MBB = {
      ...window.MBB,
      createActivity: (...args) => {
        activityCalls.push(args);
        return [];
      },
    };
    const panel = MBBWritingTools.create({
      stamp: () => 'unchanged',
      selection: () => activitySelection,
      blocks: () => [],
      insert: (v) => activityInserts.push(v),
      select: () => {},
    });
    panel.id = 'late-activity-tools';
    panel.open = true;
    document.body.append(panel);
    panel.querySelector('.mbb-activity-insert').open = true;
  });
  const panel = page.locator('#late-activity-tools');
  const templates = panel.getByRole('combobox', { name: 'Activity template', exact: true });
  await expect(templates.locator('option')).toHaveCount(2);
  await panel.getByRole('button', { name: 'Insert activity', exact: true }).click();
  await templates.selectOption('b@1.0.0');
  await page.evaluate(() => releaseActivity());
  await page.waitForTimeout(30);
  expect(await page.evaluate(() => activityInserts.length)).toBe(0);
  await panel.getByRole('button', { name: 'Insert activity', exact: true }).click();
  await page.evaluate(() => {
    activitySelection = [1, 4];
    releaseActivity();
  });
  await page.waitForTimeout(30);
  expect(await page.evaluate(() => activityInserts.length)).toBe(0);
  expect(await page.evaluate(() => activityCalls.length)).toBe(0);
});

test('editing then undoing parameters still invalidates the earlier exact selection generation', async ({
  page,
}) => {
  let release, started;
  const began = new Promise((r) => {
    started = r;
  });
  await page.route('**/catalog-fixture/descriptor/**', async (route) => {
    started();
    await new Promise((r) => {
      release = r;
    });
    await route.fulfill({ json: { fingerprint: 'fixed-index', provider: provider('1.1.0') } });
  });
  await open(page);
  await page
    .getByRole('combobox', { name: 'Registered teaching component', exact: true })
    .selectOption('fixture@1.1.0');
  await began;
  const raw = page.getByRole('textbox', { name: 'Parameter JSON (data only)', exact: true });
  await page.evaluate(() =>
    taskRegistry.dispatch('core/block-editor').updateBlockAttributes(taskBlocks[0].clientId, {
      params: { value: 77, behavior: 'complete' },
    }),
  );
  await expect(raw).toHaveValue(JSON.stringify({ value: 77, behavior: 'complete' }, null, 2));
  await page.evaluate(() =>
    taskRegistry.dispatch('core/block-editor').updateBlockAttributes(taskBlocks[0].clientId, {
      params: { value: 42, behavior: 'complete' },
    }),
  );
  await expect(raw).toHaveValue(JSON.stringify({ value: 42, behavior: 'complete' }, null, 2));
  release();
  await expect(page.getByText('Loading component description…', { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        taskRegistry.select('core/block-editor').getBlock(taskBlocks[0].clientId).attributes
          .componentVersion,
    ),
  ).toBe('0.1.0');
});

test('late diagram example cannot overwrite a changed source selection or a changed wizard title', async ({
  page,
}) => {
  await page.goto('/navigation-editor?locale=en_US');
  await page.getByRole('button', { name: '编辑现有文档' }).click();
  await page.getByText('Find, replace and navigate', { exact: true }).click();
  await page.getByText('Insert a teaching structure', { exact: true }).click();
  const wizard = page.locator('.mbb-insert-example');
  await wizard.getByRole('combobox', { name: 'Structure', exact: true }).selectOption('diagram');
  await page.evaluate(() => {
    window.MarkBridgeComponentCatalog = {
      scope: () => 'fixed',
      resolveDefault: () =>
        new Promise((r) => {
          window.releaseExample = r;
        }),
    };
  });
  const source = page.locator('#mbb-source');
  const before = await source.inputValue();
  const insert = wizard.getByRole('button', { name: 'Insert example at selection', exact: true });
  await insert.click();
  await wizard.getByRole('textbox', { name: 'Title', exact: true }).fill('A changed title');
  await page.evaluate(() => releaseExample({ id: 'node-diagram', version: '0.2.0', defaults: {} }));
  await page.waitForTimeout(30);
  expect(await source.inputValue()).toBe(before);
  await insert.click();
  await source.evaluate((n) => n.setSelectionRange(1, 5));
  await page.evaluate(() => releaseExample({ id: 'node-diagram', version: '0.2.0', defaults: {} }));
  await page.waitForTimeout(30);
  expect(await source.inputValue()).toBe(before);
});

test('unapplied JSON edits followed by discard still invalidate an earlier exact selection', async ({
  page,
}) => {
  let release, started;
  const began = new Promise((r) => {
    started = r;
  });
  await page.route('**/catalog-fixture/descriptor/**', async (route) => {
    started();
    await new Promise((r) => {
      release = r;
    });
    await route.fulfill({ json: { fingerprint: 'fixed-index', provider: provider('1.1.0') } });
  });
  await open(page);
  await page
    .getByRole('combobox', { name: 'Registered teaching component', exact: true })
    .selectOption('fixture@1.1.0');
  await began;
  const raw = page.getByRole('textbox', { name: 'Parameter JSON (data only)', exact: true });
  await raw.fill(JSON.stringify({ value: 77, behavior: 'complete' }));
  await page.getByRole('button', { name: 'Discard parameter input', exact: true }).click();
  await expect(raw).toHaveValue(JSON.stringify({ value: 42, behavior: 'complete' }, null, 2));
  release();
  await expect(page.getByText('Loading component description…', { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        taskRegistry.select('core/block-editor').getBlock(taskBlocks[0].clientId).attributes
          .componentVersion,
    ),
  ).toBe('0.1.0');
});
