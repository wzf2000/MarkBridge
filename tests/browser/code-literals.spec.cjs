// Actual PHP core shortcode/token projection; synthetic HTML fixture, no WordPress DB.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs'),
  path = require('node:path');
const plugin = path.resolve(__dirname, '../../plugin');
test('literal shortcodes remain code through real Prism, tabs and clipboard', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const fixture = await (await page.request.get('/code-literals-fixture')).json();
  await page.goto('/health');
  const styles = [
    'teaching.css',
    'code-display.css',
    'vendor/prism/themes/prism.css',
    'vendor/prism/plugins/line-numbers/prism-line-numbers.css',
  ]
    .map((f) => fs.readFileSync(path.join(plugin, f), 'utf8'))
    .join('\n');
  await page.setContent(
    '<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:16px;font:16px/1.6 sans-serif}' +
      styles +
      '</style><article class="mbb-document">' +
      fixture.html +
      '</article>',
  );
  await page.addScriptTag({ url: '/fixture-localization.js?locale=zh_CN' });
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text) => (window.copied = text) },
    });
    window.Prism = { manual: true };
  });
  await page.addScriptTag({ path: path.join(plugin, 'teaching.js') });
  for (const file of [
    'prism.js',
    'plugins/line-numbers/prism-line-numbers.js',
    'plugins/toolbar/prism-toolbar.js',
    'plugins/copy-to-clipboard/prism-copy-to-clipboard.js',
    'plugins/autoloader/prism-autoloader.js',
  ])
    await page.addScriptTag({ path: path.join(plugin, 'vendor/prism', file) });
  await page.evaluate(() => {
    window.MBB_PRESENTATION = {
      codeLanguages: ['javascript', 'js', 'python'],
      codeStyles: [],
      codeScripts: [],
      lineNumbers: true,
      languages: '/wp-content/plugins/markdown-block-bridge/vendor/prism/components/',
      images: [],
    };
  });
  await page.addScriptTag({ path: path.join(plugin, 'presentation-loader.js') });
  await page.evaluate(() => Prism.highlightAll());
  await expect(page.locator('pre.wp-block-mbb-code .token.keyword').first()).toBeVisible();
  expect(await page.locator('pre.wp-block-mbb-code code').first().textContent()).toBe(fixture.code);
  await expect(page.locator('.shortcode-result')).toHaveCount(1);
  expect(await page.locator('p code').first().textContent()).toBe('[mbb_literal_fixture]');
  expect(await page.locator('pre.wp-block-preformatted').textContent()).toBe(
    '[mbb_literal_fixture]',
  );
  await page.getByRole('button', { name: '复制 JavaScript', exact: true }).click();
  expect(await page.evaluate(() => window.copied)).toBe(fixture.code);
  const ordinary = page.locator('pre.wp-block-mbb-code').first().locator('..');
  await ordinary.getByRole('button', { name: 'Copy', exact: true }).click();
  expect(await page.evaluate(() => window.copied)).toBe(fixture.code);
  await page.getByRole('tab', { name: 'Python', exact: true }).click();
  await expect(page.locator('#second')).toBeVisible();
  expect(await page.locator('#second code').textContent()).toContain('[mbb_literal_fixture]');
  expect(await page.locator('article').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: info.outputPath('code-literals.png'), fullPage: true });
  expect(errors).toEqual([]);
});
