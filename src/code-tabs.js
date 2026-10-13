// Code tabs contain inert source text only. Markdown metadata never duplicates the fence language.
export const tabsLabel = (tab) => tab.title || tab.language || '代码';
export function codeTabsAttributes(attrs, source, fail) {
  const keys = source ? ['id', 'title', 'terminalNewline'] : ['id', 'title', 'language', 'code'];
  if (!Array.isArray(attrs.tabs) || attrs.tabs.length < 1 || attrs.tabs.length > 8)
    fail('CODE_TABS_STRUCTURE', '代码组需有 1–8 个版本');
  const ids = new Set();
  let bytes = 0;
  const tabs = attrs.tabs.map((tab) => {
    if (
      !tab ||
      Array.isArray(tab) ||
      typeof tab !== 'object' ||
      Object.keys(tab).length !== keys.length ||
      Object.keys(tab).some((key) => !keys.includes(key))
    )
      fail('CODE_TABS_ATTRIBUTES', '代码版本属性不完整或未知');
    if (
      typeof tab.id !== 'string' ||
      !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(tab.id) ||
      ids.has(tab.id)
    )
      fail('TEACHING_ID', '代码版本 ID 非法或重复');
    ids.add(tab.id);
    if (
      typeof tab.title !== 'string' ||
      [...tab.title].length > 200 ||
      /[\r\n\0\uD800-\uDFFF]/u.test(tab.title)
    )
      fail('TEACHING_TITLE', '代码版本标题需为空或不超过 200 字符的单行文字');
    if (source) {
      if (typeof tab.terminalNewline !== 'boolean')
        fail('CODE_TABS_ATTRIBUTES', '末尾换行标记需为布尔值');
    } else {
      if (typeof tab.language !== 'string' || !/^[A-Za-z0-9_+-]{0,64}$/.test(tab.language))
        fail('CODE_INFO', '代码语言需为最长 64 位安全 ASCII 标记');
      if (typeof tab.code !== 'string' || /[\0\uD800-\uDFFF]/u.test(tab.code))
        fail('CODE_TABS_CODE', '代码需为有效 Unicode，不得含 NUL');
      const size = new TextEncoder().encode(tab.code).length;
      bytes += size;
      if (size > 65536 || bytes > 131072)
        fail('CODE_TABS_LIMIT', '每版最多 64 KiB，全组最多 128 KiB');
    }
    return Object.fromEntries(keys.map((key) => [key, tab[key]]));
  });
  if (!ids.has(attrs.defaultTab)) fail('CODE_TABS_DEFAULT', '默认版本必须引用组内 ID');
  return tabs;
}
export function codeTabsMarkdown(a) {
  const tabs = a.tabs.map(({ id, title, code }) => ({
    id,
    title,
    terminalNewline: code.endsWith('\n'),
  }));
  const codes = a.tabs
    .map((tab) => {
      const runs = tab.code.match(/`+/g) || [];
      const fence = '`'.repeat(runs.reduce((n, s) => Math.max(n, s.length + 1), 3));
      return fence + tab.language + '\n' + tab.code + (tab.code.endsWith('\n') ? '' : '\n') + fence;
    })
    .join('\n\n');
  return (
    ':::mbb:v1 code-tabs ' +
    JSON.stringify({ id: a.id, defaultTab: a.defaultTab, tabs }) +
    '\n\n' +
    codes +
    '\n\n:::mbb:end'
  );
}
export function codeTabsSave(a, el) {
  return el(
    'div',
    wp.blockEditor.useBlockProps.save({ id: a.id }),
    ...(a.tabs || []).map((tab) =>
      el(
        'div',
        { id: tab.id, key: tab.id, className: 'mbb-code-tab' },
        el('p', { 'data-mbb-generated': '', className: 'mbb-code-tab-title' }, tabsLabel(tab)),
        el(
          'pre',
          {},
          el('code', tab.language ? { className: 'language-' + tab.language } : {}, tab.code),
        ),
      ),
    ),
  );
}
export function registerCodeTabs() {
  const el = wp.element.createElement;
  let serial = 0;
  const selections = new Map();
  const freshId = () =>
    'mbb-' +
    Date.now().toString(36) +
    '-' +
    (++serial).toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 12);
  const freshTab = () => ({ id: freshId(), title: '', language: '', code: '' });
  wp.blocks.registerBlockType('mbb/code-tabs', {
    apiVersion: 3,
    title: '多语言代码页签',
    category: 'text',
    attributes: {
      id: { type: 'string' },
      defaultTab: { type: 'string' },
      tabs: { type: 'array' },
      version: { type: 'number' },
    },
    supports: { html: false, customClassName: false, anchor: false },
    edit: ({ attributes: a, setAttributes, clientId }) => {
      const actions = wp.data.useDispatch('core/block-editor');
      const store = wp.data.useSelect((select) => select('core/block-editor'), []);
      const [selected, setSelected] = wp.element.useState(
        selections.get(clientId) ??
          Math.max(
            0,
            (a.tabs || []).findIndex((t) => t.id === a.defaultTab),
          ),
      );
      const select = (index) => {
        selections.set(clientId, index);
        if (selections.size > 2000) selections.delete(selections.keys().next().value);
        setSelected(index);
      };
      wp.element.useEffect(() => {
        if (a.version === undefined) {
          const tab = freshTab();
          setAttributes({ version: 1, id: freshId(), defaultTab: tab.id, tabs: [tab] });
          select(0);
        }
      }, []);
      const tabs = a.tabs || [],
        index = Math.max(0, Math.min(selected, tabs.length - 1)),
        tab = tabs[index];
      const update = (changes) =>
        setAttributes({
          tabs: tabs.map((t, i) => (i === index ? { ...t, ...changes } : t)),
          ...('id' in changes && a.defaultTab === tab.id ? { defaultTab: changes.id } : {}),
        });
      const action = (label, onClick, disabled = false) =>
        el(wp.components.Button, { variant: 'secondary', onClick, disabled }, label);
      const move = (delta) => {
        const reordered = [...tabs];
        [reordered[index], reordered[index + delta]] = [reordered[index + delta], reordered[index]];
        setAttributes({ tabs: reordered });
        select(index + delta);
      };
      const field = (label, key) =>
        el(wp.components.TextControl, {
          label,
          value: tab?.[key] || '',
          onChange: (value) => {
            update({ [key]: value });
          },
        });
      return el(
        'div',
        wp.blockEditor.useBlockProps({ className: 'mbb-code-tabs-editor mbb-teaching-editor' }),
        el(
          wp.blockEditor.InspectorControls,
          {},
          el(
            wp.components.PanelBody,
            { title: '代码组配置', initialOpen: true },
            el(wp.components.TextControl, {
              label: '代码组稳定 ID',
              value: a.id || '',
              onChange: (id) => setAttributes({ id }),
            }),
            tab
              ? el(
                  'div',
                  {},
                  field('版本稳定 ID', 'id'),
                  field('版本标题（可留空）', 'title'),
                  field('版本语言', 'language'),
                )
              : null,
            el(wp.components.SelectControl, {
              label: '默认代码版本',
              value: a.defaultTab || '',
              options: tabs.map((t) => ({ value: t.id, label: tabsLabel(t) })),
              onChange: (defaultTab) => setAttributes({ defaultTab }),
            }),
          ),
        ),
        el(
          'div',
          { role: 'tablist', 'aria-label': '代码版本' },
          ...tabs.map((t, i) =>
            el(
              'button',
              {
                key: i,
                id: 'mbb-editor-tab-' + clientId + '-' + i,
                type: 'button',
                role: 'tab',
                'aria-controls': 'mbb-editor-code-' + clientId,
                'aria-selected': index === i,
                tabIndex: index === i ? 0 : -1,
                onClick: () => select(i),
                onKeyDown: (event) => {
                  let next = index;
                  if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
                  else if (event.key === 'ArrowLeft')
                    next = (index + tabs.length - 1) % tabs.length;
                  else if (event.key === 'Home') next = 0;
                  else if (event.key === 'End') next = tabs.length - 1;
                  else return;
                  event.preventDefault();
                  select(next);
                  event.currentTarget.parentElement.children[next].focus();
                },
              },
              tabsLabel(t),
            ),
          ),
        ),
        tab
          ? el(
              'div',
              {
                id: 'mbb-editor-code-' + clientId,
                role: 'tabpanel',
                'aria-labelledby': 'mbb-editor-tab-' + clientId + '-' + index,
              },
              el(wp.components.TextareaControl, {
                label: '当前版本原代码',
                value: tab.code,
                help: /\r/.test(tab.code)
                  ? '原代码含 CR/CRLF；显示框可能以 LF 显示。切换与重开保留原字节；实际输入会按浏览器文本框换行保存。'
                  : '保留所有空白；允许空代码或没有末尾换行。',
                onChange: (code) => update({ code }),
              }),
            )
          : null,
        el(
          'p',
          {},
          `${tabs.length} / 8 个版本；${tabs.reduce((n, t) => n + new TextEncoder().encode(t.code).length, 0)} / 131072 字节`,
        ),
        action(
          '添加代码版本',
          () => {
            const t = freshTab();
            setAttributes({ tabs: [...tabs, t] });
            select(tabs.length);
          },
          tabs.length >= 8,
        ),
        action(
          '删除当前版本',
          () => {
            const remaining = tabs.filter((_, i) => i !== index);
            setAttributes({ tabs: remaining });
            select(Math.min(index, remaining.length - 1));
          },
          tabs.length <= 1 || a.defaultTab === tab?.id,
        ),
        a.defaultTab === tab?.id && tabs.length > 1
          ? el('p', {}, '删除默认版本前，请先明确选择其他默认版本。')
          : null,
        tabs.length === 1 ? action('删除整个代码组', () => actions.removeBlock(clientId)) : null,
        action('上移当前版本', () => move(-1), index === 0),
        action('下移当前版本', () => move(1), index === tabs.length - 1),
        action(
          '将当前版本设为默认',
          () => setAttributes({ defaultTab: tab.id }),
          !tab || a.defaultTab === tab.id,
        ),
        action('复制代码组', () => {
          const copies = tabs.map((t) => ({ ...t, id: freshId() }));
          const block = wp.blocks.createBlock('mbb/code-tabs', {
            version: 1,
            id: freshId(),
            defaultTab: copies[tabs.findIndex((t) => t.id === a.defaultTab)].id,
            tabs: copies,
          });
          actions.insertBlocks(
            block,
            store.getBlockIndex(clientId) + 1,
            store.getBlockRootClientId(clientId),
          );
        }),
      );
    },
    save: ({ attributes }) => codeTabsSave(attributes, el),
  });
}
