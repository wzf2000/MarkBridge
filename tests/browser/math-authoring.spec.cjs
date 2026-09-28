const { test, expect } = require('@playwright/test');
test.skip(!process.env.MARKBRIDGE_TEST_RUNTIME, 'requires the real WordPress editor runtime');

const browserFailures = new WeakMap();
test.beforeEach(async ({ page }) => {
  const failures = [];
  browserFailures.set(page, failures);
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(browserFailures.get(page) || []).toEqual([]);
});

const body = (page) => page.locator('#task-editor .block-editor-rich-text__editable');
const formulas = (page) => page.locator('#task-editor span.mbb-math[data-mbb-tex]');

test('typing a closing dollar creates one inline object, while money remains text', async ({
  page,
}) => {
  await page.goto('/inline-math-editor');
  const paragraph = body(page).nth(1);
  await paragraph.click();
  await paragraph.press('End');
  await page.keyboard.type(' Cost $5 and $10. Formula $a = b$ tail');
  await expect(formulas(page)).toHaveCount(3);
  await expect(formulas(page).last()).toHaveAttribute('data-mbb-tex', 'a = b');
  await expect(paragraph).toContainText('Cost $5 and $10');
  await expect(paragraph).toContainText('tail');
  await page.locator('#export-tasks').click();
  await expect(page.locator('#task-export')).toContainText('$a = b$');
  await expect(page.locator('#task-export')).toContainText('$a = b$ tail');
  await expect(page.locator('#task-export')).toContainText('\\$5 and \\$10');
});

test('escaped dollars, pasted TeX, and code block text do not auto-convert', async ({
  page,
  context,
}) => {
  await page.goto('/inline-math-editor');
  const paragraph = body(page).nth(1);
  await paragraph.click();
  await paragraph.press('End');
  await page.keyboard.type(' Escaped \\$x$');
  await expect(formulas(page)).toHaveCount(2);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => navigator.clipboard.writeText(' pasted $z^2$'));
  await page.keyboard.press('ControlOrMeta+v');
  await expect(formulas(page)).toHaveCount(2);
  await expect(paragraph).toContainText('pasted $z^2$');
  await page.evaluate(() => {
    taskRegistry.dispatch('core/block-editor').insertBlocks(
      wp.blocks.createBlock('core/code', {
        content: '',
      }),
    );
  });
  const code = page.locator('#task-editor [data-type="core/code"] [contenteditable="true"]');
  await code.focus();
  await page.keyboard.type('$w^2$');
  await expect(formulas(page)).toHaveCount(2);
  await expect(code).toContainText('$w^2$');
});

