const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

// Check source CSS independently of a WordPress theme or a bundled asset build.
test('presentation tokens style default and adapted content without changing code geometry', async ({
  page,
}, testInfo) => {
  await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
    <article class="mbb-document">
      <blockquote><p>A quotation remains readable without a theme.</p></blockquote>
      <div class="wp-block-mbb-code-tabs"><div class="mbb-code-tab">
        <pre class="mbb-code-display language-js" tabindex="0"><code>const message = "${'long code '.repeat(35)}";</code></pre>
      </div></div>
      <section class="mbb-footnotes"><ol><li tabindex="0">A footnote.</li></ol></section>
    </article>`);
  for (const file of ['math.css', 'teaching.css', 'code-display.css', 'footnotes.css']) {
    await page.addStyleTag({
      content: fs.readFileSync(path.join(__dirname, '../../plugin', file), 'utf8'),
    });
  }
  const pre = page.locator('pre');
  await expect(pre).toHaveCSS('background-color', 'rgb(245, 246, 248)');
  await expect(pre.locator('code')).toHaveCSS(
    'font-family',
    await pre.evaluate((node) => getComputedStyle(node).fontFamily),
  );
  expect(await pre.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
  const before = await pre.evaluate((node) => ({
    padding: getComputedStyle(node).padding,
    whiteSpace: getComputedStyle(node).whiteSpace,
  }));
  await page.addStyleTag({
    content: `.mbb-document {
    --mbb-code-surface: #17202b; --mbb-code-text: #e7edf6;
    --mbb-quote-surface: #223344; --mbb-quote-text: #ffffff;
    --mbb-quote-border: #aabbcc; --mbb-focus-color: #ffcc00;
    --mbb-border-color: #456789; --mbb-font-code: monospace;
  }`,
  });
  await expect(pre).toHaveCSS('background-color', 'rgb(23, 32, 43)');
  await expect(pre).toHaveCSS('color', 'rgb(231, 237, 246)');
  await expect(page.locator('blockquote')).toHaveCSS('background-color', 'rgb(34, 51, 68)');
  await expect(page.locator('blockquote')).toHaveCSS(
    'border-inline-start-color',
    'rgb(170, 187, 204)',
  );
  await expect(page.locator('.mbb-footnotes')).toHaveCSS('border-top-color', 'rgb(69, 103, 137)');
  await pre.focus();
  await expect(pre).toHaveCSS('outline-color', 'rgb(255, 204, 0)');
  expect(
    await pre.evaluate((node) => ({
      padding: getComputedStyle(node).padding,
      whiteSpace: getComputedStyle(node).whiteSpace,
    })),
  ).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('theme-token-contract.png') });
});
