const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const plugin = path.resolve(__dirname, '../../plugin');
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

async function mount(page, config) {
  await page.setContent(`<html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>body{margin:20px;font:16px/1.7 system-ui}#map{max-width:1006px;margin:auto}
    ${fs.readFileSync(path.join(plugin, 'relation-map.css'), 'utf8')}</style>
    <div id="map"></div><footer style="height:800px"></footer></html>`);
  await page.addScriptTag({ path: path.join(plugin, 'relation-map.js') });
  await page.evaluate((p) => MBBRelationMap.enhance(document.querySelector('#map'), p), config);
}

async function checkGeometry(page, config) {
  const result = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('.mbb-relation-node')].map((n) => ({
      id: n.dataset.node,
      x: parseFloat(n.style.left),
      y: n.offsetTop,
      w: parseFloat(n.style.width),
      h: n.offsetHeight,
    }));
    return [...document.querySelectorAll('.edge')].map((edge) => {
      const length = edge.getTotalLength(),
        start = edge.getPointAtLength(0),
        end = edge.getPointAtLength(length),
        prev = edge.getPointAtLength(length - 1),
        arrow = [...edge.nextElementSibling.points].map((p) => [p.x, p.y]),
        crossed = new Set();
      const board = document.querySelector('.mbb-relation-board'),
        target = nodes.find((n) => n.id === edge.dataset.to);
      let clipped = false;
      const sideArrival =
        Math.abs(end.x - target.x) < 0.1 || Math.abs(end.x - target.x - target.w) < 0.1;
      for (let distance = 1; distance < length; distance += 2) {
        const p = edge.getPointAtLength(distance);
        if (
          p.x < 0 ||
          p.y < 0 ||
          p.x > parseFloat(board.style.width) ||
          p.y > parseFloat(board.style.height)
        )
          clipped = true;
        for (const node of nodes)
          if (
            p.x > node.x + 0.5 &&
            p.x < node.x + node.w - 0.5 &&
            p.y > node.y + 0.5 &&
            p.y < node.y + node.h - 0.5
          )
            crossed.add(node.id);
      }
      const base = [(arrow[1][0] + arrow[2][0]) / 2, (arrow[1][1] + arrow[2][1]) / 2];
      return {
        from: edge.dataset.from,
        to: edge.dataset.to,
        kind: edge.dataset.kind,
        length,
        clipped,
        portInside: !sideArrival || (end.y >= target.y + 12 && end.y <= target.y + target.h - 12),
        crossed: [...crossed],
        arrowTip: arrow[0],
        end: [end.x, end.y],
        arrowDirection: (end.x - base[0]) * (end.x - prev.x) + (end.y - base[1]) * (end.y - prev.y),
        direct: Math.hypot(end.x - start.x, end.y - start.y),
        d: edge.getAttribute('d'),
      };
    });
  });
  expect(result.map(({ from, to, kind }) => ({ from, to, kind }))).toEqual(config.edges);
  for (const edge of result) {
    expect(edge.crossed, edge.from + ' → ' + edge.to).toEqual([]);
    expect(edge.clipped).toBe(false);
    expect(edge.portInside).toBe(true);
    expect(edge.arrowTip[0]).toBeCloseTo(edge.end[0], 2);
    expect(edge.arrowTip[1]).toBeCloseTo(edge.end[1], 2);
    expect(edge.arrowDirection).toBeGreaterThan(7.5);
  }
  return result;
}

for (const width of [1440, 390, 320]) {
  test(`relationship routes keep short paths and distinct branches at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await mount(page, params);
    if (width <= 700) {
      await expect(page.locator('.mbb-relation-node')).toHaveCount(6);
      expect(
        await page
          .locator('.mbb-relation-viewport')
          .evaluate((n) => getComputedStyle(n).touchAction),
      ).toBe('pan-y');
      await page.getByRole('button', { name: 'View full map', exact: true }).click();
    }
    const edges = await checkGeometry(page, params);
    for (const [from, to] of [
      ['n0', 'n1'],
      ['n1', 'n2'],
      ['n6', 'n7'],
      ['n10', 'n11'],
      ['n13', 'n14'],
    ]) {
      const edge = edges.find((e) => e.from === from && e.to === to);
      expect(edge.length).toBeCloseTo(32, 2);
      expect(edge.length).toBeCloseTo(edge.direct, 2);
    }
    // Interleaving long branches use opposite sides; same-source branches have
    // an inner short track and an outer long track, without intersecting arrivals.
    const paths = Object.fromEntries(edges.map((e) => [e.from + '-' + e.to, e.d]));
    expect(paths['n1-n3']).toMatch(/Q/);
    expect(paths['n2-n4']).not.toEqual(paths['n2-n5']);
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect(page.locator('.mbb-relation-status')).toContainText('125%');
    await page.getByRole('button', { name: 'Reset view', exact: true }).click();
    await expect(page.locator('.mbb-relation-status')).toContainText('100%');
    await page.getByRole('button', { name: 'Drag canvas: off', exact: true }).click();
    const node = page.locator('.mbb-relation-node').first(),
      box = await node.boundingBox();
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 50, box.y + 40, { steps: 4 });
    await page.mouse.up();
    expect(page.url()).not.toContain('#article');
    await page.getByRole('button', { name: 'Reset view', exact: true }).click();
    await node.focus();
    await page.keyboard.press('Enter');
    expect(page.url()).toContain('#article-0');
  });
}

test('reverse, long cross-group, same-endpoint kinds and multiple incoming edges avoid nodes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const config = structuredClone(params);
  config.edges.push(
    { from: 'n0', to: 'n14', kind: 'compare' },
    { from: 'n14', to: 'n0', kind: 'optimization' },
    { from: 'n8', to: 'n7', kind: 'compare' },
    { from: 'n6', to: 'n7', kind: 'compare' },
    { from: 'n10', to: 'n7', kind: 'recommended' },
  );
  for (const i of [0, 1, 2, 3, 4, 5])
    config.edges.push({ from: 'n' + i, to: 'n7', kind: 'optimization' });
  await mount(page, config);
  await checkGeometry(page, config);
  // Static fallback still preserves every native endpoint link and relationship.
  await page.locator('summary').click();
  await expect(page.locator('.mbb-relation-static a')).toHaveCount(
    config.nodes.length + config.edges.length * 2,
  );
});

test('group heading keeps its alignment and inset under a stronger reading theme', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mount(page, params);
  await page.evaluate(() => {
    document.body.classList.add('pagenest-site');
    document.querySelector('#map').classList.add('pagenest-main');
  });
  await page.addStyleTag({
    content: `
    .pagenest-site :is(.pagenest-main, .pagenest-sidebar) :is(h1,h2,h3,h4,p) {
      text-align: left; margin: 0;
    }`,
  });
  for (const heading of await page.locator('.mbb-relation-lane > h4').all()) {
    expect(
      await heading.evaluate((n) => {
        const style = getComputedStyle(n);
        return [style.textAlign, style.marginTop, style.marginLeft, style.marginRight];
      }),
    ).toEqual(['center', '18px', '12px', '12px']);
  }
});
