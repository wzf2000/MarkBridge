const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const plugin = path.resolve(__dirname, '../../plugin');
const gid = (i) => 'g_' + i.toString(16).padStart(32, '0');
const nid = (i) => 'n_' + i.toString(16).padStart(32, '0');
const eid = (i) => 'e_' + i.toString(16).padStart(32, '0');
const map = {
  format: 'relation-map/v1',
  title: '分支阅读与相邻主题',
  groups: ['理解问题与选择方法', '实践验证与结果比较', '进一步优化与拓展'].map((title, i) => ({
    id: gid(i),
    title,
  })),
  nodes: Array.from({ length: 6 }, (_, i) => ({
    id: nid(i),
    group: gid(i < 3 ? 0 : i < 5 ? 1 : 2),
    title: '阅读主题 ' + (i + 1),
    url: '#topic-' + i,
  })),
  edges: [
    [0, 1],
    [1, 2],
    [3, 4],
    [0, 3],
    [1, 4],
    [2, 4],
    [5, 2],
  ].map(([a, b], i) => ({
    from: nid(a),
    to: nid(b),
    kind: i === 6 ? 'compare' : 'recommended',
    why: '关联说明 ' + i + '：对照文章中的具体例子。',
  })),
};
const filePath = (info, name) => {
  if (!process.env.MARKBRIDGE_REVIEW_SCREEN_DIR) return info.outputPath(name);
  fs.mkdirSync(process.env.MARKBRIDGE_REVIEW_SCREEN_DIR, { recursive: true });
  return path.join(process.env.MARKBRIDGE_REVIEW_SCREEN_DIR, name);
};
async function mount(page, source, theme) {
  await page.goto('/health');
  await page.evaluate(() => sessionStorage.clear());
  await page.setContent(
    `<html lang="en" data-pagenest-color-scheme="${theme}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:12px;font:16px/1.7 system-ui;background:${theme === 'dark' ? '#182a23' : '#fbfaf6'}}#map{max-width:1006px;margin:auto}${fs.readFileSync(path.join(source, 'relation-map.css'), 'utf8')}</style><button id="before">Before map</button><div id="map"></div><button id="after">After map</button></html>`,
  );
  for (const file of ['relation-map-layout-v3.js', 'relation-map-v3-reader.js'])
    await page.addScriptTag({ path: path.join(source, file) });
  await page.evaluate(
    ({ map, edgeIds }) =>
      MBBRelationMapV3Reader.enhance(document.querySelector('#map'), map, edgeIds),
    { map, edgeIds: map.edges.map((_, i) => eid(i)) },
  );
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.mbb-relation-node').first()).toBeVisible();
}
async function contrast(locator) {
  return locator.evaluate((node) => {
    const luminance = (color) => {
      const rgb = color
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number)
        .map((n) => {
          n /= 255;
          return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
        });
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    const style = getComputedStyle(node);
    let surface = node;
    while (
      surface.parentElement &&
      getComputedStyle(surface).backgroundColor.match(/[\d.]+/g)?.[3] === '0'
    )
      surface = surface.parentElement;
    const a = luminance(style.color),
      b = luminance(getComputedStyle(surface).backgroundColor);
    return {
      ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      opacity: style.opacity,
      outline: style.outlineStyle,
      outlineWidth: parseFloat(style.outlineWidth),
      focusVisible: node.matches(':focus-visible'),
    };
  });
}
for (const width of [1440, 390, 320])
  for (const theme of ['light', 'dark']) {
    test(`r3 grouped branches, stable focus and contrast ${width} ${theme}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width: 390, height: 844 });
      if (width === 320 && theme === 'light' && process.env.MARKBRIDGE_BASELINE_PLUGIN) {
        await page.setViewportSize({ width, height: 844 });
        await mount(page, process.env.MARKBRIDGE_BASELINE_PLUGIN, theme);
        await page.screenshot({ path: filePath(info, 'r3-before-320-light.png'), fullPage: true });
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await mount(page, plugin, theme);
      await page.locator('.mbb-relation-viewport').focus();
      await page.keyboard.press('Tab');
      await expect(page.locator(`[data-node="${nid(0)}"]`)).toBeFocused();
      const focusedContrast = await contrast(page.locator(`[data-node="${nid(0)}"]`));
      expect(focusedContrast.ratio).toBeGreaterThanOrEqual(4.5);
      expect(focusedContrast.focusVisible).toBe(true);
      expect(focusedContrast.outline).toBe('solid');
      expect(focusedContrast.outlineWidth).toBeGreaterThanOrEqual(3);
      const mutedContrast = await contrast(page.locator(`[data-node="${nid(2)}"]`));
      expect(mutedContrast.ratio).toBeGreaterThanOrEqual(4.5);
      expect(mutedContrast.opacity).toBe('1');
      const crossLinkContrast = await contrast(page.locator('.mbb-relation-cross a').first());
      const detailsLinkContrast = await contrast(page.locator('.mbb-relation-details a').first());
      expect(crossLinkContrast.ratio).toBeGreaterThanOrEqual(4.5);
      expect(detailsLinkContrast.ratio).toBeGreaterThanOrEqual(4.5);
      await expect(page.locator('.mbb-relation-cross a').first()).toHaveCSS(
        'text-decoration-line',
        'underline',
      );
      await expect(page.locator('.mbb-relation-details a').first()).toHaveCSS(
        'text-decoration-line',
        'underline',
      );
      await page.evaluate(() => {
        window.previousAnchor = document.activeElement;
        window.scrollTo(0, 0);
      });
      await page.setViewportSize({ width, height: width > 700 ? 900 : 844 });
      // 390 also needs a real width change to exercise the same-breakpoint reflow.
      if (width === 390)
        await page.locator('#map').evaluate((map) => {
          map.style.width = '350px';
        });
      await expect.poll(() => page.evaluate(() => !window.previousAnchor.isConnected)).toBe(true);
      await expect(page.locator(`[data-node="${nid(0)}"]`)).toBeFocused();
      expect(await page.evaluate(() => scrollY)).toBe(0);
      await page.evaluate(() => {
        window.previousAnchor = document.activeElement;
        document.fonts.dispatchEvent(new Event('loadingdone'));
      });
      await expect.poll(() => page.evaluate(() => !window.previousAnchor.isConnected)).toBe(true);
      await expect(page.locator(`[data-node="${nid(0)}"]`)).toBeFocused();
      expect(await page.evaluate(() => scrollY)).toBe(0);
      await expect(page.locator('.mbb-relation-cross-group')).toHaveCount(2);
      await expect(page.locator('.mbb-relation-cross button')).toHaveCount(2);
      const edges = page.locator('.mbb-relation-cross li[data-edge-id]');
      expect(
        await edges.evaluateAll((nodes) => nodes.map((node) => node.dataset.edgeId).sort()),
      ).toEqual([3, 4, 5, 6].map(eid).sort());
      for (const i of [3, 4, 5, 6])
        await expect(
          page.locator(`.mbb-relation-cross li[data-edge-id="${eid(i)}"]`),
        ).toContainText('关联说明 ' + i);
      if (width <= 700) {
        const controls = await page.evaluate(() => {
          const select = document
              .querySelector('.mbb-relation-branch-picker')
              .getBoundingClientRect(),
            toolbar = document.querySelector('.mbb-relation-toolbar').getBoundingClientRect(),
            full = [...document.querySelectorAll('.mbb-relation-toolbar button')]
              .find((n) => n.textContent === 'View full map')
              .getBoundingClientRect();
          return {
            selectWidth: select.width,
            toolbarWidth: toolbar.width,
            selectBottom: select.bottom,
            buttonTop: full.top,
          };
        });
        expect(controls.selectWidth).toBeGreaterThanOrEqual(controls.toolbarWidth - 1);
        expect(controls.buttonTop).toBeGreaterThanOrEqual(controls.selectBottom);
      }
      await page.screenshot({
        path: filePath(info, `r3-after-${width}-${theme}.png`),
        fullPage: true,
      });
      fs.writeFileSync(
        filePath(info, `r3-contrast-${width}-${theme}.json`),
        JSON.stringify(
          { focusedContrast, mutedContrast, crossLinkContrast, detailsLinkContrast },
          null,
          2,
        ),
      );
      await page.locator(`[data-node="${nid(2)}"]`).focus();
      await page.keyboard.press('Tab');
      expect(
        await page.evaluate(() => !!document.activeElement.closest('.mbb-relation-board')),
      ).toBe(false);
      await page.locator(`[data-node="${nid(0)}"]`).focus();
      await page.keyboard.press('Shift+Tab');
      await expect(page.locator('.mbb-relation-viewport')).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      expect(
        await page.evaluate(() => !!document.activeElement.closest('.mbb-relation-viewport')),
      ).toBe(false);
      await page.locator(`.mbb-relation-cross a[href="#topic-4"]`).first().click();
      await expect(page).toHaveURL(/#topic-4$/);
    });
  }
