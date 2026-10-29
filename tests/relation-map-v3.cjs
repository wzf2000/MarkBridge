const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const V = require('../plugin/relation-map-v3.js');
const L = require('../plugin/relation-map-layout-v3.js');
const clone = (v) => JSON.parse(JSON.stringify(v));
const base = {
  format: 'relation-map/v3',
  title: '关系布局',
  display: { mobileStart: { kind: 'auto', id: '' } },
  groups: [
    { id: 'foundation', title: '基础' },
    { id: 'practice', title: '实践' },
  ],
  nodes: ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => ({
    id,
    group: i < 4 ? 'foundation' : 'practice',
    title: '中文节点 ' + id,
    target: { kind: 'local-document', site: 'S_' + 'a'.repeat(32), documentId: 'document-' + id },
  })),
  edges: [
    { id: 'ab', from: 'a', to: 'b', kind: 'recommended' },
    { id: 'ac', from: 'a', to: 'c', kind: 'recommended', why: '同源分支' },
    { id: 'bd', from: 'b', to: 'd', kind: 'recommended' },
    { id: 'cd', from: 'c', to: 'd', kind: 'recommended' },
    { id: 'ae', from: 'a', to: 'e', kind: 'compare' },
  ],
};
const good = [
  base,
  ...['group', 'node'].map((kind) => ({
    ...clone(base),
    display: { mobileStart: { kind, id: kind === 'group' ? 'practice' : 'e' } },
  })),
];
const bad = [];
for (const change of [
  (p) => delete p.display,
  (p) => (p.display.extra = true),
  (p) => (p.display.mobileStart = null),
  (p) => (p.display.mobileStart.id = 'a'),
  (p) => (p.display.mobileStart = { kind: 'group', id: 'missing' }),
  (p) => (p.display.mobileStart = { kind: 'node', id: 'practice' }),
  (p) => (p.display.mobileStart.extra = 'no'),
  (p) => (p.nodes[0].target.secret = 'no'),
  (p) => (p.edges[1].id = 'ab'),
]) {
  const p = clone(base);
  change(p);
  bad.push(p);
}
const valid = (p) => {
  try {
    V.validate(p);
    return true;
  } catch {
    return false;
  }
};
const all = [...good, ...bad];
assert.deepEqual(all.map(valid), [...good.map(() => true), ...bad.map(() => false)]);
assert.deepEqual(
  JSON.parse(
    cp.execFileSync(
      process.env.MARKBRIDGE_TEST_PHP || 'php',
      [path.join(__dirname, 'relation-map-v3.php')],
      { input: JSON.stringify(all), encoding: 'utf8' },
    ),
  ),
  all.map(valid),
);
assert(V.publicDisplay({ mobileStart: null }, null));
assert(!V.publicDisplay({ mobileStart: { kind: 'group', id: 'foundation' } }, base));
const publicMap = {
  ...base,
  format: 'relation-map/v1',
  nodes: base.nodes.map(({ target, ...n }) => ({ ...n, url: '#' + n.id })),
};
delete publicMap.display;
const edgeIds = base.edges.map((_, i) => 'e_' + String(i).padStart(32, '0'));
function checkGeometry(map, options = {}) {
  const geometry = L.layout(map, { width: 1000, edgeIds, ...options });
  assert.equal(geometry.edges.length, map.edges.length);
  assert.deepEqual(
    geometry.edges.map((e) => [e.from, e.to, e.kind, e.why]),
    map.edges.map((e) => [e.from, e.to, e.kind, e.why]),
  );
  const obstacles = [...geometry.boxes, ...geometry.regions.map((r) => r.header)];
  for (const e of geometry.edges)
    for (const [x, y] of e.points)
      assert(
        x >= 0 && y >= 0 && x <= geometry.width && y <= geometry.height,
        'route escapes board',
      );
  for (const e of geometry.edges)
    for (let i = 1; i < e.points.length; i++)
      assert(
        !L.segmentBlocked(e.points[i - 1], e.points[i], obstacles),
        'edge crosses a node or title',
      );
  for (const bundle of geometry.bundles)
    assert(
      bundle.members.every((id) => geometry.edges.find((e) => e.id === id)?.from === bundle.from),
    );
  const overlap = (a, b, c, d) =>
    a[0] === b[0] && c[0] === d[0] && a[0] === c[0]
      ? Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1])) -
        Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1]))
      : a[1] === b[1] && c[1] === d[1] && a[1] === c[1]
        ? Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) -
          Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0]))
        : 0;
  // Full semantic paths may overlap only inside a real same-target, same-kind arrival.
  // Visual union alone cannot prove this: it deliberately draws each common segment once.
  for (let i = 0; i < geometry.edges.length; i++) {
    const a = geometry.edges[i];
    const length = (u, v) => Math.abs(u[0] - v[0]) + Math.abs(u[1] - v[1]);
    assert(length(a.points[0], a.points[1]) >= 24, 'departure is too short to follow');
    assert(length(a.points.at(-2), a.points.at(-1)) >= 24, 'arrival is too short to follow');
    for (let k = 1; k < a.points.length - 1; k++) {
      const before = a.points[k - 1],
        point = a.points[k],
        after = a.points[k + 1];
      const dot =
        (point[0] - before[0]) * (after[0] - point[0]) +
        (point[1] - before[1]) * (after[1] - point[1]);
      assert(dot >= 0, 'route reverses over its departure, arrival or an intermediate leg');
    }
    const [start, departure] = a.points,
      end = a.points.at(-1),
      arrival = a.points.at(-2);
    assert(
      departure[0] === start[0] && departure[1] > start[1],
      'departure leaves the bottom normally',
    );
    assert(
      a.tail.side === 'top'
        ? end[0] === arrival[0] && end[1] > arrival[1]
        : end[1] === arrival[1] &&
            (a.tail.side === 'left' ? end[0] > arrival[0] : end[0] < arrival[0]),
      'arrival must enter normally without reversing its protected stub',
    );

    const safe = geometry.boxes
      .filter((n) => n.id !== a.from && n.id !== a.to)
      .map((r) => ({ ...r, x: r.x - 12, y: r.y - 12, w: r.w + 24, h: r.h + 24 }));
    for (let k = 1; k < a.points.length; k++)
      assert(!L.segmentBlocked(a.points[k - 1], a.points[k], safe), 'route hugs an unrelated node');
    for (let j = 0; j < i; j++) {
      const b = geometry.edges[j];
      if (a.bundle === b.bundle) continue;
      for (let ai = 1; ai < a.points.length; ai++)
        for (let bi = 1; bi < b.points.length; bi++) {
          const ap = a.points[ai - 1],
            aq = a.points[ai],
            bp = b.points[bi - 1],
            bq = b.points[bi];
          if (overlap(ap, aq, bp, bq) <= 0.01) continue;
          assert(a.to === b.to && a.kind === b.kind, 'unrelated semantic paths merge');
          const axis = a.tail.axis;
          assert(
            a.tail.id === b.tail.id &&
              ap[1 - axis] === a.tail.fixed &&
              aq[1 - axis] === a.tail.fixed &&
              bp[1 - axis] === a.tail.fixed &&
              bq[1 - axis] === a.tail.fixed,
            'shared arrival must stay on its target rail',
          );
          const start = Math.max(Math.min(ap[axis], aq[axis]), Math.min(bp[axis], bq[axis]));
          const end = Math.min(Math.max(ap[axis], aq[axis]), Math.max(bp[axis], bq[axis]));
          assert(start >= a.tail.lo && end <= a.tail.hi, 'paths merge before their local arrival');
        }
    }
  }
  for (const s of geometry.segments) {
    assert(
      s.members.every((id) => geometry.edges.some((e) => e.id === id)),
      'segment has a fake identity',
    );
    if (s.sharedTail) {
      const members = s.members.map((id) => geometry.edges.find((e) => e.id === id));
      assert(
        members.every((e) => e.to === members[0].to && e.kind === members[0].kind),
        'shared visual tail needs the same true endpoint and kind',
      );
    }
  }
  for (let i = 0; i < geometry.segments.length; i++)
    for (let j = 0; j < i; j++) {
      const a = geometry.segments[i],
        b = geometry.segments[j];
      if (a.bundle !== b.bundle) {
        assert(overlap(...a.points, ...b.points) < 0.01, 'different bundles share a line');
        const [a0, a1] = a.points,
          [b0, b1] = b.points;
        if (a0[0] === a1[0] && b0[0] === b1[0] && Math.abs(a0[0] - b0[0]) < 5)
          assert(
            overlap([b0[0], a0[1]], [b0[0], a1[1]], b0, b1) <= 0,
            'near vertical bundles merge visually',
          );
        if (a0[1] === a1[1] && b0[1] === b1[1] && Math.abs(a0[1] - b0[1]) < 5)
          assert(
            overlap([a0[0], b0[1]], [a1[0], b0[1]], b0, b1) <= 0,
            'near horizontal bundles merge visually',
          );
      }
    }
  return geometry;
}
const g = checkGeometry(publicMap),
  byId = new Map(g.boxes.map((n) => [n.id, n]));
