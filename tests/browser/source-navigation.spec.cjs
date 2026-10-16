const { test, expect } = require('@playwright/test');
const raw =
  '# 中文😀\r\n\r\n重复段落。\r\n\r\n重复段落。\r\n\r\n```python\r\nprint(1)\r\n```\r\n\r\n$$\r\n\\frac{a}{d}\r\n$$\r\n';
async function open(page) {
  const requests = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/navigation-fixture/preview'
    )
      requests.push(request.postDataJSON());
  });
  await page.goto('/navigation-editor?locale=en_US');
  await page.getByRole('button', { name: '编辑现有文档' }).click();
  await expect(page.locator('#mbb-source')).toHaveValue(raw.replace(/\r\n/g, '\n'));
  return requests;
}
async function review(page) {
  const completed = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/navigation-fixture/preview',
  );
  await page.locator('#mbb-review').click();
  expect((await completed).status()).toBe(200);
}
test('opaque trusted bridge selects repeated source objects and rejects stale or forged messages', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const requests = await open(page);
  await review(page);
  const locate = page.getByRole('button', { name: 'Locate source', exact: true });
  await expect(locate).toBeEnabled();
  const iframe = page.locator('iframe[title="Built-in content preview"]');
  expect(await iframe.getAttribute('sandbox')).toBe('allow-scripts');
  const frame = page.frameLocator('iframe[title="Built-in content preview"]');
  await expect(frame.locator('[data-mbb-preview-range="r2"]')).toBeVisible();
  expect(await page.evaluate(() => document.body.dataset.previewInjection)).toBeUndefined();
  await locate.click();
  await expect(frame.locator('[data-mbb-preview-range="r4"] mjx-container')).toBeVisible();
  await locate.click();
  await expect(frame.locator('[data-mbb-preview-range="r3"]')).toHaveAttribute('tabindex', '0');
  await locate.click();
  await frame.locator('[data-mbb-preview-range="r4"]').click();
  expect(
    await page
      .locator('#mbb-source')
      .evaluate((node) => node.value.slice(node.selectionStart, node.selectionEnd)),
  ).toBe('$$\n\\frac{a}{d}\n$$\n');
  await page.locator('#mbb-preview-toggle').click();
  await frame.locator('[data-mbb-preview-range="r2"]').click();
  const selection = await page
    .locator('#mbb-source')
    .evaluate((node) => [node.selectionStart, node.selectionEnd]);
  expect(selection).toEqual([
    raw.replace(/\r\n/g, '\n').lastIndexOf('重复'),
    raw.replace(/\r\n/g, '\n').lastIndexOf('重复') + 5,
  ]);
  // Reverse selection uses provenance, never repeated rendered text.
  await page.getByText('Find, replace and navigate', { exact: true }).click();
  await page.getByRole('button', { name: 'Locate selection in preview', exact: true }).click();
  await expect(frame.locator('[data-mbb-preview-highlight]')).toHaveAttribute(
    'data-mbb-preview-range',
    'r2',
  );
  const old = await frame.locator('html').evaluate((node) => ({
    session: node.dataset.mbbPreviewSession,
    sourceHash: node.dataset.mbbPreviewSource,
  }));
  await page.locator('#mbb-edit-toggle').click();
  await page.locator('#mbb-source').press('End');
  await page.locator('#mbb-source').pressSequentially(' new');
  await page.evaluate(
    (old) =>
      window.postMessage(
        { type: 'mbb-author-navigation/v1', action: 'select', id: 'r0', ...old },
        '*',
      ),
    old,
  );
  const unchanged = await page.locator('#mbb-source').inputValue();
  expect(unchanged).toContain(' new');
  await expect(page.locator('#mbb-save')).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Locate selection in preview', exact: true }),
  ).toBeDisabled();
  expect(requests[0].source).toBe(raw);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: test.info().outputPath('source-navigation-' + info.project.name + '.png'),
  });
});
test('literal replacements preserve untouched CRLF and undo; IME composition is one source transaction', async ({
  page,
}) => {
  const requests = await open(page);
  await page.getByText('Find, replace and navigate', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Find text', exact: true }).fill('重复段落。');
  await page.getByRole('textbox', { name: 'Replace with', exact: true }).fill('替换。');
  await page.getByRole('button', { name: 'Replace all', exact: true }).click();
  await review(page);
  expect(requests.at(-1).source).toBe(raw.replaceAll('重复段落。', '替换。'));
  await page.locator('#mbb-edit-toggle').click();
  await page.getByRole('button', { name: 'Undo source change', exact: true }).click();
  await review(page);
  expect(requests.at(-1).source).toBe(raw);
  await page.locator('#mbb-edit-toggle').click();
  await page.locator('#mbb-source').evaluate((node) => {
    node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    node.value += '中';
    node.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    node.value += '文';
    node.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
  });
  await page.getByRole('button', { name: 'Undo source change', exact: true }).click();
  await expect(page.locator('#mbb-source')).toHaveValue(raw.replace(/\r\n/g, '\n'));
  await review(page);
  expect(requests.at(-1).source).toBe(raw);
});
test('desktop split view and narrow switching preserve source; examples are explicit unsaved candidates', async ({
  page,
}, info) => {
  await open(page);
  await review(page);
  const split = page.getByRole('button', { name: 'Source beside preview', exact: true });
  if (info.project.name.startsWith('desktop')) {
    await split.click();
    await expect(page.locator('#mbb-source')).toBeVisible();
    await expect(page.locator('#mbb-preview-body')).toBeVisible();
  } else {
    await expect(split).toBeHidden();
    await page.locator('#mbb-edit-toggle').click();
    await expect(page.locator('#mbb-preview-body')).toBeHidden();
  }
  await page.getByText('Find, replace and navigate', { exact: true }).click();
  await page.getByText('Insert a teaching structure', { exact: true }).click();
  await page.getByRole('button', { name: 'Insert example at selection', exact: true }).click();
  await expect(page.locator('#mbb-source')).toContainText('');
  expect(await page.locator('#mbb-source').inputValue()).toContain(':::mbb:v1 collapse');
  await expect(page.locator('#mbb-save')).toBeDisabled();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: test.info().outputPath('authoring-workspace-' + info.project.name + '.png'),
  });
});
