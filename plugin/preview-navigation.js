(() => {
  'use strict';
  // This exact, fixed script is the only executable content in an author preview.
  // It cannot fetch resources, run a component, or send article text to its parent.
  if (window.__mbbAuthorNavigation) return;
  window.__mbbAuthorNavigation = true;
  const root = document.documentElement;
  const session = root.dataset.mbbPreviewSession;
  const sourceHash = root.dataset.mbbPreviewSource;
  const parentOrigin = root.dataset.mbbPreviewParent;
  if (!/^[a-f0-9]{32}$/.test(session || '') || !/^[a-f0-9]{64}$/.test(sourceHash || '')) return;
  if (!/^https?:\/\//.test(parentOrigin || '')) return;
  const protocol = 'mbb-author-navigation/v1';
  const nodes = [...document.querySelectorAll('[data-mbb-preview-range]')].slice(0, 2048);
  const ranges = new Map();
  for (const node of nodes) {
    const id = node.dataset.mbbPreviewRange;
    if (/^r\d{1,5}$/.test(id) && !ranges.has(id)) ranges.set(id, node);
  }
  let selecting = false,
    syncing = false,
    queued = false,
    lastViewport = '',
    quietUntil = 0;
  const send = (action, id) =>
    parent.postMessage(
      {
        type: protocol,
        action,
        session,
        sourceHash,
        ...(id ? { id } : {}),
      },
      parentOrigin,
    );
  const interactive = (target) =>
    target.closest(
      'a,button,input,textarea,select,summary,[contenteditable],[role=button],[role=link]',
    );
  function setSelection(enabled) {
    selecting = enabled;
    root.toggleAttribute('data-mbb-preview-locate', enabled);
    for (const node of ranges.values()) {
      if (enabled) {
        if (!interactive(node) && !node.hasAttribute('tabindex')) {
          node.tabIndex = 0;
          node.dataset.mbbPreviewFocusable = '';
        }
      } else if (node.hasAttribute('data-mbb-preview-focusable')) {
        node.removeAttribute('tabindex');
        delete node.dataset.mbbPreviewFocusable;
      }
    }
  }
  function select(event) {
    if (!selecting || !(event.target instanceof Element) || interactive(event.target)) return;
    const target = event.target.closest('[data-mbb-preview-range]');
    if (!target || ranges.get(target.dataset.mbbPreviewRange) !== target) return;
    if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    send('select', target.dataset.mbbPreviewRange);
  }
  document.addEventListener('click', select);
  document.addEventListener('keydown', select);
  function viewport() {
    queued = false;
    if (!syncing || performance.now() < quietUntil) return;
    let selected = null,
      distance = Infinity;
    for (const [id, node] of ranges) {
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top > innerHeight) continue;
      const next = Math.abs(rect.top);
      if (next < distance) {
        selected = id;
        distance = next;
      }
    }
    if (selected && selected !== lastViewport) {
      lastViewport = selected;
      send('viewport', selected);
    }
  }
  addEventListener(
    'scroll',
    () => {
      if (!queued) {
        queued = true;
        setTimeout(viewport, 120);
      }
    },
    { passive: true },
  );
  addEventListener('message', (event) => {
    const m = event.data;
    if (
      event.source !== parent ||
      event.origin !== parentOrigin ||
      !m ||
      m.type !== protocol ||
      m.session !== session ||
      m.sourceHash !== sourceHash ||
      Object.keys(m).some(
        (key) =>
          !['type', 'session', 'sourceHash', 'action', 'id', 'selecting', 'syncing'].includes(key),
      )
    )
      return;
    if (
      m.action === 'options' &&
      typeof m.selecting === 'boolean' &&
      typeof m.syncing === 'boolean'
    ) {
      setSelection(m.selecting);
      syncing = m.syncing;
      viewport();
    } else if (m.action === 'reveal' && typeof m.id === 'string' && ranges.has(m.id)) {
      quietUntil = performance.now() + 300;
      const node = ranges.get(m.id);
      for (let container = node.parentElement; container; container = container.parentElement)
        if (container.tagName === 'DETAILS') container.open = true;
      // A static preview contains every stage; no algorithm runtime is started here.
      node.scrollIntoView({ block: 'start', behavior: 'auto' });
      for (const marked of document.querySelectorAll('[data-mbb-preview-highlight]'))
        marked.removeAttribute('data-mbb-preview-highlight');
      node.setAttribute('data-mbb-preview-highlight', '');
    }
  });
  send('ready');
})();