assert.equal(byId.get('b').y, byId.get('c').y);
assert(byId.get('a').y < byId.get('b').y && byId.get('b').y < byId.get('d').y);
assert.equal(
  byId.get('e').y,
  byId.get('f').y,
  'cross-group relationships do not invent local hierarchy',
);
assert.equal(g.edges.filter((e) => e.to === 'd').length, 2);
assert(g.segments.some((s) => s.members.includes(edgeIds[0]) && s.members.includes(edgeIds[1])));
assert(
  g.segments.some(
    (s) => s.sharedTail && s.members.includes(edgeIds[2]) && s.members.includes(edgeIds[3]),
  ),
  'same target and kind share a local arrival',
);
const aligned = checkGeometry({
  ...publicMap,
  groups: [publicMap.groups[0]],
  nodes: publicMap.nodes.slice(0, 2),
  edges: [{ from: 'a', to: 'b', kind: 'recommended' }],
});
assert.equal(aligned.edges[0].points.length, 2, 'aligned unobstructed relationship stays straight');
const reordered = {
  ...publicMap,
  nodes: [publicMap.nodes[0], publicMap.nodes[1], { ...publicMap.nodes[2], group: 'practice' }],
  edges: [
    { id: 'incoming-compare', from: 'c', to: 'b', kind: 'compare' },
    { id: 'local-compare', from: 'a', to: 'b', kind: 'compare' },
    { id: 'centered-recommended', from: 'a', to: 'b', kind: 'recommended' },
  ],
};
for (const order of [reordered.edges, [...reordered.edges].reverse()]) {
  const stable = checkGeometry({ ...reordered, edges: order }, { edgeIds: order.map((e) => e.id) }),
    recommended = stable.edges.find((e) => e.id === 'centered-recommended'),
    source = stable.boxes.find((n) => n.id === 'a');
  assert.equal(
    recommended.points.length,
    2,
    'edge enumeration must not bend an aligned reading step',
  );
  assert.equal(
    recommended.points[0][0],
    source.x + source.w / 2,
    'recommended port stays centered',
  );
  assert.deepEqual(
    stable.edges.map((e) => e.id),
    order.map((e) => e.id),
    'canonical ports preserve independent identities',
  );
}

