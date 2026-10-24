const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const plugin = path.resolve(__dirname, '../../plugin');
const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const found = [];
  errors.set(page, found);
  page.on('pageerror', (error) => found.push(error.message));
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
const tabs = [
  { id: 'javascript', title: '', language: 'javascript', code: 'const x = 1;\r\n\t// raw  ' },
  { id: 'python', title: 'Python 版本', language: 'python', code: 'print(1)\n' },
];
const escape = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
function markup(id = 'examples', values = tabs) {
  const shown =
    Array.isArray(values) && values.every((t) => t && typeof t.code === 'string') ? values : tabs;
  return `<div id="${id}" class="wp-block-mbb-code-tabs" data-mbb-teaching="code-tabs" data-mbb-teaching-config="${escape(JSON.stringify({ defaultTab: values?.[0]?.id, tabs: values }))}">${shown.map((t) => `<div class="mbb-code-tab" id="${t.id}"><p data-mbb-generated class="mbb-code-tab-title">${t.title || t.language}</p><pre><code class="language-${t.language}">${escape(t.code)}</code></pre></div>`).join('')}</div>`;
}
const languageEntries = require('../../plugin/vendor/prism/components.json').languages;
const knownLanguages = [
  'text',
  'plain',
  'plaintext',
  'none',
  ...Object.entries(languageEntries)
    .filter(([id]) =>
      fs.existsSync(path.join(plugin, 'vendor/prism/components/prism-' + id + '.min.js')),
    )
    .flatMap(([id, entry]) => [
      id,
      ...(Array.isArray(entry.alias) ? entry.alias : entry.alias ? [entry.alias] : []),
    ]),
];
async function highlight(page) {
  await page.evaluate(() => (window.Prism = { manual: true }));
  await page.addScriptTag({ path: path.join(plugin, 'vendor/clipboard/clipboard.min.js') });
  for (const file of [
    'prism.js',
    'plugins/line-numbers/prism-line-numbers.js',
    'plugins/toolbar/prism-toolbar.js',
    'plugins/copy-to-clipboard/prism-copy-to-clipboard.js',
    'plugins/autoloader/prism-autoloader.js',
  ])
    await page.addScriptTag({ path: path.join(plugin, 'vendor/prism', file) });
  // The real presentation loader consumes fixed local resource configuration.
  await page.evaluate(
    (codeLanguages) =>
      (window.MBB_PRESENTATION = {
        codeLanguages,
        codeStyles: [],
        codeScripts: [],
        lineNumbers: true,
        languages: '/plugin/vendor/prism/components/',
        images: [],
      }),
    knownLanguages,
  );
  await page.addScriptTag({
    content: fs.readFileSync(path.join(plugin, 'presentation-loader.js'), 'utf8'),
  });
}
async function load(page, enhance = true, body = markup()) {
  await page.goto('/health');
  await page.setContent(
    `<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:16px;font:16px/1.6 sans-serif}${fs.readFileSync(path.join(plugin, 'teaching.css'), 'utf8')}${fs.readFileSync(path.join(plugin, 'code-display.css'), 'utf8')}${fs.readFileSync(path.join(plugin, 'vendor/prism/plugins/line-numbers/prism-line-numbers.css'), 'utf8')}</style><article>${body}</article>`,
  );
  await page.addScriptTag({ url: '/fixture-localization.js?locale=zh_CN' });
  if (enhance)
    await page.addScriptTag({ content: fs.readFileSync(path.join(plugin, 'teaching.js'), 'utf8') });
}
test('static and print retain every code version; enhancement keyboard/history/reveal retains nodes', async ({
  page,
}) => {
  await load(page, false);
  await expect(page.locator('#javascript')).toBeVisible();
  await expect(page.locator('#python')).toBeVisible();
  await page.evaluate(() => (window.original = document.getElementById('python')));
  await page.addScriptTag({ content: fs.readFileSync(path.join(plugin, 'teaching.js'), 'utf8') });
  await expect(page.locator('#python')).toBeHidden();
  await page.evaluate(() =>
    history.replaceState({ ...history.state, companion: { drawer: true } }, '', location.href),
  );
  await page.getByRole('tab', { name: 'JavaScript', exact: true }).focus();
  await page.keyboard.press('End');
  await expect(page.locator('#python')).toBeVisible();
  await expect(page).toHaveURL(/#python$/);
  expect(await page.evaluate(() => history.state.companion.drawer)).toBe(true);
  await page.goBack();
  await expect(page.locator('#python')).toBeHidden();
  await page.goForward();
  await expect(page.locator('#python')).toBeVisible();
  await expect(page.getByRole('button', { name: '显示全部代码版本' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /下载原代码/ })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Python', exact: true })).toBeVisible();
  await expect(page.locator('#python .mbb-code-tab-title')).toHaveText('Python 版本');
  const revealed = await page.evaluate(() => ({
    ok: MarkBridgeTeaching.revealTarget('javascript'),
    same: window.original === document.getElementById('python'),
  }));
  expect(revealed).toEqual({ ok: true, same: true });
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#javascript')).toBeVisible();
  await expect(page.locator('#python')).toBeVisible();
  await expect(page.getByRole('tablist')).toBeHidden();
});
test('copy uses exact config CRLF without competing Prism copy; failed clipboard provides source textarea', async ({
  page,
}) => {
  await load(
    page,
    true,
    markup() + '<pre id="ordinary-code"><code class="language-js">let ordinary = 1;</code></pre>',
  );
  await page.evaluate(() => {
    window.Prism = { manual: true };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text) => (window.copied = text) },
    });
  });
  await highlight(page);
  await expect(page.locator('#javascript .token.keyword')).toHaveCount(1);
  await expect(page.locator('#examples .toolbar button')).toHaveCount(0);
  await expect(page.locator('#ordinary-code').locator('..').locator('.toolbar button')).toHaveCount(
    1,
  );
  await page.getByRole('button', { name: '复制 JavaScript', exact: true }).click();
  expect(await page.evaluate(() => window.copied)).toBe(tabs[0].code);
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw Error('denied');
        },
      },
    }),
  );
  await page.getByRole('button', { name: '已复制 JavaScript', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: '代码文本手动复制（换行可能规范化）' }),
  ).toHaveValue(tabs[0].code.replaceAll('\r\n', '\n'));
  await expect(page.getByRole('button', { name: /下载原代码/ })).toHaveCount(0);
  expect(await page.locator('article').evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(
    true,
  );
});
test('malformed group remains entirely static and does not stop a later valid group or deep-link', async ({
  page,
}) => {
  await load(
    page,
    true,
    markup('bad', [null])
      .replaceAll('id="javascript"', 'id="bad-js"')
      .replaceAll('id="python"', 'id="bad-py"') +
      markup('null-config')
        .replace(/data-mbb-teaching-config="[^"]*"/, 'data-mbb-teaching-config="null"')
        .replaceAll('id="javascript"', 'id="null-js"')
        .replaceAll('id="python"', 'id="null-py"') +
      markup(),
  );
  await expect(page.locator('#bad-js')).toBeVisible();
  await expect(page.locator('#bad-py')).toBeVisible();
  await expect(page.locator('#null-js')).toBeVisible();
  await expect(page.locator('#null-py')).toBeVisible();
  await expect(page.locator('#examples')).toHaveAttribute('data-mbb-enhanced', 'true');
  await page.evaluate(() => {
    history.pushState(null, '', '#python');
    dispatchEvent(new HashChangeEvent('hashchange'));
  });
  await expect(page.locator('#python')).toBeVisible();
});
test('actual core iframe code-tabs editor preserves CRLF until editing and performs real version actions', async ({
  page,
}) => {
  await page.goto('/component-editor');
  await page.evaluate((tabs) => {
    const block = wp.blocks.createBlock('mbb/code-tabs', {
      id: 'editor-tabs',
      version: 1,
      defaultTab: tabs[0].id,
      tabs,
    });
    taskRegistry.dispatch('core/block-editor').resetBlocks([block]);
    taskRegistry.dispatch('core/block-editor').selectBlock(block.clientId);
    window.tabsId = block.clientId;
  }, tabs);
  const canvas = page.frameLocator('iframe[name="editor-canvas"]'),
    editor = canvas.locator('.mbb-code-tabs-editor');
  await expect(editor).toBeVisible();
  const source = canvas.getByRole('textbox', { name: '当前版本原代码', exact: true });
  await expect(source).toHaveValue(tabs[0].code.replaceAll('\r\n', '\n'));
  await canvas.getByRole('tab', { name: 'Python', exact: true }).click();
  await expect(source).toHaveValue(tabs[1].code);
  const id = page.getByRole('textbox', { name: '版本稳定 ID', exact: true });
  await id.fill('');
  await expect(source).toHaveValue(tabs[1].code);
  await id.pressSequentially('python-renamed');
  await source.fill('edited python');
  await expect
    .poll(() =>
      page.evaluate(
        () => taskRegistry.select('core/block-editor').getBlock(tabsId).attributes.tabs[1].code,
      ),
    )
    .toBe('edited python');
  await canvas.getByRole('tab', { name: 'JavaScript', exact: true }).click();
  expect(
    await page.evaluate(
      () => taskRegistry.select('core/block-editor').getBlock(tabsId).attributes.tabs[0].code,
    ),
  ).toBe(tabs[0].code);
  await canvas.getByRole('button', { name: '添加代码版本' }).click();
  await source.fill('third');
  await canvas.getByRole('button', { name: '上移当前版本' }).click();
  await canvas.getByRole('button', { name: '将当前版本设为默认' }).click();
  await expect(canvas.getByRole('button', { name: '删除当前版本' })).toBeDisabled();
  await canvas.getByRole('button', { name: '复制代码组' }).click();
  const blocks = await page.evaluate(() => taskRegistry.select('core/block-editor').getBlocks());
  expect(blocks).toHaveLength(2);
  expect(blocks[0].attributes.tabs[0].code).toBe(tabs[0].code);
  const ids = blocks.flatMap((b) => [b.attributes.id, ...b.attributes.tabs.map((t) => t.id)]);
  expect(new Set(ids).size).toBe(ids.length);
});
test('long titles and language labels fit the viewport without secure-context UUID support', async ({
  page,
}) => {
  const long = tabs.map((t, i) => ({
    ...t,
    title: i === 0 ? 'X'.repeat(200) : '',
    language: i === 1 ? 'a'.repeat(64) : t.language,
  }));
  await page.addInitScript(() =>
    Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined }),
  );
  const failures = [];
  page.on('response', (r) => {
    if (r.status() >= 400) failures.push(r.url());
  });
  await load(page, true, markup('examples', long));
  await highlight(page);
  await expect(page.locator('#examples')).toHaveAttribute('data-mbb-enhanced', 'true');
  await page.getByRole('tab', { name: 'a'.repeat(64), exact: true }).click();
  await expect(page.locator('#python code')).toHaveClass(/language-text/);
  expect(failures).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('full article view and old history entries preserve the selected language', async ({
  page,
}) => {
  await load(
    page,
    true,
    `<div id="course" data-mbb-teaching="steps" data-mbb-teaching-config='{"mode":"staged","previous":true,"next":true}'><div class="mbb-teaching-body"><div id="stage-one" data-mbb-teaching="step"><p class="mbb-teaching-title">First</p>${markup()}</div><div id="stage-two" data-mbb-teaching="step">Second</div></div></div>`,
  );
  await page.getByRole('tab', { name: 'Python', exact: true }).click();
  await page.getByRole('button', { name: '全文', exact: true }).click();
  await expect(page.locator('#stage-two')).toBeVisible();
  await expect(page.locator('#python')).toBeVisible();
  await expect(page.locator('#javascript')).toBeHidden();
  await page.evaluate(() => {
    const state = structuredClone(history.state);
    state.mbbTeaching.tabs[0].full = true;
    dispatchEvent(new PopStateEvent('popstate', { state }));
  });
  await expect(page.locator('#python')).toBeVisible();
  await expect(page.locator('#javascript')).toBeHidden();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#javascript')).toBeVisible();
  await expect(page.locator('#python')).toBeVisible();
});

