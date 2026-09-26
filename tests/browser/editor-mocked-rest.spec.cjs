const fs = require('node:fs/promises');
const { test, expect } = require('@playwright/test');

// These browser interactions exercise the built editor asset. REST replies are fixture data,
// so they do not claim WordPress permission, conversion, or serialization coverage.
const state = (source, overrides = {}) => ({
  post_id: 12,
  source_managed: false,
  title: 'Fixture document',
  post_status: 'draft',
  featured_media: 0,
  expected: 'version-one',
  editor_url: '/editor',
  document: { schema: 1, documentId: 'fixture-12', source, serialized: '' },
  ...overrides,
});
const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

test('mock REST: a 20k-line review exposes dispersed hunks and bounded expansion', async ({
  page,
}, testInfo) => {
  const oldLines = Array.from({ length: 20_000 }, (_, i) => `paragraph ${i} unique text`);
  const newLines = [...oldLines];
  for (let i = 200; i < 15_200; i += 600) newLines[i] = `edited paragraph ${i}`;
  for (let i = 18_000; i < 18_260; i++) newLines[i] = 'repeated replacement';
  const before = oldLines.join('\n'),
    after = newLines.join('\n');
  await page.route('**/wp-json/mbb/v1/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/document')) return json(route, state(before));
    if (url.pathname.endsWith('/preview'))
      return json(route, { before, document: { source: after }, html: '<p>preview</p>' });
    return json(route, { message: 'unexpected fixture route' }, 500);
  });
  await page.goto('/editor');
  await page.getByRole('button', { name: '编辑现有文档' }).click();
  await expect
    .poll(() => page.locator('#mbb-source').evaluate((node) => node.value.length))
    .toBe(before.length);
  await page.evaluate((value) => {
    const input = document.querySelector('#mbb-source');
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, after);
  await page.locator('#mbb-review').click();
  const diff = page.getByRole('region', { name: '修改差异' });
  await expect(diff.locator('.mbb-diff-hunk')).toHaveCount(20);
  expect(await diff.locator('.mbb-diff-row').count()).toBeLessThan(4_000);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
  await expect(diff.locator('.mbb-diff-more-hunks')).toBeVisible();
  await diff.locator('.mbb-diff-more-hunks').click();
  await expect(diff.locator('.mbb-diff-hunk')).toHaveCount(26);
  const large = diff.locator('.mbb-diff-hunk').last();
  await expect(large.locator('.mbb-diff-row').first()).toContainText('paragraph 17997');
  await expect(large.locator('.mbb-diff-more')).toBeVisible();
  await large.locator('.mbb-diff-more').click();
  expect(await large.locator('.mbb-diff-row').count()).toBeGreaterThan(200);
  await expect(page.locator('#mbb-save')).toBeEnabled();
  expect(
    await diff
      .locator('.mbb-diff-number')
      .evaluateAll((numbers) =>
        numbers.every((number) => number.scrollWidth <= number.clientWidth + 1),
      ),
  ).toBe(true);
  if (process.env.MARKBRIDGE_REVIEW_SHOTS) {
    await page.locator('#mbb-dialog').evaluate((dialog) => {
      dialog.scrollTop = 0;
    });
    await page.screenshot({ path: `test-results/review-top-${testInfo.project.name}.png` });
  }
});

