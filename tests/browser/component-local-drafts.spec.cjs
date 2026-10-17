const { test, expect } = require('@playwright/test');
test.skip(!process.env.MARKBRIDGE_TEST_RUNTIME, 'Needs the real core editor fixture.');
async function open(page) {
  if (page.viewportSize().width > 600) await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/component-editor?locale=en_US&history=1');
  await expect(page.locator('iframe[name="editor-canvas"]')).toBeVisible();
  await page.evaluate(() => {
    window.authorCalls = [];
    MBBComponents.find((p) => p.id === 'fixture').schema = {
      type: 'object',
      additionalProperties: false,
      required: ['value', 'behavior'],
      properties: {
        value: { type: 'integer', minimum: 0, maximum: 100 },
        behavior: { type: 'string' },
      },
    };
    MarkBridgeComponentAuthors.register({
      apiVersion: 1,
      component: 'fixture',
      componentVersion: '0.1.0',
      supports: () => true,
      Editor(props) {
        window.currentAuthor = props;
        window.authorCalls.push(props);
        return wp.element.createElement(
          'div',
          {},
          wp.element.createElement(
            'label',
            {},
            'Local CSV',
            wp.element.createElement('textarea', {
              'aria-label': 'Local CSV',
              value: props.localDraft?.csv || '',
              onChange: (e) => props.onLocalDraftChange({ csv: e.target.value }),
            }),
          ),
          wp.element.createElement(
            'p',
            { role: 'status' },
            props.localDraft ? 'Local edits pending' : 'No local edits',
          ),
          wp.element.createElement(
            'button',
            {
              onClick: () =>
                props.onChange({ ...props.value, value: 43 }, { consumeLocalDraft: true }),
            },
            'Prepare local input',
          ),
        );
      },
    });
    taskRegistry.dispatch('core/block-editor').clearSelectedBlock();
    taskRegistry.dispatch('core/block-editor').selectBlock(taskBlocks[0].clientId);
  });
  await page.getByRole('button', { name: 'Visual editor', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Local CSV', exact: true })).toBeVisible();
}
const local = (page) => page.getByRole('textbox', { name: 'Local CSV', exact: true });
const apply = (page) => page.getByRole('button', { name: 'Apply parameters', exact: true });
const discard = (page) =>
  page.getByRole('button', { name: 'Discard parameter input', exact: true });
async function exported(page) {
  await page.locator('#export-tasks').click();
  return page.locator('#task-export');
}
async function stale(page, field, expression) {
  const result = await page.evaluate(
    ({ field, expression }) => {
      try {
        window[field].onLocalDraftChange({ csv: expression });
        return 'accepted';
      } catch (e) {
        return e.message;
      }
    },
    { field, expression },
  );
  expect(result).toContain('author candidate changed');
}
test('local tool input locks save, survives modes/remount, consumes atomically and discards safely', async ({
  page,
}, info) => {
  await open(page);
  expect(await page.evaluate(() => MarkBridgeComponentAuthors.localDraftVersion)).toBe(1);
  await page.evaluate(() => (window.beforeEdit = window.currentAuthor));
  await local(page).fill('x,y\n1,2');
  await expect(page.getByText('Local edits pending', { exact: true })).toBeVisible();
  await stale(page, 'beforeEdit', 'late input');
  await page.screenshot({ path: info.outputPath('local-author-pending.png'), fullPage: true });
  expect(await page.evaluate(() => taskBlocks[0].attributes.params.value)).toBe(42);
  await expect(await exported(page)).toContainText('ERROR: Parameters have not been applied');
  await apply(page).click();
  await expect(
    page.getByText('Prepare or discard local author edits before applying parameters.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.beforeMode = window.currentAuthor;
    currentAuthor.localDraft.csv = 'mutated clone';
  });
  await page.getByRole('button', { name: 'Advanced JSON', exact: true }).click();
  await stale(page, 'beforeMode', 'late mode input');
  await page.getByRole('button', { name: 'Visual editor', exact: true }).click();
  await expect(local(page)).toHaveValue('x,y\n1,2');
  await page.evaluate(() => (window.beforeUnmount = window.currentAuthor));
  await page.evaluate(() => taskRegistry.dispatch('core/block-editor').clearSelectedBlock());
  await expect(local(page)).toHaveCount(0);
  await page.evaluate(() =>
    taskRegistry.dispatch('core/block-editor').selectBlock(taskBlocks[0].clientId),
  );
  await page.getByRole('button', { name: 'Visual editor', exact: true }).click();
  await expect(local(page)).toHaveValue('x,y\n1,2');
  await stale(page, 'beforeUnmount', 'late unmounted input');
  const invalid = await page.evaluate(() => ({
    bad: currentAuthor.onChange(
      { ...currentAuthor.value, value: 'bad' },
      { consumeLocalDraft: true },
    ),
    huge: (() => {
      try {
        currentAuthor.onLocalDraftChange({ csv: 'x'.repeat(16384) });
        return false;
      } catch {
        return true;
      }
    })(),
  }));
  expect(invalid).toEqual({ bad: false, huge: true });
  await expect(local(page)).toHaveValue('x,y\n1,2');
  await expect(await exported(page)).toContainText('ERROR: Parameters have not been applied');
  // A legacy one-argument author change does not consume a tool draft.
  await page.evaluate(() => currentAuthor.onChange({ ...currentAuthor.value, value: 44 }));
  await expect(local(page)).toHaveValue('x,y\n1,2');
  await apply(page).click();
  expect(await page.evaluate(() => taskBlocks[0].attributes.params.value)).toBe(42);
  await page.evaluate(() => currentAuthor.onLocalDraftChange(null));
  await expect(local(page)).toHaveValue('');
  // Clearing local input preserves the separate unapplied value=44 candidate.
  await page.getByRole('button', { name: 'Advanced JSON', exact: true }).click();
  expect(
    JSON.parse(
      await page
        .getByRole('textbox', { name: 'Parameter JSON (data only)', exact: true })
        .inputValue(),
    ).value,
  ).toBe(44);
  await expect(await exported(page)).toContainText('ERROR: Parameters have not been applied');
  await page.getByRole('button', { name: 'Visual editor', exact: true }).click();
  await local(page).fill('prepare this input');
  await page.getByRole('button', { name: 'Prepare local input', exact: true }).click();
  await expect(local(page)).toHaveValue('');
  expect(await page.evaluate(() => taskBlocks[0].attributes.params.value)).toBe(42);
  await expect(await exported(page)).toContainText('ERROR: Parameters have not been applied');
  await apply(page).click();
  expect(await page.evaluate(() => taskBlocks[0].attributes.params.value)).toBe(43);
  await expect(await exported(page)).not.toContainText('ERROR:');
  await page.evaluate(() => wp.data.dispatch('core').undo());
  await expect.poll(() => page.evaluate(() => taskBlocks[0].attributes.params.value)).toBe(42);
  await page.evaluate(() => wp.data.dispatch('core').redo());
  await expect.poll(() => page.evaluate(() => taskBlocks[0].attributes.params.value)).toBe(43);
  await local(page).fill('not applied');
  await page.evaluate(() => (window.beforeDiscard = window.currentAuthor));
  await discard(page).click();
  await expect(local(page)).toHaveValue('');
  await stale(page, 'beforeDiscard', 'late discarded input');
  await expect(await exported(page)).not.toContainText('ERROR:');
  await page.screenshot({ path: info.outputPath('local-author-draft.png'), fullPage: true });
});
test('baseline and identity changes invalidate tool callbacks without clearing newer drafts', async ({
  page,
}) => {
  await open(page);
  await local(page).fill('keep input');
  await page.evaluate(() => {
    window.beforeBaseline = currentAuthor;
    window.MBB_EDITOR ||= {};
    MBB_EDITOR.state ||= {};
    MBB_EDITOR.state.expected = 'changed';
  });
  await stale(page, 'beforeBaseline', 'stale baseline input');
  await expect(local(page)).toHaveValue('keep input');
  await page.getByRole('button', { name: 'Advanced JSON', exact: true }).click();
  await page.getByRole('button', { name: 'Visual editor', exact: true }).click();
  await page.evaluate(() => {
    window.beforeIdentity = currentAuthor;
    taskRegistry
      .dispatch('core/block-editor')
      .updateBlockAttributes(taskBlocks[0].clientId, { id: 'changed-instance' });
  });
  // A changed block identity may retain the pending input, but cannot accept old callbacks.
  await expect
    .poll(() => page.evaluate(() => taskBlocks[0].attributes.id))
    .toBe('changed-instance');
  await stale(page, 'beforeIdentity', 'stale instance identity');
  // Component identity itself includes exact type/version/activity; test the applied params baseline too.
  await page.evaluate(() =>
    taskRegistry.dispatch('core/block-editor').updateBlockAttributes(taskBlocks[0].clientId, {
      params: { value: 50, behavior: 'complete' },
    }),
  );
  await stale(page, 'beforeIdentity', 'stale applied params');
  await expect(await exported(page)).toContainText('ERROR: Parameters have not been applied');
  await discard(page).click();
  await expect(await exported(page)).not.toContainText('ERROR:');
});
