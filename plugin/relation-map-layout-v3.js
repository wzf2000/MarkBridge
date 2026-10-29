/* Pure geometry for the v3 reader. Groups describe regions, never dependency vertices. */
(() => {
  'use strict';
  function ranks(nodes, edges) {
    const adjacency = new Map(nodes.map((n) => [n.id, []]));
    for (const e of edges)
      if (e.kind === 'recommended' && adjacency.has(e.from) && adjacency.has(e.to))
        adjacency.get(e.from).push(e.to);
    let clock = 0;
    const index = new Map(),
      low = new Map(),
      stack = [],
      active = new Set(),
      components = [];
    function visit(id) {
      index.set(id, clock);
      low.set(id, clock++);
      stack.push(id);
      active.add(id);
      for (const next of adjacency.get(id)) {
        if (!index.has(next)) {
          visit(next);
          low.set(id, Math.min(low.get(id), low.get(next)));
        } else if (active.has(next)) low.set(id, Math.min(low.get(id), index.get(next)));
      }
      if (low.get(id) === index.get(id)) {
        const component = [];
        let next;
        do {
          next = stack.pop();
          active.delete(next);
          component.push(next);
        } while (next !== id);
        components.push(component);
      }
    }
    nodes.forEach((n) => {
      if (!index.has(n.id)) visit(n.id);
    });
    const owner = new Map(),
      levels = components.map(() => 0),
      indegree = components.map(() => 0),
      next = components.map(() => new Set());
    components.forEach((c, i) => c.forEach((id) => owner.set(id, i)));
    for (const [a, bs] of adjacency)
      for (const b of bs)
        if (owner.get(a) !== owner.get(b) && !next[owner.get(a)].has(owner.get(b))) {
          next[owner.get(a)].add(owner.get(b));
          indegree[owner.get(b)]++;
        }
    const queue = components.map((_, i) => i).filter((i) => !indegree[i]);
    while (queue.length) {
      const a = queue.shift();
      for (const b of next[a]) {
        levels[b] = Math.max(levels[b], levels[a] + 1);
        if (!--indegree[b]) queue.push(b);
      }
    }
    return { levels: new Map(nodes.map((n) => [n.id, levels[owner.get(n.id)]])), components };
  }
  const compact = (points) =>
    points
      .filter((p, i) => !i || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1])
      .filter(
        (p, i, a) =>
          !i ||
          i === a.length - 1 ||
          !(
            (a[i - 1][0] === p[0] && p[0] === a[i + 1][0]) ||
            (a[i - 1][1] === p[1] && p[1] === a[i + 1][1])
          ),
      );
  function segmentBlocked(a, b, obstacles) {
    return obstacles.some((r) =>
      a[0] === b[0]
        ? a[0] > r.x &&
          a[0] < r.x + r.w &&
          Math.max(a[1], b[1]) > r.y &&
          Math.min(a[1], b[1]) < r.y + r.h
        : a[1] > r.y &&
          a[1] < r.y + r.h &&
          Math.max(a[0], b[0]) > r.x &&
          Math.min(a[0], b[0]) < r.x + r.w,
    );
  }
  // Rectilinear visibility grid. Each path travels around node and title rectangles.
  function route(start, end, obstacles, bounds, offset, occupied, bundle, rails) {
    const overlap = (a, b, c, d) =>
      a[0] === b[0] && c[0] === d[0] && a[0] === c[0]
        ? Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1])) -
          Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1]))
        : a[1] === b[1] && c[1] === d[1] && a[1] === c[1]
          ? Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) -
            Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0]))
          : 0;
    const heap = [];
    const push = (item) => {
      heap.push(item);
      let i = heap.length - 1;
      while (i) {
        const parent = (i - 1) >> 1;
        if (heap[parent].cost <= item.cost) break;
        heap[i] = heap[parent];
        i = parent;
      }
      heap[i] = item;
    };
    const pop = () => {
      const first = heap[0],
        last = heap.pop();
      if (heap.length) {
        let i = 0;
        while (2 * i + 1 < heap.length) {
          let child = 2 * i + 1;
          if (child + 1 < heap.length && heap[child + 1].cost < heap[child].cost) child++;
          if (heap[child].cost >= last.cost) break;
          heap[i] = heap[child];
          i = child;
        }
        heap[i] = last;
      }
      return first;
    };
    const closeParallel = (a, b, c, d) => {
      if (a[0] === b[0] && c[0] === d[0] && Math.abs(a[0] - c[0]) < 5)
        return (
          Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1])) -
            Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) >
          0.01
        );
      if (a[1] === b[1] && c[1] === d[1] && Math.abs(a[1] - c[1]) < 5)
        return (
          Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) -
            Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) >
          0.01
        );
      return false;
    };
    let xs = [
      ...new Set([
        start[0],
        end[0],
        start[0] - 7,
        start[0] + 7,
        end[0] - 7,
        end[0] + 7,
        12 + offset,
        bounds.w - 12 - offset,
        ...rails.flatMap((r) => [r.x - 10 - offset, r.x + r.w + 10 + offset]),
      ]),
    ]
      .filter((v) => v >= 8 && v <= bounds.w - 8)
      .sort((a, b) => a - b);
    let ys = [
      ...new Set([
        start[1],
        end[1],
        start[1] - 7,
        start[1] + 7,
        end[1] - 7,
        end[1] + 7,
        12 + offset,
        bounds.h - 12 - offset,
        ...rails.flatMap((r) => [r.y - 10 - offset, r.y + r.h + 10 + offset]),
      ]),
    ]
      .filter((v) => v >= 8 && v <= bounds.h - 8)
      .sort((a, b) => a - b);
    const horizontal = new Map(),
      vertical = new Map();
    for (const segment of occupied) {
      const isVertical = segment.a[0] === segment.b[0],
        coordinate = isVertical ? segment.a[0] : segment.a[1],
        buckets = isVertical ? vertical : horizontal,
        key = Math.floor(coordinate / 5);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(segment);
    }
    const nearby = (a, b) => {
      const isVertical = a[0] === b[0],
        key = Math.floor((isVertical ? a[0] : a[1]) / 5),
        buckets = isVertical ? vertical : horizontal;
      return [
        ...(buckets.get(key - 1) || []),
        ...(buckets.get(key) || []),
        ...(buckets.get(key + 1) || []),
      ];
    };
    const allowed = (a, b) =>
      !segmentBlocked(a, b, obstacles) &&
      !nearby(a, b).some((s) => s.bundle !== bundle && closeParallel(a, b, s.a, s.b));
    const candidates = [
      [start, [end[0], start[1]], end],
      [start, [start[0], end[1]], end],
    ];
    for (const x of xs) candidates.push([start, [x, start[1]], [x, end[1]], end]);
    for (const y of ys) candidates.push([start, [start[0], y], [end[0], y], end]);
    // A short launch/arrival jog separates peers sharing a source row before taking a long rail.
    for (const delta of [-7, 7])
      for (const x of xs)
        candidates.push([
          start,
          [start[0], start[1] + delta],
          [x, start[1] + delta],
          [x, end[1]],
          end,
        ]);
    let best = null,
      bestCost = Infinity;
    for (const candidate of candidates) {
      const path = compact(candidate);
      if (
        !path.every(
          (point) =>
            point[0] >= 8 && point[0] <= bounds.w - 8 && point[1] >= 8 && point[1] <= bounds.h - 8,
        )
      )
        continue;
      let cost = 0,
        valid = true;
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1],
          b = path[i];
        if (!allowed(a, b)) {
          valid = false;
          break;
        }
        const shared = nearby(a, b).some(
          (s) => s.bundle === bundle && overlap(a, b, s.a, s.b) > 0.01,
        );
        cost += (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])) * (shared ? 0.2 : 1) + 6;
      }
      if (valid && cost < bestCost) {
        best = path;
        bestCost = cost;
      }
    }
    if (best) return best;
    xs = [...new Set([...xs, ...obstacles.flatMap((r) => [r.x - 1, r.x + r.w + 1])])]
      .filter((v) => v >= 8 && v <= bounds.w - 8)
      .sort((a, b) => a - b);
    ys = [...new Set([...ys, ...obstacles.flatMap((r) => [r.y - 1, r.y + r.h + 1])])]
      .filter((v) => v >= 8 && v <= bounds.h - 8)
      .sort((a, b) => a - b);
    const horizontalObstacles = ys.map((y) => obstacles.filter((r) => y > r.y && y < r.y + r.h)),
      verticalObstacles = xs.map((x) => obstacles.filter((r) => x > r.x && x < r.x + r.w));
    const blockedGrid = (a, b, x, y) =>
      a[0] === b[0]
        ? verticalObstacles[x].some(
            (r) => Math.max(a[1], b[1]) > r.y && Math.min(a[1], b[1]) < r.y + r.h,
          )
        : horizontalObstacles[y].some(
            (r) => Math.max(a[0], b[0]) > r.x && Math.min(a[0], b[0]) < r.x + r.w,
          );
    const nx = xs.length,
      source = ys.indexOf(start[1]) * nx + xs.indexOf(start[0]),
      target = ys.indexOf(end[1]) * nx + xs.indexOf(end[0]);
    const distance = new Map([[source, 0]]),
      previous = new Map(),
      closed = new Set();
    push({ id: source, cost: 0 });
    while (heap.length) {
      const { id } = pop();
      if (closed.has(id)) continue;
      if (id === target) break;
      closed.add(id);
      const x = id % nx,
        y = Math.floor(id / nx),
        a = [xs[x], ys[y]];
      for (const [xx, yy] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]) {
        if (xx < 0 || yy < 0 || xx >= nx || yy >= ys.length) continue;
        const b = [xs[xx], ys[yy]],
          next = yy * nx + xx;
        if (
          closed.has(next) ||
          blockedGrid(a, b, x, y) ||
          nearby(a, b).some((s) => s.bundle !== bundle && closeParallel(a, b, s.a, s.b))
        )
          continue;
        const shared = nearby(a, b).some(
          (s) => s.bundle === bundle && overlap(a, b, s.a, s.b) > 0.01,
        );
        const cost =
          distance.get(id) + (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])) * (shared ? 0.2 : 1);
        if (cost < (distance.get(next) ?? Infinity)) {
          distance.set(next, cost);
          previous.set(next, id);
          push({
            id: next,
            cost: cost + 0.2 * (Math.abs(b[0] - end[0]) + Math.abs(b[1] - end[1])),
          });
        }
      }
    }
    if (!distance.has(target))
      throw Error('Relationship route has no obstacle-free path: ' + bundle);
    const path = [];
    let current = target;
    while (true) {
      path.push([xs[current % nx], ys[Math.floor(current / nx)]]);
      if (current === source) break;
      current = previous.get(current);
    }
    return compact(path.reverse());
  }
  function layout(map, options = {}) {
    const levels = new Map(),
      components = [];
    for (const group of map.groups) {
      const local = ranks(
        map.nodes.filter((n) => n.group === group.id),
        map.edges,
      );
      for (const [id, rank] of local.levels) levels.set(id, rank);
      components.push(...local.components);
    }
    const nodeWidth = options.nodeWidth || 168,
      nodeGap = 24,
      rowGap = options.compact ? 46 : 62,
      pad = options.compact ? 18 : 26,
      outer = options.compact ? 12 : 24;
    const measured = options.heights || {},
      regions = [],
      boxes = [];
    for (const group of map.groups) {
      const items = map.nodes.filter((n) => n.group === group.id),
        rows = new Map();
      for (const n of items) {
        const level = levels.get(n.id);
        if (!rows.has(level)) rows.set(level, []);
        rows.get(level).push(n);
      }
      const columns = Math.max(
        1,
        ...[...rows.values()].map((row) => Math.min(options.maxColumns || 2, row.length)),
      );
      const w = pad * 2 + columns * nodeWidth + (columns - 1) * nodeGap;
      const incomingMax = Math.max(
        1,
        ...items.map((n) => map.edges.filter((e) => e.to === n.id).length),
      );
      const titleHeight =
        options.headerHeights?.[group.id] ||
        Math.max(23, Math.ceil(([...group.title].length * 16) / (w - 24)) * 23);
      const header = Math.max(78, 18 + titleHeight + 40 + incomingMax * 7),
        clearGap = Math.max(rowGap, 36 + incomingMax * 7 + (incomingMax > 2 ? 16 : 0));
      let y = header;
      const local = [];
      for (const [level, row] of [...rows].sort((a, b) => a[0] - b[0])) {
        for (let first = 0; first < row.length; first += columns) {
          const slice = row.slice(first, first + columns),
            h = Math.max(
              ...slice.map(
                (n) =>
                  measured[n.id] ||
                  Math.max(64, 24 + Math.ceil([...n.title].length / ((nodeWidth - 30) / 16)) * 24),
              ),
            );
          slice.forEach((n, i) =>
            local.push({
              id: n.id,
              group: n.group,
              rank: level,
              x:
                pad +
                i * (nodeWidth + nodeGap) +
                ((columns - slice.length) * (nodeWidth + nodeGap)) / 2,
              y,
              w: nodeWidth,
              h: measured[n.id] || h,
            }),
          );
          y += h + clearGap;
        }
      }
      regions.push({ id: group.id, w, h: y - clearGap + pad, titleHeight, local });
    }
    const largest = Math.max(...regions.map((r) => r.w)),
      total = regions.reduce((s, r) => s + r.w * r.h, 0),
      packWidth = Math.max(
        largest,
        options.width || Math.min(1560, Math.max(900, Math.sqrt(total) * 1.35)),
      ),
      gutter = 56;
    let width = 0;
    const placed = [];
    for (const r of regions) {
      const candidates = [...new Set([outer, ...placed.map((p) => p.x + p.w + gutter)])].filter(
        (x) => x + r.w + outer <= packWidth || x === outer,
      );
      const positions = candidates
        .map((x) => {
          let y = outer;
          for (;;) {
            const overlaps = placed.filter(
              (p) =>
                x < p.x + p.w + gutter &&
                x + r.w + gutter > p.x &&
                y < p.y + p.h + gutter &&
                y + r.h + gutter > p.y,
            );
            if (!overlaps.length) break;
            y = Math.max(...overlaps.map((p) => p.y + p.h + gutter));
          }
          return { x, y };
        })
        .sort((a, b) => a.y - b.y || a.x - b.x);
      const { x, y } = positions[0];
      r.x = x;
      r.y = y;
      r.header = { x: x + 12, y: y + 18, w: r.w - 24, h: r.titleHeight };
      r.local.forEach((n) => boxes.push({ ...n, x: n.x + x, y: n.y + y }));
      delete r.local;
      placed.push(r);
      width = Math.max(width, x + r.w + outer);
    }
    const height = Math.max(...regions.map((r) => r.y + r.h)) + 36,
      byId = new Map(boxes.map((n) => [n.id, n])),
      obstacles = [
        ...boxes.map((r) => ({ ...r, x: r.x - 6, y: r.y - 6, w: r.w + 12, h: r.h + 12 })),
        ...regions.map((r) => r.header),
      ],
      bundles = [],
      grouped = new Map();
    if (options.measureOnly) return { width, height, regions, boxes };
    map.edges.forEach((e, index) => {
      const key = e.from + '\0' + e.kind;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped
        .get(key)
        .push({ ...e, id: options.edgeIds?.[index] || e.id || 'edge-' + index, index });
    });
    const outgoing = new Map();
    for (const members of grouped.values()) {
      const e = members[0];
      if (!outgoing.has(e.from)) outgoing.set(e.from, []);
      outgoing.get(e.from).push(e.kind);
    }
    const incoming = new Map();
    map.edges.forEach((e, i) => {
      if (!incoming.has(e.to)) incoming.set(e.to, []);
      incoming.get(e.to).push(i);
    });
    const edges = [],
      occupied = [],
      reservations = [],
      plans = [];
    let bundleIndex = 0;
    for (const members of grouped.values()) {
      const first = members[0],
        source = byId.get(first.from),
        kinds = outgoing.get(first.from),
        offset = (kinds.indexOf(first.kind) - (kinds.length - 1) / 2) * 16,
        start = [source.x + source.w / 2 + offset, source.y + source.h],
        fork = [start[0], start[1] + 24 + kinds.indexOf(first.kind) * 8];
      const bundle = {
        id: 'bundle-' + bundleIndex,
        from: first.from,
        kind: first.kind,
        members: members.map((e) => e.id),
        points: [start, fork],
      };
      bundles.push(bundle);
      occupied.push({ a: start, b: fork, bundle: bundle.id });
      reservations.push({ bundle: bundle.id, x: fork[0] - 6, y: fork[1] - 6, w: 12, h: 12 });
      for (const e of members) {
        const target = byId.get(e.to),
          arrivals = incoming.get(e.to),
          port =
            (arrivals.indexOf(e.index) - (arrivals.length - 1) / 2) *
            Math.min(12, (target.w - 24) / arrivals.length),
          end = [target.x + target.w / 2 + port, target.y],
          approach = [end[0], end[1] - 12 - arrivals.indexOf(e.index) * 7];
        reservations.push({
          bundle: bundle.id,
          x: approach[0] - 5,
          y: approach[1] - 5,
          w: 10,
          h: 10,
        });
        plans.push({ e, bundle, fork, end, approach, bundleIndex });
      }
      bundleIndex++;
    }
    for (const plan of plans) {
      const { e, bundle, fork, end, approach, bundleIndex } = plan;
      const forbidden = [...obstacles, ...reservations.filter((r) => r.bundle !== bundle.id)];
      const points = route(
        fork,
        approach,
        forbidden,
        { w: width, h: height },
        (bundleIndex % 7) * 7,
        occupied,
        bundle.id,
        obstacles,
      );
      const branch = compact([...points, end]);
      for (let i = 1; i < branch.length; i++)
        occupied.push({ a: branch[i - 1], b: branch[i], bundle: bundle.id });
      edges.push({ ...e, bundle: bundle.id, points: compact([bundle.points[0], ...branch]) });
    }
    // Union and split collinear legs per bundle. Every shared visual segment is drawn once;
    // semantic paths below retain every real edge and its independent identity.
    const segments = [];
    for (const bundle of bundles) {
      const lines = new Map(),
        members = edges.filter((e) => e.bundle === bundle.id);
      for (const e of members) {
        const path = e.points;
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1],
            b = path[i],
            vertical = a[0] === b[0],
            key = (vertical ? 'v:' : 'h:') + (vertical ? a[0] : a[1]);
          if (!lines.has(key)) lines.set(key, []);
          lines.get(key).push({
            a,
            b,
            id: e.id,
            lo: Math.min(a[vertical ? 1 : 0], b[vertical ? 1 : 0]),
            hi: Math.max(a[vertical ? 1 : 0], b[vertical ? 1 : 0]),
          });
        }
      }
      for (const [key, legs] of lines) {
        const cuts = [...new Set(legs.flatMap((l) => [l.lo, l.hi]))].sort((a, b) => a - b),
          vertical = key[0] === 'v',
          fixed = Number(key.slice(2));
        for (let i = 1; i < cuts.length; i++) {
          const ids = legs.filter((l) => l.lo <= cuts[i - 1] && l.hi >= cuts[i]).map((l) => l.id);
          if (!ids.length) continue;
          segments.push({
            bundle: bundle.id,
            kind: bundle.kind,
            members: [...new Set(ids)],
            points: vertical
              ? [
                  [fixed, cuts[i - 1]],
                  [fixed, cuts[i]],
                ]
              : [
                  [cuts[i - 1], fixed],
                  [cuts[i], fixed],
                ],
          });
        }
      }
    }
    return {
      width,
      height,
      regions,
      boxes,
      edges: edges.sort((a, b) => a.index - b.index),
      bundles,
      segments,
      components,
    };
  }
  const api = Object.freeze({ layout, ranks, segmentBlocked });
  globalThis.MBBRelationMapLayoutV3 = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