test('language tabs retain visible full-height line-number gutters after theme highlighting', async ({
  page,
}, info) => {
  const values = tabs.map((tab) => ({
    ...tab,
    code: Array.from({ length: 18 }, (_, i) => `const value${i} = ${i};`).join('\n'),
  }));
  await load(page, true, markup('examples', values));
  await highlight(page);
  await expect(page.locator('#javascript .mbb-code-line-number')).toHaveCount(18);
  await page.evaluate(() => Prism.highlightAll());
  await page.getByRole('tab', { name: 'Python', exact: true }).click();
  await expect(page.locator('#python .mbb-code-line-number')).toHaveCount(18);
  await expect(page.locator('.mbb-code-scroll-hint')).toHaveCount(0);
  // A theme's generic pre padding must not clip the separately positioned gutter.
  await page.addStyleTag({
    content: 'article pre:not(.wp-block-mbb-math){padding:20px!important}',
  });
  const gutter = await page.locator('#python pre').evaluate((pre) => {
    const code = pre.querySelector('code').getBoundingClientRect();
    const numbers = [...pre.querySelectorAll('.mbb-code-line-number')].map((n) =>
      n.getBoundingClientRect(),
    );
    const rows = { left: numbers[0].left, height: numbers.at(-1).bottom - numbers[0].top };
    return {
      codeHeight: code.height,
      rowHeight: rows.height,
      codeLeft: pre.querySelector('.mbb-compare-source').getBoundingClientRect().left,
      rowLeft: rows.left,
      preLeft: pre.getBoundingClientRect().left,
    };
  });
  expect(gutter.rowHeight).toBeCloseTo(gutter.codeHeight, 0);
  expect(gutter.rowLeft).toBeGreaterThanOrEqual(gutter.preLeft - 1);
  expect(gutter.codeLeft - gutter.rowLeft).toBeGreaterThan(30);
  await page.screenshot({ path: `test-results/code-gutter-${info.project.name}.png` });
});

