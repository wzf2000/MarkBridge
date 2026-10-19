const { test, expect } = require('@playwright/test'),
  fs = require('node:fs'),
  path = require('node:path'),
  { execFileSync } = require('node:child_process'),
  { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..'),
  technicalCSS = fs.readFileSync(path.join(root, 'plugin/technical.css'), 'utf8'),
  css =
    fs.readFileSync(path.join(root, 'plugin/technical.css'), 'utf8') +
    '\n' +
    fs.readFileSync(path.join(root, 'plugin/static-export.css'), 'utf8');
const data = (locale) =>
  JSON.parse(
    execFileSync('php', [path.join(__dirname, 'proof-presentation.php'), locale], {
      encoding: 'utf8',
    }),
  );
test('proof bars contain only the locale number, retain authored title nodes in the body and use native keyboard folding', async ({
  page,
}, info) => {
  for (const locale of ['en_US', 'zh_CN']) {
    const d = data(locale);
    await page.goto('/health');
    await page.setContent(
      '<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:18px/1.75 system-ui;max-width:820px;padding:24px;margin:auto;box-sizing:border-box}' +
        technicalCSS +
        '</style>' +
        d.html,
    );
    for (let i = 0; i < 4; i++) {
      const bar = page.locator('#proof-example-' + i + ' > summary');
      await expect(bar).toHaveText((locale === 'zh_CN' ? '证明' : 'Proof ') + (i + 1) + '.');
      await expect(bar).toHaveCSS('font-weight', '600');
      await expect(bar.locator('.mbb-technical-number')).toHaveCSS('font-weight', '600');
      await expect(page.locator('#proof-body-' + i)).toBeHidden();
    }
    const title = page.locator('#named-title-child');
    await expect(title).toBeHidden();
    await page.locator('#proof-example-3 > summary').focus();
    await page.keyboard.press('Enter');
    await expect(title).toBeVisible();
    await expect(title).toHaveText('An induction argument');
    expect(await title.evaluate((n) => n.parentElement.parentElement.className)).toBe(
      'mbb-technical-body',
    );
    await expect(page.locator('#proof-body-3')).toBeVisible();
    await expect(page.locator('.mbb-xref a')).toHaveAttribute('href', '#proof-example-3');
    await expect(page.locator('.mbb-xref a')).toHaveText(locale === 'zh_CN' ? '证明 4' : 'Proof 4');
    for (const defaultTitle of ['Proof', '证明', '證明'])
      await expect(
        page.locator('.mbb-proof-default-title').filter({ hasText: defaultTitle }).first(),
      ).toBeHidden();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: info.outputPath('proof-' + locale + '-' + info.project.name + '.png'),
      fullPage: true,
    });
  }
});
test('proof static builder keeps the same title placement and references offline without scripts', async ({
  page,
  browser,
}, info) => {
  const d = data('zh_CN');
  await page.goto('/front?locale=en_US');
  await expect(page.locator('#inline-line mjx-container')).toBeVisible();
  const assets = JSON.parse(fs.readFileSync(path.join(root, 'plugin/assets.json')));
  await page.addScriptTag({ path: path.join(root, 'plugin', assets['static-export.js']) });
  const html = await page.evaluate(
    async ({ body, css }) =>
      (
        await MarkBridgeStaticExport.build({
          schema: 1,
          kind: 'markbridge-static',
          title: 'Proof reading',
          lang: 'zh-CN',
          body,
          css,
          images: [],
        })
      ).text(),
    { body: d.static, css },
  );
  expect(html).not.toMatch(/<script|<iframe/);
  const file = info.outputPath('proof-offline.html');
  fs.writeFileSync(file, html);
  const context = await browser.newContext({
      javaScriptEnabled: false,
      offline: true,
      viewport: info.project.use.viewport,
    }),
    p = await context.newPage();
  await p.goto(pathToFileURL(file).href);
  await expect(p.locator('#proof-body-3')).toBeVisible();
  await expect(p.locator('#named-title-child')).toBeVisible();
  for (let i = 0; i < 4; i++)
    await expect(p.locator('#proof-example-' + i + ' > summary')).toHaveText(
      '证明' + (i + 1) + '.',
    );
  await expect(p.locator('.mbb-proof-default-title')).toHaveCount(3);
  for (const n of await p.locator('.mbb-proof-default-title').all()) await expect(n).toBeHidden();
  // Default-title omission also remains stable if a static consumer removes its hidden attribute.
  await p
    .locator('.mbb-proof-default-title[hidden]')
    .evaluateAll((ns) => ns.forEach((n) => n.removeAttribute('hidden')));
  for (const n of await p.locator('.mbb-proof-default-title').all()) await expect(n).toBeHidden();
  await p.emulateMedia({ media: 'print' });
  await expect(p.locator('#named-title-child')).toBeVisible();
  await p.screenshot({
    path: info.outputPath('proof-static-' + info.project.name + '.png'),
    fullPage: true,
  });
  await context.close();
});
