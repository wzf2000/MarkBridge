// Real core editor, modeled export REST; actual HTTP/WordPress is separately guarded.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const crypto = require('node:crypto');
const raw = '---\nmarkbridge: 1\ntitle: "Raw proposal"\n---\n\n```js\r\na\r\nb\r\n```\n';
const token = 'c'.repeat(64),
  receipt = 'd'.repeat(64),
  expected = 'a'.repeat(64);
let errors;
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(async () => {
  expect(errors).toEqual([]);
});
async function fixture(
  page,
  { plain = false, delayed = false, changed = false, unavailable = false } = {},
) {
  const requests = [],
    cancelled = [];
  let release = null;
  await page.route('**/*', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const path = url.searchParams.get('rest_route') || url.pathname;
    if (!path.startsWith('/mbb/v1/export') && !path.startsWith('/wp-json/mbb/v1/export'))
      return route.continue();
    requests.push({
      path,
      post: url.searchParams.get('post_id'),
      method: request.method(),
      data: request.postDataJSON(),
    });
    const reply = (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path.endsWith('/context'))
      return reply({ schema: 1, post_id: 12, expected, documentId: 'EXPORT' });
    if (request.method() === 'DELETE') {
      cancelled.push(token);
      return reply({ schema: 1, cancelled: true });
    }
    if (path.endsWith('/prepare')) {
      const chosen = request.postDataJSON().format;
      if (delayed)
        await new Promise((resolve) => {
          release = resolve;
        });
      return reply({
        schema: 1,
        format: chosen,
        token,
        receipt,
        expiresAt: Math.floor(Date.now() / 1000) + 900,
        document: {
          bytes: Buffer.byteLength(raw),
          sha256: crypto.createHash('sha256').update(raw).digest('hex'),
        },
        resources:
          chosen === 'zip'
            ? [{ path: 'images/' + '1'.repeat(64) + '.png', bytes: 100, mime: 'image/png' }]
            : [],
        retainedImages:
          chosen === 'zip'
            ? [{ url: 'https://external.invalid/a.png', reason: '未关联图片保留原 URL，不抓取' }]
            : [],
        projectedSource: raw,
        changes: [],
      });
    }
    if (path.endsWith('/download')) {
      if (changed)
        return reply({ code: 'export_conflict', message: '已保存文章已变化，请重新准备导出' }, 409);
      return route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=UTF-8',
          'Content-Disposition': 'attachment; filename="markbridge-EXPORT.md"',
          'Cache-Control': 'private, no-store',
        },
        body: Buffer.from(raw),
      });
    }
    return reply({ code: 'unknown' }, 404);
  });
  await page.goto('/recovery-editor');
  await page.waitForFunction(
    () => !!window.MarkBridgeExport && !!document.querySelector('#mbb-export-open'),
  );
  await page.evaluate(
    ({ plain, unavailable }) => {
      MBB_EDITOR.root = plain
        ? location.origin + '/index.php?rest_route=/mbb/v1'
        : location.origin + '/wp-json/mbb/v1';
      MBB_EDITOR.exports = { zipAvailable: !unavailable };
      window.nativeDirty = true;
      wp.data.dispatch('core/editor').editPost({ title: 'UNSAVED TITLE' });
    },
    { plain, unavailable },
  );
  await page.locator('#mbb-more > summary').click();
  return { requests, cancelled, release: () => release?.() };
}
test('exact Markdown download and both REST URL forms leave unsaved native input untouched', async ({
  page,
}) => {
  for (const plain of [false, true]) {
    const model = await fixture(page, { plain });
    await page.locator('#mbb-export-open').click();
    await expect(page.locator('#mbb-export-preview')).toBeEnabled();
    await page.locator('#mbb-export-preview').click();
    await expect(page.locator('#mbb-export-confirm')).toBeEnabled();
    expect(model.requests[0].path.endsWith('/export/context')).toBe(true);
    expect(model.requests[0].post).toBe('12');
    expect(model.requests.find((r) => r.path.endsWith('/prepare')).data).toEqual({
      schema: 1,
      post_id: 12,
      expected,
      format: 'markdown',
    });
    const downloaded = page.waitForEvent('download');
    await page.locator('#mbb-export-confirm').click();
    const download = await downloaded;
    expect(fs.readFileSync(await download.path())).toEqual(Buffer.from(raw));
    expect(await page.evaluate(() => recoveryFields.title)).toBe('UNSAVED TITLE');
    expect(model.requests.some((r) => r.path.endsWith('/save'))).toBe(false);
    await page.locator('#mbb-export-cancel').click();
    await page.unrouteAll({ behavior: 'wait' });
  }
});
test('ZIP resource projection shows retained URLs, repreview and cancellation clean only this candidate', async ({
  page,
}) => {
  const model = await fixture(page);
  await page.locator('#mbb-export-open').click();
  await expect(page.locator('#mbb-export-preview')).toBeEnabled();
  await page.locator('#mbb-export-format').selectOption('zip');
  await page.locator('#mbb-export-preview').click();
  await expect(page.locator('#mbb-export-confirm')).toBeEnabled();
  await expect(page.locator('#mbb-export-resources')).toContainText('不抓取');
  await page.locator('#mbb-export-format').selectOption('markdown');
  await expect(page.locator('#mbb-export-confirm')).toBeDisabled();
  await expect.poll(() => model.cancelled.length).toBe(1);
  await page.locator('#mbb-export-preview').click();
  await expect(page.locator('#mbb-export-confirm')).toBeEnabled();
  await page.locator('#mbb-export-cancel').click();
  await expect.poll(() => model.cancelled.length).toBe(2);
  expect(await page.evaluate(() => recoveryFields.title)).toBe('UNSAVED TITLE');
  const geometry = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
});
test('late preparation after close cannot revive or replace a newer target', async ({ page }) => {
  const model = await fixture(page, { delayed: true });
  await page.locator('#mbb-export-open').click();
  await expect(page.locator('#mbb-export-preview')).toBeEnabled();
  await page.locator('#mbb-export-preview').click();
  await expect.poll(() => model.requests.some((r) => r.path.endsWith('/prepare'))).toBe(true);
  await page.locator('#mbb-export-cancel').click();
  model.release();
  await expect.poll(() => model.cancelled.length).toBe(1);
  expect(await page.locator('#mbb-export-dialog').evaluate((node) => node.open)).toBe(false);
  expect(await page.evaluate(() => recoveryFields.title)).toBe('UNSAVED TITLE');
});
test('concurrent save rejection keeps edited text and requires renewed export confirmation', async ({
  page,
}) => {
  await fixture(page, { changed: true });
  await page.locator('#mbb-export-open').click();
  await expect(page.locator('#mbb-export-preview')).toBeEnabled();
  await page.locator('#mbb-export-preview').click();
  await expect(page.locator('#mbb-export-confirm')).toBeEnabled();
  await page.locator('#mbb-export-confirm').click();
  await expect(page.locator('#mbb-export-dialog > p[role=status]')).toContainText('已变化');
  await expect(page.locator('#mbb-export-confirm')).toBeDisabled();
  expect(await page.evaluate(() => recoveryFields.title)).toBe('UNSAVED TITLE');
});

