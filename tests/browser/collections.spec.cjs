const { test, expect } = require('@playwright/test');
const bid = 'B_' + 'a'.repeat(32),
  token = 'b'.repeat(64),
  receipt = 'c'.repeat(64);
for (const plain of [false, true])
  test(`collection reference configuration, readable reopen titles, scope and late prepare (${plain ? 'plain' : 'pretty'} routes)`, async ({
    page,
  }, info) => {
    await page.setViewportSize(
      info.project.name.startsWith('mobile')
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
    );
    let revision = null,
      stored = null,
      hold = null,
      cancelled = 0,
      posted = null;
    const summary = (c) =>
      c.chapters.map((ch) => ({
        key: ch.key,
        state: 'available',
        title: ch.post_id === 12 ? 'First: equations and code' : 'Second: same local labels',
        status: 'publish',
      }));
    await page.route(
      (url) =>
        url.pathname.startsWith('/wp-json/mbb/v1/collections') ||
        (url.pathname === '/index.php' &&
          (url.searchParams.get('rest_route') || '').startsWith('/mbb/v1/collections')),
      async (route) => {
        const u = new URL(route.request().url()),
          path = (u.searchParams.get('rest_route') || u.pathname).split('/collections')[1] || '',
          method = route.request().method();
        const body = route.request().postDataJSON();
        let response = {};
        if (path === '/search')
          response = {
            items: [
              { post_id: 12, title: 'First: equations and code', status: 'publish' },
              { post_id: 13, title: 'Second: same local labels', status: 'publish' },
            ],
            nextPage: null,
          };
        else if (path === '' && method === 'GET')
          response = {
            schema: 1,
            revision,
            items: stored
              ? [{ id: bid, title: stored.title, chapters: stored.chapters.length }]
              : [],
            limits: {},
            adapters: {},
          };
        else if (path === '' && method === 'POST') {
          posted = body;
          stored = body.config;
          revision = 'd'.repeat(64);
          response = {
            schema: 1,
            collection_id: bid,
            revision,
            config: stored,
            chapterSummaries: summary(stored),
          };
        } else if (path === '/' + bid && method === 'GET')
          response = {
            schema: 1,
            collection_id: bid,
            revision,
            config: stored,
            chapterSummaries: summary(stored),
          };
        else if (path === '/prepare') {
          if (hold) await hold;
          response = {
            schema: 1,
            token,
            receipt,
            expires: 2000000000,
            snapshot_sha256: 'e'.repeat(64),
            artifact: {
              bytes: 100,
              sha256: 'f'.repeat(64),
              extension: 'zip',
              mime: 'application/zip',
            },
            scope: summary(stored).map((s) => ({
              key: s.key,
              title: s.title,
              scope: 'public',
              documentId: 'MODEL',
            })),
            resourceCount: 1,
            resourceBytes: 1024,
          };
        } else if (path === '/jobs/' + token && method === 'DELETE') {
          cancelled++;
          response = { cancelled: true };
        } else if (path.endsWith('/confirm'))
          response = { confirmed: true, snapshot_sha256: 'e'.repeat(64) };
        else if (path.endsWith('/download'))
          return route.fulfill({ body: 'synthetic zip bytes', contentType: 'application/zip' });
        return route.fulfill({ json: response });
      },
    );
    await page.goto('/collections-editor?locale=en_US' + (plain ? '&plain=1' : ''));
    await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Add article' }).first()).toBeEnabled();
    await page.getByRole('button', { name: 'Add article' }).first().click();
    await page.getByRole('button', { name: 'Add article' }).nth(1).click();
    await page.getByLabel('Collection title', { exact: true }).fill('A small technical collection');
    await page.getByRole('button', { name: 'Save collection configuration' }).click();
    await expect(page.getByRole('button', { name: 'Prepare snapshot' })).toBeEnabled();
    expect(posted.config.chapters).toHaveLength(2);
    expect(Object.keys(posted.config).sort()).toEqual(
      ['schema', 'title', 'lang', 'rights', 'cover', 'privateOptIn', 'chapters'].sort(),
    );
    await page.getByLabel('Saved collections', { exact: true }).selectOption('');
    await page.getByLabel('Saved collections', { exact: true }).selectOption(bid);
    await expect(page.locator('.mbbc-selected li').first()).toContainText(
      'First: equations and code',
    );
    await expect(page.locator('.mbbc-selected')).not.toContainText('Article 12');
    await page.getByRole('button', { name: 'Move down' }).first().click();
    await expect(page.locator('.mbbc-selected li').first()).toContainText(
      'Second: same local labels',
    );
    await page.getByRole('button', { name: 'Save collection configuration' }).click();
    await page.getByRole('button', { name: 'Prepare snapshot' }).click();
    await expect(page.getByRole('heading', { name: 'Check the snapshot scope' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download snapshot ZIP' })).toBeDisabled();
    await expect(page.locator('body')).not.toHaveJSProperty('scrollWidth', 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath('collection-scope.png'), fullPage: true });
    await page.getByRole('button', { name: 'Confirm this snapshot' }).click();
    await expect(page.getByRole('button', { name: 'Download snapshot ZIP' })).toBeEnabled();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download snapshot ZIP' }).click();
    await download;
    await expect(page.getByRole('button', { name: 'Prepare snapshot' })).toBeEnabled();
    let release;
    hold = new Promise((resolve) => {
      release = resolve;
    });
    await page.getByRole('button', { name: 'Prepare snapshot' }).click();
    await page.getByLabel('Collection title', { exact: true }).fill('New local unsaved title');
    release();
    hold = null;
    await expect.poll(() => cancelled).toBeGreaterThan(0);
    await expect(page.getByLabel('Collection title', { exact: true })).toHaveValue(
      'New local unsaved title',
    );
    await expect(page.getByRole('button', { name: 'Prepare snapshot' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Save collection configuration' })).toBeEnabled();
  });

test('publication arrangement is explicit and preserves metadata during cancelled and late preparation', async ({
  page,
}, info) => {
  let stored = null,
    posted = null,
    revision = null,
    release = null,
    waiting = false,
    cancelled = 0;
  const summary = (config) =>
    config.chapters.map((c) => ({
      key: c.key,
      title: 'Article ' + c.post_id,
      status: 'publish',
      state: 'available',
      state: 'available',
    }));
  await page.route(
    (url) => url.pathname.startsWith('/wp-json/mbb/v1/collections'),
    async (route) => {
      const path = new URL(route.request().url()).pathname.split('/collections')[1] || '',
        method = route.request().method(),
        body = route.request().postDataJSON();
      if (path === '' && method === 'GET')
        return route.fulfill({
          json: {
            items: [],
            revision,
            collectionSchemas: [1, 2],
            adapters: {
              'snapshot-v1': { title: 'Snapshot ZIP', collectionSchemas: [1, 2] },
              legacy: { title: 'Old Publisher', collectionSchemas: [1] },
            },
          },
        });
      if (path === '/search')
        return route.fulfill({
          json: {
            items: [
              { post_id: 12, title: 'First saved article', status: 'publish' },
              { post_id: 13, title: 'Second saved article', status: 'publish' },
            ],
            nextPage: null,
          },
        });
      if (path === '' && method === 'POST') {
        posted = body;
        stored = body.config;
        revision = 'd'.repeat(64);
        return route.fulfill({
          json: { collection_id: bid, revision, config: stored, chapterSummaries: summary(stored) },
        });
      }
      if (path === '/prepare') {
        if (waiting)
          await new Promise((resolve) => {
            release = resolve;
          });
        return route.fulfill({
          json: {
            token,
            receipt,
            adapter: 'snapshot-v1',
            snapshot_sha256: 'e'.repeat(64),
            artifact: {
              bytes: 10,
              sha256: 'f'.repeat(64),
              extension: 'zip',
              mime: 'application/zip',
            },
            scope: summary(stored).map((c) => ({ ...c, scope: 'public' })),
            resourceCount: 0,
            resourceBytes: 0,
          },
        });
      }
      if (method === 'DELETE') {
        cancelled++;
        return route.fulfill({ json: { cancelled: true } });
      }
      return route.fulfill({ json: {} });
    },
  );
  await page.goto('/collections-editor?locale=en_US');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: 'Add article', exact: true }).first().click();
  await page.getByRole('button', { name: 'Add article', exact: true }).nth(1).click();
  await page.getByLabel('Collection title', { exact: true }).fill('Publication arrangement');
  await page.getByLabel('Export format', { exact: true }).selectOption('legacy');
  await page.getByRole('button', { name: 'Save collection configuration', exact: true }).click();
  await expect.poll(() => posted?.config.schema).toBe(1);
  expect(posted.config).not.toHaveProperty('authors');
  await page.getByRole('button', { name: 'Adopt publication arrangement', exact: true }).click();
  await page
    .getByLabel('Authors (one per line, up to 8)', { exact: true })
    .fill('作者甲\nAuthor B');
  await page.getByLabel('Edition', { exact: true }).fill('第二版');
  await page.getByLabel('Version statement', { exact: true }).fill('Reviewed 2026');
  await page.getByLabel('Chapter role', { exact: true }).first().selectOption('preface');
  await page.getByLabel('Chapter role', { exact: true }).nth(1).selectOption('appendix');
  await page.getByLabel('Object numbering', { exact: true }).selectOption('chapter');
  await page.getByRole('button', { name: 'Undo publication arrangement', exact: true }).click();
  await page.getByRole('button', { name: 'Adopt publication arrangement', exact: true }).click();
  await expect(page.getByLabel('Authors (one per line, up to 8)', { exact: true })).toHaveValue(
    '作者甲\nAuthor B',
  );
  await expect(page.getByLabel('Edition', { exact: true })).toHaveValue('第二版');
  await expect(page.getByLabel('Chapter role', { exact: true }).first()).toHaveValue('preface');
  await expect(page.getByLabel('Object numbering', { exact: true })).toHaveValue('chapter');

  await page.getByRole('button', { name: 'Save collection configuration', exact: true }).click();
  await expect.poll(() => posted?.config.schema).toBe(2);
  expect(posted.config.authors).toEqual(['作者甲', 'Author B']);
  expect(posted.config.chapters.map((c) => c.role)).toEqual(['preface', 'appendix']);
  await expect(page.getByRole('button', { name: 'Prepare snapshot', exact: true })).toBeDisabled();
  await expect(
    page.getByText(
      'This publication adapter does not support this collection schema. Select a compatible format.',
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByLabel('Export format', { exact: true }).selectOption('snapshot-v1');
  waiting = true;
  await page.getByRole('button', { name: 'Prepare snapshot', exact: true }).click();
  await expect.poll(() => typeof release).toBe('function');
  await page.getByLabel('Edition', { exact: true }).fill('第三版（未保存）');
  release();
  waiting = false;
  await expect.poll(() => cancelled).toBeGreaterThan(0);
  await expect(page.getByLabel('Edition', { exact: true })).toHaveValue('第三版（未保存）');
  await expect(page.getByLabel('Authors (one per line, up to 8)', { exact: true })).toHaveValue(
    '作者甲\nAuthor B',
  );
  await page.getByRole('button', { name: 'Save collection configuration', exact: true }).click();
  await expect.poll(() => posted?.config.edition).toBe('第三版（未保存）');
  await page.getByRole('button', { name: 'Prepare snapshot', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Check the snapshot scope', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cancel snapshot', exact: true }).click();
  await expect(page.getByLabel('Edition', { exact: true })).toHaveValue('第三版（未保存）');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('publication-arrangement.png'), fullPage: true });
});
