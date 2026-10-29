const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const baseline = process.env.MBB_UI_BASELINE === '1';
if (baseline && !process.env.MARKBRIDGE_READER_BASELINE_ROOT)
  throw Error('A frozen Main source root is required for the baseline');
const sourceRoot = baseline
  ? path.resolve(process.env.MARKBRIDGE_READER_BASELINE_ROOT)
  : path.resolve(__dirname, '../..');
const plugin = path.join(sourceRoot, 'plugin');
const params = {
  format: 'relation-map/v1',
  title: '阅读路线',
  groups: ['基础', '序列', '搜索', '扫描'].map((title, i) => ({ id: 'g' + i, title })),
  nodes: Array.from({ length: 15 }, (_, i) => ({
    id: 'n' + i,
    group: 'g' + (i < 6 ? 0 : i < 10 ? 1 : i < 13 ? 2 : 3),
    title: '主题 ' + i,
    url: '#article-' + i,
  })),
  edges: [
    [0, 1],
    [1, 2],
    [1, 3],
    [2, 4],
    [2, 5],
    [1, 6],
    [6, 7],
    [7, 8],
    [7, 9],
    [10, 11],
    [11, 12],
    [13, 14],
  ].map(([a, b]) => ({ from: 'n' + a, to: 'n' + b, kind: 'recommended' })),
};
params.edges.push(
  { from: 'n10', to: 'n6', kind: 'optimization' },
  { from: 'n10', to: 'n13', kind: 'compare' },
);

for (const width of [1440, 390, 320]) {
  test(`map reader navigation and cross-branch hierarchy ${width}`, async ({ page }, info) => {
    const prefix = baseline ? 'A' : 'B';
    fs.writeFileSync(
      info.outputPath('source.json'),
      JSON.stringify(
        {
          baseline,
          version: JSON.parse(fs.readFileSync(path.join(sourceRoot, 'package.json'))).version,
          files: Object.fromEntries(
            ['relation-map.js', 'relation-map.css'].map((name) => [
              name,
              require('node:crypto')
                .createHash('sha256')
                .update(fs.readFileSync(path.join(plugin, name)))
                .digest('hex'),
            ]),
          ),
        },
        null,
        2,
      ) + '\n',
    );
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/health');
    await page.setContent(
      `<html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:12px;font:16px/1.7 system-ui;background:#fbfaf6}#map{max-width:1006px;margin:auto}${fs.readFileSync(path.join(plugin, 'relation-map.css'), 'utf8')}</style><div id="map"></div></html>`,
    );
    await page.addScriptTag({ url: '/fixture-localization.js?locale=zh_CN' });
    await page.addScriptTag({ path: path.join(plugin, 'relation-map.js') });
    await page.evaluate(
      (params) => MBBRelationMap.enhance(document.querySelector('#map'), params),
      params,
    );
    if (!baseline) {
      await expect(page.locator('.mbb-relation-navigation')).toBeVisible();
      expect(
        await page
          .locator('.mbb-relation-toolbar button:visible')
          .first()
          .evaluate((node) => node.getBoundingClientRect().height),
      ).toBeGreaterThanOrEqual(44);
    }
    expect(
      await page
        .locator('.mbb-relation-map')
        .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`${prefix}-map-initial-${width}.png`),
      fullPage: true,
    });
    if (width < 700) {
      await page.getByRole('combobox', { name: '当前分支' }).selectOption('g1');
      await expect(page.locator('.mbb-relation-cross li')).toHaveCount(2);
      await page.screenshot({
        path: info.outputPath(`${prefix}-map-cross-${width}.png`),
        fullPage: true,
      });
      const cross = page.locator('.mbb-relation-cross button').last();
      if (!baseline) await expect(cross).toContainText('搜索');
      await cross.click();
      if (!baseline) await expect(page.locator('[data-node="n10"]')).toBeFocused();
      await page.getByRole('button', { name: '返回分支', exact: true }).click();
      await expect(page.getByRole('combobox', { name: '当前分支' })).toBeFocused();
      await page.getByRole('button', { name: '查看全图', exact: true }).click();
    }
    await page.getByRole('button', { name: '放大', exact: true }).click();
    await expect(page.locator('.mbb-relation-status')).toContainText('125%');
    await page.getByRole('button', { name: '重置视图', exact: true }).click();
    await expect(page.locator('.mbb-relation-status')).toContainText('100%');
    await expect(page.locator('.mbb-relation-node')).toHaveCount(params.nodes.length);
    await page.screenshot({
      path: info.outputPath(`${prefix}-map-full-${width}.png`),
      fullPage: true,
    });
    await page.locator('.mbb-relation-details summary').click();
    await expect(page.locator('.mbb-relation-static')).toContainText('主题 14');
  });
}
