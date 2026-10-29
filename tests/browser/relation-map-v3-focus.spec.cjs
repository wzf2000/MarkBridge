const { test, expect } = require('@playwright/test');
const fs = require('node:fs'),
  path = require('node:path');
const plugin = path.resolve(__dirname, '../../plugin');
const gid = 'g_' + 'a'.repeat(32),
  id = (i) => 'n_' + i.toString(16).padStart(32, '0');
const map = {
  format: 'relation-map/v1',
  title: 'Initial node view',
  groups: [{ id: gid, title: 'One branch' }],
  nodes: Array.from({ length: 8 }, (_, i) => ({
    id: id(i),
    group: gid,
    title: 'Topic ' + i,
    url: '#topic-' + i,
  })),
  edges: Array.from({ length: 7 }, (_, i) => ({ from: id(i), to: id(i + 1), kind: 'recommended' })),
};
async function mount(page, start) {
  await page.goto('/health');
  await page.setContent(
    `<html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:12px;font:16px/1.7 system-ui}#map{width:100%}${fs.readFileSync(path.join(plugin, 'relation-map.css'), 'utf8')}</style><button id="sentinel">Before map</button><div id="map"></div></html>`,
  );
  for (const file of ['relation-map-layout-v3.js', 'relation-map-v3-reader.js'])
    await page.addScriptTag({ path: path.join(plugin, file) });
  await page.locator('#sentinel').focus();
  await page.evaluate(
    ({ map, start }) =>
      MBBRelationMapV3Reader.enhance(
        document.querySelector('#map'),
        map,
        map.edges.map((_, i) => 'e_' + i.toString(16).padStart(32, '0')),
        {
          display: { mobileStart: { kind: 'node', id: start } },
        },
      ),
    { map, start },
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(50);
  return page.evaluate((start) => {
    const viewport = document.querySelector('.mbb-relation-viewport').getBoundingClientRect(),
      target = document.querySelector(`[data-node="${start}"]`).getBoundingClientRect();
    return {
      top: target.top - viewport.top,
      bottom: target.bottom - viewport.top,
      height: viewport.height,
      transform: document.querySelector('.mbb-relation-board').style.transform,
      active: document.activeElement.id,
      scroll: scrollY,
    };
  }, start);
}
test('mobile node start distinguishes first/last without moving focus or article', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const first = await mount(page, id(0)),
    last = await mount(page, id(7));
  for (const result of [first, last]) {
    expect(result.top).toBeGreaterThanOrEqual(0);
    expect(result.bottom).toBeLessThanOrEqual(result.height);
    expect(result.height).toBeLessThanOrEqual(500);
    expect(result.active).toBe('sentinel');
    expect(result.scroll).toBe(0);
  }
  expect(first.transform).not.toBe(last.transform);
  await page.getByRole('button', { name: 'Show entire branch', exact: true }).click();
  expect(
    await page.locator('.mbb-relation-viewport').evaluate((n) => n.clientHeight),
  ).toBeGreaterThan(500);
  await page.setViewportSize({ width: 320, height: 844 });
  await expect(page.getByRole('button', { name: 'Show entire branch', exact: true })).toBeHidden();
});

test('v3 reader accepts expanded public drawing and every opaque edge identity', async ({
  page,
}) => {
  const fixture = require('../fixtures/relation-map-v3-public.cjs');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/health');
  await page.setContent(
    `<html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px/1.7 system-ui}#map{width:1100px}${fs.readFileSync(path.join(plugin, 'relation-map.css'), 'utf8')}</style><div id="map"></div></html>`,
  );
  for (const file of ['relation-map-layout-v3.js', 'relation-map-v3-reader.js'])
    await page.addScriptTag({ path: path.join(plugin, file) });
  await page.evaluate(
    ({ map, edgeIds }) =>
      MBBRelationMapV3Reader.enhance(document.querySelector('#map'), map, edgeIds, {
        display: { mobileStart: null },
      }),
    fixture,
  );
  await expect(page.locator('.mbb-relation-node')).toHaveCount(16);
  await expect(page.locator('path[data-id]')).toHaveCount(128);
  await expect(page.locator('[data-mbb-edge-id]')).toHaveCount(128);
  const ids = await page
    .locator('path[data-id]')
    .evaluateAll((nodes) => nodes.map((n) => n.dataset.id));
  expect(ids).toEqual(fixture.edgeIds);
});

