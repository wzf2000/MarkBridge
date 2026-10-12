import { componentParams } from './component-data.js';
// Versioned teaching syntax has a closed schema. Bodies use the ordinary parser.
export const teachingSchemas = {
  component: { id: 'string', component: 'string', componentVersion: 'string', params: 'object' },
  collapse: { id: 'string', title: 'string', open: 'boolean' },
  steps: {
    id: 'string',
    title: 'string',
    mode: 'string',
    previous: 'boolean',
    next: 'boolean',
    full: 'boolean',
  },
  step: { id: 'string', title: 'string' },
  'code-compare': {
    id: 'string',
    leftTitle: 'string',
    rightTitle: 'string',
    leftHighlights: 'string',
    rightHighlights: 'string',
  },
};
export const sourceFields = {
  codeLeft: 'string',
  languageLeft: 'string',
  codeRight: 'string',
  languageRight: 'string',
};
export const teachingKind = (name) =>
  name?.startsWith('mbb/') && Object.hasOwn(teachingSchemas, name.slice(4)) ? name.slice(4) : null;
export function teachingAttributes(kind, attrs, fail, source = false) {
  const schema = {
    ...teachingSchemas[kind],
    ...(!source ? { version: 'number' } : {}),
    ...(kind === 'code-compare' && !source ? sourceFields : {}),
  };
  if (
    !attrs ||
    Array.isArray(attrs) ||
    typeof attrs !== 'object' ||
    Object.keys(attrs).length !== Object.keys(schema).length ||
    Object.keys(attrs).some((k) => !Object.hasOwn(schema, k) || typeof attrs[k] !== schema[k])
  )
    fail('TEACHING_ATTRIBUTES', '教学容器属性不完整、未知或类型非法');
  if (!source && attrs.version !== 1) fail('TEACHING_VERSION', '教学区块版本需为 1');
  if (Object.values(attrs).some((v) => typeof v === 'string' && /[\uD800-\uDFFF]/u.test(v)))
    fail('TEACHING_ATTRIBUTES', '教学属性必须为有效 Unicode');
  const out = Object.fromEntries(Object.keys(schema).map((key) => [key, attrs[key]]));
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(out.id))
    fail('TEACHING_ID', '教学 ID 需为字母开头的 1–64 位 ASCII 字母、数字、下划线或连字符');
  for (const key of ['title', 'leftTitle', 'rightTitle'])
    if (
      key in out &&
      (!out[key].replace(
        /[ \t\r\n\f\v\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/gu,
        '',
      ) ||
        [...out[key]].length > 200 ||
        /[\r\n\x00]/.test(out[key]))
    )
      fail('TEACHING_TITLE', '教学标题需为 1–200 字符的单行纯文字');
  if (kind === 'component') {
    if (
      !/^[a-z][a-z0-9-]{0,63}$/.test(out.component) ||
      !/^\d+\.\d+\.\d+$/.test(out.componentVersion)
    )
      fail('COMPONENT_VERSION', '组件名称或版本非法');
    componentParams(out.params, fail);
  }
  if (kind === 'steps' && (!['full', 'staged'].includes(out.mode) || out.full !== true))
    fail('TEACHING_MODE', '阶段模式需为 full/staged 且全文入口必须启用');
  if (kind === 'code-compare') {
    for (const key of ['leftHighlights', 'rightHighlights'])
      if (
        !/^(?:[1-9]\d*(?:,[1-9]\d*)*)?$/.test(out[key]) ||
        new Set(out[key].split(',')).size !== out[key].split(',').length
      )
        fail('TEACHING_LINES', '重点行需为不重复的正整数，以逗号分隔');
    if (!source)
      for (const side of ['Left', 'Right'])
        if (!/^[\w+-]*$/.test(out['language' + side]) || !out['code' + side].endsWith('\n'))
          fail('TEACHING_CODE', '代码语言非法或缺少结尾换行');
  }
  return out;
}
export function teachingJSON(raw, fail) {
  const tokens = raw.match(/"(?:\\.|[^"\\])*"|[^\s]/g) || [];
  const stack = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '{') stack.push(new Set());
    else if (token === '[') stack.push(null);
    else if (token === '}' || token === ']') stack.pop();
    else if (token.startsWith('"') && tokens[i + 1] === ':' && stack.at(-1)) {
      let key;
      try {
        key = JSON.parse(token);
      } catch {
        fail('TEACHING_ATTRIBUTES', '非法 JSON 属性');
      }
      if (stack.at(-1).has(key)) fail('TEACHING_ATTRIBUTES', '教学 JSON 属性重复');
      stack.at(-1).add(key);
    }
  }

  try {
    return JSON.parse(raw);
  } catch {
    fail('TEACHING_ATTRIBUTES', '教学属性需为合法 JSON 对象');
  }
}
export function validateTeachingSerialized(serialized, fail) {
  for (const m of serialized.matchAll(
    /<!-- wp:mbb\/(collapse|steps|step|code-compare|component)(?: (\{[\s\S]*?\}))? -->/g,
  ))
    teachingAttributes(m[1], teachingJSON(m[2] || '{}', fail), fail);
}
export function teachingSource(source, fail, ignored = new Set(), nonce) {
  const protectedHTML = [...source.matchAll(/<(pre|code)\b[^>]*>[\s\S]*?<\/\1>/gi)].map((m) => [
    m.index,
    m.index + m[0].length,
  ]);
  let offset = 0;
  return source
    .split('\n')
    .map((line, index) => {
      const start = offset;
      offset += line.length + 1;
      if (ignored.has(index) || protectedHTML.some(([a, b]) => start >= a && start < b))
        return line;
      if (/^ {0,3}<!--mbb-teaching/.test(line))
        fail('TEACHING_SYNTAX', '保留的内部教学标记不能作为 Markdown 输入');
      if (!line.startsWith(':::mbb:')) return line;
      let data;
      if (line === ':::mbb:end') data = { end: true };
      else {
        const match =
          /^:::mbb:v1 (collapse|steps|step|code-compare|component) (\{[^\r\n]*\})$/.exec(line);
        if (!match) fail('TEACHING_SYNTAX', '教学容器需使用完整的 :::mbb:v1 名称 JSON 属性');
        let attrs;
        try {
          attrs = teachingJSON(match[2], fail);
        } catch {
          fail('TEACHING_ATTRIBUTES', '教学属性需为合法 JSON 对象');
        }
        data = { kind: match[1], attrs: teachingAttributes(match[1], attrs, fail, true) };
      }
      const hex = [...new TextEncoder().encode(JSON.stringify(data))]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      return '<!--mbb-teaching ' + nonce + ':' + hex + '-->';
    })
    .join('\n');
}
export function teachingMarker(raw, nonce) {
  const m = /^<!--mbb-teaching ([0-9a-f]{32}):([0-9a-f]+)-->\s*$/.exec(raw);
  if (!m || m[1] !== nonce) return null;
  return JSON.parse(
    new TextDecoder().decode(Uint8Array.from(m[2].match(/../g), (v) => parseInt(v, 16))),
  );
}
export function assembleTeaching(blocks, make, fail) {
  const root = [],
    stack = [{ children: root }];
  for (const b of blocks) {
    if (!b.teachingMarker) {
      stack.at(-1).children.push(b);
      continue;
    }
    const data = b.teachingMarker;
    if (!data.end) {
      if (stack.length >= 32) fail('STRUCTURE_LIMIT', '教学容器总深度不得超过 31 层');
      stack.push({ ...data, children: [] });
      continue;
    }
    if (stack.length === 1) fail('TEACHING_STRUCTURE', '教学结束标记没有对应开始');
    const item = stack.pop();
    item.attrs.version = 1;
    if (item.kind === 'code-compare') {
      const [left, right, ...body] = item.children;
      if (left?.name !== 'mbb/code' || right?.name !== 'mbb/code')
        fail('TEACHING_CODE', '代码比较必须以两份围栏代码开始');
      Object.assign(item.attrs, {
        codeLeft: left.attributes.code,
        languageLeft: left.attributes.language || '',
        codeRight: right.attributes.code,
        languageRight: right.attributes.language || '',
      });
      item.children = body;
    }
    stack.at(-1).children.push(make('mbb/' + item.kind, item.attrs, item.children));
  }
  if (stack.length !== 1) fail('TEACHING_STRUCTURE', '教学容器缺少结束标记');
  validateTeaching(root, fail);
  return root;
}
export function validateTeaching(blocks, fail) {
  const ids = new Set();
  let count = 0;
  let groups = 0;
  function walk(list, parent = '', depth = 0, collapseDepth = 0) {
    for (const b of list) {
      if (depth > 32 || ++count > 10000) fail('STRUCTURE_LIMIT', '教学结构超出深度或节点数量边界');
      const kind = teachingKind(b.name),
        inner = b.innerBlocks || [];
      if (parent === 'steps' && kind !== 'step') fail('TEACHING_STRUCTURE', '阶段组只能包含阶段');
      if (kind) {
        const a = teachingAttributes(kind, b.attributes, fail);
        if (ids.has(a.id)) fail('TEACHING_ID', '教学 ID 在文档内必须唯一');
        ids.add(a.id);
        if (kind === 'steps' && (depth || ++groups > 1 || !inner.length))
          fail('TEACHING_STRUCTURE', '每篇文档只能有一个非空的顶层阶段组');
        if (kind === 'step' && parent !== 'steps')
          fail('TEACHING_STRUCTURE', '阶段只能作为阶段组直接子块');
        if ((kind === 'collapse' || kind === 'step' || kind === 'component') && !inner.length)
          fail('TEACHING_STRUCTURE', '教学正文不能为空');
        if (kind === 'collapse' && collapseDepth >= 3)
          fail('TEACHING_DEPTH', '折叠内容最多嵌套三层');
        if (kind === 'code-compare')
          for (const side of ['Left', 'Right'])
            if (
              a[side.toLowerCase() + 'Highlights']
                .split(',')
                .filter(Boolean)
                .some((v) => Number(v) > a['code' + side].split('\n').length - 1)
            )
              fail('TEACHING_LINES', '重点行超出对应代码范围');
      }
      walk(inner, kind || b.name, depth + 1, collapseDepth + (kind === 'collapse' ? 1 : 0));
    }
  }
  const anchors = [];
  function collect(list) {
    for (const b of list) {
      if (!teachingKind(b.name)) {
        const raw =
          b.name === 'core/html'
            ? (b.innerContent?.join('') ?? b.attributes?.content)
            : b.attributes?.content;
        if (typeof raw === 'string') {
          const template = document.createElement('template');
          template.innerHTML = raw;
          for (const node of template.content.querySelectorAll('[id]')) anchors.push(node.id);
        }
      }
      collect(b.innerBlocks || []);
    }
  }
  collect(blocks);
  walk(blocks);
  if (anchors.some((id) => ids.has(id))) fail('TEACHING_ID', '教学 ID 与正文锚点冲突');
}
export function teachingMarkdown(b, body, fail) {
  const kind = teachingKind(b.name);
  const a = teachingAttributes(kind, b.attributes, fail);
  const attrs = Object.fromEntries(Object.keys(teachingSchemas[kind]).map((key) => [key, a[key]]));
  const code = (side) => {
    const value = a['code' + side];
    const fence = '`'.repeat(Math.max(3, ...(value.match(/`+/g) || []).map((s) => s.length + 1)));
    return fence + a['language' + side] + '\n' + value + fence + '\n\n';
  };
  return (
    ':::mbb:v1 ' +
    kind +
    ' ' +
    JSON.stringify(attrs) +
    '\n\n' +
    (kind === 'code-compare' ? code('Left') + code('Right') : '') +
    body.trimEnd() +
    '\n\n:::mbb:end'
  );
}
export function registerTeaching() {
  const el = wp.element.createElement;
  const drafts = new Map();
  const syncDraftLock = () => {
    window.MarkBridgeParameterDrafts = { pending: () => drafts.size > 0 };
    try {
      const editor = wp.data.dispatch('core/editor');
      if (drafts.size) editor.lockPostSaving('mbb-component-params');
      else editor.unlockPostSaving('mbb-component-params');
    } catch {}
  };
  const ParameterEditor = ({ value, onCommit, clientId }) => {
    const original = JSON.stringify(value || {}, null, 2);
    const [raw, setRaw] = wp.element.useState(drafts.get(clientId)?.raw ?? original);
    const [error, setError] = wp.element.useState(drafts.get(clientId)?.error || '');
    wp.element.useEffect(() => {
      if (!drafts.has(clientId)) {
        setRaw(original);
        setError('');
      }
    }, [original]);
    const change = (text) => {
      setRaw(text);
      setError('');
      if (text === original) drafts.delete(clientId);
      else drafts.set(clientId, { raw: text, error: '', baseline: original });
      syncDraftLock();
    };
    const commit = () => {
      try {
        const parsed = teachingJSON(raw, (code, message) => {
          throw new Error(message);
        });
        componentParams(parsed, (code, message) => {
          throw new Error(message);
        });
        onCommit(parsed);
        drafts.delete(clientId);
        syncDraftLock();
        setError('');
      } catch (e) {
        setError(e.message);
        drafts.set(clientId, {
          raw,
          error: e.message,
          baseline: drafts.get(clientId)?.baseline || original,
        });
        syncDraftLock();
      }
    };
    return el(
      'div',
      {},
      el(wp.components.TextareaControl, {
        label: '参数 JSON（纯数据）',
        value: raw,
        help:
          (error ? error + ' 输入尚未应用，文章保存已暂停。' : '') ||
          (drafts.has(clientId)
            ? drafts.get(clientId).baseline !== original
              ? '已应用配置已变化；当前候选仍保留，尚未应用。保存已暂停。'
              : '参数尚未应用，文章保存已暂停。应用或撤销后继续。'
            : '编辑后明确应用；保存时由服务端登记 schema 校验。'),
        onChange: change,
      }),
      el(wp.components.Button, { variant: 'secondary', onClick: commit }, '应用参数'),
      el(
        wp.components.Button,
        {
          variant: 'tertiary',
          onClick: () => {
            drafts.delete(clientId);
            syncDraftLock();
            setRaw(original);
            setError('');
          },
        },
        '撤销参数输入',
      ),
    );
  };

  for (const [kind, schema] of Object.entries(teachingSchemas)) {
    const name = 'mbb/' + kind;
    if (wp.blocks.getBlockType(name)) continue;
    wp.blocks.registerBlockType(name, {
      apiVersion: 3,
      title: {
        component: '教学组件',
        collapse: '折叠内容',
        steps: '阶段导览',
        step: '阶段',
        'code-compare': '代码比较',
      }[kind],
      category: 'text',
      ...(kind === 'step' ? { parent: ['mbb/steps'] } : {}),
      attributes: Object.fromEntries(
        Object.entries({
          ...schema,
          version: 'number',
          ...(kind === 'code-compare' ? sourceFields : {}),
        }).map(([key, type]) => [key, { type }]),
      ),
      supports: { html: false, customClassName: false, anchor: false },
      edit: ({ attributes: a, setAttributes, clientId }) => {
        wp.element.useEffect(
          () => () => {
            drafts.delete(clientId);
            syncDraftLock();
          },
          [],
        );
        wp.element.useEffect(() => {
          const initial = a.version === undefined ? { version: 1 } : {};
          for (const [key, type] of Object.entries(schema))
            if (a[key] === undefined)
              initial[key] =
                key === 'params'
                  ? window.MBBComponents?.[0]?.defaults || {}
                  : key === 'component'
                    ? window.MBBComponents?.[0]?.id || ''
                    : key === 'componentVersion'
                      ? window.MBBComponents?.[0]?.version || ''
                      : key === 'id'
                        ? 'mbb-' + clientId
                        : type === 'boolean'
                          ? key !== 'open'
                          : key.endsWith('Highlights')
                            ? ''
                            : key === 'mode'
                              ? 'full'
                              : kind === 'code-compare'
                                ? key === 'leftTitle'
                                  ? '原代码'
                                  : '新代码'
                                : '标题';
          if (kind === 'code-compare')
            for (const key of Object.keys(sourceFields))
              if (a[key] === undefined) initial[key] = key.startsWith('code') ? '\n' : '';
          if (Object.keys(initial).length) setAttributes(initial);
        }, []);
        const controls = Object.entries({
          ...schema,
          ...(kind === 'code-compare' ? sourceFields : {}),
        })
          .filter(
            ([key]) =>
              key !== 'full' &&
              !(kind === 'component' && ['component', 'componentVersion'].includes(key)),
          )
          .map(([key, type]) =>
            key === 'params'
              ? el(ParameterEditor, {
                  key,
                  value: a.params,
                  clientId,
                  onCommit: (params) => setAttributes({ params }),
                })
              : el(
                  key === 'mode'
                    ? wp.components.SelectControl
                    : type === 'boolean'
                      ? wp.components.ToggleControl
                      : key === 'params' || key.startsWith('code')
                        ? wp.components.TextareaControl
                        : wp.components.TextControl,
                  {
                    key,
                    ...(key === 'mode'
                      ? {
                          options: [
                            { label: '全文', value: 'full' },
                            { label: '分阶段', value: 'staged' },
                          ],
                        }
                      : {}),
                    help:
                      key === 'params' || key.startsWith('code')
                        ? '源码必须保留末尾换行；使用下方按钮显式补上。'
                        : undefined,
                    label: {
                      component: '组件类型',
                      componentVersion: '组件版本',
                      params: '参数 JSON（纯数据，保存时验证）',
                      id: '稳定 ID',
                      title: '标题',
                      open: '默认展开',
                      previous: '上一阶段',
                      next: '下一阶段',
                      full: '全文模式',
                      leftTitle: '左侧标题',
                      rightTitle: '右侧标题',
                      mode: '阅读模式（full / staged）',
                      leftHighlights: '左侧重点行（逗号分隔）',
                      rightHighlights: '右侧重点行（逗号分隔）',
                      codeLeft: '左侧原代码',
                      codeRight: '右侧原代码',
                      languageLeft: '左侧语言',
                      languageRight: '右侧语言',
                    }[key],
                    ...(type === 'boolean'
                      ? { checked: !!a[key] }
                      : {
                          value:
                            key === 'params' ? JSON.stringify(a[key] || {}, null, 2) : a[key] || '',
                        }),
                    onChange: (value) => {
                      if (key === 'params') {
                        try {
                          const parsed = teachingJSON(value, () => {
                            throw new Error('JSON');
                          });
                          componentParams(parsed, () => {
                            throw new Error('params');
                          });
                          setAttributes({ params: parsed });
                        } catch {}
                      } else setAttributes({ [key]: value });
                    },
                  },
                ),
          );
        const field = (key) => controls.find((control) => control.key === key);
        const visible =
          kind === 'code-compare'
            ? ['leftTitle', 'rightTitle', 'codeLeft', 'codeRight', 'languageLeft', 'languageRight']
            : ['title'];
        const appendNewline = (side) =>
          el(
            wp.components.Button,
            {
              variant: 'secondary',
              disabled: (a['code' + side] || '').endsWith('\n'),
              onClick: () => setAttributes({ ['code' + side]: (a['code' + side] || '') + '\n' }),
            },
            '为' + (side === 'Left' ? '左' : '右') + '侧源码补末尾换行',
          );
        return el(
          'div',
          wp.blockEditor.useBlockProps({ className: 'mbb-teaching-editor' }),
          el(
            wp.blockEditor.InspectorControls,
            {},
            el(
              wp.components.PanelBody,
              { title: '教学配置', initialOpen: true },
              kind === 'component'
                ? el(wp.components.SelectControl, {
                    label: '登记的教学组件',
                    value: (a.component || '') + '@' + (a.componentVersion || ''),
                    options: [
                      ...((window.MBBComponents || []).some(
                        (p) => p.id === a.component && p.version === a.componentVersion,
                      )
                        ? []
                        : [
                            {
                              label:
                                '保留当前组件 ' +
                                (a.component || '待选择') +
                                ' ' +
                                (a.componentVersion || ''),
                              value: (a.component || '') + '@' + (a.componentVersion || ''),
                            },
                          ]),
                      ...(window.MBBComponents || []).map((p) => ({
                        label: p.title + ' ' + p.version,
                        value: p.id + '@' + p.version,
                      })),
                    ],
                    onChange: (key) => {
                      const p = (window.MBBComponents || []).find(
                        (p) => p.id + '@' + p.version === key,
                      );
                      if (p)
                        setAttributes({
                          component: p.id,
                          componentVersion: p.version,
                          params: p.defaults,
                        });
                    },
                  })
                : null,
              ...controls.filter((control) => !visible.includes(control.key)),
              kind === 'component'
                ? el(
                    'div',
                    {
                      'data-mbb-generated': '',
                      'data-mbb-teaching': 'component',
                      'data-mbb-teaching-config': JSON.stringify({
                        component: a.component,
                        componentVersion: a.componentVersion,
                        params: a.params,
                        status: (window.MBBComponents || []).some(
                          (p) => p.id === a.component && p.version === a.componentVersion,
                        )
                          ? 'available'
                          : 'missing',
                        provider: (window.MBBComponents || []).find(
                          (p) => p.id === a.component && p.version === a.componentVersion,
                        ),
                      }),
                    },
                    el(
                      'div',
                      { className: 'mbb-teaching-body' },
                      '编辑器交互预览；正文静态替代在下方编辑。',
                    ),
                  )
                : null,
            ),
          ),
          el(
            'p',
            { className: 'mbb-teaching-editor-label' },
            {
              component: '教学组件',
              collapse: '折叠内容',
              steps: '阶段导览',
              step: '阶段',
              'code-compare': '代码比较',
            }[kind],
          ),
          kind === 'code-compare'
            ? el(
                'div',
                { className: 'mbb-teaching-editor-columns' },
                ...['Left', 'Right'].map((side) =>
                  el(
                    'div',
                    { key: side },
                    field(side.toLowerCase() + 'Title'),
                    field('language' + side),
                    field('code' + side),
                    appendNewline(side),
                  ),
                ),
              )
            : kind === 'component'
              ? el(
                  'p',
                  {},
                  (a.component || '请在右侧选择教学组件') + ' ' + (a.componentVersion || ''),
                )
              : field('title'),

          el(
            wp.blockEditor.InnerBlocks,
            kind === 'steps'
              ? { allowedBlocks: ['mbb/step'], template: [['mbb/step']], templateLock: false }
              : {},
          ),
        );
      },
      save: ({ attributes: a }) =>
        el(
          'div',
          wp.blockEditor.useBlockProps.save({ id: a.id }),
          kind === 'code-compare'
            ? ['Left', 'Right'].map((side) =>
                el(
                  'div',
                  { key: side, className: 'mbb-compare-' + side.toLowerCase() },
                  el('p', { 'data-mbb-generated': '' }, a[side.toLowerCase() + 'Title']),
                  el(
                    'pre',
                    {},
                    el(
                      'code',
                      a['language' + side] ? { className: 'language-' + a['language' + side] } : {},
                      a['code' + side],
                    ),
                  ),
                ),
              )
            : kind === 'component'
              ? el(
                  'p',
                  { 'data-mbb-generated': '', className: 'mbb-component-params' },
                  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(a.params)))),
                )
              : el('p', { className: 'mbb-teaching-title', 'data-mbb-generated': '' }, a.title),
          el('div', { className: 'mbb-teaching-body' }, el(wp.blockEditor.InnerBlocks.Content)),
        ),
    });
  }
}