test('compact gutters fit three and five digit line numbers without covering source', async ({
  page,
}, info) => {
  const values = tabs.map((tab) => ({
    ...tab,
    startLine: tab.id === 'javascript' ? 10000 : 1,
    highlights: '',
    code: Array.from({ length: 130 }, (_, i) => `const value${i} = ${i};`).join('\n'),
  }));
  const html = markup('examples', values).replace(
    /data-mbb-teaching-config="[^"]*"/,
    'data-mbb-teaching-config="' +
      escape(JSON.stringify({ version: 2, defaultTab: values[0].id, tabs: values })) +
      '"',
  );
  await load(page, true, html);
  await highlight(page);
  const measure = (locator) =>
    locator.evaluate((pre) => {
      const rows = pre.querySelector('.mbb-code-line-number');
      const rowStyle = getComputedStyle(rows, '::before');
      const canvas = document.createElement('canvas').getContext('2d');
      canvas.font = rowStyle.font;
      const digits = pre.closest('.mbb-code-tab').id === 'javascript' ? '10129' : '130';
      return {
        padding: parseFloat(getComputedStyle(pre.querySelector('.mbb-code-line')).paddingLeft),
        fontSize: parseFloat(getComputedStyle(pre).fontSize),
        numberFits:
          canvas.measureText(digits).width + parseFloat(rowStyle.paddingRight) <=
          rows.getBoundingClientRect().width,
        inset: rows.getBoundingClientRect().left - pre.getBoundingClientRect().left,
        separation:
          pre.querySelector('.mbb-compare-source').getBoundingClientRect().left -
          rows.getBoundingClientRect().right,
      };
    });
  const five = await measure(page.locator('#javascript pre'));
  expect(five.numberFits).toBe(true);
  expect(five.inset).toBeGreaterThanOrEqual(-1);
  expect(five.separation).toBeGreaterThan(0);
  await page.getByRole('tab', { name: 'Python', exact: true }).click();
  const three = await measure(page.locator('#python pre'));
  expect(three.padding / three.fontSize).toBeLessThan(3.3);
  expect(three.numberFits).toBe(true);
  expect(three.inset).toBeGreaterThanOrEqual(-1);
  expect(five.padding).toBeGreaterThan(three.padding);
  await page.screenshot({ path: `test-results/compact-code-gutter-${info.project.name}.png` });
});

