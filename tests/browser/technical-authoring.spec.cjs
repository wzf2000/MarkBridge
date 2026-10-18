const { test, expect } = require('@playwright/test');
test.skip(!process.env.MARKBRIDGE_TEST_RUNTIME, 'Needs the real WordPress editor runtime.');
async function open(page) {
  await page.goto('/technical-editor?locale=en_US');
  await expect(page.locator('iframe[name="editor-canvas"]')).toBeVisible();
  return page.frameLocator('iframe[name="editor-canvas"]');
}
async function select(page, name) {
  await page.evaluate(
    (name) =>
      taskRegistry
        .dispatch('core/block-editor')
        .selectBlock(taskBlocks.find((block) => block.name === name).clientId),
    name,
  );
}
async function exported(page) {
  await page.locator('#export-tasks').click();
  return page.locator('#task-export');
}
test('technical captions and reference picker keep focus and rename references atomically', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const frame = await open(page);
  await page.evaluate(() => taskRegistry.dispatch('core/block-editor').clearSelectedBlock());
  await expect(page.getByRole('textbox', { name: 'Stable ID', exact: true })).toHaveCount(0);
  await select(page, 'mbb/object');
  const caption = page.getByRole('textbox', { name: 'Caption', exact: true });
  await caption.fill('Edited caption');
  await caption.pressSequentially(' abcde');
  await expect(caption).toBeFocused();
  await expect(caption).toHaveValue('Edited caption abcde');
  await expect(await exported(page)).toContainText('ERROR: Parameters have not been applied');
  await page.getByRole('button', { name: 'Apply text edits', exact: true }).click();
  await select(page, 'mbb/object');
  await page.getByRole('textbox', { name: 'Proposed stable ID', exact: true }).fill('eq-renamed');
  await page.getByRole('button', { name: 'Check label rename', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('1 reference markers');
  await page.getByRole('button', { name: 'Rename label and references', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => taskBlocks.find((block) => block.name === 'mbb/object').attributes.id),
    )
    .toBe('eq-renamed');
  await expect(await exported(page)).not.toContainText('ERROR:');
  const paragraph = await page.evaluate(() => {
    const block = taskBlocks.find(
      (block) =>
        block.name === 'core/paragraph' && String(block.attributes.content).startsWith('See '),
    );
    taskRegistry.dispatch('core/block-editor').selectBlock(block.clientId);
    return block.clientId;
  });
  const content = frame.locator(
    '[data-block="' +
      paragraph +
      '"][contenteditable="true"], [data-block="' +
      paragraph +
      '"] [contenteditable="true"]',
  );
  await content.click();
  await content.press('End');
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByText('Insert cross-reference', { exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Choose a reference target', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Reference target', exact: true })
    .selectOption('eq-renamed');
  await page.getByRole('button', { name: 'Insert reference', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            taskBlocks
              .filter((block) => block.name === 'core/paragraph')
              .map((block) => String(block.attributes.content))
              .join('')
              .match(/data-mbb-target="eq-renamed"/g) || []
          ).length,
      ),
    )
    .toBe(2);
  await expect(await exported(page)).not.toContainText('ERROR:');
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('technical-authoring.png'), fullPage: true });
});
test('bibliography drafts preserve keyboard input across selection, require Apply and protect cited entries', async ({
  page,
}, info) => {
  await open(page);
  await select(page, 'mbb/bibliography');
  const title = page.getByRole('textbox', { name: 'Reference title', exact: true });
  if (!(await title.isVisible()))
    await page.getByRole('button', { name: 'Title <literal> (paper-a)', exact: true }).click();
  await title.fill('Edited reference');
  await title.pressSequentially(' abcde');
  await expect(title).toBeFocused();
  await expect(title).toHaveValue('Edited reference abcde');
  await expect(await exported(page)).toContainText('ERROR: Parameters have not been applied');
  await page.evaluate(() => taskRegistry.dispatch('core/block-editor').clearSelectedBlock());
  await select(page, 'mbb/bibliography');
  await expect(title).toHaveValue('Edited reference abcde');
  await page.getByRole('button', { name: 'Discard bibliography edits', exact: true }).click();
  await expect(title).toHaveValue('Title <literal>');
  await title.fill('Applied title');
  await page.getByRole('button', { name: 'Apply bibliography edits', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          taskBlocks.find((block) => block.name === 'mbb/bibliography').attributes.entries[0].title,
      ),
    )
    .toBe('Applied title');
  await page
    .getByRole('textbox', { name: 'Proposed reference key', exact: true })
    .fill('paper-renamed');
  await page.getByRole('button', { name: 'Check label rename', exact: true }).click();
  await page.getByRole('button', { name: 'Rename label and references', exact: true }).click();
  const remove = page.getByRole('button', { name: 'Remove bibliography entry', exact: true });
  if (!(await remove.isVisible()))
    await page.getByRole('button', { name: 'Applied title (paper-renamed)', exact: true }).click();
  await remove.click();
  await expect(page.getByRole('alert')).toContainText('This entry is cited.');
  await expect(await exported(page)).not.toContainText('ERROR:');
  expect(
    await page.evaluate(
      () => taskBlocks.find((block) => block.name === 'mbb/bibliography').attributes.entries[0].key,
    ),
  ).toBe('paper-renamed');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('bibliography-draft.png'), fullPage: true });
});
