// Actual core editor scripts, synthetic fixture and no WordPress database.
const { test, expect } = require('@playwright/test');
test('native code and preformatted retain identity and plain whitespace through edit and reopen', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/adapters-editor?locale=en_US');
  await page.evaluate(() => {
    const content = '  Original native text\n\tsecond &lt;literal&gt; &amp; \u00a0\n\n';
    const children = ['core/code', 'core/preformatted'].map((name, i) =>
      wp.blocks.createBlock(name, {
        anchor: 'native-text-' + i,
        className: 'native-text-sample',
        content: wp.richText.RichTextData.fromHTMLElement(
          Object.assign(document.createElement('span'), {
            innerHTML: name === 'core/preformatted' ? content.replaceAll('\n', '<br>') : content,
          }),
          { preserveWhiteSpace: true },
        ),
      }),
    );
    taskRegistry
      .dispatch('core/block-editor')
      .resetBlocks([wp.blocks.createBlock('core/group', {}, children)]);
    taskRegistry.dispatch('core/block-editor').selectBlock(children[0].clientId);
  });
  const canvas = page.frameLocator('iframe[name="editor-canvas"]');
  const code = canvas
    .locator('[data-type="core/code"] textarea,[data-type="core/code"] [contenteditable="true"]')
    .first();
  await expect(code).toBeVisible();
  await code.fill('  Edited native text\n\tsecond\n\n');
  const preformatted = canvas.locator(
    '[data-type="core/preformatted"][contenteditable="true"], [data-type="core/preformatted"] [contenteditable="true"]',
  );
  await preformatted.fill('  Edited preformatted');
  await preformatted.press('End');
  await preformatted.press('Enter');
  await page.keyboard.insertText('\trow');
  await preformatted.press('Enter');
  await preformatted.press('Enter');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.locator('#task-export')).toContainText(':::mbb:v1 native-code');
  const result = await page.evaluate(() => {
    const current = taskRegistry.select('core/block-editor').getBlocks();
    const source = MBB.toMarkdown(current, { origin: 'markdown_import' }),
      doc = MBB.importDocument(source, 'native-text-browser'),
      blocks = wp.blocks.parse(doc.serialized);
    const exact = MBB.exportDocument(doc, wp.blocks.serialize(blocks)) === source;
    taskRegistry.dispatch('core/block-editor').resetBlocks(blocks);
    taskRegistry.dispatch('core/block-editor').selectBlock(blocks[0].innerBlocks[0].clientId);
    return {
      source,
      serialized: doc.serialized,
      exact,
      names: blocks[0].innerBlocks.map((b) => b.name),
      valid: blocks[0].innerBlocks.every((b) => b.isValid),
    };
  });
  expect(result.exact && result.valid).toBe(true);
  expect(result.names).toEqual(['core/code', 'core/preformatted']);
  expect(result.source).toContain('Edited native text');
  expect(result.source).toContain(':::mbb:v1 preformatted');
  expect(result.source).toContain('Edited preformatted');
  expect(result.serialized).toContain('  Edited native text\n\tsecond\n\n');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('native-text-editor.png'), fullPage: true });
  const rejected = await page.evaluate(() => {
    const blocks = taskRegistry.select('core/block-editor').getBlocks();
    blocks[0].innerBlocks[1].attributes.content = '<strong>formatted</strong>';
    try {
      MBB.toMarkdown(blocks, { origin: 'markdown_import' });
      return null;
    } catch (e) {
      return e.code;
    }
  });
  expect(rejected).toBe('ADAPTER_TEXT');
  expect(errors).toEqual([]);
});