test('v2 displayed line ranges keep original bytes and a bounded window across history and Prism', async ({
  page,
}) => {
  const values = [
    {
      id: 'long-code',
      title: 'long.py',
      language: 'python',
      code: Array.from(
        { length: 1200 },
        (_, i) => (i === 701 ? 'print("&#13;")' : 'print(' + i + ')') + '\r\n',
      ).join(''),
      startLine: 120,
      highlights: '821-823',
    },
  ];
  // Build the closed v2 configuration without changing the inert original source.
  const original = markup('line-group', values);
  const config = escape(JSON.stringify({ version: 2, defaultTab: 'long-code', tabs: values }));
  await load(
    page,
    false,
    original.replace(
      /data-mbb-teaching-config="[^"]*"/,
      'data-mbb-teaching-config="' + config + '"',
    ),
  );
  await page.addScriptTag({ content: fs.readFileSync(path.join(plugin, 'teaching.js'), 'utf8') });
  await expect(page.locator('.mbb-code-line')).toHaveCount(400);
  await page.evaluate(() => {
    location.hash = '#mbb-code/line-group/long-code/L821-L823';
  });
  await expect(page.locator('.mbb-code-line[data-mbb-selected]')).toHaveCount(3);
  expect(await page.locator('.mbb-code-line').count()).toBeLessThanOrEqual(400);
  await highlight(page);
  await page.evaluate(() => Prism.highlightAll());
  expect(await page.locator('#long-code pre code').textContent()).toBe(values[0].code);
  await page.locator('.mbb-code-line-number[data-line="821"]').click();
  await page.locator('.mbb-code-line-number[data-line="823"]').click({ modifiers: ['Shift'] });
  await expect(page).toHaveURL(/#mbb-code\/line-group\/long-code\/L821-L823$/);
  await page.goBack();
  await expect(page).toHaveURL(/#mbb-code\/line-group\/long-code\/L821$/);
  await page.goForward();
  await expect(page.locator('.mbb-code-line[data-mbb-selected]')).toHaveCount(3);
  const before = await page.locator('#long-code pre code').innerHTML();
  await page.evaluate(() => {
    location.hash = '#mbb-code/line-group/long-code/L999999';
  });
  expect(await page.locator('#long-code pre code').innerHTML()).toBe(before);
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw Error('denied');
        },
      },
    }),
  );
  await page.getByRole('button', { name: '复制行链接', exact: true }).click();
  const manualLink = page.getByRole('textbox', { name: '复制行链接', exact: true });
  await expect(manualLink).toBeVisible();
  await expect(manualLink).toHaveValue(
    new URL('#mbb-code/line-group/long-code/L821-L823', page.url()).href,
  );
  await page.getByRole('button', { name: '复制 Python', exact: true }).click();
  const manualCode = page.getByRole('textbox', {
    name: '代码文本手动复制（换行可能规范化）',
    exact: true,
  });
  await expect(manualCode).toBeVisible();
  await expect(manualCode).toHaveValue(values[0].code.replace(/\r\n/g, '\n'));
  await page.getByRole('button', { name: '复制行链接', exact: true }).click();
  await expect(manualLink).toBeVisible();
  await expect(page.locator('#long-code textarea')).toHaveCount(1);
});