test('mock REST: save conflict retains and downloads candidate, then requires new preview', async ({
  page,
}, testInfo) => {
  const writes = [];
  let documentReads = 0;
  await page.route('**/wp-json/mbb/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/document')) {
      documentReads++;
      return json(
        route,
        state(documentReads === 1 ? 'original' : 'server revised', {
          expected: documentReads === 1 ? 'version-one' : 'version-two',
        }),
      );
    }
    if (pathname.endsWith('/preview')) {
      const body = route.request().postDataJSON();
      writes.push({ route: 'preview', body });
      return json(route, {
        before: body.expected === 'version-one' ? 'original' : 'server revised',
        document: { source: body.source },
        html: '<p>preview</p>',
      });
    }
    if (pathname.endsWith('/save')) {
      const body = route.request().postDataJSON();
      writes.push({ route: 'save', body });
      if (body.expected === 'version-one')
        return json(route, { code: 'conflict', message: 'Version changed' }, 409);
      return json(route, { editor_url: '/editor?done=1', noop: false });
    }
    return json(route, { message: 'unexpected fixture route' }, 500);
  });
  await page.goto('/editor');
  await page.getByRole('button', { name: '编辑现有文档' }).click();
  await page.locator('#mbb-source').fill('my candidate');
  await page.locator('#mbb-review').click();
  await expect(page.locator('#mbb-save')).toBeEnabled();
  await page.locator('#mbb-save').click();
  await expect(page.locator('#mbb-conflict')).toBeVisible();
  if (process.env.MARKBRIDGE_REVIEW_SHOTS) {
    await page.locator('#mbb-conflict').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/review-conflict-${testInfo.project.name}.png` });
  }
  await expect(page.locator('#mbb-save')).toBeDisabled();
  await expect(page.locator('#mbb-source')).toHaveValue('my candidate');
  await expect(page.locator('#mbb-conflict-adopt')).toBeEnabled();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#mbb-conflict-download').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('fixture-12.md');
  expect(await fs.readFile(await download.path(), 'utf8')).toBe('my candidate');
  await page.locator('#mbb-conflict-adopt').click();
  await expect(page.locator('#mbb-conflict')).toBeHidden();
  await expect(page.locator('#mbb-save')).toBeDisabled();
  await expect(page.locator('#mbb-source')).toHaveValue('my candidate');
  await page.locator('#mbb-review').click();
  await expect(page.locator('#mbb-save')).toBeEnabled();
  await page.locator('#mbb-save').click();
  await expect(page).toHaveURL(/done=1/);
  expect(writes.map((write) => [write.route, write.body.expected])).toEqual([
    ['preview', 'version-one'],
    ['save', 'version-one'],
    ['preview', 'version-two'],
    ['save', 'version-two'],
  ]);
});

test('mock REST: file conflict cannot adopt until both document and source refresh', async ({
  page,
}) => {
  let sourceReads = 0;
  const attempts = [];
  await page.route('**/wp-json/mbb/v1/**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/document'))
      return json(
        route,
        state('old saved copy', {
          source_managed: true,
          source_write_available: true,
          expected: sourceReads ? 'version-two' : 'version-one',
        }),
      );
    if (pathname.endsWith('/source')) {
      sourceReads++;
      if (sourceReads === 2) return json(route, { code: 'source_io', message: 'unavailable' }, 503);
      return json(route, {
        expected: sourceReads === 1 ? 'version-one' : 'version-two',
        source_sha256: sourceReads === 1 ? 'sha-one' : 'sha-two',
        source: sourceReads === 1 ? 'old source' : 'new source',
      });
    }
    if (pathname.endsWith('/preview')) {
      const body = route.request().postDataJSON();
      attempts.push({ route: 'preview', body });
      return json(route, {
        before: 'old source',
        document: { source: body.source },
        html: '<p>preview</p>',
      });
    }
    if (pathname.endsWith('/source-save')) {
      const body = route.request().postDataJSON();
      attempts.push({ route: 'source-save', body });
      return json(route, { code: 'source_conflict', message: 'Source changed' }, 409);
    }
    return json(route, { message: 'unexpected fixture route' }, 500);
  });
  await page.goto('/editor');
  await page.getByRole('button', { name: '编辑现有文档' }).click();
  await expect(page.locator('#mbb-source')).toHaveValue('old source');
  await page.locator('#mbb-source').fill('local source');
  await page.locator('#mbb-review').click();
  await page.locator('#mbb-save').click();
  await expect(page.locator('#mbb-conflict')).toBeVisible();
  await expect(page.locator('#mbb-conflict-adopt')).toBeDisabled();
  await expect(page.locator('#mbb-source')).toHaveValue('local source');
  await page.locator('#mbb-conflict-refresh').click();
  await expect(page.locator('#mbb-conflict-adopt')).toBeEnabled();
  await page.locator('#mbb-conflict-adopt').click();
  await expect(page.locator('#mbb-save')).toBeDisabled();
  await page.locator('#mbb-review').click();
  await expect(page.locator('#mbb-save')).toBeEnabled();
  expect(attempts.at(-1).body).toMatchObject({
    expected: 'version-two',
    source_sha256: 'sha-two',
    source: 'local source',
  });
});

test('mock REST: inconsistent source/document versions block adoption', async ({ page }) => {
  let sourceReads = 0;
  let documentReads = 0;
  await page.route('**/wp-json/mbb/v1/**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/document')) {
      documentReads++;
      return json(
        route,
        state('saved copy', {
          source_managed: true,
          source_write_available: true,
          expected: documentReads === 1 ? 'version-one' : 'version-two',
        }),
      );
    }
    if (pathname.endsWith('/source')) {
      sourceReads++;
      return json(route, {
        expected:
          sourceReads === 1 ? 'version-one' : sourceReads === 2 ? 'version-three' : 'version-two',
        source_sha256: `sha-${sourceReads}`,
        source: 'source text',
      });
    }
    if (pathname.endsWith('/preview'))
      return json(route, {
        before: 'source text',
        document: { source: 'local edit' },
        html: '<p>preview</p>',
      });
    if (pathname.endsWith('/source-save'))
      return json(route, { code: 'source_conflict', message: 'Source changed' }, 409);
    return json(route, { message: 'unexpected fixture route' }, 500);
  });
  await page.goto('/editor');
  await page.getByRole('button', { name: '编辑现有文档' }).click();
  await page.locator('#mbb-source').fill('local edit');
  await page.locator('#mbb-review').click();
  await page.locator('#mbb-save').click();
  await expect(page.locator('#mbb-conflict-adopt')).toBeDisabled();
  await expect(page.locator('#mbb-conflict')).toContainText('再次变化');
  await page.locator('#mbb-conflict-refresh').click();
  await expect(page.locator('#mbb-conflict-adopt')).toBeEnabled();
});

test('mock REST: rejected preview cannot save, and diff markup stays inert with correct line numbers', async ({
  page,
}) => {
  const payload = '<img src=x onerror="window.__diffExecuted=true">';
  let rejectPreview = true;
  let saves = 0;
  await page.route('**/wp-json/mbb/v1/**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/document')) return json(route, state('first\nold\nlast'));
    if (pathname.endsWith('/preview')) {
      if (rejectPreview)
        return json(route, { code: 'html_policy', message: 'Preview rejected' }, 422);
      return json(route, {
        before: 'first\nold\nlast',
        document: { source: `first\n${payload}\nlast` },
        html: '<p>safe preview</p>',
      });
    }
    if (pathname.endsWith('/save')) saves++;
    return json(route, { message: 'unexpected fixture route' }, 500);
  });
  await page.goto('/editor');
  await page.getByRole('button', { name: '编辑现有文档' }).click();
  await page.locator('#mbb-source').fill(`first\n${payload}\nlast`);
  await page.locator('#mbb-review').click();
  await expect(page.locator('#mbb-dialog [role="status"]').first()).toContainText(
    'Preview rejected',
  );
  await expect(page.locator('#mbb-save')).toBeDisabled();
  expect(saves).toBe(0);
  rejectPreview = false;
  await page.locator('#mbb-review').click();
  const removed = page.locator('[aria-label="修改差异"] .mbb-removed');
  const added = page.locator('[aria-label="修改差异"] .mbb-added');
  await expect(removed).toHaveCount(1);
  await expect(added).toHaveCount(1);
  await expect(removed.locator('.mbb-diff-number').first()).toHaveText('2');
  await expect(removed.locator('.mbb-diff-number').last()).toBeEmpty();
  await expect(added.locator('.mbb-diff-number').first()).toBeEmpty();
  await expect(added.locator('.mbb-diff-number').last()).toHaveText('2');
  await expect(added.locator('.mbb-diff-text')).toContainText(payload);
  expect(await page.evaluate(() => window.__diffExecuted)).toBeUndefined();
  expect(await page.locator('[aria-label="修改差异"] img').count()).toBe(0);
});

test('mock REST: a late preview cannot change a reopened editor session', async ({ page }) => {
  let documentReads = 0;
  let releasePreview;
  const previewStarted = new Promise((resolve) => {
    releasePreview = resolve;
  });
  let fulfillPreview;
  const pendingPreview = new Promise((resolve) => {
    fulfillPreview = resolve;
  });
  await page.route('**/wp-json/mbb/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/document')) {
      documentReads++;
      return json(route, state(documentReads === 1 ? 'first document' : 'fresh document'));
    }
    if (pathname.endsWith('/preview')) {
      releasePreview();
      await pendingPreview;
      return json(route, {
        before: 'first document',
        document: { source: 'stale candidate' },
        html: '<p>stale preview</p>',
      });
    }
    return json(route, { message: 'unexpected fixture route' }, 500);
  });
  await page.goto('/editor');
  await page.getByRole('button', { name: '编辑现有文档' }).click();
  await page.locator('#mbb-source').fill('stale candidate');
  await page.locator('#mbb-review').click();
  await previewStarted;
  await page.keyboard.press('Escape');
  await expect(page.locator('#mbb-dialog')).not.toHaveAttribute('open');
  await page.getByRole('button', { name: '编辑现有文档' }).click();
  await expect(page.locator('#mbb-source')).toHaveValue('fresh document');
  const staleResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith('/preview'),
  );
  fulfillPreview();
  await (await staleResponse).finished();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect(page.locator('#mbb-save')).toBeDisabled();
  await expect(page.locator('[aria-label="修改差异"] .mbb-diff-hunk')).toHaveCount(0);
  await expect(page.locator('#mbb-dialog [role="status"]').first()).not.toContainText('校验通过');
});
