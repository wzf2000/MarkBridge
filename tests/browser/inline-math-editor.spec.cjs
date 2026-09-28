const { test, expect } = require('@playwright/test');
test.skip(!process.env.MARKBRIDGE_TEST_RUNTIME, 'requires the real WordPress editor runtime');

const source = 'Before $x^2$ between $y_0$ after\\.\n\nSecond paragraph\\.\n';
const formula = (page, index) => page.locator('#task-editor span.mbb-math').nth(index);

async function exportMarkdown(page) {
  await page.locator('#export-tasks').click();
  return page.locator('#task-export').textContent();
}

test('inline formulas render in place without changing the saved span or Markdown', async ({
  page,
}) => {
  await page.goto('/inline-math-editor');
  await expect(page.locator('#task-editor span.mbb-math')).toHaveCount(2);
  await expect
    .poll(() =>
      formula(page, 0).evaluate((node) => !!node.shadowRoot?.querySelector('mjx-container')),
    )
    .toBe(true);
  await expect
    .poll(() =>
      formula(page, 1).evaluate((node) => !!node.shadowRoot?.querySelector('mjx-container')),
    )
    .toBe(true);
  expect(await formula(page, 0).evaluate((node) => node.outerHTML)).toContain('data-mbb-tex="x^2"');
  expect(await formula(page, 0).evaluate((node) => node.textContent)).toBe('$x^2$');
  expect(await exportMarkdown(page)).toBe(source);
  expect(await page.evaluate(() => wp.blocks.serialize(taskBlocks))).toContain(
    'data-mbb-tex="x^2"',
  );
  expect(await page.evaluate(() => wp.blocks.serialize(taskBlocks))).toMatch(
    /<span[^>]*data-mbb-tex="x\^2"[^>]*>\$x\^2\$<\/span>/,
  );
  await expect(page.locator('.mbb-paragraph-preview')).toHaveCount(0);
});

test('edit one adjacent formula and keep the other formula and surrounding text', async ({
  page,
}) => {
  await page.goto('/inline-math-editor');
  await expect(formula(page, 0)).toBeVisible();
  await formula(page, 0).click();
  const input = page.locator('.mbb-inline-math-source');
  await expect(input).toHaveValue('x^2');
  await input.fill('x^3');
  await expect(page.locator('.mbb-inline-math-small-preview mjx-container')).toBeVisible();
  await page.getByRole('button', { name: '应用公式' }).click();
  await expect(formula(page, 0)).toHaveAttribute('data-mbb-tex', 'x^3');
  await expect(formula(page, 1)).toHaveAttribute('data-mbb-tex', 'y_0');
  expect(await exportMarkdown(page)).toBe(
    'Before $x^3$ between $y_0$ after\\.\n\nSecond paragraph\\.\n',
  );
  expect(await page.evaluate(() => wp.blocks.serialize(taskBlocks))).toContain(
    'data-mbb-tex="x^3"',
  );
  expect(await page.evaluate(() => wp.blocks.serialize(taskBlocks))).toMatch(
    /<span[^>]*data-mbb-tex="x\^3"[^>]*>\$x\^3\$<\/span>/,
  );
});

test('keyboard activation, cancel, and ordinary paragraph editing preserve formulas', async ({
  page,
}) => {
  await page.goto('/inline-math-editor');
  const trigger = formula(page, 1).locator('xpath=..');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.mbb-inline-math-source')).toHaveValue('y_0');
  await page.locator('.mbb-inline-math-source').fill('wrong');
  await page.keyboard.press('Escape');
  await expect(page.locator('.mbb-inline-math-source')).toHaveCount(0);
  await expect(formula(page, 1)).toHaveAttribute('data-mbb-tex', 'y_0');
  const paragraph = page.locator('#task-editor .block-editor-rich-text__editable').first();
  await paragraph.click();
  await paragraph.press('End');
  await paragraph.press('!');
  expect(await exportMarkdown(page)).toContain('Before $x^2$ between $y_0$ after\\.\\!');
});

test('caret edits beside a formula keep both inline objects distinct', async ({ page }) => {
  await page.goto('/inline-math-editor');
  await expect(formula(page, 0)).toBeVisible();
  const editable = page.locator('#task-editor .block-editor-rich-text__editable').first();
  await editable.click();
  await page.evaluate(() => {
    const root = document.querySelector('#task-editor .block-editor-rich-text__editable');
    const wrapper = root.querySelector('span.mbb-math').parentElement;
    const range = document.createRange();
    range.setStartAfter(wrapper);
    range.collapse(true);
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    root.focus();
  });
  await page.keyboard.type('Z');
  await expect(formula(page, 0)).toHaveAttribute('data-mbb-tex', 'x^2');
  await expect(formula(page, 1)).toHaveAttribute('data-mbb-tex', 'y_0');
  expect(await exportMarkdown(page)).toContain('$x^2$Z between $y_0$');
  await formula(page, 0).click();
  await page.locator('.mbb-inline-math-source').fill('x^4');
  await page.getByRole('button', { name: '应用公式' }).click();
  await expect(formula(page, 0)).toHaveAttribute('data-mbb-tex', 'x^4');
  await expect(formula(page, 1)).toHaveAttribute('data-mbb-tex', 'y_0');
  expect(await exportMarkdown(page)).toContain('$x^4$Z between $y_0$');
});

test('same-origin editor iframe uses its own styles; invalid TeX leaves source visible', async ({
  page,
}) => {
  await page.goto('/inline-math-editor');
  await page.evaluate(() => {
    const frame = document.createElement('iframe');
    frame.id = 'math-canvas';
    frame.srcdoc =
      '<div contenteditable="true"><span class="mbb-math" data-mbb-tex="a+b">$a+b$</span></div>';
    document.body.append(frame);
    const invalid = document.createElement('span');
    invalid.className = 'mbb-math';
    invalid.dataset.mbbTex = '\\notARealCommand{x}';
    invalid.textContent = '$\\notARealCommand{x}$';
    document.querySelector('#task-editor .block-editor-rich-text__editable').append(invalid);
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const host = document
          .querySelector('#math-canvas')
          ?.contentDocument?.querySelector('.mbb-math');
        return !!host?.shadowRoot?.querySelector('mjx-container');
      }),
    )
    .toBe(true);
  expect(
    await page.evaluate(() => {
      const owner = document.querySelector('#math-canvas').contentDocument;
      return owner.head.querySelector('style[data-mbb-editor-chtml]')?.textContent.length > 0;
    }),
  ).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const host = [...document.querySelectorAll('#task-editor span.mbb-math')].find((node) =>
          node.dataset.mbbTex.startsWith('\\notARealCommand'),
        );
        return !!host?.shadowRoot?.querySelector('slot');
      }),
    )
    .toBe(true);
});

test('an externally changed formula cannot be overwritten by an open source panel', async ({
  page,
}) => {
  await page.goto('/inline-math-editor');
  await formula(page, 0).click();
  await expect(page.locator('.mbb-inline-math-source')).toHaveValue('x^2');
  await page.locator('.mbb-inline-math-source').fill('x^9');
  await formula(page, 0).evaluate((node) => node.setAttribute('data-mbb-tex', 'x^5'));
  await page.getByRole('button', { name: '应用公式' }).click();
  await expect(page.getByRole('alert')).toContainText('重新选择');
  expect(await exportMarkdown(page)).toBe(source);
});