test('v2 compact actions leave a long title readable and keep the static summary for print', async ({
  page,
}, info) => {
  const values = [
    {
      id: 'titled-code',
      title: '保持原缩进的 Python 实现',
      language: 'python',
      code: 'a\nb\nc\nd\n',
      startLine: 120,
      highlights: '121-123',
    },
  ];
  let body = markup('titled-group', values).replace(
    /data-mbb-teaching-config="[^"]*"/,
    'data-mbb-teaching-config="' +
      escape(JSON.stringify({ version: 2, defaultTab: 'titled-code', tabs: values })) +
      '"',
  );
  body = body.replace(
    '<pre>',
    '<p data-mbb-generated="" class="mbb-code-line-summary">Starting line: 120; highlights: 121-123</p><pre>',
  );
  await load(page, true, '<style>article{max-width:260px;margin-inline:auto}</style>' + body);
  await expect(page.locator('.mbb-code-line-summary')).toBeHidden();
  await expect(page.getByRole('button', { name: '跳到重点行', exact: true })).toBeHidden();
  const link = page.getByRole('button', { name: '复制行链接', exact: true });
  await expect(link).toBeVisible();
  await expect(link).toHaveText('');
  const geometry = await page.locator('#titled-code').evaluate((panel) => {
    const range = document.createRange();
    range.selectNodeContents(panel.querySelector('.mbb-code-tab-title'));
    const title = range.getBoundingClientRect(),
      tools = panel.querySelector('.mbb-code-panel-tools').getBoundingClientRect();
    return {
      titleRight: title.right,
      toolsLeft: tools.left,
      pageWidth: document.documentElement.scrollWidth,
      viewport: innerWidth,
    };
  });
  expect(geometry.titleRight).toBeLessThanOrEqual(geometry.toolsLeft - 2);
  expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewport);
  await page.screenshot({ path: info.outputPath('compact-line-actions.png') });
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.mbb-code-line-summary')).toBeVisible();
});
