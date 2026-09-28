const { test, expect } = require('@playwright/test');

test('editor iframe receives new MathJax fraction rules and survives canvas replacement', async ({
  page,
}) => {
  await page.goto('/editor');
  const state = await page.evaluate(async () => {
    const makeCanvas = () => {
      const frame = document.createElement('iframe');
      document.body.append(frame);
      const owner = frame.contentDocument;
      owner.body.innerHTML = '<div id="formula"></div>';
      MBB_MATH.registerDocument(owner);
      return { frame, owner };
    };
    const first = makeCanvas();
    const simple = await MBB_MATH.render('x', true);
    first.owner.querySelector('#formula').innerHTML = simple;
    const before = first.owner.head.querySelector('style[data-mbb-editor-chtml]').textContent;
    const fraction = await MBB_MATH.render('a+b+\\frac{a}{d}', true);
    first.owner.querySelector('#formula').innerHTML = fraction;
    await first.owner.fonts.ready;
    const measure = (owner) => {
      const denominator = owner.querySelector('mjx-den mjx-mi');
      return {
        height: denominator.getBoundingClientRect().height,
        width: denominator.getBoundingClientRect().width,
        fractionDisplay: owner.defaultView.getComputedStyle(owner.querySelector('mjx-mfrac'))
          .display,
      };
    };
    const updated = first.owner.head.querySelector('style[data-mbb-editor-chtml]').textContent;
    const firstMeasure = measure(first.owner);
    first.frame.remove();
    const second = makeCanvas();
    second.owner.querySelector('#formula').innerHTML = fraction;
    await second.owner.fonts.ready;
    return {
      updated: before !== updated,
      first: firstMeasure,
      second: measure(second.owner),
      styleRestored:
        second.owner.head.querySelector('style[data-mbb-editor-chtml]').textContent === updated,
    };
  });
  expect(state.updated).toBe(true);
  expect(state.styleRestored).toBe(true);
  for (const box of [state.first, state.second]) {
    expect(box.height).toBeGreaterThan(1);
    expect(box.width).toBeGreaterThan(1);
    expect(box.fractionDisplay).not.toBe('inline');
  }
});

test('scriptless review renders complete inline and display CHTML at readable dimensions', async ({
  page,
}) => {
  const source = 'Inline $\\operatorname{KL}(P\\Vert Q)$ and $\\frac{x^2}{y_0}$.\n';
  const html =
    '<p>Inline <span class="mbb-math" data-mbb-tex="\\operatorname{KL}(P\\Vert Q)">$\\operatorname{KL}(P\\Vert Q)$</span> and <span class="mbb-math" data-mbb-tex="\\frac{x^2}{y_0}">$\\frac{x^2}{y_0}$</span>.</p><pre class="wp-block-mbb-math"><code>\\sum_{i=1}^{n}x_i</code></pre>';
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.route('**/wp-json/mbb/v1/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        route.request().url().includes('/preview')
          ? { before: source, document: { source }, html }
          : {
              post_id: 12,
              title: 'Math fixture',
              post_status: 'draft',
              featured_media: 0,
              expected: 'one',
              document: { documentId: 'fixture', source, serialized: '' },
            },
      ),
    }),
  );
  await page.goto('/editor');
  await page.getByRole('button', { name: '编辑现有文档' }).click();
  await expect(page.locator('#mbb-source')).toHaveValue(source);
  await page.locator('#mbb-review').click();
  const frame = page.frameLocator('iframe[title="内置内容预览"]');
  await expect(frame.locator('mjx-container')).toHaveCount(3);
  const dimensions = await frame.locator('mjx-container').evaluateAll(async (nodes) => {
    await document.fonts.ready;
    return nodes.map((n) => ({
      width: n.getBoundingClientRect().width,
      height: n.getBoundingClientRect().height,
      font: getComputedStyle(n).fontSize,
      overflow: getComputedStyle(n).overflow,
      inner: n.querySelector('mjx-math').getBoundingClientRect().height,
    }));
  });
  await test.info().attach('math-preview-metrics', {
    body: JSON.stringify({ dimensions, errors }),
    contentType: 'application/json',
  });
  expect(dimensions[0].height).toBeGreaterThan(12);
  expect(dimensions[0].width).toBeGreaterThan(60);
  expect(dimensions[1].height).toBeGreaterThan(20);
  expect(dimensions[0].height).toBeGreaterThanOrEqual(dimensions[0].inner - 1);
  await page.screenshot({ path: test.info().outputPath('preview.png') });
  expect(errors.filter((x) => /font|CORS|MathJax/i.test(x))).toEqual([]);
});

test('preview font failure refuses confirmation and a retry loads fonts without relaxing sandbox', async ({
  page,
}) => {
  const source = 'Math $x^2$.\n';
  let reject = true;
  await page.route('**/woff2/*.woff2', (r) =>
    reject ? r.fulfill({ status: 503, body: 'Unavailable' }) : r.continue(),
  );
  await page.route('**/wp-json/mbb/v1/**', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        r.request().url().includes('/preview')
          ? {
              before: source,
              document: { source },
              html: '<p><span class="mbb-math" data-mbb-tex="x^2">$x^2$</span></p>',
            }
          : {
              post_id: 12,
              title: 'Fixture',
              post_status: 'draft',
              expected: 'one',
              document: { documentId: 'fixture', source },
            },
      ),
    }),
  );
  await page.goto('/editor');
  await page.getByRole('button', { name: '编辑现有文档' }).click();
  await expect(page.locator('#mbb-source')).toHaveValue(source);
  await page.locator('#mbb-review').click();
  await expect(page.locator('.mbb-error')).toContainText('字体加载失败');
  await expect(page.locator('#mbb-save')).toBeDisabled();
  reject = false;
  await page.locator('#mbb-review').click();
  await expect(page.locator('#mbb-save')).toBeEnabled();
  await expect(page.locator('iframe[title="内置内容预览"]')).toHaveAttribute('sandbox', '');
  const frame = page.frameLocator('iframe[title="内置内容预览"]');
  await expect(frame.locator('mjx-container')).toHaveCount(1);
  const css = await frame.locator('style[data-mbb-chtml]').textContent();
  expect(css).toContain('data:font/woff2;base64,');
  expect(css).not.toMatch(/url\(["']?https?:/);
});
