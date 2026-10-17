const { test, expect } = require('@playwright/test');
const documents = [
  { name: 'formula.md', mimeType: 'text/markdown', buffer: Buffer.from('$$\n\\frac{a}{d}\n$$\n') },
  {
    name: 'images.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('Synthetic ZIP transport; not a server archive-model test'),
  },
  { name: 'blocked.md', mimeType: 'text/markdown', buffer: Buffer.from('Synthetic invalid input') },
];
const dialog = (page) => page.locator('#mbb-batch-dialog');
const status = (page) => dialog(page).locator(':scope > p[role="status"]');
const item = (page, name) => dialog(page).getByRole('region', { name, exact: true });
async function open(page, scenario = '') {
  await page.goto('/batch-tools?locale=en_US' + scenario);
  await page.getByRole('button', { name: 'Batch import drafts', exact: true }).click();
}
async function scan(page) {
  await dialog(page).getByLabel('Batch files', { exact: true }).setInputFiles(documents);
  await dialog(page).getByRole('button', { name: 'Scan selected files', exact: true }).click();
}
async function control(page, data = {}) {
  const root = await page.evaluate(() => window.batchFixtureRoot);
  const r = await page.request.post(root + 'control', { data });
  expect(r.ok()).toBe(true);
  return r.json();
}
async function preview(page, name) {
  await item(page, name).getByRole('button', { name: 'Preview this item', exact: true }).click();
  const frame = page.frameLocator('.mbb-batch-preview iframe');
  await expect(frame.locator('mjx-container[jax="CHTML"]')).toHaveCount(1);
  await expect(frame.locator('mjx-merror')).toHaveCount(0);
  await expect(frame.locator('mjx-speech')).toHaveAttribute('aria-label', /a over d/);
  await expect(status(page)).toContainText('Review the content below');
  return frame;
}

