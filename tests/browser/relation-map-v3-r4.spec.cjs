const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');
const schema = require('../fixtures/relation-map-v3-author-schema.json');
const params = {
  format: 'relation-map/v3',
  title: 'Author starting point',
  groups: [
    { id: 'basics', title: 'Foundations' },
    { id: 'practice', title: 'Practice' },
  ],
  nodes: Array.from({ length: 3 }, (_, i) => ({
    id: 'node-' + i,
    group: i === 2 ? 'practice' : 'basics',
    title: 'Article ' + (i + 1),
    description: '',
    target: {
      kind: 'document',
      namespace: 'S_' + 'a'.repeat(32),
      document: 'D_' + i.toString(16).padStart(32, '0'),
    },
  })),
  edges: [
    {
      id: 'edge-0',
      from: 'node-0',
      to: 'node-1',
      kind: 'recommended',
      why: 'Read the first article before the comparison.',
    },
  ],
  display: { mobileStart: { kind: 'auto', id: '' } },
};
test.skip(
  !process.env.MARKBRIDGE_TEST_RUNTIME,
  'Needs the sanitized real WordPress core editor runtime.',
);
const apply = (page) => page.getByRole('button', { name: 'Apply parameters', exact: true });
const discard = (page) =>
  page.getByRole('button', { name: 'Discard parameter input', exact: true });
const json = (page) =>
  page.getByRole('textbox', { name: 'Parameter JSON (data only)', exact: true });
const applied = (page) => page.evaluate(() => taskBlocks[0].attributes.params);
async function open(page, hint = params.display.mobileStart) {
  await page.goto('/component-editor?locale=en_US');
  await expect(page.locator('iframe[name="editor-canvas"]')).toBeVisible();
  for (const file of ['relation-map.js', 'relation-map-v2.js', 'relation-map-v3.js'])
    await page.addScriptTag({ path: path.resolve(__dirname, '../../plugin', file) });
  await page.evaluate(
    ({ schema, params, hint }) => {
      const provider = MBBComponents.find((p) => p.id === 'fixture');
      provider.schema = schema;
      provider.readerMode = 'relation-map/v3';
      wp.apiFetch = () => Promise.resolve({ state: 'unavailable' });
      taskRegistry.dispatch('core/block-editor').updateBlockAttributes(taskBlocks[0].clientId, {
        params: { ...params, display: { mobileStart: hint } },
      });
      taskRegistry.dispatch('core/block-editor').selectBlock(taskBlocks[0].clientId);
    },
    { schema, params, hint },
  );
  await expect(page.getByRole('combobox', { name: 'Initial focus', exact: true })).toHaveValue(
    hint.kind,
  );
}
function screen(info, name) {
  if (!process.env.MARKBRIDGE_REVIEW_SCREEN_DIR) return info.outputPath(name);
  fs.mkdirSync(process.env.MARKBRIDGE_REVIEW_SCREEN_DIR, { recursive: true });
  return path.join(process.env.MARKBRIDGE_REVIEW_SCREEN_DIR, name);
}
for (const kind of ['group', 'node'])
  test(`r4 missing ${kind} starting item has local error and preserves applied data`, async ({
    page,
  }, info) => {
    const missing = { kind, id: 'missing-' + kind };
    await open(page, missing);
    const before = await applied(page);
    const title = page.getByRole('textbox', { name: 'Title', exact: true });
    const titleId = await title.getAttribute('id');
    const visibleTitleLabel = page.locator('label[for="' + titleId + '"]');
    await expect(visibleTitleLabel).toHaveText('Title');
    await visibleTitleLabel.click();
    await expect(title).toBeFocused();
    expect(
      await title.evaluate(
        (node) =>
          !!(
            node.compareDocumentPosition(document.querySelector('[data-mbb-mobile-start]')) &
            Node.DOCUMENT_POSITION_FOLLOWING
          ),
      ),
    ).toBe(true);
    expect(
      await page
        .locator('[data-mbb-mobile-start]')
        .evaluate(
          (node) =>
            !!(
              node.compareDocumentPosition(
                [...document.querySelectorAll('.mbb-parameter-form legend')].find(
                  (n) => n.textContent === 'Groups',
                ),
              ) & Node.DOCUMENT_POSITION_FOLLOWING
            ),
        ),
    ).toBe(true);
    await expect(page.locator('[data-mbb-mobile-start]')).toContainText(
      'Sets the first mobile view',
    );
    const start = page.getByRole('combobox', { name: 'Starting item', exact: true });
    await expect(start).toHaveValue(missing.id);
    await apply(page).click();
    await expect(start).toBeFocused();
    await expect(start).toHaveAttribute('aria-invalid', 'true');
    const errorId = await start.getAttribute('aria-describedby');
    await expect(page.locator('[id="' + errorId + '"]')).toHaveText(
      'Choose an existing mobile starting item, or use Automatic.',
    );
    expect(await applied(page)).toEqual(before);
    await page.screenshot({ path: screen(info, `r4-missing-${kind}.png`), fullPage: true });
    await start.selectOption(kind === 'group' ? 'basics' : 'node-0');
    await expect(start).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('[id="' + errorId + '"]')).toHaveCount(0);
    await apply(page).click();
    const updated = await applied(page);
    expect(updated.display.mobileStart).toEqual({
      kind,
      id: kind === 'group' ? 'basics' : 'node-0',
    });
    expect(updated.groups).toEqual(params.groups);
    expect(updated.nodes).toEqual(params.nodes);
    expect(updated.edges).toEqual(params.edges);
  });
