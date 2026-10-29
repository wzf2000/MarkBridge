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

async function nearestLineFixture(page) {
  await page.setViewportSize({ width: 774, height: 900 });
  await mount(page, plugin);
  // The actual 800px drawing fits into 750 CSS pixels. At 40% zoom its 16px
  // parallel rails are six screen CSS pixels apart, including on a DPR 2 display.
  for (let i = 0; i < 5; i++)
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  const size = await page.locator('#map').evaluate((host) => ({
    drawing: host.mbbRelationGeometry.width,
    viewport: host.querySelector('.mbb-relation-viewport').clientWidth,
  }));
  await page.setViewportSize({
    width: 774 + Math.round(size.drawing * 0.9375) - size.viewport,
    height: 900,
  });
  await expect
    .poll(() => page.locator('.mbb-relation-lines').evaluate((svg) => svg.getScreenCTM().a * 16))
    .toBeCloseTo(6, 1);
  return page.locator('#map').evaluate((host) => {
    const segments = host.mbbRelationGeometry.segments;
    const distance = (point, segment) => {
      const [a, b] = segment.points,
        dx = b[0] - a[0],
        dy = b[1] - a[1];
      const t = Math.max(
        0,
        Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy)),
      );
      return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy);
    };
    const pairs = [];
    let crossing;
    for (let i = 0; i < segments.length; i++)
      for (let j = 0; j < i; j++) {
        const a = segments[i],
          b = segments[j];
        if (a.members.length !== 1 || b.members.length !== 1 || a.members[0] === b.members[0])
          continue;
        const av = a.points[0][0] === a.points[1][0],
          bv = b.points[0][0] === b.points[1][0];
        if (av !== bv) {
          const v = av ? a : b,
            h = av ? b : a,
            point = [v.points[0][0], h.points[0][1]];
          if (
            !crossing &&
            point[0] > Math.min(...h.points.map((p) => p[0])) + 10 &&
            point[0] < Math.max(...h.points.map((p) => p[0])) - 10 &&
            point[1] > Math.min(...v.points.map((p) => p[1])) + 10 &&
            point[1] < Math.max(...v.points.map((p) => p[1])) - 10
          ) {
            crossing = {
              point,
              members: [
                ...new Set(
                  segments.filter((s) => distance(point, s) < 0.001).flatMap((s) => s.members),
                ),
              ],
            };
          }
          continue;
        }
        const axis = av ? 0 : 1,
          along = 1 - axis;
        if (Math.abs(a.points[0][axis] - b.points[0][axis]) !== 16) continue;
        const lo = Math.max(
          Math.min(a.points[0][along], a.points[1][along]),
          Math.min(b.points[0][along], b.points[1][along]),
        );
        const hi = Math.min(
          Math.max(a.points[0][along], a.points[1][along]),
          Math.max(b.points[0][along], b.points[1][along]),
        );
        if (hi - lo < 40) continue;
        const first = [...a.points[0]],
          second = [...b.points[0]];
        first[along] = second[along] = (lo + hi) / 2;
        const middle = [(first[0] + second[0]) / 2, (first[1] + second[1]) / 2];
        const members = [...a.members, ...b.members];
        // Exclude unrelated junctions from this parallel-line fixture, using real
        // geometry rather than the topmost DOM hit target that caused the bug.
        if (
          segments.some(
            (s) =>
              s.members.some((id) => !members.includes(id)) &&
              [first, second, middle].some((point) => distance(point, s) <= 10),
          )
        )
          continue;
        pairs.push({ first, second, middle, members, span: hi - lo });
      }
    pairs.sort((a, b) => b.span - a.span);
    if (!pairs.length || !crossing)
      throw Error('Expected real parallel and crossing relationships');
    const tail = segments.find((s) => s.sharedTail && s.members.length > 1);
    if (!tail) throw Error('Expected a real common arrival');
    return {
      parallel: pairs[0],
      crossing,
      shared: {
        point: [
          (tail.points[0][0] + tail.points[1][0]) / 2,
          (tail.points[0][1] + tail.points[1][1]) / 2,
        ],
        members: tail.members,
      },
    };
  });
}
async function screenPoint(page, point) {
  await page.evaluate((point) => {
    const matrix = document.querySelector('.mbb-relation-lines').getScreenCTM();
    const y = matrix.b * point[0] + matrix.d * point[1] + matrix.f;
    scrollBy(0, y - innerHeight / 2);
  }, point);
  return page.evaluate((point) => {
    const matrix = document.querySelector('.mbb-relation-lines').getScreenCTM();
    return {
      x: matrix.a * point[0] + matrix.c * point[1] + matrix.e,
      y: matrix.b * point[0] + matrix.d * point[1] + matrix.f,
    };
  }, point);
}
async function clickWorldPoint(page, point) {
  const position = await screenPoint(page, point);
  await page.mouse.click(Math.round(position.x), Math.round(position.y));
}
async function candidateIds(page) {
  return page
    .locator('.mbb-relation-inspection li button')
    .evaluateAll((nodes) => nodes.map((n) => n.dataset.edgeId).sort());
}
test.describe('v3 nearest visible centerline selection', () => {
  test.use({ deviceScaleFactor: 2 });
  test('six CSS pixel parallel lines select each center regardless of hit painting order', async ({
    page,
  }) => {
    const { parallel, crossing, shared } = await nearestLineFixture(page);
    const first = await screenPoint(page, parallel.first),
      second = await screenPoint(page, parallel.second);
    expect(Math.hypot(first.x - second.x, first.y - second.y)).toBeCloseTo(6, 1);
    expect(await page.evaluate(() => devicePixelRatio)).toBe(2);
    const requested = await screenPoint(page, parallel.middle);
    await page.evaluate(() =>
      document.addEventListener(
        'click',
        (event) => {
          globalThis.nativeLineClick = { x: event.clientX, y: event.clientY };
        },
        { once: true, capture: true },
      ),
    );
    await page.mouse.click(requested.x, requested.y);
    const actual = await page.evaluate(() => globalThis.nativeLineClick);
    await test
      .info()
      .attach('native-click-coordinates', {
        body: JSON.stringify({ requested, actual }),
        contentType: 'application/json',
      });
    expect(Math.abs(actual.x - requested.x)).toBeLessThan(1);
    await page.keyboard.press('Escape');
    for (const reverse of [false, true]) {
      if (reverse)
        await page
          .locator('[data-edge-hits]')
          .evaluate((group) => group.replaceChildren(...[...group.children].reverse()));
      for (const [index, point] of [parallel.first, parallel.second].entries()) {
        await clickWorldPoint(page, point);
        await expect(page.locator('.mbb-relation-edge-identity.is-selected')).toHaveAttribute(
          'data-id',
          parallel.members[index],
        );
        await page.keyboard.press('Escape');
      }
      await clickWorldPoint(page, parallel.middle);
      expect(await candidateIds(page)).toEqual([...parallel.members].sort());
      await expect(page.locator('.mbb-relation-edge-identity.is-selected')).toHaveCount(0);
      await page.keyboard.press('Escape');
    }
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await page.getByRole('button', { name: 'Drag canvas: off', exact: true }).click();
    await page.locator('.mbb-relation-viewport').focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowUp');
    await page.getByRole('button', { name: 'Drag canvas: on', exact: true }).click();
    for (const [index, point] of [parallel.first, parallel.second].entries()) {
      await clickWorldPoint(page, point);
      await expect(page.locator('.mbb-relation-edge-identity.is-selected')).toHaveAttribute(
        'data-id',
        parallel.members[index],
      );
      await page.keyboard.press('Escape');
    }
    await clickWorldPoint(page, parallel.middle);
    expect(await candidateIds(page)).toEqual([...parallel.members].sort());
    await page.keyboard.press('Escape');
    await clickWorldPoint(page, crossing.point);
    expect(await candidateIds(page)).toEqual([...crossing.members].sort());
    await page.keyboard.press('Escape');
    await clickWorldPoint(page, shared.point);
    expect(await candidateIds(page)).toEqual([...shared.members].sort());
  });
  test('a real crossing offers every equally near relationship and ignores out-of-range hit events', async ({
    page,
  }) => {
    const { crossing } = await nearestLineFixture(page);
    await clickWorldPoint(page, crossing.point);
    expect(await candidateIds(page)).toEqual([...crossing.members].sort());
    await expect(page.locator('.mbb-relation-edge-identity.is-selected')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page
      .locator('[data-edge-hits]')
      .evaluate((group) =>
        group.dispatchEvent(
          new MouseEvent('click', { bubbles: true, clientX: -1000, clientY: -1000 }),
        ),
      );
    await expect(page.locator('.mbb-relation-inspection')).toBeHidden();
    await expect(page.locator('.mbb-relation-edge-identity.is-selected')).toHaveCount(0);
  });
  test('panning a centerline outside the viewport removes it from nearest choices', async ({
    page,
  }) => {
    const { parallel } = await nearestLineFixture(page);
    const pair = [
      { point: parallel.first, id: parallel.members[0] },
      { point: parallel.second, id: parallel.members[1] },
    ].sort((a, b) => a.point[0] - b.point[0]);
    expect(pair[0].point[1]).toBe(pair[1].point[1]);
    const hidden = await screenPoint(page, pair[0].point);
    await page.getByRole('button', { name: 'Drag canvas: off', exact: true }).click();
    const rect = await page.locator('.mbb-relation-viewport').boundingBox();
    const start = { x: rect.x + rect.width - 32, y: rect.y + 32 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + rect.x - 2 - hidden.x, start.y, { steps: 8 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Drag canvas: on', exact: true }).click();
    const hiddenNow = await screenPoint(page, pair[0].point),
      visibleNow = await screenPoint(page, pair[1].point);
    const clip = await page.locator('.mbb-relation-viewport').boundingBox();
    expect(hiddenNow.x).toBeLessThan(clip.x);
    expect(hiddenNow.x).toBeGreaterThan(clip.x - 3);
    expect(visibleNow.x).toBeGreaterThan(clip.x);
    expect(visibleNow.x).toBeLessThan(clip.x + 6);
    await page.mouse.click(Math.ceil(clip.x + 1), Math.round(visibleNow.y));
    await expect(page.locator('.mbb-relation-edge-identity.is-selected')).toHaveAttribute(
      'data-id',
      pair[1].id,
    );
    await expect(page.locator('.mbb-relation-inspection li button')).toHaveCount(0);
  });
});
