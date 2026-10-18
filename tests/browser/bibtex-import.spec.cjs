const { test, expect } = require('@playwright/test');
test('BibTeX import previews into the shared bibliography draft and rejects stale, duplicate and cited-key replacements', async ({
  page,
}, info) => {
  await page.goto('/technical-editor?locale=en_US');
  await expect(page.locator('iframe[name="editor-canvas"]')).toBeVisible();
  await page.evaluate(() =>
    taskRegistry
      .dispatch('core/block-editor')
      .selectBlock(taskBlocks.find((b) => b.name === 'mbb/bibliography').clientId),
  );
  const original = await page.evaluate(() =>
    JSON.stringify(taskBlocks.find((b) => b.name === 'mbb/bibliography').attributes.entries),
  );
  await page.getByRole('button', { name: 'Import BibTeX', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Import BibTeX bibliography', exact: true });
  const input = modal.getByRole('textbox', { name: 'BibTeX source (up to 64 KiB)', exact: true });
  await input.fill(
    '@article{Extra,title={Imported paper},author={Jane Doe and Alan Turing},year={2026},doi={10.1234/example}}',
  );
  await modal.getByRole('button', { name: 'Preview BibTeX mapping', exact: true }).click();
  const use = modal.getByRole('button', { name: 'Use bibliography candidate', exact: true });
  await expect(use).toBeEnabled();
  await expect(modal).toContainText('Imported paper');
  await page.screenshot({ path: info.outputPath('bibtex-preview.png') });
  await input.fill('@article{Extra,title={Changed after preview}}');
  await expect(use).toBeDisabled();
  await modal.getByRole('button', { name: 'Preview BibTeX mapping', exact: true }).click();
  await use.click();
  await expect(modal).toBeHidden();
  expect(
    await page.evaluate(() =>
      JSON.stringify(taskBlocks.find((b) => b.name === 'mbb/bibliography').attributes.entries),
    ),
  ).toBe(original);
  await page.getByRole('button', { name: 'Discard bibliography edits', exact: true }).click();
  await page.getByRole('button', { name: 'Import BibTeX', exact: true }).click();
  await expect(input).toHaveValue('@article{Extra,title={Changed after preview}}');
  await modal
    .getByRole('combobox', { name: 'Import operation', exact: true })
    .selectOption('replace');
  await modal.getByRole('button', { name: 'Preview BibTeX mapping', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('preserve every currently cited key');
  await expect(use).toBeDisabled();
  await modal
    .getByRole('combobox', { name: 'Import operation', exact: true })
    .selectOption('merge');
  const key = JSON.parse(original)[0].key;
  await input.fill('@book{' + key + ',title={Duplicate key}}');
  await modal.getByRole('button', { name: 'Preview BibTeX mapping', exact: true }).click();
  await expect(use).toBeDisabled();
  await input.fill('@book{Extra,title={Final imported paper}}');
  await modal.getByRole('button', { name: 'Preview BibTeX mapping', exact: true }).click();
  await use.click();
  await page.getByRole('button', { name: 'Apply bibliography edits', exact: true }).click();
  expect(
    await page.evaluate(() =>
      taskBlocks
        .find((b) => b.name === 'mbb/bibliography')
        .attributes.entries.some((e) => e.key === 'Extra'),
    ),
  ).toBe(true);
});
