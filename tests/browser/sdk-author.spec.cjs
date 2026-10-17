const { test, expect } = require('@playwright/test'),
  fs = require('node:fs'),
  cp = require('node:child_process');
test('extensions settings keeps selected scope readable at desktop and phone', async ({
  page,
}, info) => {
  await page.setContent(
    cp.execFileSync('php', ['tests/extensions-view.php', 'zh'], { encoding: 'utf8' }),
  );
  await page.addStyleTag({
    content:
      'body{font-family:system-ui;background:#f0f0f1;color:#1d2327;margin:24px}main{max-width:960px;margin:auto}nav{padding:1rem 0;border-bottom:1px solid #ccd0d4}button,input{font:inherit}table{border-collapse:collapse;width:100%;background:white}th,td{text-align:left;padding:12px;border-bottom:1px solid #dcdcde}' +
      fs.readFileSync('plugin/settings.css', 'utf8'),
  });
  await expect(page.getByRole('heading', { name: '已安装的扩展' })).toBeVisible();
  await page.getByRole('textbox').fill('836, 837');
  expect(await page.locator('body').evaluate((n) => n.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('extensions-settings.png'), fullPage: true });
});
test('generic author tool patches current core candidate and one Apply is one Undo', async ({
  page,
}, info) => {
  test.skip(!process.env.MARKBRIDGE_TEST_RUNTIME, 'Needs real core scripts');
  await page.goto('/technical-editor?locale=en_US&history=1');
  await expect(page.locator('iframe[name="editor-canvas"]')).toBeVisible();
  await page.evaluate(() => {
    MarkBridgeAuthorTools.register({
      id: 'sdk-fixture',
      version: '0.1.0',
      slot: 'bibliography/v2',
      Editor({ draft, change }) {
        return wp.element.createElement(
          'button',
          {
            onClick: () =>
              change({
                entries: draft.entries.map((e, i) =>
                  i ? e : { ...e, title: 'Generic candidate title' },
                ),
              }),
          },
          'SDK replace title',
        );
      },
    });
    taskRegistry
      .dispatch('core/block-editor')
      .selectBlock(taskBlocks.find((b) => b.name === 'mbb/bibliography').clientId);
  });
  await page
    .getByRole('button', { name: 'Prepare bibliography v2 candidate', exact: true })
    .click();
  await page.getByRole('button', { name: 'Apply bibliography edits', exact: true }).click();
  const attrs = () =>
    page.evaluate(() =>
      JSON.stringify(taskBlocks.find((b) => b.name === 'mbb/bibliography').attributes),
    );
  const initial = await attrs();
  await page.getByRole('button', { name: 'SDK replace title', exact: true }).click();
  expect(await attrs()).toBe(initial);
  await expect(page.getByRole('textbox', { name: 'Reference title', exact: true })).toHaveValue(
    'Generic candidate title',
  );
  await page.getByRole('button', { name: 'Apply bibliography edits', exact: true }).click();
  await expect.poll(attrs).not.toBe(initial);
  await page.evaluate(() => wp.data.dispatch('core').undo());
  await expect.poll(attrs).toBe(initial);
  await page.evaluate(() => wp.data.dispatch('core').redo());
  await expect.poll(attrs).toContain('Generic candidate title');
  await page.screenshot({ path: info.outputPath('generic-author-candidate.png'), fullPage: true });
});
