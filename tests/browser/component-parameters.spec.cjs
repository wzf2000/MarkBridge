const { test, expect } = require('@playwright/test');
const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['value', 'behavior', 'enabled', 'details', 'items'],
  properties: {
    value: { type: 'integer', minimum: 0, maximum: 100 },
    behavior: { type: 'string', enum: ['complete', 'alternate'] },
    enabled: { type: 'boolean' },
    details: {
      type: 'object',
      additionalProperties: false,
      required: ['title'],
      properties: { title: { type: 'string', minLength: 1, maxLength: 12 } },
    },
    items: { type: 'array', minItems: 1, maxItems: 2, items: { type: 'string' } },
    optional: { type: 'string' },
  },
};
const params = {
  value: 42,
  behavior: 'complete',
  enabled: true,
  details: { title: '中😀' },
  items: ['first'],
};
test.skip(
  !process.env.MARKBRIDGE_TEST_RUNTIME,
  'Needs the sanitized real WordPress core editor runtime.',
);
async function open(page, options = {}) {
  await page.goto('/component-editor?locale=en_US');
  await expect(page.locator('iframe[name="editor-canvas"]')).toBeVisible();
  await page.evaluate(
    ({ schema, params, options }) => {
      window.MBBComponents.find((p) => p.id === 'fixture').schema = schema;
      if (options.otherVersion)
        window.MBBComponents.find((p) => p.id === 'fixture').version = '9.0.0';
      taskRegistry.dispatch('core/block-editor').updateBlockAttributes(taskBlocks[0].clientId, {
        params: { ...params, ...options.params },
      });
      taskRegistry.dispatch('core/block-editor').selectBlock(taskBlocks[0].clientId);
    },
    { schema, params, options },
  );
  // The fixture starts with the provider's two-field form. Wait for this
  // test's replacement schema/attributes to commit before editing a field
  // that exists in both forms; iframe visibility alone does not prove that.
  if (
    !options.otherVersion &&
    !Object.keys(options.params || {}).some((key) => !schema.properties[key])
  )
    await expect(
      page.getByRole('textbox', { name: 'params.details.title', exact: true }),
    ).toHaveValue((options.params?.details || params.details).title);
}
const apply = (page) => page.getByRole('button', { name: 'Apply parameters', exact: true });
const discard = (page) =>
  page.getByRole('button', { name: 'Discard parameter input', exact: true });
const json = (page) =>
  page.getByRole('textbox', { name: 'Parameter JSON (data only)', exact: true });
