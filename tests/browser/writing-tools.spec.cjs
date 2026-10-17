const { test, expect } = require('@playwright/test');
test.skip(!process.env.MARKBRIDGE_TEST_RUNTIME, 'Needs the real WordPress editor runtime.');
test('source content navigation, same-source pattern insertion, complete paste preview and one undo', async ({
  page,
}, info) => {
  const source = '# Original\n\nOriginal body.\n';
  await page.route('**/wp-json/mbb/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/preview'))
      return route.fulfill({
        json: { document: { source }, title: 'Original', post_status: 'draft' },
      });
    if (path.endsWith('/document'))
      return route.fulfill({
        json: {
          post_id: 12,
          expected: 'baseline-1',
          title: 'Original',
          post_status: 'draft',
          featured_media: 0,
          source_managed: false,
          document: {
            schema: 1,
            documentId: 'RECOVERY',
            source,
            serialized: await page.evaluate(
              (s) => MBB.importDocument(s, 'RECOVERY').serialized,
              source,
            ),
          },
        },
      });
    return route.fulfill({ json: {} });
  });
  await page.goto('/recovery-editor?locale=en_US');
  await page.getByRole('button', { name: 'Markdown edit / upload', exact: true }).click();
  const textarea = page.locator('#mbb-source');
  await expect(textarea).toHaveValue(source);
  await page.getByText('Find, replace and navigate', { exact: true }).click();
  const tools = page.locator('.mbb-source-tools .mbb-writing-tools');
  await tools.locator('summary').click();
  await tools.getByRole('combobox', { name: 'Writing pattern' }).selectOption('lesson');
  await tools.getByRole('button', { name: 'Insert writing pattern', exact: true }).click();
  await expect(textarea).toHaveValue(/## Experiment/);
  await textarea.press('Control+z');
  await expect(textarea).toHaveValue(source);
  await textarea.evaluate((node) => node.setSelectionRange(node.value.length, node.value.length));
  const snippet = '```javascript\nconst price="$5";\n```';
  await textarea.evaluate((node, text) => {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    node.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, snippet);
  await expect(page.locator('.mbb-paste-candidate')).toBeVisible();
  await expect(textarea).toHaveValue(source);
  await page.getByRole('button', { name: 'Insert recognized Markdown', exact: true }).click();
  await expect(textarea).toHaveValue(source + snippet);
  await textarea.press('Control+z');
  await expect(textarea).toHaveValue(source);
  await tools.getByRole('button', { name: 'Check current content', exact: true }).click();
  await expect(tools).toContainText('Browser structure check completed.');
  await page.screenshot({ path: info.outputPath('writing-tools.png'), fullPage: true });
});
test('native empty-paragraph paste is reviewed, code dollars preserved, partial text untouched', async ({
  page,
}) => {
  await page.goto('/technical-editor?locale=en_US');
  const frame = page.frameLocator('iframe[name="editor-canvas"]');
  await expect(frame.locator('[contenteditable="true"]').first()).toBeVisible();
  await page.evaluate(() => {
    const oldSelect = wp.data.select.bind(wp.data),
      oldDispatch = wp.data.dispatch.bind(wp.data);
    wp.data = { ...wp.data };
    wp.data.select = (name) =>
      name === 'core/block-editor' ? taskRegistry.select(name) : oldSelect(name);
    wp.data.dispatch = (name) =>
      name === 'core/block-editor' ? taskRegistry.dispatch(name) : oldDispatch(name);
    const block = wp.blocks.createBlock('core/paragraph', { content: '' });
    taskRegistry.dispatch('core/block-editor').resetBlocks([block]);
    taskRegistry.dispatch('core/block-editor').selectBlock(block.clientId);
  });
  await expect
    .poll(() =>
      page.evaluate(() => taskBlocks.length === 1 && taskBlocks[0].name === 'core/paragraph'),
    )
    .toBe(true);
  await expect(frame.getByRole('document', { name: /Empty block/ })).toBeVisible();
  const editable = frame.locator('[contenteditable="true"]').first();
  await editable.click();
  await page.evaluate(() =>
    taskRegistry.dispatch('core/block-editor').selectBlock(taskBlocks[0].clientId),
  );
  await editable.evaluate((node) => {
    const data = new DataTransfer();
    data.setData('text/plain', '```javascript\nconst price="$5";\n```');
    node.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  });
  await expect(page.getByRole('dialog', { name: 'Markdown paste preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Insert recognized Markdown', exact: true }).click();
  await expect.poll(() => page.evaluate(() => taskBlocks[0].name)).toBe('mbb/code');
  expect(await page.evaluate(() => taskBlocks[0].attributes.code)).toBe('const price="$5";\n');
  await page.evaluate(() => {
    const block = wp.blocks.createBlock('core/paragraph', { content: '' });
    taskRegistry.dispatch('core/block-editor').resetBlocks([block]);
    taskRegistry.dispatch('core/block-editor').selectBlock(block.clientId);
  });
  await editable.click();
  await editable.evaluate((node) => {
    const data = new DataTransfer();
    data.setData('text/plain', 'The price is $5 and $10.');
    const event = new ClipboardEvent('paste', {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    });
    node.dispatchEvent(event);
    return event.defaultPrevented;
  });
  await expect(page.getByRole('dialog', { name: 'Markdown paste preview' })).toHaveCount(0);
});
