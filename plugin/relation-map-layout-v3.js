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
            (a[i - 1][0] === p[0] &&
              p[0] === a[i + 1][0] &&
              (p[1] - a[i - 1][1]) * (a[i + 1][1] - p[1]) > 0) ||
            (a[i - 1][1] === p[1] &&
              p[1] === a[i + 1][1] &&
              (p[0] - a[i - 1][0]) * (a[i + 1][0] - p[0]) > 0)
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
  function route(start, end, obstacles, bounds, offset, occupied, bundle, rails, tail) {
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
        8,
        bounds.w - 8,
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
        8,
        bounds.h - 8,
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
    // Only the local normal arrival corridor of the same real target and kind may merge.
    const sharedTail = (a, b, segment) =>
      segment.tail === tail.id &&
      a[1 - tail.axis] === tail.fixed &&
      b[1 - tail.axis] === tail.fixed &&
      Math.min(a[tail.axis], b[tail.axis]) >= tail.lo &&
      Math.max(a[tail.axis], b[tail.axis]) <= tail.hi;
    const conflicts = (a, b) =>
      nearby(a, b).some(
        (s) => s.bundle !== bundle && !sharedTail(a, b, s) && closeParallel(a, b, s.a, s.b),
      );
    const allowed = (a, b) => !segmentBlocked(a, b, obstacles) && !conflicts(a, b);
    const directionOf = (a, b) => (a[0] !== b[0] ? (b[0] > a[0] ? 1 : 3) : b[1] > a[1] ? 2 : 4);
    const opposite = (direction) => ((direction + 1) % 4) + 1;
    const arrivalDirection = tail.side === 'left' ? 1 : tail.side === 'right' ? 3 : 2;
    const candidates = [
      [start, [end[0], start[1]], end],
      [start, [start[0], end[1]], end],
    ];
    for (const x of xs) candidates.push([start, [x, start[1]], [x, end[1]], end]);
    for (const y of ys) candidates.push([start, [start[0], y], [end[0], y], end]);
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
        valid = true,
        previousDirection = 2;
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1],
          b = path[i];
        const direction = directionOf(a, b);
        if (
          direction === opposite(previousDirection) ||
          (i === path.length - 1 && direction === opposite(arrivalDirection)) ||
          !allowed(a, b)
        ) {
          valid = false;
          break;
        }
        const length = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
        cost +=
          length +
          (direction !== previousDirection ? 64 : 0) +
          (i === path.length - 1 && direction !== arrivalDirection ? 64 : 0) +
          (length < 24 ? 48 : 0);
        previousDirection = direction;
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
    // Direction belongs to the search state: distance alone prefers tiny zigzags.
    const origin = source * 5 + 2,
      distance = new Map([[origin, 0]]),
      previous = new Map(),
      closed = new Set();
    let goal = null;
    push({ id: origin, cost: 0 });
    while (heap.length) {
      const { id } = pop();
      if (closed.has(id)) continue;
      const point = Math.floor(id / 5),
        direction = id % 5;
      if (point === target) {
        goal = id;
        break;
      }
      closed.add(id);
      const x = point % nx,
        y = Math.floor(point / nx),
        a = [xs[x], ys[y]];
      for (const [xx, yy] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]) {
        if (xx < 0 || yy < 0 || xx >= nx || yy >= ys.length) continue;
        const b = [xs[xx], ys[yy]],
          nextDirection = directionOf(a, b),
          next = (yy * nx + xx) * 5 + nextDirection;
        if (
          nextDirection === opposite(direction) ||
          (yy * nx + xx === target && nextDirection === opposite(arrivalDirection)) ||
          closed.has(next) ||
          blockedGrid(a, b, x, y) ||
          conflicts(a, b)
        )
          continue;
        const cost =
          distance.get(id) +
          Math.abs(a[0] - b[0]) +
          Math.abs(a[1] - b[1]) +
          (direction && direction !== nextDirection ? 64 : 0) +
          (yy * nx + xx === target && nextDirection !== arrivalDirection ? 64 : 0);
        if (cost < (distance.get(next) ?? Infinity)) {
          distance.set(next, cost);
          previous.set(next, id);
          push({ id: next, cost: cost + Math.abs(b[0] - end[0]) + Math.abs(b[1] - end[1]) });
        }
      }
    }
    if (goal === null) throw Error('Relationship route has no obstacle-free path: ' + bundle);
    const path = [];
    let current = goal;
    while (true) {
      const point = Math.floor(current / 5);
      path.push([xs[point % nx], ys[Math.floor(point / nx)]]);
      if (current === origin) break;
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
      nodeGap = 32,
      rowGap = options.compact ? 80 : 88,
      pad = options.compact ? 18 : 26,
      outer = options.compact ? 12 : 48;
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
      const header = Math.max(96, 18 + titleHeight + 44 + incomingMax * 12),
        clearGap = Math.max(rowGap, 72 + incomingMax * 12);
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
        !options.compact && regions.length > 1 ? largest * 2 + 64 + outer * 2 : largest,
        options.width || Math.min(1560, Math.max(900, Math.sqrt(total) * 1.35)),
      ),
      gutter = 64;
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
        ...boxes.map((r) => ({ ...r, x: r.x - 12, y: r.y - 12, w: r.w + 24, h: r.h + 24 })),
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
    const kindOrder = ['recommended', 'compare', 'optimization'];
    const canonicalKinds = (kinds) =>
      kinds.sort((a, b) => kindOrder.indexOf(a) - kindOrder.indexOf(b));
    for (const kinds of outgoing.values()) canonicalKinds(kinds);
    const incoming = new Map();
    map.edges.forEach((e, i) => {
      if (!incoming.has(e.to)) incoming.set(e.to, []);
      if (!incoming.get(e.to).some((x) => x.from === e.from && x.kind === e.kind))
        incoming.get(e.to).push({ from: e.from, kind: e.kind, index: i });
    });
    // A nearby branch can enter a node from its facing side. Long downward reading
    // chains retain top arrivals, and a blocked side never displaces a safe top port.
    const sideClear = (e, side, length) => {
      const target = byId.get(e.to),
        end = [side === 'left' ? target.x : target.x + target.w, target.y + target.h / 2],
        approach = [end[0] + (side === 'left' ? -length : length), end[1]];
      return !segmentBlocked(
        approach,
        end,
        obstacles.filter((r) => r.id !== e.to),
      );
    };
    const arrivalSides = map.edges.map((e) => {
      const source = byId.get(e.from),
        target = byId.get(e.to);
      if (
        source.group === target.group ||
        Math.abs(target.y + target.h / 2 - source.y - source.h) > 160
      )
        return 'top';
      const side =
        source.x + source.w + 24 <= target.x
          ? 'left'
          : source.x >= target.x + target.w + 24
            ? 'right'
            : 'top';
      return side !== 'top' && sideClear(e, side, 32) ? side : 'top';
    });
    map.edges.forEach((e, i) => {
      const side = arrivalSides[i];
      const peers = incoming
        .get(e.to)
        .filter((a) => a.kind === e.kind && arrivalSides[a.index] === side);
      if (side !== 'top' && !sideClear(e, side, 32 + (peers.length - 1) * 12))
        arrivalSides[i] = 'top';
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
        offset = kinds.indexOf(first.kind) * 16,
        start = [source.x + source.w / 2 + offset, source.y + source.h],
        fork = [start[0], start[1] + 32 + kinds.indexOf(first.kind) * 12];
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
          side = arrivalSides[e.index],
          arrivals = incoming.get(e.to).filter((a) => arrivalSides[a.index] === side),
          targetKinds = canonicalKinds([...new Set(arrivals.map((a) => a.kind))]),
          peers = arrivals.filter((a) => a.kind === e.kind),
          port =
            targetKinds.indexOf(e.kind) *
            (side === 'top'
              ? 16
              : Math.min(16, (target.h / 2 - 12) / Math.max(1, targetKinds.length - 1))),
          end =
            side === 'top'
              ? [target.x + target.w / 2 + port, target.y]
              : [side === 'left' ? target.x : target.x + target.w, target.y + target.h / 2 + port],
          arrivalIndex = peers.findIndex((a) => a.from === e.from),
          axis = side === 'top' ? 1 : 0,
          direction = side === 'right' ? 1 : -1,
          approach = [...end],
          tailStart = [...end];
        approach[axis] += direction * (32 + arrivalIndex * 12);
        tailStart[axis] += direction * (32 + (peers.length - 1) * 12);
        const tail = {
          id: e.to + '\0' + e.kind + '\0' + side,
          side,
          axis,
          fixed: end[1 - axis],
          lo: Math.min(end[axis], tailStart[axis]),
          hi: Math.max(end[axis], tailStart[axis]),
          end,
        };
        reservations.push({
          bundle: bundle.id,
          tail: tail.id,
          x: approach[0] - 6,
          y: approach[1] - 6,
          w: 12,
          h: 12,
        });
        plans.push({ e, bundle, fork, end, approach, bundleIndex, tail });
      }
      bundleIndex++;
    }
    // Reserve short local reading steps before long cross-branch routes occupy their corridors.
    const priority = (plan) => {
      const source = byId.get(plan.e.from),
        target = byId.get(plan.e.to),
        local = source.group === target.group,
        aligned = plan.fork[0] === plan.approach[0] && plan.approach[1] >= plan.fork[1];
      return local && plan.e.kind === 'recommended' ? (aligned ? 0 : 1) : local ? 2 : 3;
    };
    plans.sort(
      (a, b) =>
        priority(a) - priority(b) ||
        Math.abs(a.fork[0] - a.approach[0]) +
          Math.abs(a.fork[1] - a.approach[1]) -
          (Math.abs(b.fork[0] - b.approach[0]) + Math.abs(b.fork[1] - b.approach[1])) ||
        a.e.index - b.e.index,
    );
    for (const plan of plans) {
      const { e, bundle, fork, end, approach, bundleIndex, tail } = plan;
      const forbidden = [
        ...obstacles,
        ...reservations.filter((r) => r.bundle !== bundle.id && r.tail !== tail.id),
      ];
      const points = route(
        fork,
        approach,
        forbidden,
        { w: width, h: height },
        (bundleIndex % 7) * 7,
        occupied,
        bundle.id,
        obstacles,
        tail,
      );
      const branch = compact([...points, end]);
      for (let i = 1; i < branch.length; i++) {
        const a = branch[i - 1],
          b = branch[i],
          axis = tail.axis;
        if (a[1 - axis] === tail.fixed && b[1 - axis] === tail.fixed) {
          const lo = Math.min(a[axis], b[axis]),
            hi = Math.max(a[axis], b[axis]),
            cuts = [...new Set([lo, hi, tail.lo, tail.hi].filter((v) => v >= lo && v <= hi))].sort(
              (a, b) => a - b,
            );
          for (let j = 1; j < cuts.length; j++) {
            const p = [...a],
              q = [...a];
            p[axis] = cuts[j - 1];
            q[axis] = cuts[j];
            occupied.push({
              a: p,
              b: q,
              bundle: bundle.id,
              tail: cuts[j - 1] >= tail.lo && cuts[j] <= tail.hi ? tail.id : null,
            });
          }
        } else occupied.push({ a, b, bundle: bundle.id });
      }
      edges.push({ ...e, bundle: bundle.id, tail, points: compact([bundle.points[0], ...branch]) });
    }
    // Union and split collinear legs, including the permitted common arrivals. Every shared visual segment is drawn once;
    // semantic paths below retain every real edge and its independent identity.
    const segments = [];
    const lines = new Map();
    for (const e of edges) {
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
          bundle: e.bundle,
          kind: e.kind,
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
          bundle: legs.find((l) => ids.includes(l.id)).bundle,
          sharedTail: new Set(legs.filter((l) => ids.includes(l.id)).map((l) => l.bundle)).size > 1,
          kind: legs.find((l) => ids.includes(l.id)).kind,
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
