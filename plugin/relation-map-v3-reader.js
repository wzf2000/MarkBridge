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
      new TextEncoder().encode(JSON.stringify(p)).length > 65536
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
  function edgeIdsValid(ids, map) {
    return (
      Array.isArray(ids) &&
      ids.length === map.edges.length &&
      new Set(ids).size === ids.length &&
      ids.every((id) => typeof id === 'string' && /^e_[a-f0-9]{32}$/.test(id))
    );
  }
  function staticView(doc, raw, zh = true, options = {}) {
    if (!edgeIdsValid(options.edgeIds, raw)) throw Error('Invalid public relationship identities.');
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
        if (n.description) {
          const description = el('p', n.description);
          if (options.idPrefix) description.id = options.idPrefix + n.id;
          li.append(description);
        }
        list.append(li);
      }
      section.append(list);
      root.append(section);
    }
    root.append(el('h3', T('All relationships')));
    const list = el('ul');
    for (const e of p.edges) {
      const li = el('li');
      const edgeId = options.edgeIds?.[p.edges.indexOf(e)];
      if (typeof edgeId === 'string' && /^e_[a-f0-9]{32}$/.test(edgeId)) {
        li.dataset.mbbEdgeId = edgeId;
        if (options.idPrefix) li.id = options.idPrefix + edgeId;
        li.dataset.from = e.from;
        li.dataset.to = e.to;
        li.dataset.kind = e.kind;
      }
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
  let readerSerial = 0;
  function enhance(node, raw, edgeIds, options = {}) {
    if (!edgeIdsValid(edgeIds, raw)) throw Error('Invalid public relationship identities.');
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
    const ui = el('div', 'mbb-relation-map mbb-relation-map-v3'),
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
    const navigation = el('div', 'mbb-relation-navigation');
    const toolbar = el('div', 'mbb-relation-toolbar'),
      groupLabel = el('label', 'mbb-relation-branch-picker'),
      select = el('select');
    select.setAttribute('aria-label', T('Current branch'));
    for (const g of p.groups) {
      const option = el('option', '', g.title);
      option.value = g.id;
      select.append(option);
    }
    const hint = options.display?.mobileStart;
    const initialGroup =
      hint?.kind === 'group'
        ? p.groups.find((g) => g.id === hint.id)?.id
        : hint?.kind === 'node'
          ? p.nodes.find((n) => n.id === hint.id)?.group
          : null;
    if (initialGroup) select.value = initialGroup;
    groupLabel.append(el('span', 'mbb-relation-branch-label', T('Current branch')), select);
    const button = (text, click) => {
      const b = el('button', '', text);
      b.type = 'button';
      b.onclick = click;
      return b;
    };
    const full = button(T('View full map'), () => {
      initialNodeFocus = null;
      fullMode = true;
      saveView();
      zoom = 1;
      pan = { x: 0, y: 0 };
      render();
      viewport.focus({ preventScroll: true });
    });
    const back = button(T('Back to branch'), () => {
      initialNodeFocus = null;
      fullMode = false;
      zoom = 1;
      pan = { x: 0, y: 0 };
      saveView();
      render();
      select.focus();
    });
    const wholeBranch = button(T('Show entire branch'), () => {
      initialNodeFocus = null;
      saveView();
      render();
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
    toolbar.append(groupLabel, wholeBranch, full, back, zoomOut, zoomIn, reset, panToggle);
    const status = el('p', 'mbb-relation-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const colorHelp = el(
      'p',
      'mbb-relation-color-help',
      T('Colors match the source branch; patterns show the relationship type.') +
        ' ' +
        T('Shared arrivals use a neutral color.'),
    );
    const inspection = el('section', 'mbb-relation-inspection');
    inspection.hidden = true;
    inspection.setAttribute('aria-label', T('Selected relationship'));
    inspection.tabIndex = -1;
    navigation.append(status, toolbar, legend, colorHelp);
    ui.append(navigation, inspection);
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
    const descriptionPrefix = 'mbb-relation-v3-' + ++readerSerial + '-';
    details.append(
      summary,
      staticView(doc, p, zh, { ...options, edgeIds, idPrefix: descriptionPrefix }),
    );
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
    let lastVisible = false,
      lastWidth = 0,
      lastViewportWidth = 0;
    let initialNodeFocus =
      mobile.matches && hint?.kind === 'node' && p.nodes.some((n) => n.id === hint.id)
        ? hint.id
        : null;
    // A bounded session stores only the selected opaque branch and UI mode.
    // Rebuild the key from the current visible set and hint; old permissions cannot restore it.
    const visibleSignature = JSON.stringify([
      p.groups.map((g) => g.id),
      p.nodes.map((n) => n.id),
      edgeIds,
      options.display || null,
    ]);
    let viewHash = 2166136261;
    for (const char of visibleSignature)
      viewHash = Math.imul(viewHash ^ char.charCodeAt(0), 16777619) >>> 0;
    const statePrefix = 'mbb-relation-v3:',
      stateKey = statePrefix + node.id.slice(0, 80) + ':' + viewHash.toString(16);
    const allowedGroup = (id) =>
      typeof id === 'string' && /^g_[a-f0-9]{32}$/.test(id) && p.groups.some((g) => g.id === id);
    try {
      const saved = JSON.parse(globalThis.sessionStorage?.getItem(stateKey) || 'null');
      if (saved && allowedGroup(saved.group) && typeof saved.full === 'boolean') {
        select.value = saved.group;
        fullMode = saved.full;
        initialNodeFocus = null;
      }
    } catch {
      /* Storage is optional; current author defaults remain usable. */
    }
    function saveView() {
      if (!allowedGroup(select.value)) return;
      try {
        const storage = globalThis.sessionStorage;
        if (!storage) return;
        const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter(
          (k) => k?.startsWith(statePrefix) && k !== stateKey,
        );
        while (keys.length >= 31) storage.removeItem(keys.shift());
        storage.setItem(stateKey, JSON.stringify({ group: select.value, full: fullMode }));
      } catch {
        /* Storage restrictions never prevent native links or local navigation. */
      }
    }
    let hoveredNode = null,
      focusedNode = null,
      traceNode = null,
      selectedEdge = null,
      candidateEdges = [],
      selectionTrigger = null;
    const edgeById = new Map(p.edges.map((edge, i) => [edgeIds[i], { ...edge, id: edgeIds[i] }]));
    const groupIndex = (from) =>
      p.groups.findIndex((g) => g.id === p.nodes.find((n) => n.id === from).group);
    const sourceColor = (from) => 'var(--rm-source-' + (groupIndex(from) % 8) + ')';
    function relationshipContent(parent, edge) {
      for (const [i, key] of ['from', 'to'].entries()) {
        if (i) parent.append(doc.createTextNode(' → '));
        const n = p.nodes.find((n) => n.id === edge[key]),
          a = el('a', '', n.title);
        a.href = n.url;
        parent.append(a);
      }
      parent.append(el('p', '', kinds[edge.kind] + (edge.why ? '：' + edge.why : '')));
    }
    function applySelection() {
      const selected = edgeById.get(selectedEdge);
      board.classList.toggle('has-selected-edge', !!selected);
      for (const edge of svg.querySelectorAll('.mbb-relation-edge-identity'))
        edge.classList.toggle('is-selected', edge.dataset.id === selectedEdge);
      for (const arrow of svg.querySelectorAll('.arrow')) {
        arrow.classList.toggle('is-selected', arrow.dataset.edgeId === selectedEdge);
        if (arrow.dataset.edgeId === selectedEdge)
          svg.insertBefore(arrow, svg.querySelector('[data-edge-hits]'));
      }
      for (const anchor of board.querySelectorAll('.mbb-relation-node'))
        anchor.classList.toggle(
          'is-selected-endpoint',
          !!selected && [selected.from, selected.to].includes(anchor.dataset.node),
        );
      for (const item of details.querySelectorAll('[data-mbb-edge-id]')) {
        item.classList.toggle('is-selected', item.dataset.mbbEdgeId === selectedEdge);
        item
          .querySelector('button')
          ?.setAttribute('aria-pressed', String(item.dataset.mbbEdgeId === selectedEdge));
      }
    }
    function showInspection() {
      const ownedFocus = inspection.contains(doc.activeElement);
      inspection.replaceChildren();
      inspection.hidden = !selectedEdge && !candidateEdges.length;
      if (inspection.hidden) return;
      const header = el('div', 'mbb-relation-inspection-header');
      header.append(
        el('strong', '', selectedEdge ? T('Selected relationship') : T('Choose a relationship')),
        button(T('Clear selection'), clearSelection),
      );
      inspection.append(header);
      if (selectedEdge) relationshipContent(inspection, edgeById.get(selectedEdge));
      else {
        const list = el('ul');
        for (const id of candidateEdges) {
          const edge = edgeById.get(id),
            names = [edge.from, edge.to].map((id) => p.nodes.find((n) => n.id === id).title);
          const item = el('li');
          const pick = button(names.join(' → ') + ' · ' + kinds[edge.kind], () => chooseEdge(id));
          pick.dataset.edgeId = id;
          item.append(pick);
          if (edge.why) {
            const why = el('p', '', edge.why);
            why.id = descriptionPrefix + 'candidate-' + id;
            pick.setAttribute('aria-describedby', why.id);
            item.append(why);
          }
          list.append(item);
        }
        inspection.append(list);
      }
      if (ownedFocus) inspection.focus({ preventScroll: true });
    }
    function clearSelection() {
      const ownedFocus = inspection.contains(doc.activeElement);
      selectedEdge = null;
      candidateEdges = [];
      applySelection();
      showInspection();
      trace(hoveredNode || focusedNode);
      if (ownedFocus)
        (selectionTrigger?.isConnected ? selectionTrigger : viewport).focus({
          preventScroll: true,
        });
    }
    function chooseEdge(id, reveal = false) {
      const edge = edgeById.get(id);
      if (!edge) return;
      if (!inspection.contains(doc.activeElement))
        selectionTrigger = doc.activeElement?.closest('button') || viewport;
      selectedEdge = id;
      candidateEdges = [];
      if (
        reveal &&
        !fullMode &&
        [edge.from, edge.to].some((id) => p.nodes.find((n) => n.id === id).group !== select.value)
      ) {
        initialNodeFocus = null;
        fullMode = true;
        saveView();
        render();
      }
      trace(null);
      applySelection();
      showInspection();
    }
    for (const item of details.querySelectorAll('[data-mbb-edge-id]')) {
      const pick = button(T('Show relationship'), () => chooseEdge(item.dataset.mbbEdgeId, true));
      pick.setAttribute('aria-pressed', 'false');
      item.append(doc.createTextNode(' '), pick);
    }
    ui.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && (selectedEdge || candidateEdges.length)) {
        event.preventDefault();
        clearSelection();
      }
    });
    function trace(id) {
      if (selectedEdge) id = null;
      traceNode = id;
      const related = p.edges
          .map((edge, i) => ({ ...edge, id: edgeIds[i] }))
          .filter((edge) => edge.from === id || edge.to === id),
        ids = new Set(related.map((edge) => edge.id)),
        endpoints = new Set([id, ...related.flatMap((edge) => [edge.from, edge.to])]);
      board.classList.toggle('is-tracing', !!id);
      for (const anchor of board.querySelectorAll('.mbb-relation-node')) {
        anchor.classList.toggle('is-trace-source', anchor.dataset.node === id);
        anchor.classList.toggle('is-trace-related', !!id && endpoints.has(anchor.dataset.node));
        anchor.classList.toggle('is-trace-muted', !!id && !endpoints.has(anchor.dataset.node));
      }
      for (const edge of svg.querySelectorAll('.mbb-relation-edge-identity'))
        edge.classList.toggle('is-traced', !!id && ids.has(edge.dataset.id));
      for (const arrow of svg.querySelectorAll('.arrow'))
        arrow.classList.toggle('is-trace-muted', !!id && !ids.has(arrow.dataset.edgeId));
      for (const item of details.querySelectorAll('[data-mbb-edge-id]'))
        item.classList.toggle('is-trace-related', !!id && ids.has(item.dataset.mbbEdgeId));
    }
    function setPanning(value) {
      if (panning === value && !drag) return;
      panning = value;
      drag = null;
      viewport.classList.toggle('is-panning', value);
      panToggle.setAttribute('aria-pressed', String(value));
      panToggle.textContent = T('Drag canvas: ') + (value ? T('on') : T('off'));
    }
    const fitScale = () =>
      fullMode && mobile.matches ? 1 : Math.min(1, viewport.clientWidth / width);
    function transform() {
      const fit = fitScale();
      board.style.transform = `translate(${pan.x}px,${pan.y}px) scale(${fit * zoom})`;
      viewport.style.height =
        fullMode && mobile.matches
          ? '520px'
          : initialNodeFocus && mobile.matches
            ? Math.min(500, Math.ceil(height * fit * zoom)) + 'px'
            : Math.ceil(height * fit * zoom) + 'px';
      status.textContent = fullMode
        ? T('Full map') + ' · ' + Math.round(fit * zoom * 100) + '%'
        : T('Current branch') +
          ' · ' +
          p.nodes.filter((n) => n.group === select.value).length +
          ' ' +
          T('Nodes');
      zoomOut.disabled = zoom <= 0.4;
      zoomIn.disabled = zoom >= 2.5;
    }
    function changeZoom(next) {
      zoom = Math.max(0.4, Math.min(2.5, next));
      transform();
    }
    function render() {
      if (disposed) return;
      if (!node.clientWidth || !viewport.clientWidth) {
        lastVisible = false;
        return;
      }
      const activeNode = board.contains(doc.activeElement)
        ? doc.activeElement.closest('.mbb-relation-node')?.dataset.node
        : null;
      hoveredNode = null;
      focusedNode = activeNode || null;
      setPanning(false);
      svg.replaceChildren();
      board.querySelectorAll('.mbb-relation-node,.mbb-relation-lane').forEach((n) => n.remove());
      const visibleGroups = fullMode ? p.groups : p.groups.filter((g) => g.id === select.value),
        visible = p.nodes.filter((n) => visibleGroups.some((g) => g.id === n.group)),
        visibleIds = new Set(visible.map((n) => n.id));
      if (
        selectedEdge &&
        [edgeById.get(selectedEdge).from, edgeById.get(selectedEdge).to].some(
          (id) => !visibleIds.has(id),
        )
      )
        clearSelection();
      candidateEdges = candidateEdges.filter((id) =>
        [edgeById.get(id).from, edgeById.get(id).to].every((id) => visibleIds.has(id)),
      );
      showInspection();
      const visibleEdges = p.edges.filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to)),
        crossEdges = visibleEdges.filter(
          (e) =>
            p.nodes.find((n) => n.id === e.from).group !== p.nodes.find((n) => n.id === e.to).group,
        );
      const layoutMap = { ...p, groups: visibleGroups, nodes: visible, edges: visibleEdges };
      const layoutOptions = {
        width: fullMode ? Math.max(1040, viewport.clientWidth) : viewport.clientWidth,
        maxColumns: fullMode ? 2 : 1,
        compact: !fullMode,
        nodeWidth: fullMode ? 168 : Math.max(168, Math.min(280, viewport.clientWidth - 60)),
        edgeIds: visibleEdges.map((e) => edgeIds[p.edges.indexOf(e)]),
        heights: {},
        headerHeights: {},
      };
      const anchors = new Map(),
        lanes = new Map();
      // Measure in the actual component font and assigned width before routing.
      for (const n of visible) {
        const a = el('a', 'mbb-relation-node', n.title);
        a.href = n.url;
        a.dataset.node = n.id;
        a.style.width = layoutOptions.nodeWidth + 'px';
        a.style.boxSizing = 'border-box';
        a.style.visibility = 'hidden';
        if (n.description) a.title = n.description;
        const descriptions = p.edges.flatMap((edge, i) =>
          edge.from === n.id || edge.to === n.id ? [descriptionPrefix + edgeIds[i]] : [],
        );
        if (n.description) descriptions.unshift(descriptionPrefix + n.id);
        if (descriptions.length) a.setAttribute('aria-describedby', descriptions.join(' '));
        a.addEventListener('pointerenter', () => {
          hoveredNode = n.id;
          trace(n.id);
        });
        a.addEventListener('pointermove', () => {
          hoveredNode = n.id;
          if (traceNode !== n.id) trace(n.id);
        });
        a.addEventListener('pointerleave', () => {
          hoveredNode = null;
          trace(focusedNode);
        });
        a.addEventListener('focus', () => {
          focusedNode = n.id;
          trace(n.id);
        });
        a.addEventListener('blur', () => {
          focusedNode = null;
          trace(hoveredNode);
        });
        board.append(a);
        anchors.set(n.id, a);
        layoutOptions.heights[n.id] = Math.max(64, Math.ceil(a.offsetHeight));
      }
      const preview = globalThis.MBBRelationMapLayoutV3.layout(layoutMap, {
        ...layoutOptions,
        measureOnly: true,
      });
      for (const region of preview.regions) {
        const lane = el(
          'div',
          'mbb-relation-lane lane-' + (p.groups.findIndex((g) => g.id === region.id) % 8),
        );
        lane.style.setProperty(
          '--rm-source',
          'var(--rm-source-' + (p.groups.findIndex((g) => g.id === region.id) % 8) + ')',
        );
        lane.style.width = region.w + 'px';
        lane.style.visibility = 'hidden';
        const heading = el('h4', '', p.groups.find((g) => g.id === region.id).title);
        heading.style.overflowWrap = 'anywhere';
        lane.append(heading);
        board.append(lane);
        lanes.set(region.id, lane);
        layoutOptions.headerHeights[region.id] = Math.ceil(heading.offsetHeight);
      }
      const geometry = globalThis.MBBRelationMapLayoutV3.layout(layoutMap, layoutOptions);
      width = geometry.width;
      height = geometry.height;
      const boxes = new Map(geometry.boxes.map((n) => [n.id, n]));
      for (const region of geometry.regions) {
        const lane = lanes.get(region.id);
        lane.style.left = region.x + 'px';
        lane.style.top = region.y + 'px';
        lane.style.height = region.h + 'px';
        lane.style.visibility = '';
      }
      for (const n of visible) {
        const box = boxes.get(n.id),
          a = anchors.get(n.id);
        a.style.left = box.x + 'px';
        a.style.top = box.y + 'px';
        a.style.minHeight = box.h + 'px';
        a.style.visibility = '';
      }
      board.style.width = width + 'px';
      board.style.height = height + 'px';
      svg.setAttribute('width', width);
      svg.setAttribute('height', height);
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      const NS = 'http://www.w3.org/2000/svg';
      const path = (points) => points.map((p, i) => (i ? 'L ' : 'M ') + p.join(' ')).join(' ');
      for (const bundle of geometry.bundles) {
        const gaps = doc.createElementNS(NS, 'g'),
          colors = doc.createElementNS(NS, 'g');
        gaps.dataset.bundleHalo = bundle.id;
        colors.dataset.bundleLines = bundle.id;
        svg.append(gaps, colors);
        for (const segment of geometry.segments.filter((segment) => segment.bundle === bundle.id)) {
          const d = path(segment.points),
            gap = doc.createElementNS(NS, 'path');
          gap.setAttribute('d', d);
          gap.setAttribute('fill', 'none');
          gap.setAttribute('stroke', 'var(--rm-canvas, #fff)');
          gap.setAttribute('stroke-width', '6');
          gaps.append(gap);
          const line = doc.createElementNS(NS, 'path');
          line.setAttribute('d', d);
          line.setAttribute(
            'class',
            'edge ' + segment.kind + (segment.sharedTail ? ' is-shared-tail' : ''),
          );
          line.style.setProperty('--rm-source', sourceColor(edgeById.get(segment.members[0]).from));
          line.dataset.bundle = segment.bundle;
          line.dataset.members = JSON.stringify(segment.members);
          colors.append(line);
        }
      }
      for (const e of geometry.edges) {
        const d = path(e.points);
        const line = doc.createElementNS(NS, 'path');
        line.setAttribute('d', d);
        line.setAttribute('class', 'mbb-relation-edge-identity ' + e.kind);
        line.setAttribute('fill', 'none');
        line.style.setProperty('--rm-source', sourceColor(e.from));
        line.setAttribute('stroke', 'transparent');
        line.dataset.from = e.from;
        line.dataset.to = e.to;
        line.dataset.kind = e.kind;
        line.dataset.id = e.id;
        line.dataset.bundle = e.bundle;
        const why = doc.createElementNS(NS, 'title');
        why.textContent = kinds[e.kind] + (e.why ? '：' + e.why : '');
        line.append(why);
        svg.append(line);
        const end = e.points.at(-1),
          prev = e.points.at(-2),
          length = Math.hypot(end[0] - prev[0], end[1] - prev[1]),
          dx = (end[0] - prev[0]) / length,
          dy = (end[1] - prev[1]) / length;
        const arrow = doc.createElementNS(NS, 'polygon');
        arrow.setAttribute(
          'points',
          `${end[0]},${end[1]} ${end[0] - dx * 8 - dy * 4},${end[1] - dy * 8 + dx * 4} ${end[0] - dx * 8 + dy * 4},${end[1] - dy * 8 - dx * 4}`,
        );
        arrow.setAttribute('class', 'arrow ' + e.kind);
        arrow.style.setProperty('--rm-source', sourceColor(e.from));
        if (geometry.segments.some((s) => s.sharedTail && s.members.includes(e.id)))
          arrow.classList.add('is-shared-tail');
        arrow.dataset.edgeId = e.id;
        svg.append(arrow);
      }
      // Hit targets belong to visible segments, never individual overlapping full paths.
      const hits = doc.createElementNS(NS, 'g');
      hits.setAttribute('aria-hidden', 'true');
      hits.dataset.edgeHits = '';
      for (const segment of geometry.segments) {
        const hit = doc.createElementNS(NS, 'path');
        hit.setAttribute('d', path(segment.points));
        hit.setAttribute('class', 'mbb-relation-edge-hit');
        hit.dataset.members = JSON.stringify(segment.members);
        hits.append(hit);
      }
      // Transparent touch targets overlap. Resolve intent from screen-space centerlines,
      // so SVG painting order, fitting, zoom and panning cannot choose a neighboring edge.
      hits.addEventListener('click', (event) => {
        const matrix = svg.getScreenCTM();
        if (!matrix) return;
        const rect = viewport.getBoundingClientRect(),
          window = doc.defaultView,
          clip = [
            Math.max(0, rect.left),
            Math.max(0, rect.top),
            Math.min(window.innerWidth, rect.right),
            Math.min(window.innerHeight, rect.bottom),
          ];
        if (clip[0] >= clip[2] || clip[1] >= clip[3]) return;
        const screen = ([x, y]) => [
          matrix.a * x + matrix.c * y + matrix.e,
          matrix.b * x + matrix.d * y + matrix.f,
        ];
        const distances = geometry.segments.map((segment) => {
          const [a, b] = segment.points.map(screen),
            dx = b[0] - a[0],
            dy = b[1] - a[1],
            lengthSquared = dx * dx + dy * dy;
          let from = 0,
            to = 1;
          // Clip centerlines before measuring: a hidden rail's wide transparent hit
          // can enter the viewport, but that rail is not a visible choice.
          for (const axis of [0, 1]) {
            const delta = b[axis] - a[axis];
            if (!delta) {
              if (a[axis] < clip[axis] || a[axis] > clip[axis + 2]) return Infinity;
            } else {
              const first = (clip[axis] - a[axis]) / delta,
                last = (clip[axis + 2] - a[axis]) / delta;
              from = Math.max(from, Math.min(first, last));
              to = Math.min(to, Math.max(first, last));
              if (from > to) return Infinity;
            }
          }
          const projection = lengthSquared
            ? Math.max(
                from,
                Math.min(
                  to,
                  ((event.clientX - a[0]) * dx + (event.clientY - a[1]) * dy) / lengthSquared,
                ),
              )
            : 0;
          return Math.hypot(
            event.clientX - a[0] - projection * dx,
            event.clientY - a[1] - projection * dy,
          );
        });
        const nearest = Math.min(...distances);
        if (nearest > 9) return;
        const members = [
          ...new Set(
            geometry.segments.flatMap((segment, i) =>
              distances[i] <= 9 && distances[i] - nearest <= 1.25 ? segment.members : [],
            ),
          ),
        ];
        if (members.length === 1) chooseEdge(members[0]);
        else {
          selectionTrigger = doc.activeElement?.closest('button') || viewport;
          selectedEdge = null;
          candidateEdges = members;
          applySelection();
          showInspection();
        }
        inspection.focus({ preventScroll: true });
        inspection.scrollIntoView({ block: 'nearest' });
      });
      svg.append(hits);
      applySelection();
      // Geometry is public data only and exposed for deterministic layout/obstacle checks.
      node.mbbRelationGeometry = geometry;
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
        for (const targetGroup of p.groups.filter((g) => g.id !== select.value)) {
          const groupEdges = related.filter((e) =>
            [e.from, e.to].some((id) => p.nodes.find((n) => n.id === id).group === targetGroup.id),
          );
          if (!groupEdges.length) continue;
          const section = el('section', 'mbb-relation-cross-group'),
            ul = el('ul'),
            targetNode = p.nodes.find(
              (n) =>
                n.group === targetGroup.id &&
                groupEdges.some((e) => e.from === n.id || e.to === n.id),
            );
          section.append(el('h5', '', targetGroup.title));
          for (const e of groupEdges) {
            const li = el('li', 'mbb-relation-cross-item ' + e.kind);
            li.dataset.edgeId = edgeIds[p.edges.indexOf(e)];
            for (const [i, key] of ['from', 'to'].entries()) {
              if (i) li.append(doc.createTextNode(' → '));
              const n = p.nodes.find((n) => n.id === e[key]),
                a = el('a', '', n.title);
              a.href = n.url;
              li.append(a);
            }
            li.append(el('p', '', kinds[e.kind] + (e.why ? '：' + e.why : '')));
            ul.append(li);
          }
          section.append(
            ul,
            button(T('Show in map') + ' · ' + targetGroup.title, () => {
              initialNodeFocus = null;
              fullMode = true;
              saveView();
              zoom = 1;
              pan = { x: 0, y: 0 };
              render();
              const target = board.querySelector(`[data-node="${targetNode.id}"]`);
              if (target) {
                target.classList.add('is-highlighted');
                pan = {
                  x:
                    viewport.clientWidth / 2 -
                    (target.offsetLeft + target.offsetWidth / 2) * fitScale() * zoom,
                  y: 260 - (target.offsetTop + target.offsetHeight / 2) * fitScale() * zoom,
                };
                transform();
                target.focus({ preventScroll: true });
                viewport.scrollIntoView({ block: 'nearest' });
              }
            }),
          );
          cross.append(section);
        }
      }
      groupLabel.hidden = fullMode;
      wholeBranch.hidden = fullMode || !initialNodeFocus || !mobile.matches;
      full.hidden = fullMode;
      back.hidden = !fullMode || !mobile.matches;
      for (const b of [zoomOut, zoomIn, reset, panToggle]) b.hidden = !fullMode;
      viewport.classList.toggle('is-full', fullMode && mobile.matches);
      pan = { x: 0, y: 0 };
      if (initialNodeFocus && !fullMode && mobile.matches) {
        const target = boxes.get(initialNodeFocus);
        if (target) {
          const fit = Math.min(1, viewport.clientWidth / width),
            windowHeight = Math.min(500, Math.ceil(height * fit));
          pan.y = Math.max(
            Math.min(0, windowHeight / 2 - (target.y + target.h / 2) * fit),
            Math.min(0, windowHeight - height * fit),
          );
          const anchor = anchors.get(initialNodeFocus);
          anchor.dataset.initialFocus = '';
        }
      }
      trace(traceNode && visibleIds.has(traceNode) ? traceNode : null);
      transform();
      if (activeNode && anchors.has(activeNode)) {
        const target = anchors.get(activeNode);
        target.focus({ preventScroll: true });
        const viewRect = viewport.getBoundingClientRect(),
          targetRect = target.getBoundingClientRect(),
          margin = 8;
        if (targetRect.left < viewRect.left + margin)
          pan.x += viewRect.left + margin - targetRect.left;
        else if (targetRect.right > viewRect.right - margin)
          pan.x -= targetRect.right - viewRect.right + margin;
        if (targetRect.top < viewRect.top + margin) pan.y += viewRect.top + margin - targetRect.top;
        else if (targetRect.bottom > viewRect.bottom - margin)
          pan.y -= targetRect.bottom - viewRect.bottom + margin;
        transform();
      }
      lastWidth = node.clientWidth;
      lastViewportWidth = viewport.clientWidth;
      lastVisible = true;
    }
    select.onchange = () => {
      initialNodeFocus = null;
      saveView();
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
    const checkVisibility = () => {
      if (disposed) return;
      const nextWidth = node.clientWidth;
      const visible = !!(
        node.isConnected &&
        nextWidth &&
        viewport.clientWidth &&
        node.getClientRects().length &&
        viewport.getClientRects().length &&
        !node.closest('[hidden]')
      );
      if (!visible) {
        lastVisible = false;
        setPanning(false);
        return;
      }
      if (!lastVisible || nextWidth !== lastWidth || viewport.clientWidth !== lastViewportWidth) {
        // Record before scheduling so repeated host pumps coalesce without mutations.
        lastVisible = true;
        lastWidth = nextWidth;
        lastViewportWidth = viewport.clientWidth;
        onResize();
      }
    };
    let fontsChanged = false;
    doc.fonts?.ready.then(() => {
      if (!disposed && !fontsChanged) {
        fontsChanged = true;
        onResize();
      }
    });
    doc.fonts?.addEventListener('loadingdone', onResize);
    // Use the same border-inclusive clientWidth as render and the host visibility hook.
    const resize = new ResizeObserver(checkVisibility);
    resize.observe(node);
    resize.observe(viewport);
    const modeChanged = () => {
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
        lastVisible = false;
        setPanning(false);
      },
      readerVisibility(force) {
        if (force) {
          setPanning(false);
          return;
        }
        checkVisibility();
      },
      dispose() {
        disposed = true;
        resize.disconnect();
        doc.fonts?.removeEventListener('loadingdone', onResize);
        mobile.removeEventListener('change', modeChanged);
        cancelAnimationFrame(raf);
        ui.remove();
        node.dataset.mbbComponentState = 'closed';
      },
    };
  }
  globalThis.MBBRelationMapV3Reader = Object.freeze({
    format: FORMAT,
    validate,
    safeURL,
    staticBytes,
    edgeIdsValid,
    staticView,
    enhance,
  });
  if (typeof module !== 'undefined' && module.exports)
    module.exports = globalThis.MBBRelationMapV3Reader;
})();
