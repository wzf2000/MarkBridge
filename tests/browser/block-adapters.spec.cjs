const { test, expect } = require('@playwright/test');
const fs = require('node:fs'),
  path = require('node:path');
const plugin = path.resolve(__dirname, '../../plugin'),
  fixture = require('../fixtures/block-adapters.json');
const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const list = [];
  errors.set(page, list);
  page.on('pageerror', (e) => list.push(e.message));
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
test('real core details/buttons retain identity, edit controlled text and reject unsupported style', async ({
  page,
}) => {
  await page.goto('/adapters-editor');
  const canvas = page.frameLocator('iframe[name="editor-canvas"]');
  const summary = canvas.getByRole('textbox', {
    name: 'Write summary. Press Enter to expand or collapse the details.',
  });
  await expect(summary).toBeVisible();
  await summary.fill('Edited & <summary>');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.locator('#task-export')).toContainText('Edited & <summary>');
  const data = await page.evaluate(() => {
    const raw = MBB.toMarkdown(taskBlocks, { origin: 'markdown_import' }),
      doc = MBB.importDocument(raw, 'browser-native'),
      flatten = (blocks) => blocks.flatMap((b) => [b, ...flatten(b.innerBlocks || [])]),
      blocks = wp.blocks.parse(doc.serialized);
    return {
      names: flatten(blocks).map((b) => b.name),
      valid: flatten(blocks).every((b) => b.isValid),
      source: raw,
    };
  });
  expect(data.valid).toBe(true);
  expect(data.names).toContain('core/details');
  expect(data.names).toContain('core/buttons');
  expect(data.names).toContain('core/button');
  expect(data.source).toContain('![literal](image.png)');
  expect(data.source).toContain('$x$');
  const code = await page.evaluate(() => {
    const block = taskRegistry.select('core/block-editor').getBlocks()[0];
    taskRegistry
      .dispatch('core/block-editor')
      .updateBlockAttributes(block.clientId, { style: { color: { text: 'red' } } });
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
});
test('trusted static editor applies required pure fields and pending/invalid JSON cannot export silently', async ({
  page,
}) => {
  await page.goto('/adapters-editor');
  await page.evaluate(() => {
    const block = wp.blocks.createBlock('markbridge-example/plain-card', {
      mbbAdapterVersion: '1.0.0',
      count: 1,
      enabled: false,
      text: 'Original <tag> $x$',
      tone: 'plain',
    });
    taskRegistry.dispatch('core/block-editor').resetBlocks([block]);
    taskRegistry.dispatch('core/block-editor').selectBlock(block.clientId);
    window.adapterId = block.clientId;
  });
  const canvas = page.frameLocator('iframe[name="editor-canvas"]'),
    wrapper = canvas.locator('.mbb-static-adapter-editor'),
    params = canvas.getByRole('textbox', { name: '静态适配器参数（JSON）' });
  await expect(wrapper).toBeVisible();
  await params.fill('{bad');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.locator('#task-export')).toContainText('ERROR: 参数尚未应用');
  await canvas.getByRole('button', { name: '应用参数', exact: true }).click();
  await expect(wrapper.getByRole('alert')).toBeVisible();
  expect(
    await page.evaluate(
      () => taskRegistry.select('core/block-editor').getBlock(adapterId).attributes.text,
    ),
  ).toBe('Original <tag> $x$');
  await canvas.getByRole('button', { name: '撤销参数输入', exact: true }).click();
  await expect(params).toHaveValue(/Original/);
  await params.fill(
    JSON.stringify({
      count: 2,
      enabled: false,
      text: 'Updated ![literal](image.png) <tag> & $x$',
      tone: 'note',
    }),
  );
  await canvas.getByRole('button', { name: '应用参数', exact: true }).click();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.locator('#task-export')).toContainText(
    'Updated ![literal](image.png) <tag> & $x$',
  );
  const saved = await page.evaluate(() => {
    const doc = MBB.importDocument(
        MBB.toMarkdown(taskBlocks, { origin: 'markdown_import' }),
        'browser-static',
      ),
      blocks = wp.blocks.parse(doc.serialized);
    return { attrs: blocks[0].attributes, valid: blocks[0].isValid, html: doc.serialized };
  });
  expect(saved.valid).toBe(true);
  expect(saved.attrs.enabled).toBe(false);
  expect(saved.attrs.count).toBe(2);
  expect(saved.html).toContain('false');
});
const reader = () =>
  `<article><details id="outer" class="wp-block-details" data-mbb-teaching="native-details"><summary>Outer native details</summary><details id="inner" class="wp-block-details" data-mbb-teaching="native-details"><summary>Inner details</summary><p id="target">Retained target</p></details></details></article>`;
async function openReader(page, enhance) {
  await page.goto('/health');
  await page.setContent(
    `<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:16px;font:16px/1.6 sans-serif}${fs.readFileSync(path.join(plugin, 'teaching.css'), 'utf8')}</style>${reader()}`,
  );
  if (enhance) await page.addScriptTag({ path: path.join(plugin, 'teaching.js') });
}
test('native details keyboard/deep reveal/history and print keep the same body nodes', async ({
  page,
}) => {
  await openReader(page, true);
  await expect(page.locator('#target')).toBeHidden();
  await page.evaluate(() => (window.nativeTarget = document.getElementById('target')));
  await page.locator('#outer > summary').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#inner > summary')).toBeVisible();
  await page.evaluate(() => MarkBridgeTeaching.revealTarget('target'));
  await expect(page.locator('#target')).toBeVisible();
  expect(await page.evaluate(() => nativeTarget === document.getElementById('target'))).toBe(true);
  await page.locator('#inner > summary').click();
  await expect(page.locator('#target')).toBeHidden();
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await expect(page.locator('#target')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('#target')).toBeHidden();
  await page.evaluate(() => (location.hash = 'target'));
  await expect(page.locator('#target')).toBeVisible();
  expect(await page.locator('article').evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(
    true,
  );
});
test('without teaching script native summary remains operable and print shows closed details', async ({
  page,
}) => {
  await openReader(page, false);
  await expect(page.locator('#target')).toBeHidden();
  await page.locator('#outer > summary').click();
  await expect(page.locator('#inner > summary')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#target')).toBeVisible();
});

test('converter-only new editor configures trusted data without block or math registration', async ({
  page,
}) => {
  await page.addInitScript((snapshot) => (window.MBB_ADAPTERS = snapshot), fixture.descriptors);
  await page.goto('/recovery-editor?new=1');
  const state = await page.evaluate(() => ({
    names: MBB.adapterDescriptors().map((d) => d.blockName),
    block: !!wp.blocks.getBlockType('markbridge-example/plain-card'),
    math: !!wp.data.select('core/rich-text').getFormatType('mbb/math'),
    pure: typeof MBB.planMerge,
    header: typeof MBB.parseFrontmatter,
  }));
  expect(state).toEqual({
    names: ['markbridge-example/plain-card'],
    block: false,
    math: false,
    pure: 'function',
    header: 'function',
  });
});
