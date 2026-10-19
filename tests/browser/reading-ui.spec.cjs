const { test, expect } = require('@playwright/test');

test('managed long code exposes keyboard scrolling and readable comments without styling unrelated code', async ({
  page,
}, testInfo) => {
  await page.goto('/front');
  const pre = page.locator('#long-code').locator('..');
  await expect(pre).toHaveClass(/mbb-code-display/);
  await expect(page.locator('.mbb-code-scroll-hint')).toHaveCount(0);
  await expect(pre).toHaveAttribute('aria-description', /.+/);
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
        `<pre id="short" class="wp-block-mbb-code"><code class="language-js">let short = 1;</code></pre><pre id="unmanaged"><code class="language-js">${'long '.repeat(180)}</code></pre><pre id="authored" class="wp-block-mbb-code" tabindex="-1" aria-label="Authored code" aria-description="Author scrolling notes"><code class="language-js">${'long '.repeat(180)}</code></pre><span id="code-help" hidden>Author help</span><pre id="described" class="wp-block-mbb-code" aria-describedby="code-help"><code class="language-js">${'long '.repeat(180)}</code></pre>`,
      );
  });
  await expect(page.locator('#short')).toHaveClass(/mbb-code-display/);
  await expect(page.locator('#short')).not.toHaveAttribute('aria-description');
  await expect(page.locator('#short')).not.toHaveAttribute('tabindex', '0');
  await expect(page.locator('#unmanaged')).not.toHaveClass(/mbb-code-display/);
  await expect(page.locator('#unmanaged')).not.toHaveAttribute('tabindex');
  await expect(page.locator('#unmanaged')).not.toHaveAttribute('aria-description');
  await expect(page.locator('#authored')).toHaveClass(/mbb-code-display/);
  await expect(page.locator('#authored')).toHaveAttribute('tabindex', '-1');
  await expect(page.locator('#authored')).toHaveAttribute(
    'aria-description',
    'Author scrolling notes',
  );
  await expect(page.locator('#authored')).toHaveAttribute('aria-label', 'Authored code');
  await expect(page.locator('#described')).toHaveAttribute('tabindex', '0');
  await expect(page.locator('#described')).toHaveAttribute('aria-describedby', 'code-help');
  await expect(page.locator('#described')).not.toHaveAttribute('aria-description');
  await page.locator('#short > code').evaluate((node) => {
    node.textContent = 'long '.repeat(180);
  });
  await expect(page.locator('#short')).toHaveAttribute('tabindex', '0');
  await expect(page.locator('#short')).toHaveAttribute('aria-description', /.+/);
  await page.locator('#short > code').evaluate((node) => {
    node.textContent = 'let short = 1;';
  });
  await expect(page.locator('#short')).not.toHaveAttribute('tabindex');
  await expect(page.locator('#short')).not.toHaveAttribute('aria-description');
  await expect(page.locator('.mbb-code-scroll-hint')).toHaveCount(0);
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
  await expect(group.locator('.mbb-code-scroll-hint')).toHaveCount(0);
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

test('one overflowing comparison side adds no row and keeps code aligned below its title', async ({
  page,
}, testInfo) => {
  await page.setViewportSize(
    testInfo.project.name.startsWith('desktop')
      ? { width: 1440, height: 900 }
      : { width: 390, height: 844 },
  );
  await page.goto('/front');
  await page.evaluate(() => {
    const article = document.querySelector('article');
    article.insertAdjacentHTML(
      'beforeend',
      `<div id="asymmetric-compare" class="wp-block-mbb-code-compare" data-mbb-teaching="code-compare" data-mbb-teaching-config="{}"><div class="mbb-compare-left"><p>Before</p><pre><code class="language-js">const result = 1;\nreturn result;</code></pre></div><div class="mbb-compare-right"><p>After</p><pre><code class="language-js">const result = "${'x'.repeat(180)}";\nreturn result;</code></pre></div><div class="mbb-teaching-body">Only the right side needs horizontal scrolling.</div></div>`,
    );
  });
  const group = page.locator('#asymmetric-compare');
  const left = group.locator('.mbb-compare-left pre');
  const right = group.locator('.mbb-compare-right pre');
  await expect(right).toHaveAttribute('tabindex', '0');
  await expect(left).toHaveClass(/mbb-code-display/);
  await expect(left).not.toHaveAttribute('tabindex');
  await expect(left).not.toHaveAttribute('aria-description');
  await expect(group.locator('.mbb-compare-left > p')).toHaveCount(1);
  await expect(group.locator('.mbb-compare-right > p')).toHaveCount(1);
  const geometry = await group.evaluate((node) =>
    ['.mbb-compare-left', '.mbb-compare-right'].map((selector) => {
      const side = node.querySelector(selector),
        code = side.querySelector('pre');
      const title = side.querySelector('p').getBoundingClientRect();
      const box = code.getBoundingClientRect();
      return {
        x: box.x,
        top: box.top,
        titleGap: box.top - title.bottom,
        overflow: code.scrollWidth > code.clientWidth + 1,
      };
    }),
  );
  expect(geometry.map((side) => side.overflow)).toEqual([false, true]);
  for (const side of geometry) expect(Math.abs(side.titleGap)).toBeLessThan(1);
  if (geometry[0].x !== geometry[1].x)
    expect(Math.abs(geometry[0].top - geometry[1].top)).toBeLessThan(1);
  await expect(page.locator('.mbb-code-scroll-hint')).toHaveCount(0);
  await group.screenshot({ path: testInfo.outputPath('asymmetric-code-diff.png') });
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
