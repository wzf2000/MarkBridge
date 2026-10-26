// Genuine WordPress block editor/core saves, synthetic fixture only; no WordPress database.
const { test, expect } = require('@playwright/test');
test('native group creation, inner editing and paired reopen retain supported children', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://example.invalid/group.png', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XcAAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  );
  await page.goto('/adapters-editor?locale=en_US');
  const first = await page.evaluate(() => {
    const body =
      'Group first paragraph.\n\n- First item\n- Second item\n\n$$\nx^2 + 1\n$$\n\n```js\nconst count = 1;\n```\n\n![Synthetic image](https://example.invalid/group.png)\n\n:::mbb:v1 details {"summary":"Group notes"}\n\nNested explanation.\n\n:::mbb:end\n\n:::mbb:v1 adapter {"name":"plain-card","version":"1.0.0","attrs":{"text":"Static child","count":1,"enabled":false,"tone":"note"}}\n:::mbb:end\n';
    const group = wp.blocks.createBlock(
      'core/group',
      {
        tagName: 'section',
        anchor: 'native-group',
        ariaLabel: 'Native learning group',
        className: 'reading-group',
        layout: { type: 'constrained' },
      },
      MBB.toBlocks(body),
    );
    taskRegistry.dispatch('core/block-editor').resetBlocks([group]);
    taskRegistry.dispatch('core/block-editor').selectBlock(group.innerBlocks[0].clientId);
    window.groupBefore = wp.blocks.serialize([group]);
    return MBB.toMarkdown([group], { origin: 'markdown_import' });
  });
  expect(first).toContain(':::mbb:v1 group ');
  const canvas = page.frameLocator('iframe[name="editor-canvas"]');
  const paragraph = canvas
    .locator('p.block-editor-rich-text__editable')
    .filter({ hasText: 'Group first paragraph.' });
  await expect(paragraph).toBeVisible();
  await paragraph.fill('Group edited paragraph.');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.locator('#task-export')).toContainText('Group edited paragraph');
  const result = await page.evaluate(() => {
    const source = MBB.toMarkdown(taskBlocks, { origin: 'markdown_import' }),
      doc = MBB.importDocument(source, 'browser-native-group'),
      blocks = wp.blocks.parse(doc.serialized);
    const flatten = (items) => items.flatMap((b) => [b, ...flatten(b.innerBlocks || [])]);
    const exact = MBB.exportDocument(doc, wp.blocks.serialize(blocks)) === source;
    taskRegistry.dispatch('core/block-editor').resetBlocks(blocks);
    taskRegistry.dispatch('core/block-editor').selectBlock(blocks[0].clientId);
    return {
      source,
      exact,
      names: flatten(blocks).map((b) => b.name),
      valid: flatten(blocks).every((b) => b.isValid),
      serialized: doc.serialized,
    };
  });
  expect(result.exact && result.valid).toBe(true);
  for (const name of [
    'core/group',
    'core/list',
    'mbb/math',
    'mbb/code',
    'core/image',
    'core/details',
    'markbridge-example/plain-card',
  ])
    expect(result.names).toContain(name);
  expect(result.serialized).toContain(
    '<section id="native-group" aria-label="Native learning group" class="wp-block-group reading-group">',
  );
  expect(result.serialized).not.toContain('is-layout-');
  await expect(canvas.getByText('Group edited paragraph.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('native-group-editor.png'), fullPage: true });
  const code = await page.evaluate(() => {
    const group = taskBlocks[0];
    taskRegistry
      .dispatch('core/block-editor')
      .updateBlockAttributes(group.clientId, { style: { spacing: { padding: '2rem' } } });
    try {
      MBB.toMarkdown(taskRegistry.select('core/block-editor').getBlocks(), {
        origin: 'markdown_import',
      });
      return null;
    } catch (e) {
      return e.code;
    }
  });
  expect(code).toBe('ADAPTER_ATTRIBUTES');
  expect(errors).toEqual([]);
});

test('native columns keep core editing, fixed widths and paired reopen', async ({ page }, info) => {
  await page.goto('/adapters-editor?locale=en_US');
  await page.evaluate(() => {
    const paragraph = wp.blocks.createBlock('core/paragraph', {
      content: 'Column first paragraph.',
    });
    const second = wp.blocks.createBlock('core/paragraph', { content: 'Column second paragraph.' });
    const columns = wp.blocks.createBlock(
      'core/columns',
      { isStackedOnMobile: true, verticalAlignment: 'top' },
      [
        wp.blocks.createBlock('core/column', { width: '40%', anchor: 'first-column' }, [paragraph]),
        wp.blocks.createBlock('core/column', { width: '60%' }, [second]),
      ],
    );
    taskRegistry.dispatch('core/block-editor').resetBlocks([columns]);
    taskRegistry.dispatch('core/block-editor').selectBlock(paragraph.clientId);
  });
  const canvas = page.frameLocator('iframe[name="editor-canvas"]');
  const paragraph = canvas
    .locator('p.block-editor-rich-text__editable')
    .filter({ hasText: 'Column first paragraph.' });
  await expect(paragraph).toBeVisible();
  await paragraph.fill('Column edited paragraph.');
  const result = await page.evaluate(() => {
    const source = MBB.toMarkdown(taskBlocks, { origin: 'markdown_import' });
    const doc = MBB.importDocument(source, 'browser-columns');
    const blocks = wp.blocks.parse(doc.serialized);
    const flatten = (items) => items.flatMap((b) => [b, ...flatten(b.innerBlocks || [])]);
    const exact = MBB.exportDocument(doc, wp.blocks.serialize(blocks)) === source;
    taskRegistry.dispatch('core/block-editor').resetBlocks(blocks);
    taskRegistry
      .dispatch('core/block-editor')
      .selectBlock(blocks[0].innerBlocks[0].innerBlocks[0].clientId);
    return {
      source,
      serialized: doc.serialized,
      exact,
      valid: flatten(blocks).every((b) => b.isValid),
    };
  });
  expect(result.exact && result.valid).toBe(true);
  expect(result.source).toContain(':::mbb:v1 columns ');
  expect(result.source).toContain(':::mbb:v1 column ');
  expect(result.source).toContain('Column edited paragraph');
  expect(result.serialized).toContain('style="flex-basis:40%"');
  await expect(canvas.getByText('Column edited paragraph.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const columns = canvas.locator('[data-type="core/column"]');
  await expect(columns).toHaveCount(2);
  await expect
    .poll(async () => {
      const first = await columns.nth(0).boundingBox();
      const second = await columns.nth(1).boundingBox();
      return page.viewportSize().width >= 782
        ? Math.abs(first.y - second.y) < 2 && second.x > first.x
        : second.y > first.y;
    })
    .toBe(true);
  await page.screenshot({ path: info.outputPath('native-columns-editor.png'), fullPage: true });
});
