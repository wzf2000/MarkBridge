const FORMAT = 'mbb/math';
const records = new WeakMap();
const sheets = new WeakMap();
const observedDocuments = new WeakSet();
const observedFrames = new WeakSet();
let pendingHost = null;
let selectedHost = null;
const baseCSS =
  ':host{display:inline-block;vertical-align:baseline;white-space:nowrap;cursor:pointer}' +
  'mjx-container{display:inline-block;margin:0!important;max-width:none}';
const escapeHTML = (text) =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function shadowStyles(host, shadow) {
  const owner = host.ownerDocument;
  const mathCSS = document.querySelector('style[data-mbb-chtml]')?.textContent || '';
  let entry = sheets.get(owner);
  if (!entry) {
    entry = { css: null, sheet: null, global: owner.createElement('style') };
    entry.global.dataset.mbbInlineMathChtml = 'true';
    owner.head.append(entry.global);
    sheets.set(owner, entry);
  }
  if (entry.css !== mathCSS) {
    entry.global.textContent = mathCSS;
    entry.css = mathCSS;
    if (entry.sheet) entry.sheet.replaceSync(mathCSS + baseCSS);
  }
  if ('adoptedStyleSheets' in shadow && owner.defaultView.CSSStyleSheet) {
    if (!entry.sheet) {
      entry.sheet = new owner.defaultView.CSSStyleSheet();
      entry.sheet.replaceSync(mathCSS + baseCSS);
    }
    if (shadow.adoptedStyleSheets[0] !== entry.sheet) shadow.adoptedStyleSheets = [entry.sheet];
    return null;
  }
  const style = owner.createElement('style');
  style.textContent = mathCSS + baseCSS;
  return style;
}
function paint(host) {
  const record = records.get(host);
  if (!record || !host.isConnected || host.getAttribute('data-mbb-tex') !== record.tex) return;
  const state = selectedHost === host || !record.html ? 'source' : 'rendered';
  if (record.painted === state && host.shadowRoot) return;
  const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
  const style = shadowStyles(host, shadow);
  record.painted = state;
  if (state === 'source') {
    shadow.replaceChildren(...(style ? [style] : []), host.ownerDocument.createElement('slot'));
    return;
  }
  const rendered = host.ownerDocument.createElement('span');
  rendered.innerHTML = record.html;
  shadow.replaceChildren(...(style ? [style] : []), rendered);
}
function decorate(owner) {
  for (const host of owner.querySelectorAll('span.mbb-math[data-mbb-tex]')) {
    if (!host.closest('[contenteditable="true"]')) continue;
    const tex = host.getAttribute('data-mbb-tex');
    const wrapper = host.parentElement;
    if (wrapper?.getAttribute('contenteditable') === 'false') {
      wrapper.tabIndex = 0;
      wrapper.setAttribute('role', 'button');
      wrapper.setAttribute('aria-label', `编辑行内公式：${tex}`);
    }
    if (records.get(host)?.tex === tex) {
      paint(host);
      continue;
    }
    const record = { tex, html: null, painted: null };
    records.set(host, record);
    paint(host);
    MBB_MATH.render(tex, false).then(
      (html) => {
        if (records.get(host) !== record) return;
        const template = owner.createElement('template');
        template.innerHTML = html;
        if (!template.content.querySelector('mjx-merror,[data-mbb-math-error]')) record.html = html;
        paint(host);
      },
      () => {
        // Failed TeX stays visible as its original $tex$ source.
        if (records.get(host) === record) paint(host);
      },
    );
  }
}
function formulaFrom(target, owner) {
  const node = target?.nodeType === 1 ? target : target?.parentElement;
  const host = node?.closest?.('span.mbb-math[data-mbb-tex]');
  if (host && host.ownerDocument === owner && records.has(host)) return host;
  const wrapper = node?.closest?.('[data-rich-text-bogus][contenteditable="false"]');
  const nested = wrapper?.querySelector('span.mbb-math[data-mbb-tex]');
  return nested && records.has(nested) ? nested : null;
}
function observeDocument(owner) {
  if (!owner?.body || observedDocuments.has(owner)) return;
  observedDocuments.add(owner);
  let scheduled = false;
  const scan = () => {
    scheduled = false;
    decorate(owner);
    for (const frame of owner.querySelectorAll('iframe')) {
      if (frame.hidden) continue;
      try {
        observeDocument(frame.contentDocument);
        if (!observedFrames.has(frame)) {
          observedFrames.add(frame);
          frame.addEventListener('load', () => observeDocument(frame.contentDocument));
        }
      } catch {
        // Gutenberg editor canvases are same-origin; unrelated frames stay untouched.
      }
    }
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    owner.defaultView.requestAnimationFrame(scan);
  };
  new owner.defaultView.MutationObserver(schedule).observe(owner.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-mbb-tex'],
  });
  owner.addEventListener(
    'click',
    (event) => {
      const host = formulaFrom(event.target, owner);
      if (!host) return;
      pendingHost = host;
      host.dispatchEvent(
        new owner.defaultView.CustomEvent('mbb-inline-math-open', { bubbles: true }),
      );
    },
    true,
  );
  owner.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const host = formulaFrom(event.target, owner);
      if (!host) return;
      event.preventDefault();
      event.stopPropagation();
      pendingHost = host;
      host.closest('[contenteditable="true"]')?.focus();
      host.dispatchEvent(
        new owner.defaultView.CustomEvent('mbb-inline-math-open', { bubbles: true }),
      );
    },
    true,
  );
  scan();
}
export function installInlineMathDecorations() {
  observeDocument(document);
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () => observeDocument(document), { once: true });
}

