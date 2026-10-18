const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const plugin = path.resolve(__dirname, '../../plugin');
const action = (page, name) => page.locator(`[data-mbb-reader-action="${name}"]`);

test('CHTML formulas support keyboard reading, clipboard denial and wide layout', async ({
  page,
}, info) => {
  await page.goto('/front');
  const formula = page.locator('#inline-line .mbb-math');
  await expect(formula.locator('mjx-container[jax="CHTML"]')).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await formula.focus();
  await page.keyboard.press('Enter');
  const dialog = page.locator('dialog.mbb-math-reader');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('mjx-container[jax="CHTML"]')).toBeVisible();
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw Error('synthetic clipboard denial');
        },
      },
    }),
  );
  await action(page, 'copy').click();
  await expect(page.locator('.mbb-math-reader-source')).toHaveValue('x^2+y^2=z^2');
  await expect(dialog.locator('[role="status"]')).not.toBeEmpty();
  await expect(page.locator('.mbb-math-reader-source')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(formula).toBeFocused();
  await page.evaluate(async () => {
    const block = document.createElement('pre');
    block.id = 'compat-wide';
    block.className = 'wp-block-mbb-math';
    const code = document.createElement('code');
    code.textContent = Array(70).fill('x').join('+');
    block.append(code);
    document.querySelector('.mbb-document').append(block);
    await MBB_MATH.typeset(document);
  });
  const wide = page.locator('#compat-wide');
  await expect(wide.locator('mjx-container[jax="CHTML"]')).toBeVisible();
  await wide.focus();
  await page.keyboard.press('Space');
  await expect(dialog).toBeVisible();
  await action(page, 'increase').click();
  await expect(page.locator('.mbb-math-reader-scale')).toContainText('175');
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: info.outputPath('compatibility-formula-reader.png') });
  await action(page, 'close').click();
  await expect(wide).toBeFocused();
});

test('long code scrolls while stage and collapse controls remain keyboard operable', async ({
  page,
}, info) => {
  await page.goto('/front');
  const pre = page.locator('#long-code').locator('..');
  await expect(pre).toHaveClass(/mbb-code-display/);
  await expect(pre).toHaveAttribute('tabindex', '0');
  await expect(page.locator('#long-code .token').first()).toBeVisible();
  await pre.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => pre.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  await page.addStyleTag({ content: fs.readFileSync(path.join(plugin, 'teaching.css'), 'utf8') });
  await page.evaluate(() =>
    document.querySelector('article').insertAdjacentHTML(
      'afterbegin',
      `
    <section id="compat-course" data-mbb-teaching="steps" class="wp-block-mbb-steps" data-mbb-teaching-config='{"mode":"staged","previous":true,"next":true,"full":true}'>
      <h2 class="mbb-teaching-title">Compatibility course</h2><div class="mbb-teaching-body">
        <section id="compat-one" data-mbb-teaching="step"><h3 class="mbb-teaching-title">First</h3><div class="mbb-teaching-body">First stage</div></section>
        <section id="compat-two" data-mbb-teaching="step"><h3 class="mbb-teaching-title">Second</h3><div class="mbb-teaching-body">
          <section id="compat-fold" data-mbb-teaching="collapse" class="wp-block-mbb-collapse" data-mbb-teaching-config='{"open":false}'><h4 class="mbb-teaching-title">Details</h4><div class="mbb-teaching-body"><p id="compat-answer">Second stage detail</p></div></section>
        </div></section>
      </div></section>`,
    ),
  );
  if (!(await page.evaluate(() => !!window.MarkBridgeTeaching)))
    await page.addScriptTag({ content: fs.readFileSync(path.join(plugin, 'teaching.js'), 'utf8') });
  await expect(page.locator('#compat-two')).toBeHidden();
  const next = page
    .locator('#compat-course > .mbb-stage-controls .mbb-stage-navigation button')
    .last();
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#compat-two')).toBeVisible();
  await expect(page.locator('#compat-one')).toBeHidden();
  await expect(page.locator('#compat-answer')).toBeHidden();
  const toggle = page.locator('#compat-fold .mbb-collapse-toggle');
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#compat-answer')).toBeVisible();
  expect(
    await page
      .locator('#compat-course > .mbb-stage-controls')
      .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath('compatibility-stage.png') });
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#compat-one')).toBeVisible();
  await expect(page.locator('#compat-course > .mbb-stage-controls')).toBeHidden();
});

test('real core task editing serializes and reparses paired Markdown', async ({ page }) => {
  test.skip(
    !process.env.MARKBRIDGE_TEST_RUNTIME,
    'Requires sanitized real WordPress core-script runtime; no stub editor substitute.',
  );
  await page.goto('/task-editor');
  const checkbox = page.locator('.wp-block-mbb-task-item input[type="checkbox"]');
  await expect(checkbox).toHaveCount(1);
  await checkbox.check();
  await page.locator('#export-tasks').click();
  await expect(page.locator('#task-export')).toContainText('- [x] Browser task');
  expect(
    await page.evaluate(() => {
      const parsed = wp.blocks.parse(wp.blocks.serialize(taskBlocks));
      return (
        parsed.every((block) => block.isValid) &&
        parsed[0].innerBlocks.find((block) => block.name === 'mbb/task-item').attributes.checked
      );
    }),
  ).toBe(true);
});
