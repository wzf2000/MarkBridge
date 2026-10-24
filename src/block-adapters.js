import { translate as T, format as F, translateError as E } from './i18n.js';
// Closed native containers and trusted declarative static leaves; never execute article code.
const nativeNames = {
  'native-code': 'core/code',
  preformatted: 'core/preformatted',
  group: 'core/group',
  details: 'core/details',
  buttons: 'core/buttons',
  button: 'core/button',
};
const bytes = (v) => new TextEncoder().encode(v).length;
const nonblank = (v) =>
  v.replace(
    /[ \t\r\n\f\v\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/gu,
    '',
  ) !== '';
const object = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const plain = (v, max, fail, nonempty = false) => {
  if (
    typeof v !== 'string' ||
    /[\uD800-\uDFFF\0]/u.test(v) ||
    [...v].length > max ||
    (nonempty && !nonblank(v))
  )
    fail('ADAPTER_ATTRIBUTES', 'Invalid plain text field type, Unicode, or length');
  return v;
};
const closed = (v, keys, required, fail) => {
  if (
    !object(v) ||
    Object.keys(v).some((k) => !keys.includes(k)) ||
    required.some((k) => !Object.hasOwn(v, k))
  )
    fail('ADAPTER_ATTRIBUTES', 'Adapter attributes are missing or contain unknown fields');
};
export const nativeAdapterKind = (name) =>
  Object.keys(nativeNames).find((k) => nativeNames[k] === name) || null;
export const nativeAdapterName = (kind) => nativeNames[kind];
export const nativeAdapterKinds = new Set(Object.keys(nativeNames));
export function adapterURL(value, fail) {
  plain(value, 2048, fail, true);
  if (
    /[\x00-\x20\x7f<>"`]/.test(value) ||
    (/^([^:/?#]+):/.test(value) && !/^(?:https?|mailto|tel|ftp):/i.test(value))
  )
    fail('ADAPTER_URL', 'The button link has an unsafe scheme or character');
  return value;
}
export function adapterAnchor(value, fail) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z][A-Za-z0-9_-]{0,63})?$/.test(value))
    fail(
      'ADAPTER_ANCHOR',
      'An anchor must begin with a letter and contain 1–64 ASCII letters, digits, underscores, or hyphens',
    );
  return value;
}
const fragment = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.content;
};
export function plainSummary(html, fail) {
  plain(html, 4096, fail);
  if (/<\/?[A-Za-z]|<!/.test(html))
    fail('ADAPTER_SUMMARY', 'A summary must be single-line plain text');
  const root = fragment(html);
  if ([...root.childNodes].some((n) => n.nodeType !== 3))
    fail('ADAPTER_SUMMARY', 'A summary must be single-line plain text');
  const value = plain(root.textContent, 200, fail, true);
  if (/[\r\n]/.test(value)) fail('ADAPTER_SUMMARY', 'A summary must be single-line plain text');
  return value;
}
export function buttonText(html, fail) {
  if (globalThis.wp?.richText?.RichTextData && html instanceof wp.richText.RichTextData)
    html = html.toString();
  plain(html, Number.MAX_SAFE_INTEGER, fail);
  if (
    /<!/.test(html) ||
    [...html.matchAll(/<\/?([A-Za-z][A-Za-z0-9-]*)\b/g)].some(
      (m) => !['strong', 'em', 's', 'del', 'code'].includes(m[1].toLowerCase()),
    )
  )
    fail('ADAPTER_INLINE', 'Buttons only support controlled text formatting');
  if (bytes(html) > 4096) fail('ADAPTER_LIMIT', 'Button text is limited to 4 KiB');
  const root = fragment(html);
  let count = 0;
  const walk = (node, depth = 1) => {
    if (++count > 256 || depth > 16)
      fail('ADAPTER_LIMIT', 'Button text is limited to 256 nodes and 16 levels');
    if (node.nodeType === 3) {
      plain(node.textContent, 4096, fail);
      return;
    }
    if (
      node.nodeType !== 1 ||
      !['strong', 'em', 's', 'del', 'code'].includes(node.localName) ||
      node.attributes.length ||
      (node.localName === 'code' && [...node.childNodes].some((n) => n.nodeType !== 3))
    )
      fail(
        'ADAPTER_INLINE',
        'Buttons only support plain text and strong/em/del/code, without links, images, or nested interactions',
      );
    [...node.childNodes].forEach((child) => walk(child, depth + 1));
  };
  [...root.childNodes].forEach((child) => walk(child));
  if (!nonblank(root.textContent)) fail('ADAPTER_INLINE', 'Button text must not be empty');
  return html;
}
export function buttonParagraph(html, fail) {
  const root = fragment(html.trim());
  if (
    root.childNodes.length !== 1 ||
    root.firstChild.nodeType !== 1 ||
    root.firstChild.localName !== 'p' ||
    root.firstChild.attributes.length
  )
    fail('ADAPTER_STRUCTURE', 'A link button must contain exactly one controlled text paragraph');
  return buttonText(root.firstChild.innerHTML, fail);
}
const nativeRichText = (value) =>
  globalThis.wp?.richText?.RichTextData && value instanceof wp.richText.RichTextData
    ? value.toString()
    : value;