async function exported(page) {
  await page.locator('#export-tasks').click();
  return page.locator('#task-export');
}
test('trusted exact-version schema form shares a draft with JSON and applies only explicitly', async ({
  page,
}, info) => {
  await open(page);
  const number = page.getByRole('textbox', { name: 'params.value', exact: true });
  await expect(number).toHaveValue('42');
  await number.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('combobox', { name: 'params.behavior', exact: true })).toBeFocused();
  await number.fill('43');
  await page.getByRole('checkbox', { name: 'params.enabled', exact: true }).uncheck();
  await page.getByRole('combobox', { name: 'params.behavior', exact: true }).selectOption('1');
  await page.getByRole('textbox', { name: 'params.details.title', exact: true }).fill('新😀');
  await page.getByRole('button', { name: 'Add field: params.optional', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'params.optional', exact: true })
    .fill('keep newline\n文字');
  await page.getByRole('button', { name: 'Add item: params.items', exact: true }).click();
  await page.getByRole('textbox', { name: 'params.items.1', exact: true }).fill('second');
  await expect(
    page.getByRole('button', { name: 'Add item: params.items', exact: true }),
  ).toBeDisabled();
  expect(await page.evaluate(() => taskBlocks[0].attributes.params.value)).toBe(42);
  await expect(await exported(page)).toContainText('ERROR: Parameters have not been applied');
  await page.getByRole('button', { name: 'Advanced JSON', exact: true }).click();
  const candidate = JSON.parse(await json(page).inputValue());
  expect(candidate).toEqual({
    value: 43,
    behavior: 'alternate',
    enabled: false,
    details: { title: '新😀' },
    items: ['first', 'second'],
    optional: 'keep newline\n文字',
  });
  await page.evaluate(() => taskRegistry.dispatch('core/block-editor').clearSelectedBlock());
  await page.evaluate(() =>
    taskRegistry.dispatch('core/block-editor').selectBlock(taskBlocks[0].clientId),
  );
  // Inspector recreation preserves the single pending candidate, regardless of visible editor mode.
  if ((await json(page).count()) === 0)
    await page.getByRole('button', { name: 'Advanced JSON', exact: true }).click();
  expect(JSON.parse(await json(page).inputValue())).toEqual(candidate);
  await apply(page).click();
  await expect(await exported(page)).toContainText('"value":43');
  expect(await page.evaluate(() => taskBlocks[0].attributes.params)).toEqual(candidate);
  await page.getByRole('button', { name: 'Parameter form', exact: true }).click();
  await number.fill('99');
  await discard(page).click();
  await expect(number).toHaveValue('43');
  await expect(await exported(page)).toContainText('Editable static fallback');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('schema-form.png'), fullPage: true });
});
test('invalid fields preserve input, block apply/export, and JSON cannot bypass current schema', async ({
  page,
}) => {
  await open(page);
  const number = page.getByRole('textbox', { name: 'params.value', exact: true });
  await number.fill('-');
  await expect(number).toHaveValue('-');
  await expect(number).toHaveAttribute('aria-invalid', 'true');
  await apply(page).click();
  expect(await page.evaluate(() => taskBlocks[0].attributes.params.value)).toBe(42);
  await expect(await exported(page)).toContainText('ERROR: Parameters have not been applied');
  await discard(page).click();
  await expect(number).toHaveValue('42');
  await page.getByRole('button', { name: 'Advanced JSON', exact: true }).click();
  await json(page).fill(JSON.stringify({ ...params, value: 101, unknown: { retained: true } }));
  await apply(page).click();
  await expect(json(page)).toHaveValue(/"retained":true/);
  await expect(await exported(page)).toContainText('ERROR: Parameters have not been applied');
  await discard(page).click();
  await expect(await exported(page)).not.toContainText('ERROR:');
  // The schema may change while a draft exists. Apply re-reads the trusted provider.
  await json(page).fill(JSON.stringify({ ...params, value: 50 }));
  await page.evaluate(() => {
    MBBComponents.find((p) => p.id === 'fixture').schema.properties.value.maximum = 45;
  });
  await apply(page).click();
  expect(await page.evaluate(() => taskBlocks[0].attributes.params.value)).toBe(42);
  await expect(await exported(page)).toContainText('ERROR: Parameters have not been applied');
});
test('unknown fields and unmatched versions retain JSON fallback; invalid baseline remains locked after discard', async ({
  page,
}) => {
  await open(page, { params: { authorExtra: { text: 'retain😀' } } });
  await expect(json(page)).toHaveValue(/retain😀/);
  await expect(page.getByRole('button', { name: 'Parameter form', exact: true })).toHaveCount(0);
  await discard(page).click();
  await expect(await exported(page)).toContainText('ERROR: Parameters have not been applied');
  await open(page, { otherVersion: true });
  await expect(json(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Parameter form', exact: true })).toHaveCount(0);
  expect(JSON.parse(await json(page).inputValue())).toEqual(params);
});
test('temporary Edit unmount preserves a draft; deleting and restoring a block clears it', async ({
  page,
}, info) => {
  // A test-only core BlockEdit filter lets us unmount/recreate Edit without
  // changing the block store, attributes, or its disabled HTML support.
  await page.route('**/wp-content/plugins/markdown-block-bridge/kernel.js', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body:
        (await response.text()) +
        `
wp.hooks.addFilter('editor.BlockEdit', 'mbb-test/parameter-lifetime', Edit => props => {
  const [visible, setVisible] = wp.element.useState(true);
  window.parameterEditVisibility ||= {};
  window.parameterEditVisibility[props.clientId] = setVisible;
  return visible ? wp.element.createElement(Edit, props) : null;
});`,
    });
  });
  await open(page);
  const number = page.getByRole('textbox', { name: 'params.value', exact: true });
  await number.fill('99');
  await expect(number).toHaveValue('99');
  await page.evaluate(() => {
    window.parameterBlockSnapshot = taskRegistry
      .select('core/block-editor')
      .getBlock(taskBlocks[0].clientId);
    parameterEditVisibility[parameterBlockSnapshot.clientId](false);
  });
  await expect(number).toHaveCount(0);
  expect(await page.evaluate(() => MarkBridgeParameterDrafts.pending())).toBe(true);
  await expect(await exported(page)).toContainText('ERROR: Parameters have not been applied');
  await page.evaluate(() => parameterEditVisibility[parameterBlockSnapshot.clientId](true));
  await expect(number).toHaveValue('99');
  // Delete while Edit is already unmounted: store ownership must clear the draft
  // without relying on another component cleanup. Restore the exact block/id,
  // modelling history restoration; this local provider has no Ctrl-Z history.
  await page.evaluate(() => parameterEditVisibility[parameterBlockSnapshot.clientId](false));
  await expect(number).toHaveCount(0);
  await page.evaluate(() =>
    taskRegistry.dispatch('core/block-editor').removeBlocks([parameterBlockSnapshot.clientId]),
  );
  await expect.poll(() => page.evaluate(() => MarkBridgeParameterDrafts.pending())).toBe(false);
  await expect(await exported(page)).not.toContainText('Parameters have not been applied');
  await page.evaluate(() => {
    const editor = taskRegistry.dispatch('core/block-editor');
    editor.insertBlocks([parameterBlockSnapshot], 0);
    editor.selectBlock(parameterBlockSnapshot.clientId);
  });
  await expect(number).toHaveValue('42');
  expect(await page.evaluate(() => MarkBridgeParameterDrafts.pending())).toBe(false);
  expect(
    await page.evaluate(
      () =>
        taskRegistry.select('core/block-editor').getBlock(parameterBlockSnapshot.clientId)
          .attributes.params,
    ),
  ).toEqual(params);
  await expect(await exported(page)).not.toContainText('Parameters have not been applied');
  await page.screenshot({
    path: info.outputPath('restored-applied-parameters.png'),
    fullPage: true,
  });
});
