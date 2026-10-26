const { test, expect } = require('@playwright/test');
const cp = require('node:child_process');
const fs = require('node:fs');
test('article discovery selects into the existing bounded scope and ignores late responses', async ({
  page,
}, info) => {
  let release,
    started,
    requestCount = 0;
  const waiting = new Promise((resolve) => {
    started = resolve;
  });
  await page.route('**/wp-json/mbb/v1/extensions/articles*', async (route) => {
    requestCount++;
    const url = new URL(route.request().url());
    const q = url.searchParams.get('q');
    if (q === 'Late') {
      started();
      await new Promise((resolve) => {
        release = resolve;
      });
    }
    const items =
      q === 'New'
        ? [{ id: 51, title: 'New article', status: 'draft' }]
        : url.searchParams.has('cursor')
          ? [{ id: 43, title: 'Next article', status: 'draft' }]
          : [
              { id: 41, title: 'Legacy <article>', status: 'private' },
              { id: 42, title: 'Second article', status: 'draft' },
            ];
    await route.fulfill({
      json: {
        schema: 1,
        items,
        cursor: !url.searchParams.has('cursor') && q !== 'New' ? 'next' : null,
      },
    });
  });
  await page.goto('/health');
  await page.setContent(
    cp.execFileSync('php', ['tests/extensions-view.php'], { encoding: 'utf8' }),
  );
  await page.addStyleTag({
    content:
      'body{font-family:system-ui;margin:24px;background:#f0f0f1;color:#1d2327}main{max-width:960px;margin:auto}button,input{font:inherit}button{padding:6px 10px}' +
      fs.readFileSync('plugin/settings.css', 'utf8'),
  });
  await page.addScriptTag({ path: 'plugin/settings.js' });
  await page.getByText('Find articles by title', { exact: true }).click();
  const query = page.getByRole('searchbox', { name: 'Article title' });
  const ids = page.getByRole('textbox', { name: 'Article IDs (comma separated, up to 50)' });
  await query.fill('Legacy');
  await query.dispatchEvent('keydown', { key: 'Enter', isComposing: true, keyCode: 229 });
  expect(requestCount).toBe(0);
  await page.getByRole('button', { name: 'Search articles', exact: true }).click();
  await page
    .getByRole('checkbox', { name: 'Legacy <article> · #41 · Private', exact: true })
    .check();
  await expect(ids).toHaveValue('41');
  await ids.fill('99');
  await page.getByRole('checkbox', { name: 'Second article · #42 · Draft', exact: true }).check();
  await expect(ids).toHaveValue('99, 42');
  expect(await page.locator('body').evaluate((node) => node.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({
    path: info.outputPath('extension-article-discovery.png'),
    fullPage: true,
  });
  await page.locator('[data-mbb-search-next]').click();
  await page.getByRole('checkbox', { name: 'Next article · #43 · Draft', exact: true }).check();
  await expect(ids).toHaveValue('99, 42, 43');
  await query.fill('Late');
  await page.getByRole('button', { name: 'Search articles', exact: true }).click();
  await waiting;
  await query.fill('New');
  await page.getByRole('button', { name: 'Search articles', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'New article · #51 · Draft', exact: true }),
  ).toBeVisible();
  release();
  await expect(page.getByRole('checkbox', { name: /Legacy/ })).toHaveCount(0);
  await ids.fill(Array.from({ length: 50 }, (_, n) => n + 1).join(', '));
  await page.getByRole('checkbox', { name: 'New article · #51 · Draft', exact: true }).click();
  await expect(page.locator('[data-mbb-search-status]')).toHaveText('Choose up to 50 articles.');
  await expect(
    page.getByRole('checkbox', { name: 'New article · #51 · Draft', exact: true }),
  ).not.toBeChecked();
});
