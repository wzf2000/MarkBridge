const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
async function open(page, scripts = true) {
  await page.goto('/health');
  const response = await page.request.get('/technical-presentation');
  expect(response.ok()).toBe(true);
  const html = await response.text();
  const style = ['math.css', 'teaching.css', 'technical.css']
    .map((name) => fs.readFileSync(path.join(root, 'plugin', name), 'utf8'))
    .join('\n');
  await page.setContent(
    '<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:24px;font:17px/1.75 system-ui,sans-serif;max-width:850px;margin-inline:auto;box-sizing:border-box}' +
      style +
      '</style>' +
      html,
  );
  if (scripts) {
    await page.addScriptTag({
      content: fs.readFileSync(path.join(root, 'plugin/teaching.js'), 'utf8'),
    });
    await page.evaluate(() => {
      window.MBB_MATH_CONFIG = { front: true };
    });
    await page.addScriptTag({ url: '/plugin/math.js' });
  }
}
test('derived references reveal stages, folds and proof without replacing authored nodes; history and print restore state', async ({
  page,
}, info) => {
  await open(page);
  await expect(page.locator('#technical-two')).toBeHidden();
  expect(await page.locator('#proof-route').getAttribute('open')).toBeNull();
  await page.evaluate(() => {
    window.proofNode = document.getElementById('proof-paragraph');
  });
  await page.getByRole('link', { name: 'Equation 1', exact: true }).click();
  await expect(page.locator('#technical-two')).toBeVisible();
  await expect(page.locator('#proof-route')).toHaveAttribute('open', '');
  await expect(page.locator('#proof-paragraph')).toBeVisible();
  await expect(page.locator('#eq-later mjx-container')).toBeVisible();
  expect(await page.evaluate(() => proofNode === document.getElementById('proof-paragraph'))).toBe(
    true,
  );
  await page.goBack();
  await expect(page.locator('#technical-two')).toBeHidden();
  await page.getByRole('button', { name: 'Full text', exact: true }).click();
  await expect(page.locator('#proof-paragraph')).toBeVisible();
  await page.locator('#proof-route summary').click();
  await expect(page.locator('#proof-paragraph')).toBeHidden();
  await page.evaluate(() => dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#proof-paragraph')).toBeVisible();
  await expect(page.locator('#technical-one')).toBeVisible();
  await expect(page.locator('#technical-two')).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => dispatchEvent(new Event('afterprint')));
  await expect(page.locator('#proof-paragraph')).toBeHidden();
  await page.getByRole('link', { name: 'Proof 1', exact: true }).click();
  await expect(page.locator('#proof-paragraph')).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(2);
  await page.screenshot({ path: info.outputPath('technical-reading.png'), fullPage: true });
});
test('plain static references, bibliography and native proof remain readable without enhancement', async ({
  page,
}) => {
  await open(page, false);
  await expect(page.getByRole('link', { name: 'Equation 1', exact: true })).toBeVisible();
  await expect(page.locator('#technical-one')).toBeVisible();
  await expect(page.locator('#technical-two')).toBeVisible();
  await expect(page.locator('#proof-paragraph')).toBeHidden();
  await page.locator('#proof-route summary').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#proof-paragraph')).toBeVisible();
  const link = page.getByRole('link', { name: 'Reference 1', exact: true });
  const target = (await link.getAttribute('href')).slice(1);
  await expect(page.locator('#' + target)).toContainText('A technical source');
});
