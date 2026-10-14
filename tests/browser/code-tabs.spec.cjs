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
        languages: '/wp-content/plugins/markdown-block-bridge/vendor/prism/components/',
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
    `<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:16px;font:16px/1.6 sans-serif}${fs.readFileSync(path.join(plugin, 'teaching.css'), 'utf8')}</style><article>${body}</article>`,
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
