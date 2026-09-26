const { test, expect } = require('@playwright/test');
test.skip(
  !process.env.MARKBRIDGE_TEST_RUNTIME,
  'Requires a sanitized real WordPress core-script runtime.',
);

test('real WordPress task checkbox edits block state and exports paired Markdown', async ({
  page,
}) => {
  await page.goto('/task-editor');
  const checkbox = page.locator('.wp-block-mbb-task-item input[type="checkbox"]');
  await expect(checkbox).toHaveCount(1);
  await expect(checkbox).not.toBeChecked();
  await page.getByRole('textbox', { name: '任务内容' }).click();
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await page.locator('#export-tasks').click();
  await expect(page.locator('#task-export')).toContainText('[x] Browser task');
  await expect(page.locator('#task-export')).toContainText('ordinary');
  const result = await page.evaluate(() => {
    const serialized = wp.blocks.serialize(taskBlocks);
    const parsed = wp.blocks.parse(serialized);
    return {
      valid: parsed.every((block) => block.isValid),
      task: parsed[0].innerBlocks.find((block) => block.name === 'mbb/task-item').attributes
        .checked,
      inputInStorage: serialized.includes('<input'),
    };
  });
  expect(result).toEqual({ valid: true, task: true, inputInStorage: false });
});

test('task list inserter and conversion after removing the final task', async ({ page }) => {
  await page.goto('/task-editor');
  await expect(page.locator('.wp-block-mbb-task-item')).toHaveCount(1);
  await page.evaluate(() => {
    const task = taskBlocks[0].innerBlocks.find((block) => block.name === 'mbb/task-item');
    taskRegistry.dispatch('core/block-editor').removeBlock(task.clientId);
  });
  await page.getByRole('button', { name: '转换为普通列表', exact: true }).click();
  await page.locator('#export-tasks').click();
  await expect(page.locator('#task-export')).toHaveText('- ordinary\n');
  expect(await page.evaluate(() => taskBlocks[0].name)).toBe('core/list');
  const variation = await page.evaluate(() => {
    const item = wp.blocks
      .getBlockVariations('mbb/list', 'inserter')
      .find((item) => item.name === 'task-list');
    const blocks = wp.blocks.createBlocksFromInnerBlocksTemplate(item.innerBlocks);
    taskRegistry
      .dispatch('core/block-editor')
      .insertBlocks([
        wp.blocks.createBlock('core/paragraph', { content: 'Next checklist' }),
        wp.blocks.createBlock('mbb/list', item.attributes || {}, blocks),
      ]);
    return item.title;
  });
  expect(variation).toBe('任务列表');
  await expect(page.locator('.wp-block-mbb-task-item input[type="checkbox"]')).toHaveCount(1);
  await page.getByRole('textbox', { name: '任务内容' }).fill('New task');
  await page.locator('#export-tasks').click();
  await expect(page.locator('#task-export')).toContainText('- [ ] New task');
});