test('mixed scan, real formula/image review, title invalidation, partial success and cancel/resume', async ({
  page,
}, info) => {
  await page.setViewportSize(
    info.project.name.startsWith('mobile')
      ? { width: 390, height: 844 }
      : { width: 1440, height: 900 },
  );
  await open(page);
  await expect(status(page)).toContainText('Choose files to scan');
  await scan(page);
  await expect(status(page)).toContainText('Scan finished');
  await expect(item(page, 'blocked.md')).toContainText('Synthetic invalid document');
  await expect(
    item(page, 'blocked.md').getByRole('button', { name: 'Preview this item' }),
  ).toBeDisabled();
  await expect(item(page, 'formula.md')).toContainText('Another selected file has the same title');
  await preview(page, 'formula.md');
  await expect(
    dialog(page).getByRole('button', {
      name: 'Create this draft',
      exact: true,
      includeHidden: true,
    }),
  ).toBeEnabled();
  await item(page, 'formula.md').getByRole('textbox').fill('Changed formula');
  await expect(status(page)).toContainText('The title changed');
  await expect(page.locator('.mbb-batch-preview')).toBeHidden();
  await expect(
    dialog(page).getByRole('button', {
      name: 'Create this draft',
      exact: true,
      includeHidden: true,
    }),
  ).toBeDisabled();
  const frame = await preview(page, 'formula.md');
  await expect(frame.getByRole('heading', { name: 'Changed formula' })).toBeVisible();
  await dialog(page)
    .getByRole('button', { name: 'Create this draft', exact: true, includeHidden: true })
    .click();
  await expect(item(page, 'formula.md')).toContainText('Draft created');
  await expect(
    item(page, 'formula.md').getByRole('link', { name: 'Open created draft' }),
  ).toHaveAttribute('href', /\/wp-admin\/post\.php\?post=90&action=edit$/);
  await dialog(page).getByRole('button', { name: 'Refresh batch status' }).click();
  await expect(status(page)).toContainText('Status refreshed');
  await expect(page.locator('.mbb-batch-preview')).toBeHidden();
  await dialog(page).getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Batch import drafts', exact: true }).click();
  await dialog(page)
    .getByRole('button', { name: /^Resume batch/ })
    .click();
  await expect(item(page, 'formula.md')).toContainText('Draft created');
  const imageFrame = await preview(page, 'images.zip');
  await expect(imageFrame.getByAltText('Bundled pixel')).toBeVisible();
  await expect(imageFrame.getByAltText('Bundled pixel')).toHaveJSProperty('naturalWidth', 1);
  const create = dialog(page).getByRole('button', {
    name: 'Create this draft',
    exact: true,
    includeHidden: true,
  });
  await expect(create).toBeDisabled();
  await dialog(page).getByRole('checkbox').check();
  await expect(create).toBeEnabled();
  const mapping = page.locator('.mbb-batch-identity-map');
  await expect(mapping).toContainText('Documents receiving new logical identities: 2.');
  await expect(mapping).toContainText('References within this batch point to its new drafts.');
  await expect(mapping.locator('details')).not.toHaveAttribute('open');
  await page.screenshot({ path: info.outputPath('batch-media-review.png'), fullPage: true });
  await mapping.locator('summary').click();
  await expect(mapping.locator('pre')).toBeVisible();
  await mapping.locator('pre').scrollIntoViewIfNeeded();
  expect(await dialog(page).evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('batch-identity-details.png'), fullPage: true });
  await mapping.locator('summary').click();
  await control(page, { conflict: true });
  await create.click();
  await expect(status(page)).toContainText('Preview this item again before creating its draft.');
  expect((await control(page)).confirms.map((x) => [x.index, x.ack_public_media])).toEqual([
    [0, false],
    [1, true],
  ]);
  await dialog(page).getByRole('button', { name: 'Refresh batch status' }).click();
  await expect(status(page)).toContainText('Status refreshed');
  await expect(item(page, 'formula.md')).toContainText('Draft created');
  await dialog(page)
    .getByRole('button', { name: 'Cancel remaining items and remove staging' })
    .click();
  await expect(status(page)).toContainText('Created drafts and their media were preserved');
  await expect(item(page, 'images.zip')).toContainText('Canceled');
  await expect(
    item(page, 'formula.md').getByRole('link', { name: 'Open created draft' }),
  ).toBeVisible();
  await expect(
    item(page, 'images.zip').getByRole('button', { name: 'Preview this item' }),
  ).toBeDisabled();
  await page.screenshot({ path: info.outputPath('batch-partial-cancel.png'), fullPage: true });
});

test('closing and reopening discards a late list GET after scan or refresh', async ({ page }) => {
  await open(page);
  await expect(status(page)).toContainText('Choose files to scan');
  for (const operation of ['scan', 'refresh']) {
    await control(page, { holdNextList: true });
    const late = page.waitForResponse((r) => r.headers()['x-batch-fixture-held'] === 'yes');
    if (operation === 'scan') await scan(page);
    else await dialog(page).getByRole('button', { name: 'Refresh batch status' }).click();
    await expect.poll(async () => (await control(page)).held).toBe(true);
    await dialog(page).getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Batch import drafts', exact: true }).click();
    await expect(status(page)).toContainText('Choose files to scan');
    await control(page, { release: true });
    await (await late).finished();
    // Wait for a browser paint after the completed response, not an arbitrary timer.
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await expect(status(page)).toHaveText(
      'Choose files to scan or resume one of your active batches.',
    );
    await dialog(page)
      .getByRole('button', { name: /^Resume batch/ })
      .click();
    await expect(status(page)).toContainText('Batch restored');
  }
});

test('capability rejection is shown without enabling creation', async ({ page }, info) => {
  await open(page, '&case=forbidden');
  await expect(status(page)).toHaveText('Sign in with an account that can create drafts.');
  await expect(
    dialog(page).getByRole('button', {
      name: 'Create this draft',
      exact: true,
      includeHidden: true,
    }),
  ).toBeDisabled();
  await expect(page.locator('.mbb-batch-item')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('batch-capability-error.png'), fullPage: true });
});
