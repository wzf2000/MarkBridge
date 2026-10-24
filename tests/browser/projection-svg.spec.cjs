// Actual PHP static-document export, reopened by a real browser with scripts disabled. No WP DB.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs'),
  path = require('node:path'),
  cp = require('node:child_process'),
  { pathToFileURL } = require('node:url');
test('PHP static SVG survives HTML serialization with real geometry, local references and author fallbacks', async ({
  browser,
}, info) => {
  const html = cp.execFileSync(
    process.env.MARKBRIDGE_TEST_PHP || 'php',
    [path.resolve('tests/projection-svg.php'), '--html'],
    { encoding: 'utf8' },
  );
  const file = info.outputPath('php-static.svg.html');
  fs.writeFileSync(file, html);
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: info.project.name.startsWith('mobile')
      ? { width: 390, height: 844 }
      : { width: 1440, height: 900 },
  });
  try {
    const page = await context.newPage(),
      external = [];
    page.on('request', (r) => {
      if (/^https?:/.test(r.url())) external.push(r.url());
    });
    await page.goto(pathToFileURL(file).href);
    await expect(page.locator('svg')).toHaveCount(2);
    expect(
      await page
        .locator('svg,svg *')
        .evaluateAll((ns) =>
          ns.every((n) => n.namespaceURI === 'http://www.w3.org/2000/svg' && !n.prefix),
        ),
    ).toBe(true);
    for (const svg of await page.locator('svg').all()) {
      await expect(svg).toBeVisible();
      expect(await svg.evaluate((n) => n.getBBox().width > 0 && n.getBBox().height > 0)).toBe(true);
      await expect(svg.locator(':scope > title')).toHaveCount(1);
      await expect(svg.locator(':scope > desc')).toHaveCount(1);
      expect(
        await svg
          .locator('circle')
          .evaluateAll((ns) => ns.length >= 3 && ns.every((n) => n.getBBox().width > 0)),
      ).toBe(true);
      expect(
        await svg.evaluate((n) =>
          n
            .getAttribute('aria-labelledby')
            .split(' ')
            .every((id) => n.closest('figure').contains(document.getElementById(id))),
        ),
      ).toBe(true);
    }
    const ids = await page.locator('[id]').evaluateAll((ns) => ns.map((n) => n.id));
    expect(new Set(ids).size).toBe(ids.length);
    await expect(page.locator('tbody tr')).toHaveCount(6);
    await expect(page.locator('#plain')).toContainText('Plain derived view');
    await expect(page.locator('#broken')).toContainText('Author fallback broken');
    await expect(page.locator('#broken')).toContainText('Static view unavailable.');
    await expect(page.locator('#legacy .mbb-projection')).toHaveCount(0);
    expect(await page.locator('script,iframe').count()).toBe(0);
    expect(external).toEqual([]);
    expect(await page.locator('body').evaluate((n) => n.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath('php-static-svg.png'), fullPage: true });
  } finally {
    await context.close();
  }
});