const mixed = checkGeometry({
  ...publicMap,
  edges: [
    ...publicMap.edges,
    { from: 'a', to: 'd', kind: 'compare' },
    { from: 'c', to: 'd', kind: 'optimization' },
  ],
});
assert(mixed.segments.filter((s) => s.sharedTail).every((s) => s.kind === 'recommended'));

assert.deepEqual(
  g.edges.map((e) => e.id),
  edgeIds,
);
checkGeometry({
  ...publicMap,
  edges: [...publicMap.edges, { id: 'da', from: 'd', to: 'a', kind: 'recommended' }],
});
const single = {
  format: 'relation-map/v1',
  title: '一节点',
  groups: [{ id: 'one', title: '复杂主题'.repeat(20) }],
  nodes: [{ id: 'solo', group: 'one', title: '长中文标题'.repeat(32), url: '#solo' }],
  edges: [],
};
const small = checkGeometry(single, { compact: true, width: 280, nodeWidth: 220, maxColumns: 1 });
assert(small.width <= 280);
assert(
  small.regions[0].header.h > 100 && small.boxes[0].h > 200,
  'pure fallback reserves long title geometry',
);
const measured = checkGeometry(single, {
  compact: true,
  width: 280,
  nodeWidth: 220,
  maxColumns: 1,
  heights: { solo: 460 },
  headerHeights: { one: 220 },
});
assert.equal(measured.boxes[0].h, 460);
assert.equal(measured.regions[0].header.h, 220);
// A strongly connected first row can receive many relationships before any local rank.
// Reserve the complete common-arrival corridor above it, clear of its group title.
const converging = {
  format: 'relation-map/v1',
  title: 'Many arrivals',
  groups: [{ id: 'many', title: 'Concentrated arrivals' }],
  nodes: Array.from({ length: 13 }, (_, i) => ({
    id: 'm' + i,
    group: 'many',
    title: 'Node ' + i,
    url: '#m' + i,
  })),
  edges: [],
};
for (let i = 1; i < 13; i++) {
  converging.edges.push({ from: 'm' + i, to: 'm0', kind: 'recommended' });
  converging.edges.push({ from: 'm0', to: 'm' + i, kind: 'recommended' });
}
checkGeometry(converging, { edgeIds: converging.edges.map((_, i) => 'arrival-' + i) });
const dense = {
  format: 'relation-map/v1',
  title: '预算',
  groups: Array.from({ length: 8 }, (_, i) => ({ id: 'g' + i, title: '组' + i })),
  nodes: Array.from({ length: 64 }, (_, i) => ({
    id: 'n' + i,
    group: 'g' + Math.floor(i / 8),
    title: '节点' + i,
    url: '#' + i,
  })),
  edges: [],
};
for (let i = 0; i < 64 && dense.edges.length < 128; i++)
  for (let step = 1; step <= 2; step++) {
    const to = (i + step) % 64;
    dense.edges.push({
      id: 'edge' + dense.edges.length,
      from: 'n' + i,
      to: 'n' + to,
      kind: 'recommended',
    });
  }
const started = performance.now();
checkGeometry(dense, { edgeIds: dense.edges.map((_, i) => 'edge' + i) });
assert(performance.now() - started < 10000, 'bounded 64/128 layout exceeds ten seconds');
console.log(
  'v3 closed PHP/JS contract, local SCC layering, bundles, multi-parent, cycle, obstacles and bounded geometry passed',
);
