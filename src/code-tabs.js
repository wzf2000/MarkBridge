import { translate as T, format as F } from './i18n.js';
// Code tabs contain inert source text only. Markdown metadata never duplicates the fence language.
const languageLabel = (language) =>
  ({
    __proto__: null,
    javascript: 'JavaScript',
    js: 'JavaScript',
    typescript: 'TypeScript',
    ts: 'TypeScript',
    python: 'Python',
    py: 'Python',
    cpp: 'C++',
    c: 'C',
    csharp: 'C#',
    cs: 'C#',
    java: 'Java',
    ruby: 'Ruby',
    rb: 'Ruby',
    rust: 'Rust',
    go: 'Go',
    php: 'PHP',
    swift: 'Swift',
    kotlin: 'Kotlin',
    sql: 'SQL',
    html: 'HTML',
    css: 'CSS',
    json: 'JSON',
    bash: 'Bash',
    shell: 'Shell',
    text: 'Text',
    plaintext: 'Text',
  })[language.toLowerCase()] ||
  language ||
  T('Code');
const displayLabel = (tab) => tab.title || tab.language || T('Code');
export const tabsLabel = (tab) => tab.title || tab.language || '代码';
// Displayed line numbers are metadata; original source bytes remain untouched.
export function codeTabLines(tab, source, fail) {
  const count = source
    ? null
    : Math.max(
        1,
        tab.code
          .replace(/\r\n|\r/g, '\n')
          .replace(/\n$/, '')
          .split('\n').length,
      );
  if (
    !Number.isInteger(tab.startLine) ||
    tab.startLine < 1 ||
    tab.startLine > 999999 ||
    (count !== null && tab.startLine + count - 1 > 999999)
  )
    fail('CODE_TABS_LINES', 'Code line numbers must remain between 1 and 999999');
  if (
    typeof tab.highlights !== 'string' ||
    tab.highlights.length > 512 ||
    !/^(?:[1-9]\d{0,5}(?:-[1-9]\d{0,5})?(?:,[1-9]\d{0,5}(?:-[1-9]\d{0,5})?)*)?$/.test(
      tab.highlights,
    )
  )
    fail('CODE_TABS_LINES', 'Highlights require comma-separated lines or closed ranges');
  const ranges = tab.highlights
    ? tab.highlights.split(',').map((x) => x.split('-').map(Number))
    : [];
  if (ranges.length > 32) fail('CODE_TABS_LINES', 'At most 32 highlighted ranges are allowed');
  let previous = 0;
  for (const [start, end = start] of ranges) {
    if (
      start < tab.startLine ||
      end < start ||
      start <= previous ||
      (count !== null && end >= tab.startLine + count)
    )
      fail('CODE_TABS_LINES', 'Highlighted ranges must be ordered, disjoint and within the code');
    previous = end;
  }
  return ranges;
}
export function codeTabsAttributes(attrs, source, fail) {
  const keys = [
    ...(source ? ['id', 'title', 'terminalNewline'] : ['id', 'title', 'language', 'code']),
    ...(attrs.version === 2 ? ['startLine', 'highlights'] : []),
  ];
  if (!Array.isArray(attrs.tabs) || attrs.tabs.length < 1 || attrs.tabs.length > 8)
    fail('CODE_TABS_STRUCTURE', 'A code group requires 1–8 versions');
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
      fail('CODE_TABS_ATTRIBUTES', 'Code version attributes are incomplete or unknown');
    if (
      typeof tab.id !== 'string' ||
      !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(tab.id) ||
      ids.has(tab.id)
    )
      fail('TEACHING_ID', 'Code version IDs are invalid or duplicated');
    ids.add(tab.id);
    if (
      typeof tab.title !== 'string' ||
      [...tab.title].length > 200 ||
      /[\r\n\0\uD800-\uDFFF]/u.test(tab.title)
    )
      fail(
        'TEACHING_TITLE',
        'A code version title must be empty or single-line text of at most 200 characters',
      );
    if (source) {
      if (typeof tab.terminalNewline !== 'boolean')
        fail('CODE_TABS_ATTRIBUTES', 'The terminal newline marker must be boolean');
    } else {
      if (typeof tab.language !== 'string' || !/^[A-Za-z0-9_+-]{0,64}$/.test(tab.language))
        fail('CODE_INFO', 'The code language must be a safe ASCII token of at most 64 characters');
      if (typeof tab.code !== 'string' || /[\0\uD800-\uDFFF]/u.test(tab.code))
        fail('CODE_TABS_CODE', 'Code must be valid Unicode without NUL');
      const size = new TextEncoder().encode(tab.code).length;
      bytes += size;
      if (size > 65536 || bytes > 131072)
        fail('CODE_TABS_LIMIT', 'Each version is limited to 64 KiB and the group to 128 KiB');
    }
    if (attrs.version === 2) codeTabLines(tab, source, fail);
    return Object.fromEntries(keys.map((key) => [key, tab[key]]));
  });
  if (!ids.has(attrs.defaultTab))
    fail('CODE_TABS_DEFAULT', 'The default version must reference an ID in the group');
  return tabs;
}
export function codeTabsMarkdown(a) {
  const tabs = a.tabs.map(({ id, title, code, startLine, highlights }) => ({
    id,
    title,
    terminalNewline: code.endsWith('\n'),
    ...(a.version === 2 ? { startLine, highlights } : {}),
  }));
  const codes = a.tabs
    .map((tab) => {
      const runs = tab.code.match(/`+/g) || [];
      const fence = '`'.repeat(runs.reduce((n, s) => Math.max(n, s.length + 1), 3));
      return fence + tab.language + '\n' + tab.code + (tab.code.endsWith('\n') ? '' : '\n') + fence;
    })
    .join('\n\n');
  return (
    ':::mbb:v' +
    a.version +
    ' code-tabs ' +
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
        ...(a.version === 2
          ? [
              el(
                'p',
                { 'data-mbb-generated': '', className: 'mbb-code-line-summary' },
                'Starting line: ' +
                  tab.startLine +
                  (tab.highlights ? '; highlights: ' + tab.highlights : ''),
              ),
            ]
          : []),
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
    title: T('Multilingual code tabs'),
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
      const updateLines = (changes) =>
        setAttributes({
          version: 2,
          tabs: tabs.map((t, i) => ({
            startLine: 1,
            highlights: '',
            ...t,
            ...(i === index ? changes : {}),
          })),
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
            { title: T('Code group settings'), initialOpen: true },
            el(wp.components.TextControl, {
              label: T('Stable code group ID'),
              value: a.id || '',
              onChange: (id) => setAttributes({ id }),
            }),
            tab
              ? el(
                  'div',
                  {},
                  field(T('Stable version ID'), 'id'),
                  field(T('Version title (optional)'), 'title'),
                  field(T('Version language'), 'language'),
                  el(wp.components.TextControl, {
                    label: T('Starting line number'),
                    type: 'number',
                    min: 1,
                    max: 999999,
                    value: tab.startLine ?? 1,
                    onChange: (value) => updateLines({ startLine: Number(value) }),
                  }),
                  el(wp.components.TextControl, {
                    label: T('Highlighted lines or ranges'),
                    help: T('Use displayed line numbers, for example 12,15-18.'),
                    value: tab.highlights ?? '',
                    onChange: (value) => updateLines({ highlights: value }),
                  }),
                )
              : null,
            el(wp.components.SelectControl, {
              label: T('Default code version'),
              value: a.defaultTab || '',
              options: tabs.map((t) => ({ value: t.id, label: displayLabel(t) })),
              onChange: (defaultTab) => setAttributes({ defaultTab }),
            }),
          ),
        ),
        el(
          'div',
          { role: 'tablist', 'aria-label': T('Code versions') },
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
              languageLabel(t.language || ''),
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
                label: T('Original code for the current version'),
                value: tab.code,
                help: /\r/.test(tab.code)
                  ? T(
                      "The original code contains CR/CRLF and may display as LF here. Switching and reopening preserve original bytes; actual input uses the browser textarea's newlines.",
                    )
                  : T(
                      'All whitespace is preserved. Empty code and code without a trailing newline are allowed.',
                    ),
                onChange: (code) => update({ code }),
              }),
            )
          : null,
        el(
          'p',
          {},
          F(
            T('%1$s / 8 versions; %2$s / 131072 bytes'),
            tabs.length,
            tabs.reduce((n, t) => n + new TextEncoder().encode(t.code).length, 0),
          ),
        ),
        action(
          T('Add code version'),
          () => {
            const t = freshTab();
            setAttributes({
              tabs: [...tabs, a.version === 2 ? { ...t, startLine: 1, highlights: '' } : t],
            });
            select(tabs.length);
          },
          tabs.length >= 8,
        ),
        action(
          T('Delete current version'),
          () => {
            const remaining = tabs.filter((_, i) => i !== index);
            setAttributes({ tabs: remaining });
            select(Math.min(index, remaining.length - 1));
          },
          tabs.length <= 1 || a.defaultTab === tab?.id,
        ),
        a.defaultTab === tab?.id && tabs.length > 1
          ? el(
              'p',
              {},
              T(
                'Choose a different default version explicitly before deleting the default version.',
              ),
            )
          : null,
        tabs.length === 1
          ? action(T('Delete entire code group'), () => actions.removeBlock(clientId))
          : null,
        action(T('Move current version up'), () => move(-1), index === 0),
        action(T('Move current version down'), () => move(1), index === tabs.length - 1),
        action(
          T('Set current version as default'),
          () => setAttributes({ defaultTab: tab.id }),
          !tab || a.defaultTab === tab.id,
        ),
        action(T('Duplicate code group'), () => {
          const copies = tabs.map((t) => ({ ...t, id: freshId() }));
          const block = wp.blocks.createBlock('mbb/code-tabs', {
            version: a.version,
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