export const nativeTextKind = (kind) => ['native-code', 'preformatted'].includes(kind);
export function nativePlainText(value, fail) {
  plain(value, 262144, fail);
  if (/[\x00-\x08\x0b-\x1f\x7f]/.test(value) || bytes(value) > 262144)
    fail('ADAPTER_TEXT', 'Native text requires bounded plain text with LF line endings');
  return value;
}
const nativeTextRichText = (html) => {
  const element = document.createElement('span');
  element.innerHTML = html;
  return wp.richText.RichTextData.fromHTMLElement(element, { preserveWhiteSpace: true });
};
const nativeTextHTML = (text, kind) => {
  const html = escapeAdapterText(text).replaceAll('\u00a0', '&nbsp;');
  return kind === 'preformatted' ? html.replaceAll('\n', '<br>') : html;
};
export function nativeContentText(value, kind, fail) {
  const html = nativeRichText(value);
  if (typeof html !== 'string' || html.includes('\r'))
    fail('ADAPTER_TEXT', 'Native text requires bounded plain text with LF line endings');
  const root = fragment(html);
  let text = '';
  for (const n of root.childNodes) {
    if (n.nodeType === 3) text += n.textContent;
    else if (n.nodeType === 1 && n.localName === 'br' && !n.attributes.length) text += '\n';
    else fail('ADAPTER_TEXT', 'Native code and preformatted blocks only support plain text');
  }
  return nativePlainText(text, fail);
}
export function nativeAttributes(kind, attrs, fail, source = false) {
  if (!nativeAdapterKinds.has(kind)) fail('ADAPTER_KIND', 'Unknown native adapter type');
  const keys = {
    'native-code': ['anchor', 'className', source ? 'text' : 'content'],
    preformatted: ['anchor', 'className', source ? 'text' : 'content'],
    group: ['tagName', 'anchor', 'ariaLabel', 'className', 'layout'],
    details: ['summary', 'showContent', 'anchor', ...(!source ? ['name'] : [])],
    buttons: ['anchor', 'layout'],
    button: [
      'url',
      'title',
      'linkTarget',
      'rel',
      'anchor',
      ...(!source ? ['text', 'tagName', 'type'] : []),
    ],
  }[kind];
  closed(
    attrs,
    keys,
    nativeTextKind(kind)
      ? [source ? 'text' : 'content']
      : kind === 'details'
        ? ['summary']
        : kind === 'button'
          ? ['url', ...(!source ? ['text'] : [])]
          : [],
    fail,
  );
  const out = {};
  if (Object.hasOwn(attrs, 'anchor') && adapterAnchor(attrs.anchor, fail))
    out.anchor = attrs.anchor;
  if (nativeTextKind(kind)) {
    const text = source
      ? nativePlainText(attrs.text, fail)
      : nativeContentText(attrs.content, kind, fail);
    out[source ? 'text' : 'content'] = source ? text : nativeTextHTML(text, kind);
  }
  if (nativeTextKind(kind)) {
    if (Object.hasOwn(attrs, 'className')) {
      if (
        typeof attrs.className !== 'string' ||
        attrs.className.length > 200 ||
        (attrs.className !== '' &&
          !/^[A-Za-z][A-Za-z0-9_-]*(?: [A-Za-z][A-Za-z0-9_-]*)*$/.test(attrs.className))
      )
        fail('ADAPTER_ATTRIBUTES', 'Invalid native block class names');
      out.className = attrs.className;
    }
  }
  if (kind === 'group') {
    out.tagName = Object.hasOwn(attrs, 'tagName') ? attrs.tagName : 'div';
    if (!['div', 'section'].includes(out.tagName))
      fail('ADAPTER_ATTRIBUTES', 'Groups only support div or section tags');
    if (Object.hasOwn(attrs, 'ariaLabel')) {
      out.ariaLabel = plain(attrs.ariaLabel, 200, fail);
      if (/[\x00-\x1f\x7f\u0085\u2028\u2029]/.test(out.ariaLabel))
        fail('ADAPTER_ATTRIBUTES', 'A group label must be single-line plain text');
    }
    if (Object.hasOwn(attrs, 'className')) {
      if (
        typeof attrs.className !== 'string' ||
        attrs.className.length > 200 ||
        (attrs.className !== '' &&
          !/^[A-Za-z][A-Za-z0-9_-]*(?: [A-Za-z][A-Za-z0-9_-]*)*$/.test(attrs.className))
      )
        fail('ADAPTER_ATTRIBUTES', 'Invalid native block class names');
      out.className = attrs.className;
    }
    if (Object.hasOwn(attrs, 'layout')) {
      closed(attrs.layout, ['type'], ['type'], fail);
      if (!['flow', 'constrained'].includes(attrs.layout.type))
        fail('ADAPTER_ATTRIBUTES', 'Groups only support flow or constrained layout');
      out.layout = { type: attrs.layout.type };
    }
  } else if (nativeTextKind(kind)) {
    // Plain native leaves have no other fields.
  } else if (kind === 'details') {
    if (Object.hasOwn(attrs, 'name') && attrs.name !== '')
      fail('ADAPTER_ATTRIBUTES', 'Exclusive details groups are not supported');
    out.summary = source
      ? plain(attrs.summary, 200, fail, true)
      : plainSummary(nativeRichText(attrs.summary), fail);
    if (/[\r\n]/.test(out.summary))
      fail('ADAPTER_SUMMARY', 'A summary must be single-line plain text');
    if (Object.hasOwn(attrs, 'showContent') && typeof attrs.showContent !== 'boolean')
      fail('ADAPTER_ATTRIBUTES', 'The details open state must be boolean');
    out.showContent = attrs.showContent ?? false;
  } else if (kind === 'buttons') {
    if (
      Object.hasOwn(attrs, 'layout') &&
      (!object(attrs.layout) ||
        Object.keys(attrs.layout).length !== 1 ||
        attrs.layout.type !== 'flex')
    )
      fail('ADAPTER_ATTRIBUTES', 'Button groups only support the default flex layout');
    if (Object.hasOwn(attrs, 'layout')) out.layout = { type: 'flex' };
  } else {
    if (
      (Object.hasOwn(attrs, 'tagName') && attrs.tagName !== 'a') ||
      (Object.hasOwn(attrs, 'type') && attrs.type !== 'button')
    )
      fail('ADAPTER_ATTRIBUTES', 'Only link buttons are supported, not action buttons');
    out.url = adapterURL(attrs.url, fail);
    if (Object.hasOwn(attrs, 'title')) {
      plain(attrs.title, 200, fail);
      if (/[\r\n]/.test(attrs.title))
        fail('ADAPTER_ATTRIBUTES', 'A link title must occupy a single line');
      out.title = attrs.title;
    }
    if (Object.hasOwn(attrs, 'linkTarget')) {
      if (!['', '_self', '_blank'].includes(attrs.linkTarget))
        fail('ADAPTER_ATTRIBUTES', 'Invalid link target');
      out.linkTarget = attrs.linkTarget;
    }
    if (Object.hasOwn(attrs, 'rel')) {
      if (typeof attrs.rel !== 'string') fail('ADAPTER_ATTRIBUTES', 'Link rel must be text');
      const tokens = attrs.rel ? attrs.rel.split(' ') : [];
      if (
        tokens.length > 5 ||
        new Set(tokens).size !== tokens.length ||
        tokens.some((v) => !['noopener', 'noreferrer', 'nofollow', 'ugc', 'sponsored'].includes(v))
      )
        fail('ADAPTER_ATTRIBUTES', 'Link rel must contain unique tokens from the closed safe set');
      out.rel = tokens.join(' ');
    }
    if (out.linkTarget === '_blank' && !out.rel?.split(' ').includes('noopener'))
      fail('ADAPTER_ATTRIBUTES', 'New-window links must include noopener');
    if (!source) out.text = buttonText(nativeRichText(attrs.text), fail);
  }
  return out;
}
export function nativeBlockAttributes(kind, attrs, fail) {
  const a = nativeAttributes(kind, attrs, fail, true);
  if (nativeTextKind(kind)) {
    const { text, ...rest } = a;
    return {
      ...rest,
      content: nativeTextRichText(nativeTextHTML(text, kind)),
    };
  }
  return kind === 'details' ? { ...a, summary: escapeAdapterText(a.summary) } : a;
}
export const escapeAdapterText = (value) =>
  String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
