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
