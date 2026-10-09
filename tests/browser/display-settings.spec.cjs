const { test, expect } = require('@playwright/test');

test('disabled formula reader keeps front-end typesetting and source intact', async ({
  page,
}, testInfo) => {
  await page.goto('/front?reader=off');
  const formula = page.locator('#inline-line .mbb-math');
  await expect(formula.locator('mjx-container')).toBeVisible();
  await expect(formula).not.toHaveClass(/mbb-math-readable/);
  await expect(formula).not.toHaveAttribute('role', 'button');
  await expect(formula).toHaveAttribute('data-mbb-tex', 'x^2+y^2=z^2');
  await formula.click();
  await expect(page.locator('dialog.mbb-math-reader')).toHaveCount(0);
  await expect(page.locator('pre.wp-block-mbb-math mjx-container')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('reader-disabled.png') });
});

test('code tools default on, and disabled tools retain highlighting and language', async ({
  page,
}, testInfo) => {
  await page.goto('/front');
  await expect(page.locator('pre.wp-block-mbb-code .line-numbers-rows > span')).toHaveCount(120);
  await expect(page.getByRole('button', { name: 'Copy', exact: true })).toBeVisible();
  const original = await page.locator('#long-code').textContent();
  await page.goto('/front?code=off');
  await expect(page.locator('pre.wp-block-mbb-code .token.keyword').first()).toBeVisible();
  await expect(page.locator('.line-numbers-rows')).toHaveCount(0);
  await expect(page.locator('.toolbar-item button')).toHaveCount(0);
  await expect(page.locator('.toolbar-item').first()).toBeVisible();
  await expect(page.locator('#long-code')).toHaveText(original);
  expect(
    await page
      .locator('pre.wp-block-mbb-code')
      .evaluate((node) => parseFloat(getComputedStyle(node).paddingLeft)),
  ).toBeLessThan(70);
  await page.screenshot({ path: testInfo.outputPath('code-tools-disabled.png') });
});

test('source font setting changes only the Markdown input, preserving preview and draft', async ({
  page,
}, testInfo) => {
  await page.route('**/wp-json/mbb/v1/preview', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        before: '',
        document: { source: 'Before $x<3$.' },
        html: '<p>Before <span class="mbb-math" data-mbb-tex="x&lt;3">$x&lt;3$</span>.</p>',
      }),
    }),
  );
  await page.goto('/editor');
  expect(await page.evaluate(() => window.MBB_EDITOR.sourceFontSize)).toBe('14');
  await page.locator('#mbb-new').click();
  await expect(page.locator('#mbb-source')).toHaveCSS('font-size', '14px');
  await page.goto('/editor?sourceFontSize=18');
  expect(await page.evaluate(() => window.MBB_EDITOR.sourceFontSize)).toBe('18');
  await page.locator('#mbb-new').click();
  const source = page.locator('#mbb-source');
  await expect(source).toHaveCSS('font-size', '18px');
  await source.fill('Before $x<3$.');
  await page.getByLabel('标题', { exact: true }).fill('Display fixture');
  await page.getByLabel('稳定文档 ID', { exact: true }).fill('display-fixture');
  await page.locator('#mbb-review').click();
  await expect(
    page.frameLocator('iframe[title="内置内容预览"]').locator('mjx-container'),
  ).toBeVisible();
  await expect(source).toHaveValue('Before $x<3$.');
  await expect(page.locator('#mbb-save')).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('source-font-18.png') });
});
