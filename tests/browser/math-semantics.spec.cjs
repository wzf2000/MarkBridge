const { test, expect } = require('@playwright/test');

test('engine semantic speech survives the isolated CHTML pipeline and formula reader', async ({
  page,
}) => {
  await page.goto('/front?locale=en_US');
  const formula = page.locator('#inline-line .mbb-math');
  const speech = formula.locator('mjx-speech[role="img"]');
  await expect(speech).toHaveAttribute('aria-label', /x squared.*equals.*z squared/);
  const label = await speech.getAttribute('aria-label');
  expect(label).not.toContain('^');
  expect(label).not.toContain('<mark');
  await formula.focus();
  await page.keyboard.press('Enter');
  const reader = page.locator('dialog.mbb-math-reader');
  await expect(reader).toBeVisible();
  await expect(reader.locator('mjx-speech[role="img"]')).toHaveAttribute('aria-label', label);
  await expect(reader.locator('.mbb-math-reader-source')).toHaveValue('x^2+y^2=z^2');
  const snapshot = await reader.ariaSnapshot();
  expect(snapshot).toContain(label);
  await page.keyboard.press('Escape');
  await expect(formula).toBeFocused();
});

test('static preview retains actual engine semantics without executable exploration code', async ({
  page,
}) => {
  await page.goto('/front?locale=en_US');
  await expect(page.locator('#inline-line mjx-container')).toBeVisible();
  const result = await page.evaluate(async () => {
    const html = await MBB_MATH.preview(
      '<span class="mbb-math" data-mbb-tex="\\frac{a}{d}">\\frac{a}{d}</span>',
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return {
      speech: doc.querySelector('mjx-speech[role="img"]')?.getAttribute('aria-label'),
      hiddenVisualMath: doc.querySelector('mjx-math')?.getAttribute('aria-hidden'),
      executable: doc.querySelectorAll('script,iframe,object,embed').length,
    };
  });
  expect(result.speech).toMatch(/a over d/);
  expect(result.hiddenVisualMath).toBe('true');
  expect(result.executable).toBe(0);
});
