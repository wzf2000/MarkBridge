const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const plugin = path.resolve(__dirname, '../../plugin');
const gid = (i) => 'g_' + i.toString(16).padStart(32, '0');
const nid = (i) => 'n_' + i.toString(16).padStart(32, '0');
const eid = (i) => 'e_' + i.toString(16).padStart(32, '0');
const map = {
  format: 'relation-map/v1',
  title: '阅读视图与跨组定位',
  groups: [
    { id: gid(0), title: '基础与比较' },
    { id: gid(1), title: '实践与验证' },
  ],
  nodes: Array.from({ length: 7 }, (_, i) => ({
    id: nid(i),
    group: gid(i < 4 ? 0 : 1),
    title: '阅读主题 ' + (i + 1),
    url: '#topic-' + i,
  })),
  edges: [
    [0, 2],
    [1, 2],
    [2, 3],
    [4, 5],
    [5, 6],
    [3, 4],
    [2, 6],
  ].map(([a, b]) => ({
    from: nid(a),
    to: nid(b),
    kind: 'recommended',
  })),
};
async function mount(page, source) {
  await page.goto('/health');
  await page.evaluate(() => sessionStorage.clear());
  await page.setContent(
    `<html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:12px;font:16px/1.7 system-ui;background:#fbfaf6}#map{max-width:800px;padding-inline:32px;box-sizing:border-box;margin:auto}@media(max-width:700px){#map{padding:0}}#map .mbb-relation-viewport{width:min(100%,600px)}${fs.readFileSync(path.join(source, 'relation-map.css'), 'utf8')}</style><div id="map"></div></html>`,
  );
  for (const file of ['relation-map-layout-v3.js', 'relation-map-v3-reader.js'])
    await page.addScriptTag({ path: path.join(source, file) });
  await page.evaluate(
    ({ map, ids }) => MBBRelationMapV3Reader.enhance(document.querySelector('#map'), map, ids),
    { map, ids: map.edges.map((_, i) => eid(i)) },
  );
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.mbb-relation-node').first()).toBeVisible();
}
function shot(info, name) {
  const dir = process.env.MARKBRIDGE_REVIEW_SCREEN_DIR;
  if (!dir) return info.outputPath(name);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, name);
}
const scale = (page) =>
  page
    .locator('.mbb-relation-board')
    .evaluate((board) => new DOMMatrixReadOnly(getComputedStyle(board).transform).a);
const percent = (page) =>
  page
    .locator('.mbb-relation-status')
    .evaluate((status) => Number(status.textContent.match(/(\d+)%/)[1]));
for (const width of [1440, 390, 320]) {
  test(`r2 branch reset, actual scale and cross-group position ${width}`, async ({
    page,
  }, info) => {
    for (const [label, source] of [
      ['before', process.env.MARKBRIDGE_BASELINE_PLUGIN],
      ['after', plugin],
    ]) {
      if (!source) continue;
      const baseline = label === 'before';
      // Begin in a real mobile branch, then retain it when the desktop container widens.
      await page.setViewportSize({ width: 390, height: 844 });
      await mount(page, source);
      await page
        .getByRole('combobox', { name: 'Current branch', exact: true })
        .selectOption(gid(1));
      const normal = await scale(page);
      await page.getByRole('button', { name: 'View full map', exact: true }).click();
      await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
      await page.getByRole('button', { name: 'Drag canvas: off', exact: true }).click();
      await page.locator('.mbb-relation-viewport').focus();
      await page.keyboard.press('ArrowLeft');
      await page.getByRole('button', { name: 'Back to branch', exact: true }).click();
      await expect(page.getByRole('combobox', { name: 'Current branch', exact: true })).toHaveValue(
        gid(1),
      );
      const branchScale = await scale(page);
      if (baseline) expect(branchScale).toBeGreaterThan(normal);
      else expect(branchScale).toBeCloseTo(normal, 5);
      await expect(page.getByRole('button', { name: 'Zoom in', exact: true })).toBeHidden();
      await page
        .getByRole('combobox', { name: 'Current branch', exact: true })
        .selectOption(gid(0));
      await page.setViewportSize({ width, height: width > 700 ? 900 : 844 });
      await expect(
        page.getByRole('button', { name: 'Show in map', exact: false }).first(),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Show in map', exact: false }).first().click();
      await expect(page.locator(`[data-node="${nid(4)}"]`)).toBeFocused();
      const actual = await scale(page);
      const dimensions = await page.evaluate(() => ({
        viewportWidth: document.querySelector('.mbb-relation-viewport').clientWidth,
        geometryWidth: document.querySelector('#map').mbbRelationGeometry.width,
        mapWidth: document.querySelector('#map').clientWidth,
      }));
      fs.writeFileSync(
        shot(info, `r2-${label}-${width}-dimensions.json`),
        JSON.stringify(
          { width, ...dimensions, actualScale: actual, displayedPercent: await percent(page) },
          null,
          2,
        ),
      );
      if (width > 700) {
        expect(dimensions.viewportWidth).toBe(600);
        expect(dimensions.geometryWidth).toBeGreaterThan(dimensions.viewportWidth);
        expect(actual).toBeLessThan(1);
        expect(await page.locator('#map').evaluate((n) => n.clientWidth)).toBe(800);
      }
      if (baseline && width > 700) expect(await percent(page)).not.toBe(Math.round(actual * 100));
      else expect(await percent(page)).toBe(Math.round(actual * 100));
      const position = await page.evaluate((id) => {
        const viewport = document.querySelector('.mbb-relation-viewport').getBoundingClientRect();
        const target = document.querySelector(`[data-node="${id}"]`).getBoundingClientRect();
        return {
          x: target.x + target.width / 2 - viewport.x - viewport.width / 2,
          y: target.y + target.height / 2 - viewport.y - 260,
        };
      }, nid(4));
      if (baseline && width > 700) expect(Math.abs(position.x)).toBeGreaterThan(5);
      else {
        expect(Math.abs(position.x)).toBeLessThan(2);
        expect(Math.abs(position.y)).toBeLessThan(2);
      }
      await page.screenshot({ path: shot(info, `r2-${label}-${width}.png`) });
      expect(
        await page.locator('path[data-id]').evaluateAll((nodes) => nodes.map((n) => n.dataset.id)),
      ).toEqual(map.edges.map((_, i) => eid(i)));
      await expect(page.locator('.mbb-relation-node')).toHaveCount(map.nodes.length);
      if (!baseline) {
        for (let i = 0; i < 6; i++) {
          const zoomIn = page.getByRole('button', { name: 'Zoom in', exact: true });
          if (await zoomIn.isEnabled()) await zoomIn.click();
        }
        await expect(page.getByRole('button', { name: 'Zoom in', exact: true })).toBeDisabled();
        for (let i = 0; i < 12; i++) {
          const zoomOut = page.getByRole('button', { name: 'Zoom out', exact: true });
          if (await zoomOut.isEnabled()) await zoomOut.click();
        }
        await expect(page.getByRole('button', { name: 'Zoom out', exact: true })).toBeDisabled();
        await page.getByRole('button', { name: 'Reset view', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Zoom in', exact: true })).toBeEnabled();
        await expect(page.getByRole('button', { name: 'Zoom out', exact: true })).toBeEnabled();
        await page.locator(`[data-node="${nid(0)}"]`).click();
        await expect(page).toHaveURL(/#topic-0$/);
      }
    }
  });
}
