(() => {
  'use strict';
  const FORMAT = 'relation-map/v1';
  const closed = (v, keys, optional = []) =>
    v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    Object.keys(v).every((k) => keys.includes(k) || optional.includes(k)) &&
    keys.every((k) => Object.hasOwn(v, k));
  const text = (v, max, empty = false) =>
    typeof v === 'string' &&
    (empty || v.trim().length > 0) &&
    [...v].length <= max &&
    !/[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u.test(v);
  const id = (v) => typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(v);
  const safeURL = (v) => {
    if (
      typeof v !== 'string' ||
      !v ||
      new TextEncoder().encode(v).length > 1024 ||
      v !== v.trim() ||
      /[\s\u0000-\u0020\u007f-\u009f\\]/u.test(v) ||
      /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(v) ||
      v.startsWith('//') ||
      /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(v)
    )
      return false;
    if (/^https?:\/\//i.test(v)) {
      const match = v.match(
        /^https?:\/\/(\[[0-9a-f:]+\]|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::([0-9]{1,5}))?(?:[/?#][^\s\\]*)?$/i,
      );
      if (!match || (match[2] && Number(match[2]) > 65535)) return false;
      if (
        /^[0-9.]+$/.test(match[1]) &&
        !(
          match[1].split('.').length === 4 &&
          match[1].split('.').every((p) => /^(?:0|[1-9][0-9]{0,2})$/.test(p) && Number(p) <= 255)
        )
      )
        return false;
      try {
        const u = new URL(v);
        return !!u.hostname && !u.username && !u.password;
      } catch {
        return false;
      }
    }
    return !v.includes(':') && !v.startsWith('?//');
  };
  // Bound the full static fallback, including repeated endpoint links. Reserve 16 KiB
  // for the wrapper, fixed markup and either locale; leave 8 KiB below the core gate.
  function staticBytes(p) {
    const bytes = (s) => new TextEncoder().encode(s).length;
    const escaped = (s) => bytes(s.replace(/[&<>"']/g, '&&&&&&'));
    const link = (n) => escaped(n.title) + 6 * bytes(n.url);
    const nodes = new Map(p.nodes.map((n) => [n.id, n]));
    let total = 16384 + escaped(p.title);
    for (const g of p.groups) total += 128 + escaped(g.title);
    for (const n of p.nodes) total += 128 + link(n) + escaped(n.description || '');
    for (const e of p.edges)
      total += 128 + link(nodes.get(e.from)) + link(nodes.get(e.to)) + escaped(e.why || '');
    return total;
  }
  function validate(p) {
    const fail = (message = 'Invalid relationship map configuration.') => {
      throw Error(globalThis.MBBI18n?.t(message) || message);
    };
    if (
      !closed(p, ['format', 'title', 'groups', 'nodes', 'edges']) ||
      p.format !== FORMAT ||
      !text(p.title, 160) ||
      !Array.isArray(p.groups) ||
      p.groups.length < 1 ||
      p.groups.length > 8 ||
      !Array.isArray(p.nodes) ||
      p.nodes.length < 1 ||
      p.nodes.length > 64 ||
      !Array.isArray(p.edges) ||
      p.edges.length > 128 ||
      new TextEncoder().encode(JSON.stringify(p)).length > 16384
    )
      fail();
    const groups = new Set(),
      nodes = new Set(),
      edges = new Set();
    for (const g of p.groups) {
      if (!closed(g, ['id', 'title']) || !id(g.id) || groups.has(g.id) || !text(g.title, 80))
        fail();
      groups.add(g.id);
    }
    for (const n of p.nodes) {
      if (closed(n, ['id', 'group', 'title', 'url'], ['description'])) {
        if (!groups.has(n.group)) fail('Choose an existing group for every node.');
        if (!safeURL(n.url)) fail('Use a safe article URL for every node.');
      }
      if (
        !closed(n, ['id', 'group', 'title', 'url'], ['description']) ||
        !id(n.id) ||
        nodes.has(n.id) ||
        !groups.has(n.group) ||
        !text(n.title, 160) ||
        !text(Object.hasOwn(n, 'description') ? n.description : '', 240, true) ||
        !safeURL(n.url)
      )
        fail();
      nodes.add(n.id);
    }
    for (const e of p.edges) {
      if (!closed(e, ['from', 'to', 'kind'], ['why'])) fail();
      if (!nodes.has(e.from) || !nodes.has(e.to) || e.from === e.to)
        fail('Choose existing, different endpoints for every relationship.');
      const key = JSON.stringify([e.from, e.to, e.kind]);
      if (edges.has(key)) fail('Each pair may contain each relationship kind only once.');
      if (
        !closed(e, ['from', 'to', 'kind'], ['why']) ||
        !nodes.has(e.from) ||
        !nodes.has(e.to) ||
        e.from === e.to ||
        !['recommended', 'compare', 'optimization'].includes(e.kind) ||
        edges.has(key) ||
        !text(Object.hasOwn(e, 'why') ? e.why : '', 240, true)
      )
        fail();
      edges.add(key);
    }
    if (p.groups.some((g) => !p.nodes.some((n) => n.group === g.id)))
      fail('Every group must contain at least one node.');
    if (staticBytes(p) > 122880)
      fail(
        'Shorten node titles or article URLs, or reduce relationships to fit the static output budget.',
      );
    return p;
  }
  const messages = /*__MBB_RELATION_MESSAGES__*/ {};
  const translate = (message, zh) =>
    zh ? messages[message] || globalThis.MBBI18n?.t(message) || message : message;
  const labels = (zh, semantics) => {
    const T = (message) => translate(message, zh);
    if (semantics === 'knowledge-map/v1')
      return {
        recommended: T('Prior understanding'),
        compare: T('Explanation relationship'),
        optimization: T('Related practice'),
      };
    return {
      recommended: T('Suggested reading order'),
      compare: T('Compare ideas'),
      optimization: T('For further optimization'),
    };
  };
  function staticView(doc, raw, zh = true, options = {}) {
    const T = (message) => translate(message, zh);
    const p = validate(raw),
      root = doc.createElement('div'),
      kinds = labels(zh, options.semantics),
      names = new Map(p.nodes.map((n) => [n.id, n]));
    const el = (tag, content) => {
      const n = doc.createElement(tag);
      if (content) n.textContent = content;
      return n;
    };
    root.className = 'mbb-relation-static';
    root.append(
      el('h3', p.title),
      el(
        'p',
        options.semantics === 'knowledge-map/v1'
          ? T(
              'Prior understanding supports comprehension without restricting access; explanations and practice connect the material.',
            )
          : T('Relations suggest reading paths and connections; choose your own starting point.'),
      ),
    );
    for (const g of p.groups) {
      const section = el('section');
      section.append(el('h3', g.title));
      const list = el('ul');
      for (const n of p.nodes.filter((n) => n.group === g.id)) {
        const li = el('li'),
          a = el('a', n.title);
        a.href = n.url;
        li.append(a);
        if (n.description) li.append(el('p', n.description));
        list.append(li);
      }
      section.append(list);
      root.append(section);
    }
    root.append(el('h3', T('All relationships')));
    const list = el('ul');
    for (const e of p.edges) {
      const li = el('li');
      for (const [index, key] of ['from', 'to'].entries()) {
        if (index) li.append(doc.createTextNode(' → '));
        const a = el('a', names.get(e[key]).title);
        a.href = names.get(e[key]).url;
        li.append(a);
      }
      li.append(doc.createTextNode(' · ' + kinds[e.kind] + (e.why ? '：' + e.why : '')));
      list.append(li);
    }
    root.append(list);
    return root;
  }
  function enhance(node, raw, edgeIds = [], options = {}) {
    const p = validate(raw),
      doc = node.ownerDocument,
      zh = (globalThis.MBB_UI_LOCALE || doc.documentElement.lang || 'zh').startsWith('zh'),
      kinds = labels(zh, options.semantics);
    const T = (message) => translate(message, zh);
    const el = (tag, cls, text) => {
      const n = doc.createElement(tag);
      if (cls) n.className = cls;
      if (text) n.textContent = text;
      return n;
    };
    const ui = el('div', 'mbb-relation-map'),
      heading = el('div', 'mbb-relation-heading'),
      title = el('h3', '', p.title),
      help = el(
        'p',
        'mbb-relation-help',
        T(
          'Open an article by its title. Connections suggest reading paths; choose your own starting point.',
        ),
      );
    ui.setAttribute('data-mbb-generated', '');
    heading.append(title, help);
    ui.append(heading);
    const legend = el('ul', 'mbb-relation-legend');
    for (const kind of Object.keys(kinds)) {
      const li = el('li'),
        swatch = el('span', 'mbb-relation-key ' + kind);
      swatch.setAttribute('aria-hidden', 'true');
      li.append(swatch, doc.createTextNode(kinds[kind]));
      legend.append(li);
    }
    ui.append(legend);
    const toolbar = el('div', 'mbb-relation-toolbar'),
      groupLabel = el('label', '', T('Current branch')),
      select = el('select');
    select.setAttribute('aria-label', T('Current branch'));
    for (const g of p.groups) {
      const option = el('option', '', g.title);
      option.value = g.id;
      select.append(option);
    }
    groupLabel.append(select);
    const button = (text, click) => {
      const b = el('button', '', text);
      b.type = 'button';
      b.onclick = click;
      return b;
    };
    const full = button(T('View full map'), () => {
      fullMode = true;
      zoom = 1;
      pan = { x: 0, y: 0 };
      render();
      viewport.focus({ preventScroll: true });
    });
    const back = button(T('Back to branch'), () => {
      fullMode = false;
      render();
      select.focus();
    });
    const zoomOut = button('−', () => changeZoom(zoom / 1.25)),
      zoomIn = button('+', () => changeZoom(zoom * 1.25)),
      reset = button(T('Reset view'), () => {
        setPanning(false);
        zoom = 1;
        pan = { x: 0, y: 0 };
        transform();
      });
    zoomOut.setAttribute('aria-label', T('Zoom out'));
    zoomIn.setAttribute('aria-label', T('Zoom in'));
    const panToggle = button(T('Drag canvas: off'), () => setPanning(!panning));
    panToggle.setAttribute('aria-pressed', 'false');
    toolbar.append(groupLabel, full, back, zoomOut, zoomIn, reset, panToggle);
    ui.append(toolbar);
    const status = el('p', 'mbb-relation-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    ui.append(status);
    const viewport = el('div', 'mbb-relation-viewport'),
      board = el('div', 'mbb-relation-board'),
      svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('mbb-relation-lines');
    board.append(svg);
    viewport.append(board);
    ui.append(viewport);
    const cross = el('section', 'mbb-relation-cross');
    ui.append(cross);
    const details = el('details', 'mbb-relation-details'),
      summary = el('summary', '', T('All relationships and articles'));
    details.append(summary, staticView(doc, p, zh, options));
    ui.append(details);
    const mobile = matchMedia('(max-width: 700px)');
    let fullMode = !mobile.matches,
      zoom = 1,
      pan = { x: 0, y: 0 },
      panning = false,
      disposed = false,
      raf = 0,
      drag = null,
      suppressClick = false,
      width = 0,
      height = 0;
    function setPanning(value) {
      panning = value;
      drag = null;
      viewport.classList.toggle('is-panning', value);
      panToggle.setAttribute('aria-pressed', String(value));
      panToggle.textContent = T('Drag canvas: ') + (value ? T('on') : T('off'));
    }
    function transform() {
      const fit = fullMode && mobile.matches ? 1 : Math.min(1, viewport.clientWidth / width);
      board.style.transform = `translate(${pan.x}px,${pan.y}px) scale(${fit * zoom})`;
      viewport.style.height =
        fullMode && mobile.matches ? '520px' : Math.ceil(height * fit * zoom) + 'px';
      status.textContent = fullMode
        ? T('Full map') + ' · ' + Math.round(zoom * 100) + '%'
        : p.groups.find((g) => g.id === select.value).title;
    }
    function changeZoom(next) {
      zoom = Math.max(0.4, Math.min(2.5, next));
      transform();
    }
    function render() {
      if (disposed) return;
      setPanning(false);
      svg.replaceChildren();
      board.querySelectorAll('.mbb-relation-node,.mbb-relation-lane').forEach((n) => n.remove());
      const visibleGroups = fullMode ? p.groups : p.groups.filter((g) => g.id === select.value),
        visible = p.nodes.filter((n) => visibleGroups.some((g) => g.id === n.group)),
        visibleIds = new Set(visible.map((n) => n.id));
      const visibleEdges = p.edges.filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to)),
        crossEdges = visibleEdges.filter(
          (e) =>
            p.nodes.find((n) => n.id === e.from).group !== p.nodes.find((n) => n.id === e.to).group,
        );
      const laneWidth = fullMode
          ? mobile.matches
            ? 280
            : Math.max(
                180,
                Math.min(
                  280,
                  (viewport.clientWidth - 16 * (visibleGroups.length - 1)) / visibleGroups.length,
                ),
              )
          : Math.max(240, viewport.clientWidth),
        gap = 16,
        head =
          84 +
          crossEdges.filter((e) => {
            const a = visibleGroups.findIndex(
              (g) => g.id === p.nodes.find((n) => n.id === e.from).group,
            );
            const b = visibleGroups.findIndex(
              (g) => g.id === p.nodes.find((n) => n.id === e.to).group,
            );
            return Math.abs(a - b) > 1;
          }).length *
            12,
        boxes = new Map();
      width = visibleGroups.length * (laneWidth + gap) - gap;
      height = head;
      for (const [column, g] of visibleGroups.entries()) {
        const x = column * (laneWidth + gap),
          lane = el('div', 'mbb-relation-lane lane-' + (p.groups.indexOf(g) % 4)),
          h = el('h4', '', g.title);
        lane.style.left = x + 'px';
        lane.style.width = laneWidth + 'px';
        lane.append(h);
        board.append(lane);
        const items = p.nodes.filter((n) => n.group === g.id),
          indegree = new Map(items.map((n) => [n.id, 0]));
        for (const e of visibleEdges)
          if (e.kind === 'recommended' && indegree.has(e.from) && indegree.has(e.to))
            indegree.set(e.to, indegree.get(e.to) + 1);
        const ordered = [],
          queue = items.filter((n) => indegree.get(n.id) === 0);
        while (queue.length) {
          const n = queue.shift();
          if (ordered.includes(n)) continue;
          ordered.push(n);
          for (const e of visibleEdges.filter(
            (e) => e.kind === 'recommended' && e.from === n.id && indegree.has(e.to),
          )) {
            indegree.set(e.to, indegree.get(e.to) - 1);
            if (!indegree.get(e.to)) queue.push(items.find((n) => n.id === e.to));
          }
        }
        for (const n of items) if (!ordered.includes(n)) ordered.push(n);
        let y = head;
        for (const n of ordered) {
          const a = el('a', 'mbb-relation-node', n.title);
          a.href = n.url;
          a.dataset.node = n.id;
          a.style.left = x + 36 + 'px';
          a.style.top = y + 'px';
          a.style.width = laneWidth - 72 + 'px';
          if (n.description) a.title = n.description;
          board.append(a);
          const h = Math.max(64, a.offsetHeight);
          boxes.set(n.id, { id: n.id, x: x + 36, y, w: laneWidth - 72, h, lane: column });
          y += h + 32;
        }
        height = Math.max(height, y);
        lane.style.height = y + 'px';
      }
      board.style.width = width + 'px';
      board.style.height = height + 'px';
      svg.setAttribute('width', width);
      svg.setAttribute('height', height);
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      const NS = 'http://www.w3.org/2000/svg',
        tracks = new Map(),
        ports = new Map(),
        portTotals = new Map(),
        corridors = new Map();
      const adjacent = (a, b) =>
        a.lane === b.lane &&
        b.y >= a.y + a.h &&
        ![...boxes.values()].some((n) => n.lane === a.lane && n.y > a.y && n.y < b.y);
      // Only overlapping spans need separate side tracks. Reuse a track after its
      // destination so unrelated short branches do not drift toward the lane edge.
      const reserve = (box, side, start, end) => {
        const key = box.lane + ':' + side,
          lanes = tracks.get(key) || [],
          lo = Math.min(start, end) - 8,
          hi = Math.max(start, end) + 8;
        let index = lanes.findIndex((spans) => spans.every(([a, b]) => hi < a || lo > b));
        if (index < 0) index = lanes.length;
        (lanes[index] ||= []).push([lo, hi]);
        tracks.set(key, lanes);
        return side > 0 ? box.x + box.w + 12 + index * 7 : box.x - 12 - index * 7;
      };
      const port = (box, side) => {
        const key = box.id + ':' + side,
          index = ports.get(key) || 0;
        ports.set(key, index + 1);
        const total = portTotals.get(key),
          spacing = Math.min(10, (box.h - 24) / Math.max(1, total - 1)),
          offset = (index - (total - 1) / 2) * spacing;
        return [side > 0 ? box.x + box.w : box.x, box.y + box.h / 2 + offset];
      };
      const roundedPath = (points) => {
        let d = `M ${points[0].join(' ')}`;
        for (let i = 1; i < points.length - 1; i++) {
          const a = points[i - 1],
            b = points[i],
            c = points[i + 1],
            before = Math.hypot(b[0] - a[0], b[1] - a[1]),
            after = Math.hypot(c[0] - b[0], c[1] - b[1]),
            radius = Math.min(6, before / 2, after / 2);
          if (!before || !after) continue;
          const entry = b.map((v, k) => v + ((a[k] - v) * radius) / before),
            exit = b.map((v, k) => v + ((c[k] - v) * radius) / after);
          d += ` L ${entry.join(' ')} Q ${b.join(' ')} ${exit.join(' ')}`;
        }
        return d + ` L ${points.at(-1).join(' ')}`;
      };
      const bypass = visibleEdges.filter((e) => {
          const a = boxes.get(e.from),
            b = boxes.get(e.to);
          return a.lane === b.lane && !(e.kind === 'recommended' && adjacent(a, b));
        }),
        sides = new Map();
      // Interleaving spans on the same side look like a false merge. Keep each
      // source's branches together and move the next interleaving source across.
      for (const e of [...bypass].sort((a, b) => boxes.get(a.from).y - boxes.get(b.from).y)) {
        if (sides.has(e.from)) continue;
        const a = boxes.get(e.from),
          peers = bypass.filter((n) => n.from === e.from),
          interleaves = (other) =>
            peers.some((peer) => {
              const b = boxes.get(peer.to),
                c = boxes.get(other.from),
                d = boxes.get(other.to),
                lo = Math.min(a.y, b.y),
                hi = Math.max(a.y, b.y),
                left = Math.min(c.y, d.y),
                right = Math.max(c.y, d.y);
              return (
                a.lane === c.lane &&
                ((lo < left && left < hi && hi < right) || (left < lo && lo < right && right < hi))
              );
            });
        const previous = bypass.filter((n) => sides.has(n.from) && interleaves(n));
        const next = bypass.some((n) => n.from !== e.from && interleaves(n));
        sides.set(e.from, previous.length ? -sides.get(previous[0].from) : next ? -1 : 1);
      }
      const bypassTracks = new Map();
      for (const e of [...bypass].sort(
        (a, b) =>
          Math.abs(boxes.get(a.from).y - boxes.get(a.to).y) -
          Math.abs(boxes.get(b.from).y - boxes.get(b.to).y),
      )) {
        const a = boxes.get(e.from),
          b = boxes.get(e.to),
          side = e.kind === 'compare' ? -1 : sides.get(e.from);
        bypassTracks.set(e, reserve(a, side, a.y + a.h / 2, b.y + b.h / 2));
      }
      for (const e of visibleEdges) {
        const a = boxes.get(e.from),
          b = boxes.get(e.to);
        if (a.lane === b.lane && e.kind === 'recommended' && adjacent(a, b)) continue;
        const side =
          a.lane !== b.lane
            ? Math.sign(b.lane - a.lane)
            : e.kind === 'compare'
              ? -1
              : sides.get(e.from);
        for (const [box, direction] of [
          [a, side],
          [b, a.lane === b.lane ? side : -side],
        ]) {
          const key = box.id + ':' + direction;
          portTotals.set(key, (portTotals.get(key) || 0) + 1);
        }
      }
      let crossing = 0;
      for (const e of visibleEdges) {
        const a = boxes.get(e.from),
          b = boxes.get(e.to),
          isCross = a.lane !== b.lane;
        let points;
        if (!isCross && e.kind === 'recommended' && adjacent(a, b)) {
          points = [
            [a.x + a.w / 2, a.y + a.h],
            [b.x + b.w / 2, b.y],
          ];
        } else if (isCross) {
          const direction = Math.sign(b.lane - a.lane),
            start = port(a, direction),
            end = port(b, -direction);
          if (Math.abs(a.lane - b.lane) === 1) {
            const key = Math.min(a.lane, b.lane),
              spans = corridors.get(key) || [],
              lo = Math.min(start[1], end[1]) - 8,
              hi = Math.max(start[1], end[1]) + 8;
            let index = spans.findIndex((items) => items.every(([x, y]) => hi < x || lo > y));
            if (index < 0) index = spans.length;
            (spans[index] ||= []).push([lo, hi]);
            corridors.set(key, spans);
            const middle =
              (start[0] + end[0]) / 2 + Math.ceil(index / 2) * 7 * (index % 2 ? 1 : -1);
            points = [start, [middle, start[1]], [middle, end[1]], end];
          } else {
            const top = 60 + crossing++ * 12,
              sx = reserve(a, direction, top, start[1]),
              tx = reserve(b, -direction, top, end[1]);
            points = [start, [sx, start[1]], [sx, top], [tx, top], [tx, end[1]], end];
          }
        } else {
          const side = e.kind === 'compare' ? -1 : sides.get(e.from),
            start = port(a, side),
            end = port(b, side),
            track = bypassTracks.get(e);
          points = [start, [track, start[1]], [track, end[1]], end];
        }
        // Zero-length legs are unnecessary and would obscure the final vector.
        points = points.filter(
          (point, index) =>
            !index || point[0] !== points[index - 1][0] || point[1] !== points[index - 1][1],
        );
        const line = doc.createElementNS(NS, 'path');
        line.setAttribute('d', roundedPath(points));
        line.setAttribute('class', 'edge ' + e.kind);
        line.dataset.from = e.from;
        line.dataset.to = e.to;
        line.dataset.kind = e.kind;
        const edgeId = edgeIds[p.edges.indexOf(e)];
        if (typeof edgeId === 'string' && /^e_[a-f0-9]{32}$/.test(edgeId)) line.dataset.id = edgeId;
        const why = doc.createElementNS(NS, 'title');
        why.textContent = kinds[e.kind] + (e.why ? '：' + e.why : '');
        line.append(why);
        svg.append(line);
        const end = points.at(-1),
          prev = points.at(-2),
          length = Math.hypot(end[0] - prev[0], end[1] - prev[1]),
          dx = (end[0] - prev[0]) / length,
          dy = (end[1] - prev[1]) / length,
          arrow = doc.createElementNS(NS, 'polygon');
        arrow.setAttribute(
          'points',
          `${end[0]},${end[1]} ${end[0] - dx * 8 - dy * 4},${end[1] - dy * 8 + dx * 4} ${end[0] - dx * 8 + dy * 4},${end[1] - dy * 8 - dx * 4}`,
        );
        arrow.setAttribute('class', 'arrow ' + e.kind);
        svg.append(arrow);
      }
      cross.replaceChildren();
      if (!fullMode) {
        const related = p.edges.filter((e) => {
          const a = p.nodes.find((n) => n.id === e.from),
            b = p.nodes.find((n) => n.id === e.to);
          return a.group !== b.group && (a.group === select.value || b.group === select.value);
        });
        cross.append(el('h4', '', T('Connections to other branches')));
        if (!related.length)
          cross.append(el('p', '', T('No cross-branch relationships in this branch.')));
        const ul = el('ul');
        for (const e of related) {
          const li = el('li');
          for (const [i, key] of ['from', 'to'].entries()) {
            if (i) li.append(doc.createTextNode(' → '));
            const n = p.nodes.find((n) => n.id === e[key]),
              a = el('a', '', n.title);
            a.href = n.url;
            li.append(a);
          }
          li.append(el('p', '', kinds[e.kind] + (e.why ? '：' + e.why : '')));
          li.append(
            button(T('Show in map'), () => {
              fullMode = true;
              zoom = 1;
              pan = { x: 0, y: 0 };
              render();
              const target = board.querySelector(`[data-node="${e.to}"]`);
              if (target) {
                target.classList.add('is-highlighted');
                pan = {
                  x: viewport.clientWidth / 2 - target.offsetLeft - target.offsetWidth / 2,
                  y: 260 - target.offsetTop - target.offsetHeight / 2,
                };
                transform();
                target.focus({ preventScroll: true });
                viewport.scrollIntoView({ block: 'nearest' });
              }
            }),
          );
          ul.append(li);
        }
        cross.append(ul);
      }
      groupLabel.hidden = fullMode;
      full.hidden = fullMode;
      back.hidden = !fullMode || !mobile.matches;
      for (const b of [zoomOut, zoomIn, reset, panToggle]) b.hidden = !fullMode;
      viewport.classList.toggle('is-full', fullMode && mobile.matches);
      pan = { x: 0, y: 0 };
      transform();
    }
    select.onchange = () => {
      zoom = 1;
      render();
    };
    viewport.tabIndex = 0;
    viewport.setAttribute(
      'aria-label',
      T('Relationship canvas; arrow keys pan when drag mode is on'),
    );
    viewport.addEventListener('keydown', (e) => {
      if (
        e.target !== viewport ||
        !panning ||
        !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)
      )
        return;
      e.preventDefault();
      pan.x += e.key === 'ArrowLeft' ? 32 : e.key === 'ArrowRight' ? -32 : 0;
      pan.y += e.key === 'ArrowUp' ? 32 : e.key === 'ArrowDown' ? -32 : 0;
      transform();
    });
    viewport.addEventListener('pointerdown', (e) => {
      suppressClick = false;
      if (!panning || e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      drag = { x: e.clientX, y: e.clientY, pan: { ...pan }, moved: false, id: e.pointerId };
    });
    viewport.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 8) return;
      drag.moved = true;
      viewport.setPointerCapture(e.pointerId);
      pan = { x: drag.pan.x + dx, y: drag.pan.y + dy };
      transform();
    });
    viewport.addEventListener('pointerup', () => {
      if (drag?.moved) suppressClick = true;
      drag = null;
    });
    viewport.addEventListener('pointercancel', () => {
      drag = null;
    });
    viewport.addEventListener(
      'click',
      (e) => {
        if (suppressClick && e.button === 0 && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          e.stopPropagation();
          suppressClick = false;
        }
      },
      true,
    );
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(render);
    };
    let observedWidth = node.clientWidth;
    const resize = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next && Math.abs(next - observedWidth) > 1) {
        observedWidth = next;
        onResize();
      }
    });
    resize.observe(node);
    const modeChanged = () => {
      fullMode = !mobile.matches;
      zoom = 1;
      render();
    };
    mobile.addEventListener('change', modeChanged);
    node.append(ui);
    render();
    node.dataset.mbbComponentState = 'ready';
    return {
      controls: ui,
      stop() {
        setPanning(false);
      },
      hidden() {
        setPanning(false);
      },
      readerVisibility(force) {
        if (force) setPanning(false);
      },
      dispose() {
        disposed = true;
        resize.disconnect();
        mobile.removeEventListener('change', modeChanged);
        cancelAnimationFrame(raf);
        ui.remove();
        node.dataset.mbbComponentState = 'closed';
      },
    };
  }
  globalThis.MBBRelationMap = Object.freeze({
    format: FORMAT,
    validate,
    safeURL,
    staticBytes,
    staticView,
    enhance,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.MBBRelationMap;
})();
