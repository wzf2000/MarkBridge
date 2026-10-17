const { test, expect } = require('@playwright/test'),
  fs = require('node:fs'),
  path = require('node:path'),
  cp = require('node:child_process'),
  { pathToFileURL } = require('node:url');
const tree = JSON.parse(
  cp.execFileSync('php', ['tests/projection-sample.php'], { encoding: 'utf8' }),
);
async function setup(page) {
  await page.goto('/front?locale=en_US');
  await expect(page.locator('#inline-line mjx-container')).toBeVisible();
  await page.addScriptTag({
    content: fs
      .readFileSync('plugin/projections.js', 'utf8')
      .replace(
        '__MBB_PROJECTION_PROFILE__',
        fs.readFileSync('plugin/projections-profile.json', 'utf8'),
      ),
  });
  await page.addScriptTag({ path: path.resolve('plugin/static-export.js') });
  return (await page.request.get('/static-export-descriptor')).json();
}
test('typed static view survives actual CHTML builder and offline noJS with collision-free local IDs and print', async ({
  page,
  browser,
}, info) => {
  const d = await setup(page);
  d.schema = 2;
  d.body +=
    '<p id="mbb-proj-chart-title">Author title anchor</p><p id="mbb-proj-1-chart-title">Second author anchor</p><section id="chart-a"><p>Author explanation A</p></section><section id="chart-b"><p>Author explanation B</p></section>';
  d.projections = ['chart-a', 'chart-b'].map((target) => ({
    target,
    component: 'small-data-chart',
    version: '0.0.1',
    fingerprint: 'a'.repeat(64),
    state: 'available',
    params: {},
    projection: tree,
  }));
  const html = await page.evaluate(async (d) => (await MarkBridgeStaticExport.build(d)).text(), d);
  const file = info.outputPath('typed-offline.html');
  fs.writeFileSync(file, html);
  const offline = await browser.newContext({
    javaScriptEnabled: false,
    viewport: info.project.name.startsWith('mobile')
      ? { width: 390, height: 844 }
      : { width: 1440, height: 900 },
  });
  const view = await offline.newPage();
  const network = [];
  view.on('request', (r) => {
    if (/^https?:/.test(r.url())) network.push(r.url());
  });
  await view.goto(pathToFileURL(file).href);
  await expect(view.locator('svg')).toHaveCount(2);
  await expect(view.locator('.mbb-projection-table tbody tr')).toHaveCount(6);
  await expect(view.locator('#chart-a')).toContainText('Author explanation A');
  const ids = await view.locator('[id]').evaluateAll((ns) => ns.map((n) => n.id));
  expect(new Set(ids).size).toBe(ids.length);
  for (const idref of await view
    .locator('svg')
    .evaluateAll((ns) => ns.map((n) => n.getAttribute('aria-labelledby'))))
    for (const id of idref.split(' ')) expect(ids).toContain(id);
  expect(network).toEqual([]);
  expect(await view.locator('script,iframe').count()).toBe(0);
  expect(await view.locator('body').evaluate((n) => n.scrollWidth <= innerWidth + 1)).toBe(true);
  await view.screenshot({ path: info.outputPath('typed-static.png'), fullPage: true });
  await view.emulateMedia({ media: 'print' });
  await expect(view.locator('svg').first()).toBeVisible();
  await offline.close();
});
test('129 legacy components keep ordinary fallback export and source SVG stays forbidden', async ({
  page,
}) => {
  const d = await setup(page);
  d.schema = 2;
  d.body = '';
  d.projections = [];
  for (let i = 0; i < 129; i++) {
    const target = 'old-' + i;
    d.body += '<section id="' + target + '"><p>Legacy ' + i + '</p></section>';
    d.projections.push({
      target,
      component: 'legacy',
      version: '0.1.0',
      fingerprint: null,
      state: 'author-fallback',
      params: {},
      projection: null,
    });
  }
  const html = await page.evaluate(async (d) => (await MarkBridgeStaticExport.build(d)).text(), d);
  expect(html).toContain('Legacy 128');
  expect(html).not.toContain('Static view unavailable');
  d.body += '<svg><circle cx="1" cy="1" r="1"></circle></svg>';
  expect(
    await page.evaluate(async (d) => {
      try {
        await MarkBridgeStaticExport.build(d);
        return false;
      } catch {
        return true;
      }
    }, d),
  ).toBe(true);
});