test('v3 native Main host pumps preserve anchors and recover same-width visibility', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/health');
  await page.setContent(
    `<html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:12px;font:16px/1.7 system-ui}#map{width:100%;border:1px solid transparent}${fs.readFileSync(path.join(plugin, 'relation-map.css'), 'utf8')}</style><div id="wrapper"><div id="map" data-mbb-teaching="component"><div class="mbb-teaching-body">Author explanation</div></div></div><div id="unrelated"></div></html>`,
  );
  await page.evaluate((map) => {
    window.MBB_COMPONENTS_READER = true;
    document.querySelector('#map').dataset.mbbTeachingConfig = JSON.stringify({
      reader: 'relation-map/public-v3',
      status: 'available',
      publicView: map,
      edgeIds: map.edges.map((_, i) => 'e_' + i.toString(16).padStart(32, '0')),
      display: { mobileStart: null },
    });
  }, map);
  for (const file of [
    'relation-map-v3.js',
    'relation-map-layout-v3.js',
    'relation-map-v3-reader.js',
    'components.js',
  ])
    await page.addScriptTag({ path: path.join(plugin, file) });
  await expect(page.locator('.mbb-relation-node')).toHaveCount(map.nodes.length);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.preservedAnchor = document.querySelector('.mbb-relation-node');
    window.restoredWidth = document.querySelector('#map').clientWidth;
    const observer = new MutationObserver((records) => {
      window.hostReplacements =
        (window.hostReplacements || 0) +
        records.filter((record) => Array.from(record.removedNodes).includes(window.preservedAnchor))
          .length;
    });
    observer.observe(document.querySelector('.mbb-relation-board'), { childList: true });
  });
  for (let i = 0; i < 3; i++) {
    await page.evaluate((i) => {
      document.querySelector('#unrelated').append(document.createTextNode('unrelated ' + i));
      window.dispatchEvent(new Event('scroll'));
      window.MarkBridgeComponents.scan();
    }, i);
    await page.waitForTimeout(250);
  }
  expect(
    await page.evaluate(
      () =>
        preservedAnchor.isConnected &&
        preservedAnchor === document.querySelector('.mbb-relation-node') &&
        !window.hostReplacements,
    ),
  ).toBe(true);
  await page.evaluate(() => preservedAnchor.focus());
  expect(await page.evaluate(() => document.activeElement === preservedAnchor)).toBe(true);
  await page.locator('.mbb-relation-node').first().click();
  await expect(page).toHaveURL(/#topic-0$/);
  await page.evaluate(() => {
    document.querySelector('#wrapper').hidden = true;
    window.MarkBridgeComponents.scan();
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    document.querySelector('#wrapper').hidden = false;
    window.MarkBridgeComponents.scan();
  });
  await expect(page.locator('.mbb-relation-node').first()).toBeVisible();
  await page.waitForTimeout(250);
  expect(
    await page.evaluate(
      () =>
        document.querySelector('#map').clientWidth === restoredWidth &&
        document.querySelector('.mbb-relation-board').clientWidth > 0,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    window.restoredAnchor = document.querySelector('.mbb-relation-node');
    window.MarkBridgeComponents.scan();
    window.dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(
      () =>
        restoredAnchor.isConnected &&
        restoredAnchor === document.querySelector('.mbb-relation-node'),
    ),
  ).toBe(true);
  await page.locator('.mbb-relation-node').first().focus();
});