test('r4 invalid JSON focuses the associated error and discard clears it without applying', async ({
  page,
}, info) => {
  await open(page);
  const before = await applied(page);
  await page.getByRole('button', { name: 'Advanced JSON', exact: true }).click();
  const nativeId = await json(page).getAttribute('id');
  const visibleJSONLabel = page.locator('label[for="' + nativeId + '"]');
  await expect(visibleJSONLabel).toHaveText('Parameter JSON (data only)');
  await expect(page.locator('[data-mbb-parameter-json] textarea')).toHaveAttribute('id', nativeId);
  await visibleJSONLabel.click();
  await expect(json(page)).toBeFocused();
  await json(page).fill('{"format":');
  await apply(page).click();
  await expect(json(page)).toBeFocused();
  await expect(json(page)).toHaveAttribute('aria-invalid', 'true');
  const errorId = await json(page).getAttribute('aria-describedby');
  await expect(page.locator('[id="' + errorId + '"]')).toHaveAttribute('role', 'alert');
  expect(await applied(page)).toEqual(before);
  await page.screenshot({ path: screen(info, 'r4-invalid-json.png'), fullPage: true });
  await json(page).fill(JSON.stringify(params));
  await expect(json(page)).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('[id="' + errorId + '"]')).toHaveCount(0);
  await json(page).fill('{');
  await apply(page).click();
  await discard(page).click();
  await expect(json(page)).toHaveValue(JSON.stringify(params, null, 2));
  await expect(json(page)).not.toHaveAttribute('aria-invalid', 'true');
  expect(await applied(page)).toEqual(before);
});
test('r4 referenced deletion reports nodes, relationships and starting point without cascading', async ({
  page,
}, info) => {
  await open(page, { kind: 'node', id: 'node-0' });
  const before = await applied(page);
  const groups = page.getByRole('group', { name: 'Groups', exact: true });
  await groups.getByRole('button', { name: 'Remove item 1', exact: true }).click();
  await expect(page.locator('[data-mbb-removal-error]')).toContainText(
    'Nodes: Article 1, Article 2',
  );
  expect(await applied(page)).toEqual(before);
  await discard(page).click();
  await expect(page.locator('[data-mbb-removal-error]')).toHaveCount(0);
  const nodes = page.getByRole('group', { name: 'Nodes', exact: true });
  await nodes.getByRole('button', { name: 'Remove item 1', exact: true }).click();
  await expect(page.locator('[data-mbb-removal-error]')).toContainText('Edges: edge-0');
  await expect(page.locator('[data-mbb-removal-error]')).toContainText(
    'Mobile starting branch: Article 1',
  );
  await expect(nodes.getByRole('button', { name: 'Remove item 1', exact: true })).toHaveAttribute(
    'aria-describedby',
    /remove-error$/,
  );
  await page.getByRole('button', { name: 'Advanced JSON', exact: true }).click();
  expect(JSON.parse(await json(page).inputValue())).toEqual(before);
  await page.getByRole('button', { name: 'Parameter form', exact: true }).click();
  await page.getByRole('combobox', { name: 'Initial focus', exact: true }).selectOption('group');
  await page.getByRole('combobox', { name: 'Starting item', exact: true }).selectOption('practice');
  await page.getByRole('combobox', { name: 'Edit item: Groups', exact: true }).selectOption('1');
  await groups.getByRole('button', { name: 'Remove item 2', exact: true }).click();
  await expect(page.locator('[data-mbb-removal-error]')).toContainText('Nodes: Article 3');
  await expect(page.locator('[data-mbb-removal-error]')).toContainText(
    'Mobile starting branch: Practice',
  );
  await page.screenshot({ path: screen(info, 'r4-referenced-deletion.png'), fullPage: true });
  await discard(page).click();
  await expect(page.locator('[data-mbb-removal-error]')).toHaveCount(0);
  expect(await applied(page)).toEqual(before);
});
