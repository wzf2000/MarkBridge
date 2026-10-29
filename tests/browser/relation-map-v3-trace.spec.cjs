const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const plugin = path.resolve(__dirname, '../../plugin');
const gid = (i) => 'g_' + i.toString(16).padStart(32, '0');
const nid = (i) => 'n_' + i.toString(16).padStart(32, '0');
const eid = (i) => 'e_' + i.toString(16).padStart(32, '0');
const map = {
  format: 'relation-map/v1',
  title: '概念之间的阅读联系',
  groups: [
    { id: gid(0), title: '基础概念与常用方法' },
    { id: gid(1), title: '实践与延伸阅读' },
  ],
  nodes: Array.from({ length: 10 }, (_, i) => ({
    id: nid(i),
    group: gid(i < 5 ? 0 : 1),
    title: [
      '问题与输入',
      '拆分步骤',
      '选择数据结构',
      '比较候选方法',
      '验证结果',
      '实践起点',
      '实现与观察',
      '定位差异',
      '调整方案',
      '复盘与延伸',
    ][i],
    description: i === 2 ? '根据问题选择合适的数据结构。' : '',
    url: '#topic-' + i,
  })),
  edges: [
    [0, 1, 'recommended'],
    [0, 2, 'recommended'],
    [0, 3, 'recommended'],
    [1, 4, 'recommended'],
    [2, 4, 'recommended'],
    [2, 3, 'compare'],
    [5, 6, 'recommended'],
    [6, 7, 'recommended'],
    [7, 8, 'recommended'],
    [8, 9, 'recommended'],
    [4, 5, 'recommended'],
    [2, 8, 'optimization'],
  ].map(([from, to, kind], i) => ({
    from: nid(from),
    to: nid(to),
    kind,
    why: '关系说明 ' + i + '：结合两篇文章检查自己的理解。',
  })),
};
async function mount(page, source) {
  await page.goto('/health');
  await page.setContent(
    `<html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:12px;font:16px/1.7 system-ui;background:#fbfaf6}#map{max-width:1006px;margin:auto}${fs.readFileSync(path.join(source, 'relation-map.css'), 'utf8')}</style><button id="before">Before map</button><div id="map"></div></html>`,
  );
  for (const file of ['relation-map-layout-v3.js', 'relation-map-v3-reader.js'])
    await page.addScriptTag({ path: path.join(source, file) });
  await page.evaluate(
    ({ map, ids }) => {
      MBBRelationMapV3Reader.enhance(document.querySelector('#map'), map, ids);
    },
    { map, ids: map.edges.map((_, i) => eid(i)) },
  );
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.mbb-relation-node').first()).toBeVisible();
}
function screenshotPath(info, name) {
  const dir = process.env.MARKBRIDGE_REVIEW_SCREEN_DIR;
  if (!dir) return info.outputPath(name);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, name);
}
for (const width of [1440, 390, 320]) {
  test(`v3 direct relationships follow hover and keyboard intent ${width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    const target = () => page.locator(`[data-node="${nid(2)}"]`);
    if (process.env.MARKBRIDGE_BASELINE_PLUGIN) {
      await mount(page, process.env.MARKBRIDGE_BASELINE_PLUGIN);
      await target().hover();
      await page.screenshot({ path: screenshotPath(info, `r1-before-${width}.png`) });
    }
    await mount(page, plugin);
    const expected = map.edges.flatMap((edge, i) =>
      (edge.from === nid(2) || edge.to === nid(2)) &&
      (width > 700 ||
        (map.nodes.find((n) => n.id === edge.from).group === gid(0) &&
          map.nodes.find((n) => n.id === edge.to).group === gid(0)))
        ? [eid(i)]
        : [],
    );
    // Cover a fresh entry and mouse movement inside an already hovered node after keyboard focus.
    await page.mouse.move(0, 0);
    await page.locator(`[data-node="${nid(0)}"]`).focus();
    await target().hover();
    await expect(target()).toHaveClass(/is-trace-source/);
    await target().focus();
    await page.locator(`[data-node="${nid(0)}"]`).focus();
    await expect(page.locator(`[data-node="${nid(0)}"]`)).toHaveClass(/is-trace-source/);
    const bounds = await target().boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2 + 1, bounds.y + bounds.height / 2 + 1);
    await expect(target()).toHaveClass(/is-trace-source/);
    await expect(page.locator(`[data-node="${nid(0)}"]`)).not.toHaveClass(/is-trace-source/);
    expect(
      await page
        .locator('.mbb-relation-edge-identity.is-traced')
        .evaluateAll((nodes) => nodes.map((n) => n.dataset.id)),
    ).toEqual(expected);
    await page.screenshot({ path: screenshotPath(info, `r1-after-${width}.png`) });
    // A shared source's other outgoing edges must not be selected with the incoming edge.
    await expect(page.locator(`[data-id="${eid(0)}"]`)).not.toHaveClass(/is-traced/);
    await expect(page.locator(`[data-id="${eid(2)}"]`)).not.toHaveClass(/is-traced/);
    await target().focus();
    const described = await target().evaluate((anchor) =>
      anchor
        .getAttribute('aria-describedby')
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent)
        .join('\n'),
    );
    expect(described).toContain('根据问题选择合适的数据结构');
    expect(described).toContain('关系说明 1');
    expect(described).toContain('关系说明 11');
    await page.keyboard.press('Tab');
    await expect(page.locator(`[data-node="${nid(3)}"]`)).toBeFocused();
    await expect(page.locator(`[data-node="${nid(3)}"]`)).toHaveClass(/is-trace-source/);
    await page.locator('#before').focus();
    await page.mouse.move(0, 0);
    await expect(page.locator('.mbb-relation-board')).not.toHaveClass(/is-tracing/);
    await page.locator('.mbb-relation-details summary').click();
    await expect(page.locator('[data-mbb-edge-id]')).toHaveCount(map.edges.length);
    await expect(page.locator(`[data-mbb-edge-id="${eid(11)}"]`)).toContainText('关系说明 11');
    await target().click();
    await expect(page).toHaveURL(/#topic-2$/);
  });
}

async function clickSegment(page, predicate) {
  const selected = await page.locator('#map').evaluate((host, predicateSource) => {
    const test = Function('segment', 'return (' + predicateSource + ')(segment)');
    const index = host.mbbRelationGeometry.segments.findIndex(test);
    if (index < 0) throw Error('Expected a selectable relationship segment');
    const segment = host.mbbRelationGeometry.segments[index];
    const path = host.querySelectorAll('.mbb-relation-edge-hit')[index];
    path.scrollIntoView({ block: 'center' });
    const point = path
      .getPointAtLength(path.getTotalLength() / 2)
      .matrixTransform(path.getScreenCTM());
    return { x: point.x, y: point.y, members: segment.members };
  }, predicate.toString());
  await page.mouse.click(selected.x, selected.y);
  return selected.members;
}
for (const width of [1440, 390, 320]) {
  test(`v3 selects complete relationships and resolves common arrivals ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await mount(page, plugin);
    const members = await clickSegment(page, (s) => s.sharedTail && s.members.length === 2);
    const inspection = page.locator('.mbb-relation-inspection');
    await expect(inspection).toContainText('Choose a relationship');
    await expect(inspection.locator('li button')).toHaveCount(2);
    await expect(page.locator('.mbb-relation-edge-identity.is-selected')).toHaveCount(0);
    await inspection.locator('li button').first().click();
    await expect(page.locator('.mbb-relation-edge-identity.is-selected')).toHaveAttribute(
      'data-id',
      members[0],
    );
    await expect(page.locator('.mbb-relation-node.is-selected-endpoint')).toHaveCount(2);
    await expect(inspection.locator('a')).toHaveCount(2);
    await expect(inspection).toContainText('关系说明');
    await page.setViewportSize({ width: width + 12, height: 880 });
    await expect(page.locator('.mbb-relation-edge-identity.is-selected')).toHaveAttribute(
      'data-id',
      members[0],
    );
    await inspection.getByRole('button', { name: 'Clear selection' }).click();
    await expect(inspection).toBeHidden();
    // Relationship selection uses the existing details list; SVG adds no tab stops.
    await page.locator('.mbb-relation-details summary').click();
    const pick = page.locator(`[data-mbb-edge-id="${eid(11)}"] button`);
    await pick.focus();
    await page.keyboard.press('Enter');
    await expect(pick).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.mbb-relation-edge-identity.is-selected')).toHaveAttribute(
      'data-id',
      eid(11),
    );
    await expect(page.locator('svg [tabindex]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('.mbb-relation-edge-identity.is-selected')).toHaveCount(0);
    await expect(inspection).toBeHidden();
    if (width < 700) {
      await page.getByRole('button', { name: 'Back to branch', exact: true }).click();
      const branch = page.getByRole('combobox', { name: 'Current branch' });
      await branch.selectOption(gid(1));
      await expect(page.locator('.mbb-relation-edge-identity.is-selected')).toHaveCount(0);
      await expect(inspection).toBeHidden();
    }
  });
}
test('v3 segment hits select a single relation; dragging does not select or follow links', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mount(page, plugin);
  const members = await clickSegment(
    page,
    (s) => s.members.length === 1 && Math.abs(s.points[1][1] - s.points[0][1]) >= 32,
  );
  await expect(page.locator('.mbb-relation-edge-identity.is-selected')).toHaveAttribute(
    'data-id',
    members[0],
  );
  await page.getByRole('button', { name: 'Clear selection' }).click();
  await page.getByRole('button', { name: 'Drag canvas: off' }).click();
  const hit = await page
    .locator('.mbb-relation-edge-hit')
    .first()
    .evaluate((path) => {
      const p = path
        .getPointAtLength(path.getTotalLength() / 2)
        .matrixTransform(path.getScreenCTM());
      return { x: p.x, y: p.y };
    });
  const url = page.url();
  await page.mouse.move(hit.x, hit.y);
  await page.mouse.down();
  await page.mouse.move(hit.x + 60, hit.y + 40, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.mbb-relation-edge-identity.is-selected')).toHaveCount(0);
  await expect(page).toHaveURL(url);
  await page.getByRole('button', { name: 'Drag canvas: on' }).click();
  await page.evaluate(() =>
    document.body.insertAdjacentHTML('beforeend', '<div style="height:1200px"></div>'),
  );
  await page.mouse.move(500, 500);
  const before = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, 200);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before);
});
