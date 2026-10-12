const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const plugin = path.resolve(__dirname, '../../plugin');
const style = fs.readFileSync(path.join(plugin, 'teaching.css'), 'utf8');
const script = fs.readFileSync(path.join(plugin, 'teaching.js'), 'utf8');
function fixture() {
  const fold = (id, body) =>
    `<div id="${id}" class="wp-block-mbb-collapse" data-mbb-teaching="collapse" data-mbb-teaching-config='{"open":false}'><p class="mbb-teaching-title" data-mbb-generated>折叠 ${id}</p><div class="mbb-teaching-body">${body}</div></div>`;
  return `<article class="mbb-document"><div id="course" class="wp-block-mbb-steps" data-mbb-teaching="steps" data-mbb-teaching-config='{"mode":"staged","previous":true,"next":true,"full":true}'><p class="mbb-teaching-title" data-mbb-generated>课程</p><div class="mbb-teaching-body"><div id="one" data-mbb-teaching="step"><p class="mbb-teaching-title" data-mbb-generated>阶段一</p><div class="mbb-teaching-body"><p id="first">第一阶段</p></div></div><div id="two" data-mbb-teaching="step"><p class="mbb-teaching-title" data-mbb-generated>阶段二</p><div class="mbb-teaching-body">${fold('outer', fold('middle', fold('inner', '<h2 id="target">隐藏标题</h2><p id="original">正文评论身份</p>')))}</div></div></div></div><div id="compare" class="wp-block-mbb-code-compare" data-mbb-teaching="code-compare" data-mbb-teaching-config='{"leftHighlights":"2","rightHighlights":"2"}'><div class="mbb-compare-left"><p data-mbb-generated>原始</p><pre><code class="language-js">same\n\tbefore;  \n</code></pre></div><div class="mbb-compare-right"><p data-mbb-generated>新版</p><pre><code class="language-python">same\n\tafter;  \n</code></pre></div><div class="mbb-teaching-body"><p>重点解释</p></div></div></article><article><div id="unrelated" data-mbb-teaching="collapse" data-mbb-teaching-config='{"open":false}'><p class="mbb-teaching-title">其他文章折叠</p><div class="mbb-teaching-body">不受全文切换影响</div></div></article>`;
}
async function load(page, enhance = true) {
  await page.goto('/health');
  await page.setContent(
    `<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:16px;font:16px/1.6 sans-serif}${style}</style>${fixture()}`,
  );
  if (enhance) await page.addScriptTag({ content: script });
}
test('teaching retains nodes, reveals deep anchors, restores history and prints all content', async ({
  page,
}) => {
  await load(page);
  await page.evaluate(() => {
    window.originalNode = document.getElementById('original');
    history.replaceState({ ...history.state, companion: { drawer: true } }, '', location.href);
  });
  await expect(page.locator('#two')).toBeHidden();
  await expect(page.locator('#target')).toBeHidden();
  await page.getByRole('button', { name: '下一阶段', exact: true }).click();
  await expect(page.locator('#two')).toBeVisible();
  await expect(page.locator('#target')).toBeHidden();
  await page.getByRole('button', { name: '全文', exact: true }).click();
  await expect(page.locator('#target')).toBeVisible();
  await expect(page.locator('#unrelated .mbb-teaching-body')).toBeHidden();
  expect(await page.evaluate(() => history.state.companion.drawer)).toBe(true);
  await page.goBack();
  await expect(page.getByRole('button', { name: '全文', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.locator('#target')).toBeHidden();
  const revealed = await page.evaluate(() => {
    let complete = false;
    document.addEventListener(
      'mbb:teaching-change',
      () => (complete = !document.getElementById('target').closest('[hidden]')),
      { once: true },
    );
    const result = MarkBridgeTeaching.revealTarget(document.getElementById('target'));
    return { result, complete, same: window.originalNode === document.getElementById('original') };
  });
  expect(revealed).toEqual({ result: true, complete: true, same: true });
  await page.locator('#inner .mbb-teaching-controls button').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#target')).toBeHidden();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#target')).toBeVisible();
  await expect(page.locator('#one')).toBeVisible();
  await expect(page.locator('.mbb-teaching-controls').first()).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => {
    history.pushState(null, '', '#target');
    dispatchEvent(new HashChangeEvent('hashchange'));
  });
  await expect(page.locator('#target')).toBeVisible();
});
test('code difference preserves raw whitespace, copy fallback, language and responsive layout', async ({
  page,
}) => {
  await load(page);
  const left = page.locator('#compare .mbb-compare-left code');
  expect(await left.textContent()).toBe('same\n\tbefore;  \n');
  await expect(left.locator('[data-mbb-diff=equal]')).toHaveCount(1);
  await expect(left.locator('[data-mbb-diff=removed][data-mbb-highlight]')).toHaveCount(1);
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value) => {
          window.copied = value;
        },
      },
    }),
  );
  await page.getByRole('button', { name: '复制左侧代码' }).click();
  expect(await page.evaluate(() => window.copied)).toBe('same\n\tbefore;  \n');
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw Error('Denied');
        },
      },
    }),
  );
  await page.getByRole('button', { name: '复制右侧代码' }).click();
  await expect(page.getByLabel('原始代码手动复制')).toHaveValue('same\n\tafter;  \n');
  const layout = await page.locator('#compare').evaluate((n) => {
    const [a, b] = n.querySelectorAll('.mbb-compare-left,.mbb-compare-right');
    return {
      mobile: innerWidth <= 700,
      ax: a.getBoundingClientRect().x,
      bx: b.getBoundingClientRect().x,
      ay: a.getBoundingClientRect().y,
      by: b.getBoundingClientRect().y,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  expect(layout.overflow).toBe(false);
  if (layout.mobile) expect(layout.by).toBeGreaterThan(layout.ay);
  else expect(layout.bx).toBeGreaterThan(layout.ax);
  // Real on-demand Prism must leave comparison markup and raw bytes intact.
  const front = await (await page.request.get('/front')).text();
  const config = JSON.parse(/window\.MBB_PRESENTATION=(\{[^\n]+\});/.exec(front)[1]);
  await page.evaluate((config) => {
    window.MBB_PRESENTATION = config;
    const pre = document.createElement('pre');
    pre.innerHTML = '<code class="language-javascript">const ordinary = 1;</code>';
    pre.id = 'ordinary-prism';
    document.body.append(pre);
  }, config);
  await page.addScriptTag({ path: path.join(plugin, 'presentation-loader.js') });
  await expect(page.locator('#ordinary-prism .token.keyword')).toHaveCount(1);
  await expect(left.locator('[data-mbb-diff=removed]')).toHaveCount(1);
  expect(await left.textContent()).toBe('same\n\tbefore;  \n');
});
test('static teaching content and incomplete dynamic shells remain usable', async ({ page }) => {
  await load(page, false);
  await expect(page.locator('#target')).toBeVisible();
  await expect(page.locator('#two')).toBeVisible();
  await page.addScriptTag({ content: script });
  await page.evaluate(() => {
    const shell = document.createElement('div');
    shell.id = 'late';
    shell.dataset.mbbTeaching = 'collapse';
    shell.dataset.mbbTeachingConfig = '{"open":false}';
    document.body.append(shell);
  });
  await page.waitForTimeout(50);
  await page.evaluate(() => {
    document.getElementById('late').innerHTML =
      '<p class="mbb-teaching-title">延迟折叠</p><div class="mbb-teaching-body">晚到正文</div>';
  });
  await expect(page.getByRole('button', { name: '延迟折叠' })).toBeVisible();
  await expect(page.locator('#late .mbb-teaching-body')).toBeHidden();
});

test('real WordPress edits teaching InnerBlocks and explicitly preserves comparison newline', async ({
  page,
}) => {
  test.skip(!process.env.MARKBRIDGE_TEST_RUNTIME, 'Requires the sanitized real WordPress runtime');
  await page.goto('/teaching-editor');
  await page
    .locator('.wp-block-mbb-collapse .wp-block-paragraph[contenteditable=true]')
    .fill('Edited teaching body.');
  const left = page.getByLabel('左侧原代码', { exact: true });
  await left.fill('changed();');
  await page.getByRole('button', { name: '为左侧源码补末尾换行', exact: true }).click();
  await expect(left).toHaveValue('changed();\n');
  await page.locator('#export-tasks').click();
  await expect(page.locator('#task-export')).toContainText('Edited teaching body');
  await expect(page.locator('#task-export')).toContainText('changed();');
  await expect(page.locator('#task-export')).not.toContainText('ERROR:');
  expect(
    await page.evaluate(() => {
      const walk = (blocks) => blocks.every((b) => b.isValid !== false && walk(b.innerBlocks));
      return walk(wp.blocks.parse(wp.blocks.serialize(taskBlocks)));
    }),
  ).toBe(true);
});

test('long comparison keeps source text and bounds initial annotation nodes', async ({ page }) => {
  await load(page, false);
  const text = '\n'.repeat(6000);
  await page
    .locator('#compare .mbb-compare-left code')
    .evaluate((n, text) => (n.textContent = text), text);
  await page.addScriptTag({ content: script });
  await expect(page.locator('#compare .mbb-compare-left .mbb-compare-line')).toHaveCount(400);
  expect(await page.locator('#compare .mbb-compare-left code').textContent()).toBe(text);
  await expect(page.locator('#compare')).toContainText('按相同行位置估计');
  await page
    .locator('#compare .mbb-compare-left')
    .getByRole('button', { name: '标注后续代码行' })
    .click();
  await expect(page.locator('#compare .mbb-compare-left .mbb-compare-line')).toHaveCount(800);
});

test('history restores a closed collapse even when its hash targets hidden content', async ({
  page,
}) => {
  await load(page);
  await page.evaluate(() => {
    location.hash = 'target';
  });
  await expect(page.locator('#target')).toBeVisible();
  await page.locator('#inner .mbb-teaching-controls button').click();
  await expect(page.locator('#target')).toBeHidden();
  await page.evaluate(() => {
    const a = document.createElement('a');
    a.href = '#first';
    a.textContent = 'go first';
    a.id = 'go-first';
    document.body.append(a);
  });
  await page.locator('#go-first').click();
  await expect(page.locator('#one')).toBeVisible();
  await page.goBack();
  expect(await page.evaluate(() => location.hash)).toBe('#target');
  await expect(page.locator('#target')).toBeHidden();
});
test('multiple comparisons share the article annotation budget', async ({ page }) => {
  await load(page, false);
  await page.evaluate(() => {
    const article = document.querySelector('article');
    const original = document.getElementById('compare');
    original.querySelectorAll('code').forEach((n) => (n.textContent = 'line\n'.repeat(400)));
    for (let i = 0; i < 12; i++) {
      const clone = original.cloneNode(true);
      clone.id = 'many' + i;
      article.append(clone);
    }
  });
  await page.addScriptTag({ content: script });
  expect(await page.locator('article .mbb-compare-line').count()).toBeLessThanOrEqual(4000);
  expect(await page.locator('#many11 .mbb-compare-left code').textContent()).toBe(
    'line\n'.repeat(400),
  );
  await expect(page.locator('#many11').getByRole('button', { name: '复制左侧代码' })).toBeVisible();
});
