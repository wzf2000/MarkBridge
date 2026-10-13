// Closed native containers and trusted declarative static leaves; never execute article code.
const nativeNames = { details: 'core/details', buttons: 'core/buttons', button: 'core/button' };
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
    fail('ADAPTER_ATTRIBUTES', '纯文字字段类型、Unicode 或长度非法');
  return v;
};
const closed = (v, keys, required, fail) => {
  if (
    !object(v) ||
    Object.keys(v).some((k) => !keys.includes(k)) ||
    required.some((k) => !Object.hasOwn(v, k))
  )
    fail('ADAPTER_ATTRIBUTES', '适配属性缺失或包含未知字段');
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
    fail('ADAPTER_URL', '按钮链接协议或字符不安全');
  return value;
}
export function adapterAnchor(value, fail) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z][A-Za-z0-9_-]{0,63})?$/.test(value))
    fail('ADAPTER_ANCHOR', '锚点需为字母开头的 1–64 位 ASCII 字母、数字、下划线或连字符');
  return value;
}
const fragment = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.content;
};
export function plainSummary(html, fail) {
  plain(html, 4096, fail);
  if (/<\/?[A-Za-z]|<!/.test(html)) fail('ADAPTER_SUMMARY', '摘要只允许单行纯文字');
  const root = fragment(html);
  if ([...root.childNodes].some((n) => n.nodeType !== 3))
    fail('ADAPTER_SUMMARY', '摘要只允许单行纯文字');
  const value = plain(root.textContent, 200, fail, true);
  if (/[\r\n]/.test(value)) fail('ADAPTER_SUMMARY', '摘要只允许单行纯文字');
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
    fail('ADAPTER_INLINE', '按钮只允许受控文字格式');
  if (bytes(html) > 4096) fail('ADAPTER_LIMIT', '按钮文字最多 4 KiB');
  const root = fragment(html);
  let count = 0;
  const walk = (node, depth = 1) => {
    if (++count > 256 || depth > 16) fail('ADAPTER_LIMIT', '按钮文字最多 256 节点/16 层');
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
      fail('ADAPTER_INLINE', '按钮仅支持纯文字与 strong/em/del/code，不支持链接、图片或交互嵌套');
    [...node.childNodes].forEach((child) => walk(child, depth + 1));
  };
  [...root.childNodes].forEach((child) => walk(child));
  if (!nonblank(root.textContent)) fail('ADAPTER_INLINE', '按钮文字不能为空');
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
    fail('ADAPTER_STRUCTURE', '链接按钮必须恰好有一个受控文字段落');
  return buttonText(root.firstChild.innerHTML, fail);
}
const nativeRichText = (value) =>
  globalThis.wp?.richText?.RichTextData && value instanceof wp.richText.RichTextData
    ? value.toString()
    : value;
