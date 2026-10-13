// Actual public WordPress editor scripts with an explicitly injected synthetic MarkBridge catalog.
// User/site locale selection and database writes are verified separately in the real local WordPress lab.
const { test, expect } = require('@playwright/test');
const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const list = [];
  errors.set(page, list);
  page.on('pageerror', (error) => list.push(error.message));
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
for (const locale of ['en_US', 'zh_CN']) {
  test(`core editor chrome uses ${locale} without translating authored blocks`, async ({
    page,
  }) => {
    await page.goto('/recovery-editor?new=1&locale=' + locale);
    await page.locator('#mbb-new').click();
    const dialog = page.locator('#mbb-dialog');
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('button', {
        name: locale === 'zh_CN' ? '关闭编辑桥' : 'Close editing bridge',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', {
        name: locale === 'zh_CN' ? '查看差异与预览' : 'View differences and preview',
        exact: true,
      }),
    ).toBeVisible();
    const source = '作者正文 `author code`。\n';
    await page.locator('#mbb-source').fill(source);
    expect(await page.locator('#mbb-source').inputValue()).toBe(source);
    const snapshot = await page.evaluate((source) => {
      const first = MBB.importDocument(source, 'LOCALE');
      wp.i18n.setLocaleData({ Close: ['<img onerror=x>'] }, 'markbridge');
      return { source: first.source, serialized: first.serialized, fallback: MBBI18n.t('Close') };
    }, source);
    expect(snapshot.source).toBe(source);
    expect(snapshot.fallback).toBe('Close');
    expect(snapshot.serialized).toContain('作者正文');
    const controls = await page.locator('#mbb-dialog [data-mbb-close]').boundingBox();
    expect(controls.x).toBeGreaterThanOrEqual(0);
    expect(controls.x + controls.width).toBeLessThanOrEqual(page.viewportSize().width);
    await page.locator('#mbb-dialog [data-mbb-close]').click();
    await expect(dialog).not.toBeVisible();
  });
}