function SmallPreview({ tex }) {
  const el = wp.element.createElement;
  const [html, setHTML] = wp.element.useState('');
  const [error, setError] = wp.element.useState('');
  wp.element.useEffect(() => {
    let active = true;
    setHTML('');
    setError('');
    const timer = setTimeout(() => {
      MBB_MATH.render(tex, false).then(
        (result) => {
          if (active) setHTML(result);
        },
        (reason) => {
          if (active) setError(reason.message);
        },
      );
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [tex]);
  return el(
    'div',
    {
      className: 'mbb-inline-math-small-preview',
      style: {
        marginTop: '10px',
        padding: '10px 6px 14px',
        minHeight: '3em',
        fontSize: '16px',
        lineHeight: 1.7,
        overflowX: 'auto',
      },
    },
    el('small', {}, '公式预览（不写入正文）'),
    error
      ? el('code', { role: 'status' }, error)
      : html
        ? el('div', { dangerouslySetInnerHTML: { __html: html } })
        : el('code', {}, tex),
  );
}

export function InlineMathEdit({ contentRef, value, onChange, isVisible = true }) {
  const el = wp.element.createElement;
  const [selected, setSelected] = wp.element.useState(null);
  const [draft, setDraft] = wp.element.useState('');
  const [error, setError] = wp.element.useState('');
  const selectedRef = wp.element.useRef(null);
  const openedTexRef = wp.element.useRef(null);
  const editable = contentRef.current;
  const close = (restoreFocus = false) => {
    const previous = selectedRef.current;
    selectedRef.current = null;
    selectedHost = null;
    setSelected(null);
    setError('');
    if (previous?.isConnected) {
      paint(previous);
      if (restoreFocus) previous.parentElement?.focus();
    }
  };
  const open = (host) => {
    if (!host || !contentRef.current?.contains(host)) return;
    const previous = selectedRef.current;
    if (previous && previous !== host) {
      selectedHost = null;
      paint(previous);
    }
    pendingHost = null;
    selectedRef.current = host;
    openedTexRef.current = host.getAttribute('data-mbb-tex');
    selectedHost = host;
    setSelected(host);
    setDraft(host.getAttribute('data-mbb-tex') || '');
    setError('');
    paint(host);
  };
  wp.element.useLayoutEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    if (pendingHost && root.contains(pendingHost)) open(pendingHost);
    const requestOpen = (event) => open(event.target.closest('span.mbb-math[data-mbb-tex]'));
    root.addEventListener('mbb-inline-math-open', requestOpen);
    return () => root.removeEventListener('mbb-inline-math-open', requestOpen);
  }, [editable, contentRef]);
  wp.element.useEffect(
    () => () => {
      if (selectedRef.current) {
        selectedHost = null;
        paint(selectedRef.current);
        selectedRef.current = null;
      }
    },
    [],
  );
  wp.element.useEffect(() => {
    if (selected && (!selected.isConnected || !contentRef.current?.contains(selected))) close();
  }, [selected, value]);
  const save = () => {
    const root = contentRef.current,
      host = selectedRef.current;
    if (!root || !host || !root.contains(host)) return setError('公式已变化，请重新选择。');
    const spans = [...root.querySelectorAll('span.mbb-math[data-mbb-tex]')];
    const ordinal = spans.indexOf(host);
    const positions = [];
    value.replacements.forEach((item, index) => {
      if (item?.type === FORMAT) positions.push(index);
    });
    const position = positions[ordinal];
    if (
      position === undefined ||
      host.dataset.mbbTex !== openedTexRef.current ||
      value.replacements[position]?.attributes?.tex !== openedTexRef.current
    )
      return setError('无法定位当前公式，请重新选择。');
    if (!draft.trim() || /[\r\n]/.test(draft)) return setError('请输入单行 TeX 源码。');
    const next = wp.richText.insertObject(
      value,
      {
        type: FORMAT,
        attributes: { tex: draft },
        innerHTML: escapeHTML('$' + draft + '$'),
      },
      position,
      position + 1,
    );
    onChange(next);
    close();
  };
  if (!selected || !isVisible) return null;
  return el(
    wp.components.Popover,
    {
      anchor: selected,
      placement: 'bottom-start',
      onClose: () => close(true),
      focusOnMount: 'firstElement',
      className: 'mbb-inline-math-popover',
    },
    el(
      'div',
      { style: { padding: '12px', width: 'min(360px, 80vw)' } },
      el(
        'label',
        {},
        'TeX 源码',
        el('textarea', {
          className: 'mbb-inline-math-source',
          value: draft,
          rows: 2,
          style: { display: 'block', width: '100%', boxSizing: 'border-box' },
          onChange: (event) => setDraft(event.target.value),
          onKeyDown: (event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              close(true);
            }
          },
        }),
      ),
      el(wp.components.Button, { variant: 'primary', onClick: save }, '应用公式'),
      el(wp.components.Button, { variant: 'tertiary', onClick: () => close(true) }, '取消'),
      error ? el('p', { role: 'alert' }, error) : null,
      el(SmallPreview, { tex: draft }),
    ),
  );
}