test('explicit recovery clears the compact toolbar through expansion and viewport changes', async ({
  page,
}) => {
  await fixture(page);
  await expect(page.locator('#mbb-local-recovery')).toBeHidden();
  await page.locator('#mbb-recovery-open').click();
  await expect(page.locator('#mbb-local-recovery')).toBeVisible();
  const separated = () =>
    page.evaluate(() => {
      const bar = document.querySelector('#mbb-toolbar').getBoundingClientRect();
      const panel = document.querySelector('#mbb-local-recovery').getBoundingClientRect();
      const button = document.querySelector('#mbb-markdown').getBoundingClientRect();
      const hit = document.elementFromPoint(
        button.x + button.width / 2,
        button.y + button.height / 2,
      );
      return (
        panel.bottom <= bar.top - 7 && panel.top >= 0 && Boolean(hit?.closest('#mbb-markdown'))
      );
    });
  // Narrow the real toolbar to reproduce actual mobile rows; no pointer-event override.
  await page.locator('#mbb-toolbar').evaluate((node) => {
    node.style.width = Math.min(300, innerWidth - 24) + 'px';
  });
  await expect.poll(separated).toBe(true);
  await expect(page.locator('#mbb-local-recovery')).toHaveAttribute('open', '');
  await expect.poll(separated).toBe(true);
  const original = page.viewportSize();
  await page.setViewportSize({ width: Math.min(original.width, 390), height: 650 });
  await expect.poll(separated).toBe(true);
  await page.locator('#mbb-markdown').evaluate((node) => {
    node.style.paddingBlock = '20px';
  });
  await expect.poll(separated).toBe(true);
  await page.locator('#mbb-local-recovery summary').click();
  await expect(page.locator('#mbb-local-recovery')).toBeHidden();
  await page.locator('#mbb-more > summary').click();
  await page.locator('#mbb-export-open').click();
  await expect(page.locator('#mbb-export-dialog')).toBeVisible();
  await page.locator('#mbb-export-cancel').click();
});

test('new-post header button does not displace recovery while mobile floating button is cleared', async ({
  page,
}) => {
  await page.goto('/wp-admin/post-new.php?new=1&header=1');
  await expect(page.locator('#mbb-new-post')).toBeVisible();
  await expect(page.locator('#mbb-local-recovery')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const panel = document.querySelector('#mbb-local-recovery').getBoundingClientRect();
        const button = document.querySelector('#mbb-new-post');
        const control = button.getBoundingClientRect();
        const floating = getComputedStyle(button).position === 'fixed';
        return (
          panel.top >= innerHeight / 2 &&
          panel.bottom <= innerHeight &&
          (floating ? panel.bottom <= control.top - 7 : panel.bottom >= innerHeight - 24)
        );
      }),
    )
    .toBe(true);
  // Click through the actual header layout; no force or pointer-event override.
  await page.locator('#mbb-local-recovery summary').click();
  await expect(page.locator('#mbb-local-recovery')).toHaveAttribute('open', '');
  expect(
    await page.locator('#mbb-local-recovery').evaluate((node) => node.getBoundingClientRect().top),
  ).toBeGreaterThanOrEqual(0);
  await page.locator('#mbb-local-recovery summary').click();
  await expect(page.locator('#mbb-local-recovery')).not.toHaveAttribute('open', '');
});
