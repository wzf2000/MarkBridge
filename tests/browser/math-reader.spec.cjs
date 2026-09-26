const { test, expect } = require('@playwright/test');
const action = (page, name) => page.locator(`[data-mbb-reader-action="${name}"]`);

test('formula reader supports keyboard, copy, zoom reset and focus restoration', async ({
  page,
  context,
}, testInfo) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/front');
  const formula = page.locator('#inline-line .mbb-math');
  await expect(formula).toHaveClass(/mbb-math-readable/);
  await expect(formula.locator('mjx-container')).toBeVisible();
  const original = await formula.getAttribute('data-mbb-tex');
  await formula.focus();
  await page.keyboard.press('Enter');
  const dialog = page.locator('dialog.mbb-math-reader');
  await expect(dialog).toBeVisible();
  await expect(page.locator('.mbb-math-reader-source')).toHaveValue(original);
  await expect(page.locator('.mbb-math-reader-render mjx-container')).toBeVisible();
  await expect(page.locator('.mbb-math-reader-scale')).toContainText('150');
  await action(page, 'increase').click();
  await expect(page.locator('.mbb-math-reader-scale')).toContainText('175');
  await action(page, 'decrease').click();
  await action(page, 'decrease').click();
  await expect(page.locator('.mbb-math-reader-scale')).toContainText('125');
  await action(page, 'reset').click();
  await expect(page.locator('.mbb-math-reader-scale')).toContainText('150');
  await page.screenshot({ path: testInfo.outputPath('math-reader.png') });
  await action(page, 'copy').click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(original);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(formula).toBeFocused();
  await expect(formula).toHaveAttribute('data-mbb-tex', original);
  await page.keyboard.press('Space');
  await expect(dialog).toBeVisible();
  await action(page, 'close').click();
  await expect(formula).toBeFocused();
});

test('formula reader handles wide display math and clipboard denial without page overflow', async ({
  page,
}) => {
  await page.goto('/front');
  await page.evaluate(async () => {
    const block = document.createElement('pre');
    block.id = 'wide-math';
    block.className = 'wp-block-mbb-math';
    const code = document.createElement('code');
    code.textContent = Array(70).fill('x').join('+');
    block.append(code);
    document.querySelector('.mbb-document').append(block);
    await MBB_MATH.typeset(document);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw Error('Denied');
        },
      },
    });
  });
  await page.locator('#wide-math').click();
  await expect(page.locator('dialog.mbb-math-reader')).toBeVisible();
  await action(page, 'copy').click();
  await expect(page.locator('.mbb-math-reader-source')).toHaveValue(Array(70).fill('x').join('+'));
  await expect(page.locator('dialog.mbb-math-reader [role="status"]')).toContainText(/复制|选/);
  for (let i = 0; i < 6; i++) await action(page, 'increase').click();
  await expect(page.locator('.mbb-math-reader-scale')).toContainText('300');
  await expect(action(page, 'increase')).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  expect(
    await page
      .locator('dialog.mbb-math-reader')
      .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
  ).toBe(true);
  await action(page, 'reset').click();
  await action(page, 'close').click();
  await expect(page.locator('#wide-math')).toBeFocused();
});

test('reader preserves invalid TeX and leaves links, editable content and static preview alone', async ({
  page,
}) => {
  await page.goto('/front');
  await page.evaluate(async () => {
    const host = document.createElement('div');
    host.id = 'reader-boundaries';
    host.innerHTML =
      '<a href="#destination"><span class="mbb-math" data-mbb-tex="x">x</span></a><div contenteditable="true"><span class="mbb-math" data-mbb-tex="y">y</span></div><span id="editable-math" class="mbb-math" contenteditable="true" data-mbb-tex="a">a</span><span id="bad-math" class="mbb-math"></span>';
    const bad = host.querySelector('#bad-math');
    bad.dataset.mbbTex = '\\notARealCommand{<img src=x onerror=alert(1)>}';
    bad.textContent = bad.dataset.mbbTex;
    document.querySelector('.mbb-document').append(host);
    await MBB_MATH.typeset(document);
    window.readerPreview = await MBB_MATH.preview(
      '<span class="mbb-math" data-mbb-tex="z">z</span>',
    );
  });
  await expect(page.locator('#reader-boundaries a .mbb-math')).not.toHaveAttribute(
    'role',
    'button',
  );
  await expect(page.locator('[contenteditable] .mbb-math')).not.toHaveAttribute('role', 'button');
  await expect(page.locator('#editable-math')).not.toHaveAttribute('role', 'button');
  expect(await page.evaluate(() => readerPreview.includes('mbb-math-readable'))).toBe(false);
  await page.locator('#reader-boundaries a').click();
  await expect(page).toHaveURL(/#destination$/);
  const bad = page.locator('#bad-math');
  await expect(bad).toHaveAttribute('data-mbb-math-error', 'true');
  await bad.click();
  await expect(page.locator('.mbb-math-reader-source')).toHaveValue(
    '\\notARealCommand{<img src=x onerror=alert(1)>}',
  );
  await expect(page.locator('dialog.mbb-math-reader img')).toHaveCount(0);
  await expect(page.locator('.mbb-math-reader-render')).toContainText(/notARealCommand/);
  await page.keyboard.press('Escape');
  await expect(bad).toBeFocused();
});

test('late clipboard failure cannot affect a reopened reader', async ({ page }) => {
  await page.goto('/front');
  const inline = page.locator('#inline-line .mbb-math');
  await expect(inline.locator('mjx-container')).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () =>
          new Promise((resolve, reject) => {
            window.rejectReaderCopy = reject;
          }),
      },
    });
  });
  await inline.click();
  await action(page, 'copy').click();
  await action(page, 'close').click();
  const display = page.locator('pre.wp-block-mbb-math').first();
  await display.click();
  await page.evaluate(async () => {
    window.rejectReaderCopy(Error('delayed denial'));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await expect(action(page, 'close')).toBeFocused();
  await expect(page.locator('.mbb-math-reader-source')).toHaveValue(
    '\\sum_{n=1}^{100}\\frac{1}{n^2}',
  );
  await expect(page.locator('dialog.mbb-math-reader [role="status"]')).toBeEmpty();
});
