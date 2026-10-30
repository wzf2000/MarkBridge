const assert = require('node:assert/strict'),
  cp = require('node:child_process'),
  path = require('node:path');
const legacy = require('../plugin/relation-map.js'),
  reader = require('../plugin/relation-map-v3-reader.js');
const { map, edgeIds } = require('./fixtures/relation-map-v3-public.cjs');
assert(Buffer.byteLength(JSON.stringify(map)) > 16384);
assert.doesNotThrow(() => reader.validate(map));
assert.throws(() => legacy.validate(map));
assert(reader.edgeIdsValid(edgeIds, map));
for (const ids of [
  undefined,
  [],
  edgeIds.slice(1),
  edgeIds.map(() => edgeIds[0]),
  edgeIds.map((id, i) => (i ? id : 'author-edge')),
])
  assert(!reader.edgeIdsValid(ids, map));
const oversized = JSON.parse(JSON.stringify(map));
oversized.nodes.forEach((n) => (n.url = 'https://example.test/' + 'x'.repeat(400)));
assert(Buffer.byteLength(JSON.stringify(oversized)) < 65536);
assert.throws(() => reader.validate(oversized), /static output budget/);
const result = JSON.parse(
  cp.execFileSync(
    process.env.MARKBRIDGE_TEST_PHP || 'php',
    [path.join(__dirname, 'relation-map-v3-public.php')],
    { input: JSON.stringify({ map, edgeIds, oversized }), encoding: 'utf8' },
  ),
);
assert.deepEqual(result, {
  legacy: false,
  public: true,
  staticEdges: 128,
  oversized: false,
  badIdsRejected: true,
});
console.log(
  'v3 public drawing over 16KiB, opaque identities, complete no-script fallback and unchanged static/legacy limits passed',
);

const layout = require('../plugin/relation-map-layout-v3.js');
const started = performance.now(),
  geometry = layout.layout(map, { width: 1100, edgeIds });
assert(
  performance.now() - started < 5000,
  'legal dense public drawing blocks layout for over five seconds',
);
assert.deepEqual(
  geometry.edges.map((e) => e.id),
  edgeIds,
);
const rectangles = [...geometry.boxes, ...geometry.regions.map((r) => r.header)];
for (const edge of geometry.edges)
  for (let i = 1; i < edge.points.length; i++)
    assert(
      !layout.segmentBlocked(edge.points[i - 1], edge.points[i], rectangles),
      'dense route crosses node/title',
    );
for (let i = 0; i < geometry.segments.length; i++)
  for (let j = 0; j < i; j++) {
    const a = geometry.segments[i],
      b = geometry.segments[j];
    if (a.bundle === b.bundle) continue;
    const vertical = a.points[0][0] === a.points[1][0];
    if (vertical !== (b.points[0][0] === b.points[1][0])) continue;
    const axis = vertical ? 0 : 1,
      along = 1 - axis;
    if (Math.abs(a.points[0][axis] - b.points[0][axis]) >= 5) continue;
    const span = (p) => [Math.min(p[0][along], p[1][along]), Math.max(p[0][along], p[1][along])],
      x = span(a.points),
      y = span(b.points);
    assert(
      Math.min(x[1], y[1]) - Math.max(x[0], y[0]) <= 0.01,
      'dense different bundles visually merge',
    );
  }
console.log(
  'Dense 128-edge public geometry preserves every identity without title/node crossings or near-collinear bundle merges',
);
