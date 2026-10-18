const { test, expect } = require('@playwright/test');

test('managed long code exposes keyboard scrolling and readable comments without styling unrelated code', async ({
  page,
}, testInfo) => {
  await page.goto('/front');
  const pre = page.locator('#long-code').locator('..');
  await expect(pre).toHaveClass(/mbb-code-display/);
  await expect(page.locator('.mbb-code-scroll-hint').first()).toHaveClass('mbb-code-scroll-hint');
  await expect(page.locator('.mbb-code-scroll-hint').first()).toBeVisible();
  await expect(pre).toHaveAttribute('tabindex', '0');
  await pre.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => pre.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  const contrast = await pre.evaluate((node) => {
    const rgb = (value) =>
      value
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number);
    const lum = (value) =>
      rgb(value)
        .map((n) => {
          n /= 255;
          return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
    const bg = lum(getComputedStyle(node).backgroundColor);
    const fg = lum(getComputedStyle(node.querySelector('.token.comment')).color);
    return (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await page.evaluate(() => {
    document
      .querySelector('article')
      .insertAdjacentHTML(
        'beforeend',
        '<pre id="short" class="wp-block-mbb-code"><code class="language-js">let short = 1;</code></pre><pre id="unmanaged"><code class="language-js">let other = 1;</code></pre>',
      );
  });
  await expect(page.locator('#short')).toHaveClass(/mbb-code-display/);
  await expect(page.locator('#short').locator('xpath=../preceding-sibling::*[1]')).toBeHidden();
  await expect(page.locator('#short')).not.toHaveAttribute('tabindex', '0');
  await expect(page.locator('#unmanaged')).not.toHaveClass(/mbb-code-display/);
  await page.screenshot({ path: `test-results/code-scroll-${testInfo.project.name}.png` });
});

test('comparison scrolling synchronizes by default without a selection control and stops at the shorter side', async ({
  page,
}) => {
  await page.goto('/front');
  await page.evaluate(() => {
    document
      .querySelector('article')
      .insertAdjacentHTML(
        'beforeend',
        `<div id="long-compare" class="wp-block-mbb-code-compare" data-mbb-teaching="code-compare" data-mbb-teaching-config="{}"><div class="mbb-compare-left"><p>Before</p><pre><code class="language-js">${'long '.repeat(180)}</code></pre></div><div class="mbb-compare-right"><p>After</p><pre><code class="language-js">${'short '.repeat(80)}</code></pre></div><div class="mbb-teaching-body">Compare</div></div>`,
      );
  });
  const group = page.locator('#long-compare');
  const left = group.locator('.mbb-compare-left pre'),
    right = group.locator('.mbb-compare-right pre');
  await expect(left).toHaveClass(/mbb-code-display/);
  await expect(group.locator('input[type=checkbox], [role=checkbox]')).toHaveCount(0);
  await expect(group).toHaveAttribute('data-mbb-sync-scroll', 'true');
  const hint = group.locator('.mbb-code-scroll-hint').first();
  await expect(hint).toBeVisible();
  expect(await hint.evaluate((node) => getComputedStyle(node).fontWeight)).toBe('400');
  expect((await hint.boundingBox()).height).toBeLessThan(60);
  await left.evaluate((node) => {
    node.scrollLeft = 80;
  });
  await expect.poll(() => right.evaluate((node) => node.scrollLeft)).toBe(80);
  await left.evaluate((node) => {
    node.scrollLeft = 160;
  });
  await expect.poll(() => right.evaluate((node) => node.scrollLeft)).toBe(160);
  await left.evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
  });
  await expect
    .poll(() => right.evaluate((node) => node.scrollLeft))
    .toBe(await right.evaluate((node) => node.scrollWidth - node.clientWidth));
  expect(await left.evaluate((node) => node.scrollLeft)).toBeGreaterThan(
    await right.evaluate((node) => node.scrollLeft),
  );
  await right.evaluate((node) => {
    node.scrollLeft = 80;
  });
  await expect.poll(() => left.evaluate((node) => node.scrollLeft)).toBe(80);
  expect(await right.evaluate((node) => node.scrollLeft)).toBe(80);
});

test('Node directory follows the selected engine while remaining a successful form field', async ({
  page,
}, testInfo) => {
  const { execFileSync } = require('node:child_process');
  const path = require('node:path');
  const fs = require('node:fs');
  const root = path.resolve(__dirname, '../..');
  const output = execFileSync(
    'php',
    [path.join(root, 'tests/converter-settings.php'), '--render'],
    { encoding: 'utf8' },
  );
  const markup = JSON.parse(output.split('SETTINGS_HTML=')[1]);
  await page.goto('/health');
  await page.setContent(
    `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${fs.readFileSync(path.join(root, 'plugin/settings.css'), 'utf8')}</style>${markup}`,
  );
  await page.addScriptTag({ path: path.join(root, 'plugin/settings.js') });
  const input = page.locator('#mbb-converter-path');
  await expect(input).toBeHidden();
  expect(
    await input.evaluate((node) => new FormData(node.form).get('converter[runtime_path]')),
  ).toBe('/synthetic/retained/node');
  await page.locator('input[name="converter[backend]"][value="node"]').check();
  await expect(input).toBeVisible();
  await expect(input).toBeEnabled();
  await page.locator('input[name="converter[backend]"][value="php"]').check();
  await expect(input).toBeHidden();
  await expect(page.locator('.mbb-settings-advanced')).toHaveAttribute('open', '');
  await page.screenshot({ path: `test-results/settings-${testInfo.project.name}.png` });
});