export const escapeAdapterAttribute = (value) => escapeAdapterText(value).replaceAll('"', '&quot;');
let registry = [];
export const adapterDescriptors = () => registry;
const tags = ['div', 'p', 'span', 'strong', 'em', 'del', 'code'];
export function validateAdapterDescriptors(input, fail) {
  if (typeof input === 'string') {
    try {
      input = JSON.parse(input);
    } catch {
      fail('ADAPTER_REGISTRY', 'The adapter snapshot JSON is invalid');
    }
  }
  if (!Array.isArray(input) || input.length > 16)
    fail('ADAPTER_REGISTRY', 'At most 16 static adapters may be registered');
  const names = new Set(),
    blocks = new Set();
  const result = input.map((raw) => {
    closed(
      raw,
      ['schema', 'name', 'version', 'blockName', 'attributes', 'template'],
      ['schema', 'name', 'version', 'blockName', 'attributes', 'template'],
      fail,
    );
    if (
      raw.schema !== 1 ||
      typeof raw.name !== 'string' ||
      !/^[a-z][a-z0-9-]{0,63}$/.test(raw.name) ||
      typeof raw.version !== 'string' ||
      !/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(raw.version) ||
      typeof raw.blockName !== 'string' ||
      !/^[a-z][a-z0-9-]{0,63}\/[a-z][a-z0-9-]{0,63}$/.test(raw.blockName) ||
      raw.blockName.startsWith('core/') ||
      raw.blockName.startsWith('mbb/') ||
      names.has(raw.name) ||
      blocks.has(raw.blockName)
    )
      fail('ADAPTER_REGISTRY', 'Invalid or conflicting registration identity or version');
    names.add(raw.name);
    blocks.add(raw.blockName);
    if (
      !object(raw.attributes) ||
      !Object.keys(raw.attributes).length ||
      Object.keys(raw.attributes).length > 16
    )
      fail('ADAPTER_REGISTRY', 'Each adapter requires 1–16 fields');
    const attributes = {};
    for (const key of Object.keys(raw.attributes).sort()) {
      if (
        !/^[a-z][A-Za-z0-9_]{0,63}$/.test(key) ||
        [
          'mbbAdapterVersion',
          'className',
          'style',
          'anchor',
          'metadata',
          'lock',
          'align',
          'layout',
          'constructor',
          'prototype',
          '__proto__',
          'backgroundColor',
          'textColor',
          'borderColor',
          'gradient',
          'fontSize',
          'fontFamily',
          'allowedBlocks',
        ].includes(key)
      )
        fail('ADAPTER_REGISTRY', 'Invalid field name');
      const v = raw.attributes[key];
      if (v?.type === 'plainText') {
        closed(v, ['type', 'maxLength'], ['type', 'maxLength'], fail);
        if (!Number.isSafeInteger(v.maxLength) || v.maxLength < 1 || v.maxLength > 4096)
          fail('ADAPTER_REGISTRY', 'Invalid text length budget');
        attributes[key] = { type: v.type, maxLength: v.maxLength };
      } else if (v?.type === 'integer') {
        closed(v, ['type', 'minimum', 'maximum'], ['type', 'minimum', 'maximum'], fail);
        if (
          !Number.isSafeInteger(v.minimum) ||
          !Number.isSafeInteger(v.maximum) ||
          v.minimum > v.maximum
        )
          fail('ADAPTER_REGISTRY', 'Invalid integer budget');
        attributes[key] = {
          type: v.type,
          minimum: v.minimum === 0 ? 0 : v.minimum,
          maximum: v.maximum === 0 ? 0 : v.maximum,
        };
      } else if (v?.type === 'boolean') {
        closed(v, ['type'], ['type'], fail);
        attributes[key] = { type: v.type };
      } else if (v?.type === 'enum') {
        closed(v, ['type', 'values'], ['type', 'values'], fail);
        if (
          !Array.isArray(v.values) ||
          !v.values.length ||
          v.values.length > 16 ||
          new Set(v.values).size !== v.values.length
        )
          fail('ADAPTER_REGISTRY', 'Invalid enum declaration');
        v.values.forEach((x) => plain(x, 200, fail));
        attributes[key] = { type: v.type, values: [...v.values] };
      } else fail('ADAPTER_REGISTRY', 'Unknown field type');
    }
    let count = 0;
    const template = (v, depth) => {
      if (!object(v) || ++count > 64 || depth > 8)
        fail('ADAPTER_REGISTRY', 'Templates are limited to 64 nodes and 8 levels');
      if (Object.hasOwn(v, 'field')) {
        closed(v, ['field'], ['field'], fail);
        if (typeof v.field !== 'string' || !Object.hasOwn(attributes, v.field))
          fail('ADAPTER_REGISTRY', 'The template references an unknown field');
        return { field: v.field };
      }
      if (Object.hasOwn(v, 'text')) {
        closed(v, ['text'], ['text'], fail);
        return { text: plain(v.text, 4096, fail) };
      }
      closed(v, ['tag', 'class', 'children'], ['tag', 'children'], fail);
      if (!tags.includes(v.tag) || !Array.isArray(v.children))
        fail('ADAPTER_REGISTRY', 'Templates only allow fixed safe tags');
      const out = { tag: v.tag };
      if (Object.hasOwn(v, 'class')) {
        if (
          typeof v.class !== 'string' ||
          v.class.length > 200 ||
          !/^[A-Za-z][A-Za-z0-9_-]*(?: [A-Za-z][A-Za-z0-9_-]*)*$/.test(v.class)
        )
          fail('ADAPTER_REGISTRY', 'Invalid template class');
        out.class = v.class;
      }
      out.children = v.children.map((child) => template(child, depth + 1));
      if (
        out.children.some(
          (child) =>
            child.tag &&
            ((v.tag !== 'div' && ['div', 'p'].includes(child.tag)) || v.tag === 'code'),
        )
      )
        fail('ADAPTER_REGISTRY', 'Template tag nesting would change the saved structure');
      return out;
    };
    const node = template(raw.template, 1);
    if (!node.tag) fail('ADAPTER_REGISTRY', 'The template root must be a safe tag');
    const descriptor = {
      schema: 1,
      name: raw.name,
      version: raw.version,
      blockName: raw.blockName,
      attributes,
      template: node,
    };
    if (bytes(JSON.stringify(descriptor)) > 16384)
      fail('ADAPTER_REGISTRY', 'Each registration descriptor is limited to 16 KiB');
    return descriptor;
  });
  return result.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
export function configureBlockAdapters(input, fail) {
  registry = validateAdapterDescriptors(input, fail);
}
export const staticAdapterKind = (name) => registry.find((d) => d.blockName === name);
export function staticAdapterAttributes(descriptor, attrs, fail, source = false) {
  const keys = Object.keys(descriptor.attributes);
  closed(
    attrs,
    [...keys, ...(!source ? ['mbbAdapterVersion'] : [])],
    [...keys, ...(!source ? ['mbbAdapterVersion'] : [])],
    fail,
  );
  if (!source && attrs.mbbAdapterVersion !== descriptor.version)
    fail(
      'ADAPTER_VERSION',
      'The adapter version does not match. Original configuration is preserved but cannot convert new candidates',
    );
  const out = {};
  if (!source) out.mbbAdapterVersion = descriptor.version;
  for (const key of keys) {
    const field = descriptor.attributes[key],
      v = attrs[key];
    if (field.type === 'plainText') out[key] = plain(v, field.maxLength, fail);
    else if (field.type === 'integer') {
      if (!Number.isSafeInteger(v) || v < field.minimum || v > field.maximum)
        fail('ADAPTER_ATTRIBUTES', 'The integer exceeds its registered budget');
      out[key] = v === 0 ? 0 : v;
    } else if (field.type === 'boolean') {
      if (typeof v !== 'boolean') fail('ADAPTER_ATTRIBUTES', 'Invalid boolean field type');
      out[key] = v;
    } else {
      if (!field.values.includes(v))
        fail('ADAPTER_ATTRIBUTES', 'The enum value is not in the registered set');
      out[key] = v;
    }
  }
  return out;
}
export function adapterSourceAttributes(attrs, fail) {
  closed(attrs, ['name', 'version', 'attrs'], ['name', 'version', 'attrs'], fail);
  const descriptor = registry.find((d) => d.name === attrs.name && d.version === attrs.version);
  if (!descriptor)
    fail(
      'ADAPTER_VERSION',
      'The static adapter is missing or incompatible. Original configuration was not removed',
    );
  return {
    descriptor,
    attributes: {
      mbbAdapterVersion: descriptor.version,
      ...staticAdapterAttributes(descriptor, attrs.attrs, fail, true),
    },
  };
}
export function adapterHTML(descriptor, attributes) {
  const render = (node) => {
    if (Object.hasOwn(node, 'text')) return escapeAdapterText(node.text).replaceAll('&gt;', '>');
    if (Object.hasOwn(node, 'field')) return escapeAdapterText(attributes[node.field]);
    return (
      '<' +
      node.tag +
      (node.class ? ' class="' + escapeAdapterAttribute(node.class) + '"' : '') +
      '>' +
      node.children.map(render).join('') +
      '</' +
      node.tag +
      '>'
    );
  };
  return render(descriptor.template);
}

const ownedTypes = new Map(),
  parameterDrafts = new Map();
export const adapterDraftPending = () => parameterDrafts.size > 0;
export function registerStaticBlockAdapters(fail) {
  const e = wp.element.createElement;
  const props = (node) => (node.class ? { className: node.class } : null);
  const reactTemplate = (node, attrs) =>
    Object.hasOwn(node, 'text')
      ? node.text
      : Object.hasOwn(node, 'field')
        ? String(attrs[node.field])
        : e(node.tag, props(node), ...node.children.map((child) => reactTemplate(child, attrs)));
  for (const [name, fingerprint] of ownedTypes) {
    if (!registry.some((d) => d.blockName === name && JSON.stringify(d) === fingerprint)) {
      wp.blocks.unregisterBlockType(name);
      ownedTypes.delete(name);
    }
  }
  for (const d of registry) {
    if (ownedTypes.has(d.blockName)) continue;
    const existing = wp.blocks.getBlockType(d.blockName);
    if (existing)
      fail(
        'ADAPTER_REGISTRY',
        'An existing block with this name does not match the registered static template and will not be overwritten',
      );
    const attributes = { mbbAdapterVersion: { type: 'string' } };
    for (const [key, v] of Object.entries(d.attributes))
      attributes[key] = {
        type: { plainText: 'string', integer: 'number', boolean: 'boolean', enum: 'string' }[
          v.type
        ],
      };
    function Edit({ attributes: a, setAttributes, clientId }) {
      const initial = Object.fromEntries(Object.keys(d.attributes).map((key) => [key, a[key]]));
      const applied = JSON.stringify(initial, null, 2);
      const [raw, setRaw] = wp.element.useState(parameterDrafts.get(clientId)?.raw ?? applied),
        [error, setError] = wp.element.useState(parameterDrafts.get(clientId)?.error ?? '');
      const lock = () => {
        try {
          wp.data.dispatch('core/editor').lockPostSaving('mbb-adapter-' + clientId);
        } catch {}
      };
      const unlock = () => {
        try {
          wp.data.dispatch('core/editor').unlockPostSaving('mbb-adapter-' + clientId);
        } catch {}
      };
      wp.element.useEffect(() => {
        if (!parameterDrafts.has(clientId)) {
          setRaw(applied);
          setError('');
        }
      }, [applied]);
      wp.element.useEffect(
        () => () => {
          parameterDrafts.delete(clientId);
          unlock();
        },
        [],
      );
      const change = (value) => {
        setRaw(value);
        setError('');
        parameterDrafts.set(clientId, { raw: value, error: '' });
        lock();
      };
      const apply = () => {
        try {
          const value = JSON.parse(raw),
            normalized = staticAdapterAttributes(d, value, fail, true);
          setAttributes({ mbbAdapterVersion: d.version, ...normalized });
          parameterDrafts.delete(clientId);
          unlock();
          setError('');
        } catch (err) {
          setError(E(err));
          parameterDrafts.set(clientId, { raw, error: E(err) });
          lock();
        }
      };
      const initialize = () => {
        const value = Object.fromEntries(
          Object.entries(d.attributes).map(([key, v]) => [
            key,
            v.type === 'integer'
              ? v.minimum
              : v.type === 'boolean'
                ? false
                : v.type === 'enum'
                  ? v.values[0]
                  : '',
          ]),
        );
        change(JSON.stringify(value, null, 2));
      };
      return e(
        'div',
        wp.blockEditor.useBlockProps({ className: 'mbb-static-adapter-editor' }),
        e('strong', null, T('Static adapter ') + d.name + ' / ' + d.version),
        e(wp.components.TextareaControl, {
          label: T('Static adapter parameters (JSON)'),
          value: raw,
          onChange: change,
        }),
        error ? e('p', { role: 'alert' }, error) : null,
        e(
          'p',
          null,
          T('Parameters are data only. Explicitly apply or discard them. No code is executed.'),
        ),
        e(
          wp.components.Button,
          { variant: 'secondary', onClick: initialize },
          T('Prepare initial parameters'),
        ),
        e(wp.components.Button, { variant: 'primary', onClick: apply }, T('Apply parameters')),
        e(
          wp.components.Button,
          {
            variant: 'secondary',
            onClick: () => {
              parameterDrafts.delete(clientId);
              unlock();
              setRaw(applied);
              setError('');
            },
          },
          T('Discard parameter input'),
        ),
      );
    }
    wp.blocks.registerBlockType(d.blockName, {
      apiVersion: 3,
      title: T('Static adapter ') + d.name,
      category: 'widgets',
      attributes,
      supports: { className: false, customClassName: false, html: false, anchor: false },
      edit: Edit,
      save: ({ attributes: a }) => {
        try {
          return reactTemplate(d.template, staticAdapterAttributes(d, a, fail));
        } catch {
          return e('div', null, '静态适配参数尚未应用');
        }
      },
    });
    ownedTypes.set(d.blockName, JSON.stringify(d));
  }
  globalThis.MarkBridgeAdapterDrafts = { pending: adapterDraftPending };
}
export function validateAdaptersSerialized(serialized, fail, parse = JSON.parse) {
  for (const m of serialized.matchAll(
    /<!-- wp:([a-z0-9-]+(?:\/[a-z0-9-]+)?)(?: (\{[\s\S]*?\}))? -->/g,
  )) {
    const name = m[1].includes('/') ? m[1] : 'core/' + m[1],
      kind = nativeAdapterKind(name),
      descriptor = staticAdapterKind(name);
    if (!kind && !descriptor) continue;
    let a;
    try {
      a = parse(m[2] || '{}', fail);
    } catch {
      fail('ADAPTER_ATTRIBUTES', 'The block attribute JSON is invalid');
    }
    if (descriptor) staticAdapterAttributes(descriptor, a, fail);
    else {
      closed(
        a,
        {
          'native-code': ['anchor', 'className'],
          preformatted: ['anchor', 'className'],
          group: ['tagName', 'anchor', 'ariaLabel', 'className', 'layout'],
          details: ['showContent', 'anchor', 'name'],
          buttons: ['anchor', 'layout'],
          button: ['anchor', 'tagName', 'type'],
        }[kind],
        [],
        fail,
      );
      if (kind === 'group') nativeAttributes(kind, a, fail, true);
      if (nativeTextKind(kind)) {
        nativeAttributes(kind, { ...a, text: '' }, fail, true);
        const end = serialized.indexOf('<!-- /wp:' + m[1] + ' -->', m.index + m[0].length);
        if (end < 0) fail('ADAPTER_STRUCTURE', 'Invalid native block wrapper structure');
        const raw = serialized.slice(m.index + m[0].length, end);
        if (raw.includes('\r'))
          fail('ADAPTER_TEXT', 'Native text requires bounded plain text with LF line endings');
        const block = wp.blocks.parse(m[0] + raw + '<!-- /wp:' + m[1] + ' -->')[0];
        const attrs = nativeAttributes(kind, block.attributes, fail);
        const canonicalAttrs = {
          ...attrs,
          content: nativeTextRichText(attrs.content),
        };
        const coreHTML = wp.blocks.getSaveContent(name, canonicalAttrs, []);
        if (raw !== '\n' + coreHTML + '\n')
          fail('ADAPTER_TEXT', 'Native text HTML must match the canonical core save');
      }
      if (Object.hasOwn(a, 'anchor')) adapterAnchor(a.anchor, fail);
      if (
        kind === 'details' &&
        ((Object.hasOwn(a, 'showContent') && typeof a.showContent !== 'boolean') ||
          (Object.hasOwn(a, 'name') && a.name !== ''))
      )
        fail(
          'ADAPTER_ATTRIBUTES',
          'Raw details attributes have invalid types or non-neutral values',
        );
      if (kind === 'buttons' && Object.hasOwn(a, 'layout')) {
        closed(a.layout, ['type'], ['type'], fail);
        if (a.layout.type !== 'flex')
          fail('ADAPTER_ATTRIBUTES', 'Button groups only support the default flex layout');
      }
      if (
        kind === 'button' &&
        ((Object.hasOwn(a, 'tagName') && a.tagName !== 'a') ||
          (Object.hasOwn(a, 'type') && a.type !== 'button'))
      )
        fail('ADAPTER_ATTRIBUTES', 'Raw button attributes do not describe a link button');
    }
  }
}