test('synthetic composing input and a single committed insertion keep dollar text literal', async ({
  page,
}) => {
  await page.goto('/inline-math-editor');
  const paragraph = body(page).nth(1);
  await paragraph.click();
  await paragraph.press('End');
  await paragraph.evaluate((root) => {
    root.dispatchEvent(
      new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: '$',
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await page.keyboard.insertText(' $x^2$');
  await expect(paragraph).toContainText('$x^2$');
  await expect(formulas(page)).toHaveCount(2);
});

for (const [label, source, selector] of [
  [
    'heading',
    '# Heading\n',
    '#task-editor [data-type="core/heading"][contenteditable], #task-editor [data-type="core/heading"] [contenteditable]',
  ],
  ['quote', '> Quoted\n', '#task-editor [data-type="core/quote"] [contenteditable]'],
  [
    'list item',
    '- Listed\n',
    '#task-editor [data-type="core/list"] [contenteditable], #task-editor [data-type="mbb/list"] [contenteditable]',
  ],
]) {
  test(`typing adjacent formulas in a ${label} keeps both objects and Markdown`, async ({
    page,
  }) => {
    await page.goto('/inline-math-editor');
    await page.evaluate((markdown) => {
      taskRegistry.dispatch('core/block-editor').insertBlocks(MBB.toBlocks(markdown));
    }, source);
    const editable =
      label === 'list item'
        ? page.getByRole('textbox', { name: 'List text' })
        : page.locator(selector).last();
    await editable.click();
    await editable.press('End');
    await page.keyboard.type(' $a$', { delay: 30 });
    await expect(formulas(page)).toHaveCount(3);
    await page.keyboard.type(' $b$ tail');
    await expect(formulas(page)).toHaveCount(4);
    await expect(formulas(page).nth(2)).toHaveAttribute('data-mbb-tex', 'a');
    await expect(formulas(page).nth(3)).toHaveAttribute('data-mbb-tex', 'b');
    await page.locator('#export-tasks').click();
    await expect(page.locator('#task-export')).toContainText('$a$ $b$ tail');
  });
}

test('zero-gap second formula remains literal so its Markdown stays reversible', async ({
  page,
}) => {
  await page.goto('/inline-math-editor');
  const paragraph = body(page).nth(1);
  await paragraph.click();
  await paragraph.press('End');
  await page.keyboard.type(' $a$', { delay: 30 });
  await expect(formulas(page)).toHaveCount(3);
  await page.keyboard.type('$b$ tail');
  await expect(formulas(page)).toHaveCount(3);
  await expect(paragraph).toContainText('$b$ tail');
  await page.locator('#export-tasks').click();
  await expect(page.locator('#task-export')).toContainText('$a$\\$b\\$ tail');
});

test('math toolbar creates an inline object from selected plain text', async ({ page }) => {
  await page.goto('/inline-math-editor');
  const paragraph = body(page).nth(1);
  await paragraph.click();
  await paragraph.press('Home');
  for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowRight');
  const button = page.getByRole('button', { name: '数学（MathJax）', exact: true });
  if (await button.isVisible()) await button.click();
  else {
    await page
      .getByRole('button', { name: /More|更多/ })
      .first()
      .click();
    await page.getByRole('menuitem', { name: '数学（MathJax）' }).click();
  }
  await expect(page.locator('.mbb-inline-math-source')).toHaveValue('Second');
  await page.getByRole('button', { name: '应用公式' }).click();
  await expect(formulas(page).last()).toHaveAttribute('data-mbb-tex', 'Second');
  await page.locator('#export-tasks').click();
  await expect(page.locator('#task-export')).toContainText('$Second$ paragraph');
});

test('math toolbar refuses a formatted text selection without replacing it', async ({ page }) => {
  await page.goto('/inline-math-editor');
  await page.evaluate(() => {
    const block = taskBlocks[1];
    taskRegistry.dispatch('core/block-editor').updateBlockAttributes(block.clientId, {
      content: '<strong>Bold</strong> text',
    });
  });
  const paragraph = body(page).nth(1);
  await paragraph.click();
  await paragraph.press('Home');
  for (let index = 0; index < 4; index++) await paragraph.press('Shift+ArrowRight');
  const button = page.getByRole('button', { name: '数学（MathJax）', exact: true });
  if (await button.isVisible()) await button.click();
  else {
    await page
      .getByRole('button', { name: /More|更多/ })
      .first()
      .click();
    await page.getByRole('menuitem', { name: '数学（MathJax）' }).click();
  }
  await expect(page.locator('.mbb-inline-math-source')).toHaveValue('Bold');
  await expect(page.getByRole('alert')).toContainText('选区含其他格式');
  await page.getByRole('button', { name: '应用公式' }).click();
  await expect(formulas(page)).toHaveCount(2);
  await page.getByRole('button', { name: '取消' }).click();
  await page.locator('#export-tasks').click();
  await expect(page.locator('#task-export')).toContainText('**Bold** text');
});

test('math toolbar starts empty without selection and refuses invalid TeX', async ({ page }) => {
  await page.goto('/inline-math-editor');
  const paragraph = body(page).nth(1);
  await paragraph.click();
  await paragraph.press('End');
  const button = page.getByRole('button', { name: '数学（MathJax）', exact: true });
  if (await button.isVisible()) await button.click();
  else {
    await page
      .getByRole('button', { name: /More|更多/ })
      .first()
      .click();
    await page.getByRole('menuitem', { name: '数学（MathJax）' }).click();
  }
  const input = page.locator('.mbb-inline-math-source');
  await expect(input).toHaveValue('');
  await input.fill('\\notARealCommand{x}');
  await expect(page.getByRole('alert')).toContainText(/未定义|无法|Undefined|Unknown/);
  await expect(page.getByRole('button', { name: '应用公式' })).toBeDisabled();
  await input.fill('\\frac{1}{2}');
  await expect(page.getByRole('button', { name: '应用公式' })).toBeEnabled();
  await page.getByRole('button', { name: '应用公式' }).click();
  await expect(formulas(page).last()).toHaveAttribute('data-mbb-tex', '\\frac{1}{2}');
  await page.keyboard.type(' afternew');
  await expect(paragraph).toContainText('afternew');
  await page.locator('#export-tasks').click();
  await expect(page.locator('#task-export')).toContainText('$\\frac{1}{2}$ afternew');
});

test('double dollar Enter in a paragraph creates focused display math without a newline', async ({
  page,
}) => {
  await page.goto('/inline-math-editor');
  await page.evaluate(() => {
    taskRegistry
      .dispatch('core/block-editor')
      .insertBlocks(wp.blocks.createBlock('core/paragraph', { content: '' }));
  });
  const paragraph = body(page).last();
  await paragraph.focus();
  await page.keyboard.type('$$');
  await page.keyboard.press('Enter');
  await expect(page.locator('#task-editor [data-type="mbb/math"]')).toHaveCount(1);
  const source = page.locator('#task-editor [data-type="mbb/math"] textarea');
  await expect(source).toBeFocused();
  await expect(source).toHaveValue('');
  await source.fill('x^2 + y^2');
  await page.locator('#export-tasks').click();
  await expect(page.locator('#task-export')).toContainText('$$\nx^2 + y^2\n$$');
});

test('double dollar Enter in heading or code does not create a display math block', async ({
  page,
}) => {
  await page.goto('/inline-math-editor');
  await page.evaluate(() => {
    taskRegistry
      .dispatch('core/block-editor')
      .insertBlocks([
        wp.blocks.createBlock('core/heading', { content: '' }),
        wp.blocks.createBlock('core/code', { content: '' }),
      ]);
  });
  for (const type of ['core/heading', 'core/code']) {
    const editable = page
      .locator(
        `#task-editor [data-type="${type}"][contenteditable], #task-editor [data-type="${type}"] [contenteditable]`,
      )
      .first();
    await editable.focus();
    await page.keyboard.type('$$');
    await page.keyboard.press('Enter');
    await expect(page.locator('#task-editor [data-type="mbb/math"]')).toHaveCount(0);
  }
});

test('native math inspection accepts recoverable TeX and rejects lost attributes or mismatched MathML', async ({
  page,
}) => {
  await page.goto('/inline-math-editor');
  const result = await page.evaluate(() => {
    const example = wp.blocks.getBlockType('core/math').example.attributes;
    return {
      example: MBB.inspectNativeMath(
        { tex: example.latex, mathML: example.mathML, attributes: example },
        document,
      ),
      mismatched: MBB.inspectNativeMath(
        {
          tex: 'x^2',
          mathML:
            '<semantics><mi>x</mi><annotation encoding="application/x-tex">y^2</annotation></semantics>',
          attributes: { latex: 'x^2', mathML: '' },
        },
        document,
      ),
      missingAnnotation: MBB.inspectNativeMath(
        {
          tex: 'x^2',
          mathML: '<semantics><msup><mi>x</mi><mn>2</mn></msup></semantics>',
          attributes: { latex: 'x^2', mathML: '' },
        },
        document,
      ),
      styled: MBB.inspectNativeMath(
        { tex: 'x^2', attributes: { latex: 'x^2', style: { color: { text: '#f00' } } } },
        document,
      ),
      html: MBB.inspectNativeMath(
        { tex: 'x^2', mathML: '<script>alert(1)</script>', attributes: { latex: 'x^2' } },
        document,
      ),
    };
  });
  expect(result.example).toBeNull();
  expect(result.mismatched).toMatch(/不一致/);
  expect(result.missingAnnotation).toMatch(/语义结构|源码注释/);
  expect(result.styled).toMatch(/额外样式/);
  expect(result.html).toMatch(/不支持|语义结构/);
});

test('native math conversion rejects a display tree that disagrees with its TeX annotation', async ({
  page,
}) => {
  await page.goto('/inline-math-editor');
  const result = await page.evaluate(async () => {
    const { default: latexToMathML } = await import('@wordpress/latex-to-mathml');
    const matching = latexToMathML('1', { displayMode: true });
    const misleading =
      '<semantics><mn>2</mn><annotation encoding="application/x-tex">1</annotation></semantics>';
    return {
      structural: MBB.inspectNativeMath(
        { tex: '1', mathML: misleading, attributes: { latex: '1', mathML: misleading } },
        document,
      ),
      matching: await MBB.verifyNativeMathML('1', matching, true, document),
      misleading: await MBB.verifyNativeMathML('1', misleading, true, document),
    };
  });
  expect(result.structural).toBeNull();
  expect(result.matching).toBeNull();
  expect(result.misleading).toMatch(/不一致/);
});

test('selected native inline math converts explicitly to a paired MathJax span', async ({
  page,
}) => {
  await page.goto('/inline-math-editor');
  await page.evaluate(async () => {
    const { default: latexToMathML } = await import('@wordpress/latex-to-mathml');
    const block = taskBlocks[1];
    taskRegistry.dispatch('core/block-editor').updateBlockAttributes(block.clientId, {
      content: `Native <math data-latex="x^2">${latexToMathML('x^2', { displayMode: false })}</math> after`,
    });
  });
  const native = page.locator('#task-editor math[data-latex="x^2"]');
  await expect(native).toHaveCount(1);
  expect(
    await page.evaluate(() => !!wp.data.select('core/rich-text').getFormatType('core/math')),
  ).toBe(true);
  const paragraph = body(page).nth(1);
  await paragraph.click();
  await native.evaluate((math) => {
    const object = math.closest('[data-rich-text-bogus]') || math;
    const range = document.createRange();
    range.setStartBefore(object);
    range.setEndAfter(object);
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  const button = page.getByRole('button', {
    name: '转换原生数学为行内公式（MathJax）',
    exact: true,
  });
  if (await button.isVisible()) await button.click();
  else {
    await page
      .getByRole('button', { name: /More|更多/ })
      .first()
      .click();
    await page.getByRole('menuitem', { name: '转换原生数学为行内公式（MathJax）' }).click();
  }
  await expect(native).toHaveCount(0);
  await expect(formulas(page).last()).toHaveAttribute('data-mbb-tex', 'x^2');
  await page.locator('#export-tasks').click();
  await expect(page.locator('#task-export')).toContainText('Native $x^2$ after');
});

test('native inline conversion never overwrites content changed during asynchronous validation', async ({
  page,
}) => {
  await page.goto('/inline-math-editor');
  await page.evaluate(async () => {
    const { default: latexToMathML } = await import('@wordpress/latex-to-mathml');
    const block = taskBlocks[1];
    taskRegistry.dispatch('core/block-editor').updateBlockAttributes(block.clientId, {
      content: `Native <math data-latex="x^2">${latexToMathML('x^2', { displayMode: false })}</math> after`,
    });
    const original = MBB_MATH.render;
    MBB_MATH.render = (tex, display) =>
      tex === 'x^2' && !display
        ? new Promise((resolve) => {
            window.finishNativeValidation = () => resolve('<mjx-container></mjx-container>');
          })
        : original(tex, display);
  });
  const native = page.locator('#task-editor math[data-latex="x^2"]');
  await expect(native).toHaveCount(1);
  const paragraph = body(page).nth(1);
  await paragraph.click();
  await native.evaluate((math) => {
    const object = math.closest('[data-rich-text-bogus]') || math;
    const range = document.createRange();
    range.setStartBefore(object);
    range.setEndAfter(object);
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
  const button = page.getByRole('button', {
    name: '转换原生数学为行内公式（MathJax）',
    exact: true,
  });
  if (await button.isVisible()) await button.click();
  else {
    await page
      .getByRole('button', { name: /More|更多/ })
      .first()
      .click();
    await page.getByRole('menuitem', { name: '转换原生数学为行内公式（MathJax）' }).click();
  }
  await expect
    .poll(() => page.evaluate(() => typeof window.finishNativeValidation))
    .toBe('function');
  await page.evaluate(async () => {
    const { default: latexToMathML } = await import('@wordpress/latex-to-mathml');
    taskRegistry.dispatch('core/block-editor').updateBlockAttributes(taskBlocks[1].clientId, {
      content: `Native <math data-latex="y^2">${latexToMathML('y^2', { displayMode: false })}</math> after`,
    });
    window.finishNativeValidation();
  });
  await expect(page.locator('#task-editor math[data-latex="y^2"]')).toHaveCount(1);
  await expect(formulas(page)).toHaveCount(2);
  expect(
    await page.evaluate(() => taskBlocks[1].attributes.content.includes('data-latex="y^2"')),
  ).toBe(true);
});

test('selected native math block converts explicitly, while styled math stays untouched', async ({
  page,
}) => {
  await page.goto('/inline-math-editor');
  await page.evaluate(() => {
    taskRegistry.dispatch('core/block-editor').insertBlocks(
      wp.blocks.createBlock('core/math', {
        latex: 'x^2',
        mathML: '',
      }),
    );
  });
  await expect(page.locator('#task-editor [data-type="core/math"]')).toHaveCount(1);
  await page.getByRole('button', { name: '转换为行间公式（MathJax）' }).click();
  await expect(page.locator('#task-editor [data-type="mbb/math"]')).toHaveCount(1);
  await page.evaluate(() => {
    taskRegistry.dispatch('core/block-editor').insertBlocks(
      wp.blocks.createBlock('core/math', {
        latex: 'y^2',
        mathML: '',
        style: { color: { text: '#f00' } },
      }),
    );
  });
  await page.getByRole('button', { name: '转换为行间公式（MathJax）' }).click();
  await expect(page.getByRole('alert')).toContainText('额外样式');
  await expect(page.locator('#task-editor [data-type="core/math"]')).toHaveCount(1);
});