export function nativeAttributes(kind, attrs, fail, source = false) {
  if (!nativeAdapterKinds.has(kind)) fail('ADAPTER_KIND', '未知原生适配类型');
  const keys = {
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
    kind === 'details'
      ? ['summary']
      : kind === 'button'
        ? ['url', ...(!source ? ['text'] : [])]
        : [],
    fail,
  );
  const out = {};
  if (Object.hasOwn(attrs, 'anchor') && adapterAnchor(attrs.anchor, fail))
    out.anchor = attrs.anchor;
  if (kind === 'details') {
    if (Object.hasOwn(attrs, 'name') && attrs.name !== '')
      fail('ADAPTER_ATTRIBUTES', '互斥详情组尚不支持');
    out.summary = source
      ? plain(attrs.summary, 200, fail, true)
      : plainSummary(nativeRichText(attrs.summary), fail);
    if (/[\r\n]/.test(out.summary)) fail('ADAPTER_SUMMARY', '摘要只允许单行纯文字');
    if (Object.hasOwn(attrs, 'showContent') && typeof attrs.showContent !== 'boolean')
      fail('ADAPTER_ATTRIBUTES', '详情展开状态需为布尔值');
    out.showContent = attrs.showContent ?? false;
  } else if (kind === 'buttons') {
    if (
      Object.hasOwn(attrs, 'layout') &&
      (!object(attrs.layout) ||
        Object.keys(attrs.layout).length !== 1 ||
        attrs.layout.type !== 'flex')
    )
      fail('ADAPTER_ATTRIBUTES', '按钮组只支持默认 flex 布局');
    if (Object.hasOwn(attrs, 'layout')) out.layout = { type: 'flex' };
  } else {
    if (
      (Object.hasOwn(attrs, 'tagName') && attrs.tagName !== 'a') ||
      (Object.hasOwn(attrs, 'type') && attrs.type !== 'button')
    )
      fail('ADAPTER_ATTRIBUTES', '仅支持链接按钮，不支持动作按钮');
    out.url = adapterURL(attrs.url, fail);
    if (Object.hasOwn(attrs, 'title')) {
      plain(attrs.title, 200, fail);
      if (/[\r\n]/.test(attrs.title)) fail('ADAPTER_ATTRIBUTES', '链接标题必须单行');
      out.title = attrs.title;
    }
    if (Object.hasOwn(attrs, 'linkTarget')) {
      if (!['', '_self', '_blank'].includes(attrs.linkTarget))
        fail('ADAPTER_ATTRIBUTES', '链接 target 非法');
      out.linkTarget = attrs.linkTarget;
    }
    if (Object.hasOwn(attrs, 'rel')) {
      if (typeof attrs.rel !== 'string') fail('ADAPTER_ATTRIBUTES', '链接 rel 需为文字');
      const tokens = attrs.rel ? attrs.rel.split(' ') : [];
      if (
        tokens.length > 5 ||
        new Set(tokens).size !== tokens.length ||
        tokens.some((v) => !['noopener', 'noreferrer', 'nofollow', 'ugc', 'sponsored'].includes(v))
      )
        fail('ADAPTER_ATTRIBUTES', '链接 rel 必须为闭合、不重复的安全标记');
      out.rel = tokens.join(' ');
    }
    if (out.linkTarget === '_blank' && !out.rel?.split(' ').includes('noopener'))
      fail('ADAPTER_ATTRIBUTES', '新窗口链接必须含 noopener');
    if (!source) out.text = buttonText(nativeRichText(attrs.text), fail);
  }
  return out;
}
export function nativeBlockAttributes(kind, attrs, fail) {
  const a = nativeAttributes(kind, attrs, fail, true);
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
      fail('ADAPTER_REGISTRY', '适配快照 JSON 无效');
    }
  }
  if (!Array.isArray(input) || input.length > 16)
    fail('ADAPTER_REGISTRY', '最多登记 16 个静态适配器');
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
      fail('ADAPTER_REGISTRY', '登记身份/版本无效或冲突');
    names.add(raw.name);
    blocks.add(raw.blockName);
    if (
      !object(raw.attributes) ||
      !Object.keys(raw.attributes).length ||
      Object.keys(raw.attributes).length > 16
    )
      fail('ADAPTER_REGISTRY', '每个适配器需要 1–16 个字段');
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
        fail('ADAPTER_REGISTRY', '字段名称非法');
      const v = raw.attributes[key];
      if (v?.type === 'plainText') {
        closed(v, ['type', 'maxLength'], ['type', 'maxLength'], fail);
        if (!Number.isSafeInteger(v.maxLength) || v.maxLength < 1 || v.maxLength > 4096)
          fail('ADAPTER_REGISTRY', '文字长度预算非法');
        attributes[key] = { type: v.type, maxLength: v.maxLength };
      } else if (v?.type === 'integer') {
        closed(v, ['type', 'minimum', 'maximum'], ['type', 'minimum', 'maximum'], fail);
        if (
          !Number.isSafeInteger(v.minimum) ||
          !Number.isSafeInteger(v.maximum) ||
          v.minimum > v.maximum
        )
          fail('ADAPTER_REGISTRY', '整数预算非法');
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
          fail('ADAPTER_REGISTRY', '枚举声明非法');
        v.values.forEach((x) => plain(x, 200, fail));
        attributes[key] = { type: v.type, values: [...v.values] };
      } else fail('ADAPTER_REGISTRY', '未知字段类型');
    }
    let count = 0;
    const template = (v, depth) => {
      if (!object(v) || ++count > 64 || depth > 8)
        fail('ADAPTER_REGISTRY', '模板最多 64 节点/8 层');
      if (Object.hasOwn(v, 'field')) {
        closed(v, ['field'], ['field'], fail);
        if (typeof v.field !== 'string' || !Object.hasOwn(attributes, v.field))
          fail('ADAPTER_REGISTRY', '模板引用未知字段');
        return { field: v.field };
      }
      if (Object.hasOwn(v, 'text')) {
        closed(v, ['text'], ['text'], fail);
        return { text: plain(v.text, 4096, fail) };
      }
      closed(v, ['tag', 'class', 'children'], ['tag', 'children'], fail);
      if (!tags.includes(v.tag) || !Array.isArray(v.children))
        fail('ADAPTER_REGISTRY', '模板只允许固定安全标签');
      const out = { tag: v.tag };
      if (Object.hasOwn(v, 'class')) {
        if (
          typeof v.class !== 'string' ||
          v.class.length > 200 ||
          !/^[A-Za-z][A-Za-z0-9_-]*(?: [A-Za-z][A-Za-z0-9_-]*)*$/.test(v.class)
        )
          fail('ADAPTER_REGISTRY', '模板 class 非法');
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
        fail('ADAPTER_REGISTRY', '模板标签嵌套会改变保存结构');
      return out;
    };
    const node = template(raw.template, 1);
    if (!node.tag) fail('ADAPTER_REGISTRY', '模板根必须为安全标签');
    const descriptor = {
      schema: 1,
      name: raw.name,
      version: raw.version,
      blockName: raw.blockName,
      attributes,
      template: node,
    };
    if (bytes(JSON.stringify(descriptor)) > 16384)
      fail('ADAPTER_REGISTRY', '单个登记描述最多 16 KiB');
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
    fail('ADAPTER_VERSION', '适配版本不匹配，原配置保留但不能转换新候选');
  const out = {};
  if (!source) out.mbbAdapterVersion = descriptor.version;
  for (const key of keys) {
    const field = descriptor.attributes[key],
      v = attrs[key];
    if (field.type === 'plainText') out[key] = plain(v, field.maxLength, fail);
    else if (field.type === 'integer') {
      if (!Number.isSafeInteger(v) || v < field.minimum || v > field.maximum)
        fail('ADAPTER_ATTRIBUTES', '整数超出登记预算');
      out[key] = v === 0 ? 0 : v;
    } else if (field.type === 'boolean') {
      if (typeof v !== 'boolean') fail('ADAPTER_ATTRIBUTES', '布尔字段类型非法');
      out[key] = v;
    } else {
      if (!field.values.includes(v)) fail('ADAPTER_ATTRIBUTES', '枚举值不在登记集合中');
      out[key] = v;
    }
  }
  return out;
}
export function adapterSourceAttributes(attrs, fail) {
  closed(attrs, ['name', 'version', 'attrs'], ['name', 'version', 'attrs'], fail);
  const descriptor = registry.find((d) => d.name === attrs.name && d.version === attrs.version);
  if (!descriptor) fail('ADAPTER_VERSION', '静态适配器缺失或版本不兼容；原配置未删除');
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
    if (existing) fail('ADAPTER_REGISTRY', '已有同名区块不属于登记静态模板；不会覆盖原区块');
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
          setError(err.message);
          parameterDrafts.set(clientId, { raw, error: err.message });
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
        e('strong', null, '静态适配器 ' + d.name + ' / ' + d.version),
        e(wp.components.TextareaControl, {
          label: '静态适配器参数（JSON）',
          value: raw,
          onChange: change,
        }),
        error ? e('p', { role: 'alert' }, error) : null,
        e('p', null, '参数为纯数据，须明确应用或撤销；不执行代码。'),
        e(wp.components.Button, { variant: 'secondary', onClick: initialize }, '准备初始参数'),
        e(wp.components.Button, { variant: 'primary', onClick: apply }, '应用参数'),
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
          '撤销参数输入',
        ),
      );
    }
    wp.blocks.registerBlockType(d.blockName, {
      apiVersion: 3,
      title: '静态适配器 ' + d.name,
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
      fail('ADAPTER_ATTRIBUTES', '区块属性 JSON 非法');
    }
    if (descriptor) staticAdapterAttributes(descriptor, a, fail);
    else {
      closed(
        a,
        {
          details: ['showContent', 'anchor', 'name'],
          buttons: ['anchor', 'layout'],
          button: ['anchor', 'tagName', 'type'],
        }[kind],
        [],
        fail,
      );
      if (Object.hasOwn(a, 'anchor')) adapterAnchor(a.anchor, fail);
      if (
        kind === 'details' &&
        ((Object.hasOwn(a, 'showContent') && typeof a.showContent !== 'boolean') ||
          (Object.hasOwn(a, 'name') && a.name !== ''))
      )
        fail('ADAPTER_ATTRIBUTES', '详情原始属性类型或中性值非法');
      if (kind === 'buttons' && Object.hasOwn(a, 'layout')) {
        closed(a.layout, ['type'], ['type'], fail);
        if (a.layout.type !== 'flex') fail('ADAPTER_ATTRIBUTES', '按钮组仅支持默认 flex');
      }
      if (
        kind === 'button' &&
        ((Object.hasOwn(a, 'tagName') && a.tagName !== 'a') ||
          (Object.hasOwn(a, 'type') && a.type !== 'button'))
      )
        fail('ADAPTER_ATTRIBUTES', '按钮原始属性非链接按钮');
    }
  }
}
