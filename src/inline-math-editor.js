import {
  inspectNativeMath,
  verifyNativeMathML,
  verifyRenderedMath,
} from './native-math-conversion.js';

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
const valueSignature = (value) => JSON.stringify([value.text, value.formats, value.replacements]);
const caretExpectation = (root, before, after, position, tex) => ({
  root,
  position,
  tex,
  beforeSignature: valueSignature(before),
  expectedSignature: valueSignature(after),
  expectedStart: after.start,
  expectedEnd: after.end,
});
const isEscaped = (text, index) => {
  let slashes = 0;
  while (index - slashes - 1 >= 0 && text[index - slashes - 1] === '\\') slashes++;
  return slashes % 2 === 1;
};
const hasUnescapedDollar = (text) => {
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '$' && !isEscaped(text, index)) return true;
  }
  return false;
};
const validTex = (tex) =>
  typeof tex === 'string' &&
  tex.length > 0 &&
  tex.length <= 20000 &&
  tex.trim() === tex &&
  !/[\r\n]/.test(tex) &&
  !hasUnescapedDollar(tex);
export function typedMathRange(value) {
  const end = value.start;
  if (end !== value.end || !end || value.text[end - 1] !== '$') return null;
  const close = end - 1;
  if (isEscaped(value.text, close) || value.text[close - 1] === '$') return null;
  for (let open = close - 1; open >= Math.max(0, close - 202); open--) {
    const char = value.text[open];
    if (char === '\n' || char === '\r' || char === '\ufffc') return null;
    if (char !== '$') continue;
    if (
      isEscaped(value.text, open) ||
      value.text[open - 1] === '$' ||
      value.replacements[open - 1]?.type === FORMAT
    )
      return null;
    const tex = value.text.slice(open + 1, close);
    if (
      tex.length > 200 ||
      !validTex(tex) ||
      /^[\d\s.,]+$/.test(tex) ||
      value.replacements.slice(open, end).some(Boolean) ||
      value.formats.slice(open, end).some((formats) => formats?.length)
    )
      return null;
    return { start: open, end, tex };
  }
  return null;
}
function placeCaretAfterMath(root, value, position) {
  if (!root?.isConnected || value.replacements[position]?.type !== FORMAT) return false;
  const ordinal = value.replacements
    .slice(0, position)
    .filter((item) => item?.type === FORMAT).length;
  const host = root.querySelectorAll('span.mbb-math[data-mbb-tex]')[ordinal];
  if (!host) return false;
  const object = host.closest('[data-rich-text-bogus]') || host;
  const owner = root.ownerDocument;
  const range = owner.createRange();
  range.setStartAfter(object);
  range.collapse(true);
  const selection = owner.defaultView.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

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

export function InlineMathEdit({ contentRef, value, onChange, onFocus, isVisible = true }) {
  const el = wp.element.createElement;
  const [selected, setSelected] = wp.element.useState(null);
  const [creating, setCreating] = wp.element.useState(false);
  const [draft, setDraft] = wp.element.useState('');
  const [error, setError] = wp.element.useState('');
  const [nativeError, setNativeError] = wp.element.useState('');
  const [nativeBusy, setNativeBusy] = wp.element.useState(false);
  const [creationValidation, setCreationValidation] = wp.element.useState({
    tex: '',
    status: 'idle',
  });
  const selectedRef = wp.element.useRef(null);
  const openedTexRef = wp.element.useRef(null);
  const creationRef = wp.element.useRef(null);
  const typedRef = wp.element.useRef(null);
  const caretRef = wp.element.useRef(null);
  const valueRef = wp.element.useRef(value);
  const onChangeRef = wp.element.useRef(onChange);
  const nativeEpoch = wp.element.useRef(0);
  const registry = wp.data.useRegistry();
  valueRef.current = value;
  onChangeRef.current = onChange;
  const editable = contentRef.current;
  const close = (restoreFocus = false) => {
    const previous = selectedRef.current;
    selectedRef.current = null;
    selectedHost = null;
    setSelected(null);
    setCreating(false);
    creationRef.current = null;
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
    setCreating(false);
    creationRef.current = null;
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
  wp.element.useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const onBeforeInput = (event) => {
      if (
        event.inputType !== 'insertText' ||
        event.data !== '$' ||
        event.isComposing ||
        !root.contains(event.target) ||
        root.matches('code,pre') ||
        root.closest('[data-type="core/code"],pre,code') ||
        valueRef.current.start !== valueRef.current.end
      )
        return;
      const original = valueRef.current;
      const literal = wp.richText.insert(original, '$', original.start, original.end);
      const range = typedMathRange(literal);
      if (!range) return;
      typedRef.current = {
        root,
        beforeText: original.text,
        text: literal.text,
        position: literal.start,
        range,
      };
    };
    root.addEventListener('beforeinput', onBeforeInput, true);
    return () => root.removeEventListener('beforeinput', onBeforeInput, true);
  }, [editable, contentRef]);
  wp.element.useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const onKeyDown = (event) => {
      if (
        event.key !== 'Enter' ||
        event.shiftKey ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.isComposing ||
        event.repeat ||
        event.defaultPrevented ||
        !root.contains(event.target) ||
        root.closest('[data-type]')?.getAttribute('data-type') !== 'core/paragraph'
      )
        return;
      const current = valueRef.current;
      if (
        current?.text !== '$$' ||
        current.start !== 2 ||
        current.end !== 2 ||
        current.replacements.some(Boolean) ||
        current.formats.some((formats) => formats?.length)
      )
        return;
      const editor = registry.select('core/block-editor');
      const clientId = editor.getSelectedBlockClientId();
      if (
        !clientId ||
        root.closest('[data-block]')?.getAttribute('data-block') !== clientId ||
        editor.getBlock(clientId)?.name !== 'core/paragraph' ||
        !editor.canInsertBlockType('mbb/math', editor.getBlockRootClientId(clientId))
      )
        return;
      const actions = registry.dispatch('core/block-editor');
      if (
        typeof actions.__unstableMarkLastChangeAsPersistent !== 'function' ||
        typeof actions.__unstableMarkAutomaticChange !== 'function'
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      actions.__unstableMarkLastChangeAsPersistent();
      actions.replaceBlock(clientId, wp.blocks.createBlock('mbb/math', { tex: '' }));
      actions.__unstableMarkAutomaticChange();
    };
    root.addEventListener('keydown', onKeyDown, true);
    return () => root.removeEventListener('keydown', onKeyDown, true);
  }, [editable, contentRef, registry]);
  wp.element.useLayoutEffect(() => {
    const pending = typedRef.current;
    if (!pending || pending.root !== contentRef.current || value.text === pending.beforeText)
      return;
    typedRef.current = null;
    if (
      value.text !== pending.text ||
      value.start !== pending.position ||
      value.end !== value.start
    )
      return;
    const history = registry.dispatch('core/block-editor');
    if (
      typeof history?.__unstableMarkLastChangeAsPersistent !== 'function' ||
      typeof history?.__unstableMarkAutomaticChange !== 'function'
    )
      return;
    history.__unstableMarkLastChangeAsPersistent();
    const next = wp.richText.insertObject(
      value,
      {
        type: FORMAT,
        attributes: { tex: pending.range.tex },
        innerHTML: escapeHTML('$' + pending.range.tex + '$'),
      },
      pending.range.start,
      pending.range.end,
    );
    caretRef.current = caretExpectation(
      pending.root,
      value,
      next,
      pending.range.start,
      pending.range.tex,
    );
    onChange(next);
    onFocus?.();
    history.__unstableMarkAutomaticChange();
  }, [value, onChange, onFocus, contentRef, registry]);
  wp.element.useLayoutEffect(() => {
    const pending = caretRef.current;
    if (!pending || pending.root !== contentRef.current) return;
    const signature = valueSignature(value);
    if (signature === pending.beforeSignature) return;
    if (
      signature !== pending.expectedSignature ||
      value.start !== pending.expectedStart ||
      value.end !== pending.expectedEnd
    ) {
      caretRef.current = null;
      return;
    }
    const replacement = value.replacements[pending.position];
    if (replacement?.type !== FORMAT || replacement.attributes?.tex !== pending.tex) {
      caretRef.current = null;
      return;
    }
    const owner = pending.root.ownerDocument;
    owner.defaultView.queueMicrotask(() => {
      if (caretRef.current !== pending) return;
      const latest = valueRef.current;
      const selection = owner.defaultView.getSelection();
      if (
        valueSignature(latest) !== pending.expectedSignature ||
        latest.start !== pending.expectedStart ||
        latest.end !== pending.expectedEnd ||
        !pending.root.isConnected ||
        owner.activeElement !== pending.root ||
        !pending.root.contains(selection.anchorNode) ||
        !pending.root.contains(selection.focusNode)
      ) {
        caretRef.current = null;
        return;
      }
      if (placeCaretAfterMath(pending.root, value, pending.position)) caretRef.current = null;
    });
  }, [value, contentRef]);
  wp.element.useEffect(
    () => () => {
      nativeEpoch.current++;
      caretRef.current = null;
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
  wp.element.useEffect(() => {
    if (!creating) return;
    if (!validTex(draft)) {
      setCreationValidation({ tex: draft, status: 'invalid', message: '' });
      return;
    }
    let active = true;
    setCreationValidation({ tex: draft, status: 'pending' });
    const timer = setTimeout(() => {
      MBB_MATH.render(draft, false).then(
        (html) => {
          if (!active) return;
          const template = (contentRef.current?.ownerDocument || document).createElement(
            'template',
          );
          template.innerHTML = html;
          setCreationValidation(
            template.content.querySelector('mjx-merror,[data-mbb-math-error]')
              ? { tex: draft, status: 'invalid', message: '公式无法排版。' }
              : { tex: draft, status: 'valid' },
          );
        },
        (reason) => {
          if (active)
            setCreationValidation({ tex: draft, status: 'invalid', message: reason.message });
        },
      );
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [creating, draft, contentRef]);
  const startCreating = () => {
    const current = valueRef.current;
    if (!current || current.start === undefined || current.end === undefined) return;
    const start = Math.min(current.start, current.end);
    const end = Math.max(current.start, current.end);
    const selection = wp.richText.slice(current, start, end);
    const text = wp.richText.getTextContent(selection);
    creationRef.current = {
      start,
      end,
      signature: valueSignature(current),
      invalid:
        selection.replacements.some(Boolean) ||
        selection.formats.some((formats) => formats?.length),
    };
    setDraft(text);
    setError(creationRef.current.invalid ? '选区含其他格式或对象，请先选择纯文本。' : '');
    setCreating(true);
  };
  const coreObject = wp.richText.getActiveObject(value);
  const canConvertCore = coreObject?.type === 'core/math';
  const convertCore = async () => {
    const current = valueRef.current;
    const object = wp.richText.getActiveObject(current);
    const root = contentRef.current;
    if (!root || object?.type !== 'core/math') return;
    const positions = [];
    current.replacements.forEach((item, index) => {
      if (item?.type === 'core/math') positions.push(index);
    });
    const ordinal = positions.indexOf(current.start);
    const host = root.querySelectorAll('math[data-latex]')[ordinal];
    if (
      ordinal < 0 ||
      !host ||
      host.getAttributeNames().some((name) => name !== 'data-latex') ||
      host.getAttribute('data-latex') !== object.attributes?.['data-latex'] ||
      current.formats[current.start]?.length
    )
      return setNativeError('原生公式带有额外格式或属性，无法无损转换。');
    const tex = object.attributes['data-latex'];
    const problem = inspectNativeMath(
      { tex, mathML: object.innerHTML || '', attributes: object.attributes, inline: true },
      root.ownerDocument,
    );
    if (problem) return setNativeError(problem);
    const signature = valueSignature(current);
    const start = current.start;
    const end = current.end;
    const epoch = ++nativeEpoch.current;
    setNativeBusy(true);
    setNativeError('');
    const structureProblem = await verifyNativeMathML(
      tex,
      object.innerHTML || '',
      false,
      root.ownerDocument,
    );
    if (epoch !== nativeEpoch.current) return;
    if (structureProblem) {
      setNativeBusy(false);
      return setNativeError(structureProblem);
    }
    const renderingProblem = await verifyRenderedMath(tex, false, root.ownerDocument);
    if (epoch !== nativeEpoch.current) return;
    setNativeBusy(false);
    if (renderingProblem) return setNativeError(renderingProblem);
    const latest = valueRef.current;
    if (
      !root.isConnected ||
      !root.contains(host) ||
      latest.start !== start ||
      latest.end !== end ||
      valueSignature(latest) !== signature ||
      host.getAttribute('data-latex') !== tex
    )
      return setNativeError('原生公式在验证期间已变化，请重新选择后转换。');
    const next = wp.richText.insertObject(
      latest,
      { type: FORMAT, attributes: { tex }, innerHTML: escapeHTML('$' + tex + '$') },
      start,
      end,
    );
    caretRef.current = caretExpectation(root, latest, next, start, tex);
    onChangeRef.current(next);
    onFocus?.();
    setNativeError('');
  };
  wp.element.useEffect(() => {
    if (!canConvertCore) {
      nativeEpoch.current++;
      setNativeError('');
      setNativeBusy(false);
    }
  }, [canConvertCore, value]);
  const save = () => {
    if (creating) {
      const current = valueRef.current;
      const selection = creationRef.current;
      if (!current || !selection || valueSignature(current) !== selection.signature)
        return setError('正文已变化，请重新选择后创建公式。');
      if (selection.invalid) return setError('选区含其他格式或对象，请先选择纯文本。');
      if (!validTex(draft)) return setError('请输入不含未转义美元符的单行 TeX 源码。');
      if (creationValidation.tex !== draft || creationValidation.status !== 'valid')
        return setError('请等待公式排版成功后再应用。');
      const root = contentRef.current;
      if (!root) return setError('正文已变化，请重新选择后创建公式。');
      const next = wp.richText.insertObject(
        current,
        { type: FORMAT, attributes: { tex: draft }, innerHTML: escapeHTML('$' + draft + '$') },
        selection.start,
        selection.end,
      );
      caretRef.current = caretExpectation(root, current, next, selection.start, draft);
      onChangeRef.current(next);
      close(true);
      onFocus?.();
      return;
    }
    const root = contentRef.current,
      host = selectedRef.current;
    if (!root || !host || !root.contains(host)) return setError('公式已变化，请重新选择。');
    const spans = [...root.querySelectorAll('span.mbb-math[data-mbb-tex]')];
    const ordinal = spans.indexOf(host);
    const positions = [];
    valueRef.current.replacements.forEach((item, index) => {
      if (item?.type === FORMAT) positions.push(index);
    });
    const position = positions[ordinal];
    if (
      position === undefined ||
      host.dataset.mbbTex !== openedTexRef.current ||
      valueRef.current.replacements[position]?.attributes?.tex !== openedTexRef.current
    )
      return setError('无法定位当前公式，请重新选择。');
    if (!draft.trim() || /[\r\n]/.test(draft)) return setError('请输入单行 TeX 源码。');
    const next = wp.richText.insertObject(
      valueRef.current,
      {
        type: FORMAT,
        attributes: { tex: draft },
        innerHTML: escapeHTML('$' + draft + '$'),
      },
      position,
      position + 1,
    );
    onChangeRef.current(next);
    close();
  };
  if (!isVisible) return null;
  return el(
    wp.element.Fragment,
    {},
    el(wp.blockEditor.RichTextToolbarButton, {
      icon: 'editor-customchar',
      title: '数学（MathJax）',
      onClick: startCreating,
      isActive: creating || !!selected,
    }),
    canConvertCore
      ? el(wp.blockEditor.RichTextToolbarButton, {
          icon: 'update',
          title: '转换原生数学为行内公式（MathJax）',
          onClick: convertCore,
          disabled: nativeBusy,
        })
      : null,
    nativeError
      ? el(
          wp.components.Popover,
          {
            anchor: contentRef.current,
            placement: 'bottom-start',
            onClose: () => setNativeError(''),
          },
          el('p', { role: 'alert', style: { padding: '10px' } }, nativeError),
        )
      : null,
    selected || creating
      ? el(
          wp.components.Popover,
          {
            anchor: selected || editable,
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
                onChange: (event) => {
                  setDraft(event.target.value);
                  setError('');
                },
                onKeyDown: (event) => {
                  if (event.key === 'Escape') {
                    event.stopPropagation();
                    close(true);
                  }
                },
              }),
            ),
            el(
              wp.components.Button,
              {
                variant: 'primary',
                onClick: save,
                disabled:
                  creating &&
                  (creationValidation.tex !== draft || creationValidation.status !== 'valid'),
              },
              '应用公式',
            ),
            el(wp.components.Button, { variant: 'tertiary', onClick: () => close(true) }, '取消'),
            error ? el('p', { role: 'alert' }, error) : null,
            creating && creationValidation.status === 'pending'
              ? el('p', { role: 'status' }, '正在验证公式…')
              : null,
            creating && creationValidation.message
              ? el('p', { role: 'alert' }, creationValidation.message)
              : null,
            el(SmallPreview, { tex: draft }),
          ),
        )
      : null,
  );
}
