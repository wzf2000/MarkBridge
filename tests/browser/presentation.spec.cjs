const { test, expect } = require('@playwright/test');

test('real MathJax CHTML CSSOM and fonts keep inline math on the text baseline', async ({
  page,
}) => {
  const failures = [];
  const fonts = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) failures.push(message.text());
  });
  page.on('response', (response) => {
    if (/\/vendor\/mathjax-newcm-font\/.*\.woff2(?:\?|$)/.test(response.url()))
      fonts.push({ url: response.url(), status: response.status() });
  });
  await page.goto('/front');
  await expect(page.locator('#inline-line .mbb-typeset mjx-container[jax="CHTML"]')).toBeVisible();
  await expect(page.locator('pre.wp-block-mbb-math mjx-container[jax="CHTML"]')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const measured = await page.evaluate(() => {
    const inline = document.querySelector('#inline-line .mbb-typeset');
    const container = inline.querySelector('mjx-container');
    const line = document.querySelector('#inline-line');
    const sheet = document.querySelector('style[data-mbb-chtml]');
    const lineBox = line.getBoundingClientRect();
    const mathBox = container.getBoundingClientRect();
    const computed = getComputedStyle(inline);
    return {
      cssRules: sheet?.sheet?.cssRules.length || 0,
      glyphs: container.querySelectorAll('mjx-c').length,
      fontFaces: [...document.styleSheets].flatMap((s) => {
        try {
          return [...s.cssRules].filter((rule) => rule.type === CSSRule.FONT_FACE_RULE);
        } catch {
          return [];
        }
      }).length,
      display: computed.display,
      overflow: computed.overflowX,
      baselineWithinLine: mathBox.top >= lineBox.top - 8 && mathBox.bottom <= lineBox.bottom + 8,
      viewportOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });
  expect(measured.cssRules).toBeGreaterThan(20);
  expect(measured.glyphs).toBeGreaterThan(3);
  expect(measured.fontFaces).toBeGreaterThan(0);
  expect(measured.display).toBe('inline');
  expect(measured.overflow).not.toBe('auto');
  expect(measured.baselineWithinLine).toBe(true);
  expect(measured.viewportOverflow).toBe(false);
  expect(fonts.length).toBeGreaterThan(0);
  expect(fonts.every((font) => font.status === 200)).toBe(true);
  expect(failures).toEqual([]);
});

test('real Prism highlights long code without line number drift', async ({ page }) => {
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  await page.goto('/front');
  await expect(page.locator('pre.wp-block-mbb-code .line-numbers-rows > span')).toHaveCount(120);
  await expect(page.locator('pre.wp-block-mbb-code .token.keyword').first()).toBeVisible();
  const measured = await page.evaluate(() => {
    const pre = document.querySelector('pre.wp-block-mbb-code');
    const code = pre.querySelector('code');
    const rows = pre.querySelector('.line-numbers-rows');
    const spans = [...rows.children];
    const codeStyle = getComputedStyle(code);
    const rowStyle = getComputedStyle(rows);
    const first = spans[0].getBoundingClientRect();
    const last = spans.at(-1).getBoundingClientRect();
    const lineHeight = parseFloat(codeStyle.lineHeight);
    const starts = [];
    const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    let line = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement.closest('.line-numbers-rows,.line-numbers-sizer')) continue;
      for (let i = 0; i < node.textContent.length; i++) {
        const char = node.textContent[i];
        if (char === '\n') {
          line++;
          continue;
        }
        if (starts[line] || /\s/.test(char)) continue;
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        starts[line] = range.getBoundingClientRect().top;
      }
    }
    return {
      codeLineHeight: lineHeight,
      rowLineHeight: parseFloat(rowStyle.lineHeight),
      accumulatedDrift: Math.abs(last.top - first.top - (starts[119] - starts[0])),
      textLines: starts.length,
      preScrollWidth: pre.scrollWidth,
      preClientWidth: pre.clientWidth,
      codeFontSize: codeStyle.fontSize,
      rowFontSize: rowStyle.fontSize,
      sourceIntact:
        code.textContent.startsWith('const value0 = 0; // line 0') &&
        code.textContent.includes('const value119 = 119; // line 119'),
    };
  });
  expect(measured.textLines).toBe(120);
  expect(measured.rowLineHeight).toBeCloseTo(measured.codeLineHeight, 0);
  expect(measured.accumulatedDrift).toBeLessThan(3);
  expect(measured.codeFontSize).toBe(measured.rowFontSize);
  expect(measured.preClientWidth).toBeGreaterThan(0);
  expect(measured.preScrollWidth).toBeGreaterThan(measured.preClientWidth);
  expect(measured.sourceIntact).toBe(true);
  expect(failures).toEqual([]);
});

test('negative control: removing serialized CSSOM rules is detected', async ({ page }) => {
  await page.route(/\/plugin\/math-[a-f0-9]{12}\.js$/, async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    const oldCode = 'outputStyle.textContent = m.css;';
    expect(body).toContain(oldCode);
    await route.fulfill({ response, body: body.replace(oldCode, "outputStyle.textContent = '';") });
  });
  await page.goto('/front');
  await expect(page.locator('#inline-line .mbb-typeset mjx-container[jax="CHTML"]')).toBeVisible();
  const rules = await page
    .locator('style[data-mbb-chtml]')
    .evaluate((style) => style.sheet.cssRules.length);
  expect(rules).toBe(0);
});

test('negative control: old code line height produces measurable long-document drift', async ({
  page,
}) => {
  await page.goto('/front');
  await expect(page.locator('pre.wp-block-mbb-code .line-numbers-rows > span')).toHaveCount(120);
  await page.addStyleTag({
    content: 'pre.wp-block-mbb-code.line-numbers>code{display:inline;line-height:1.5}',
  });
  const drift = await page.evaluate(() => {
    const pre = document.querySelector('pre.wp-block-mbb-code');
    const code = pre.querySelector('code');
    const rows = pre.querySelector('.line-numbers-rows');
    const spans = rows.children;
    const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    let line = 0;
    const positions = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement.closest('.line-numbers-rows,.line-numbers-sizer')) continue;
      for (let i = 0; i < node.textContent.length; i++) {
        if (node.textContent[i] === '\n') {
          line++;
          continue;
        }
        if (positions[line] || /\s/.test(node.textContent[i])) continue;
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        positions[line] = range.getBoundingClientRect().top;
      }
    }
    return Math.abs(
      spans[119].getBoundingClientRect().top -
        spans[0].getBoundingClientRect().top -
        (positions[119] - positions[0]),
    );
  });
  expect(drift).toBeGreaterThan(100);
});
