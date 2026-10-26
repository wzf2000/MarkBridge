const { test, expect } = require('@playwright/test'),
  path = require('node:path'),
  fs = require('node:fs');
const plugin = path.resolve(__dirname, '../../plugin');
test('upright reading statements, quote edges, and failed image links preserve authored content', async ({
  page,
}, info) => {
  await page.goto('/front');
  await page.addStyleTag({ path: path.join(plugin, 'technical.css') });
  await page.addStyleTag({ path: path.join(plugin, 'media-presentation.css') });
  let outside = 0;
  await page.route('https://review.invalid/**', (route) => {
    outside++;
    return route.abort();
  });
  await page.evaluate(() => {
    const article = document.querySelector('article');
    article.setAttribute('data-mbb-content-view', '');
    article.insertAdjacentHTML(
      'afterbegin',
      `<section class="mbb-technical-statement mbb-statement-theorem"><h3 class="mbb-technical-heading">定理与声明</h3><div class="mbb-technical-body"><p>清晰的中文结论。A theorem stays upright.</p></div></section><details open class="mbb-technical-statement mbb-statement-proof"><summary class="mbb-technical-heading">证明</summary><div class="mbb-technical-body"><p>作者的解释完整保留。</p></div></details><div class="wp-block-mbb-component"><div class="mbb-teaching-body"><h2 id="fallback-first">组件首标题</h2><p>第一段解释。</p><p>第二段解释。</p></div></div><blockquote><div><h3>引用首标题</h3><p>第一段。</p><p>第二段仍有自然间距。</p></div></blockquote><figure class="wp-block-image"><img id="failed-image" alt="站外示例图片" src="https://review.invalid/missing.png"><figcaption>原图注不变。</figcaption></figure>`,
    );
  });
  await expect(page.locator('.mbb-image-unavailable')).toBeVisible();
  await expect(page.locator('.mbb-image-unavailable a')).toHaveAttribute(
    'href',
    'https://review.invalid/missing.png',
  );
  expect(outside).toBe(1); // Existing image navigation only; no fetch/proxy/retry.
  await expect(page.locator('#failed-image')).toBeHidden();
  await expect(page.locator('figcaption')).toHaveText('原图注不变。');
  await expect(page.locator('.mbb-statement-theorem > .mbb-technical-body')).toHaveCSS(
    'font-style',
    'normal',
  );
  await expect(page.locator('.mbb-statement-proof > summary')).toHaveCSS('font-weight', '600');
  expect(
    await page
      .locator('.mbb-technical-statement')
      .first()
      .evaluate((n) => getComputedStyle(n).fontFamily),
  ).not.toMatch(/SimSun|Songti|STIX/);
  await page.addStyleTag({ path: path.join(plugin, 'teaching.css') });
  await expect(page.locator('#fallback-first')).toHaveCSS('margin-block-start', '0px');
  await expect(page.locator('blockquote h3')).toHaveCSS('margin-block-start', '0px');
  expect(
    await page
      .locator('blockquote p')
      .last()
      .evaluate((n) => parseFloat(getComputedStyle(n).marginTop)),
  ).toBeGreaterThan(0);
  await page.locator('blockquote').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('reading-review-' + info.project.name + '.png') });
  // A later valid source recovers the original image; successful images are never replaced.
  await page.locator('#failed-image').evaluate((n) => {
    n.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  });
  await expect(page.locator('#failed-image')).toBeVisible();
  await expect(page.locator('.mbb-image-unavailable')).toHaveCount(0);
});
test('failed inline emoji and generated fallback images never create recursive image fallbacks', async ({
  page,
}) => {
  let requests = 0;
  await page.route('https://review.invalid/**', (route) => {
    requests++;
    return route.abort();
  });
  await page.goto('/front');
  await page.evaluate(async () => {
    const article = document.querySelector('article');
    const root = document.createElement('section');
    root.id = 'image-failure-boundaries';
    root.setAttribute('data-mbb-content-view', '');
    article.append(root);
    const broken = (id, className, alt, parent) => {
      const image = document.createElement('img');
      image.id = id;
      image.className = className;
      image.alt = alt;
      const failed = new Promise((resolve) =>
        image.addEventListener('error', resolve, { once: true }),
      );
      parent.append(image);
      image.src = 'https://review.invalid/' + id + '.png';
      return failed;
    };
    const figure = document.createElement('figure');
    const inline = document.createElement('p');
    root.append(figure, inline);
    await Promise.all([
      broken('ordinary-broken', '', '作者图片', figure),
      broken('inline-emoji-broken', 'emoji', '😀', inline),
      broken('inline-smiley-broken', 'wp-smiley', '🙂', inline),
    ]);
  });
  const root = page.locator('#image-failure-boundaries');
  await expect(root.locator('.mbb-image-unavailable')).toHaveCount(1);
  await expect(root.locator('.mbb-image-unavailable a')).toHaveAttribute(
    'href',
    'https://review.invalid/ordinary-broken.png',
  );
  await expect(root.locator('.mbb-image-unavailable a')).toHaveText('作者图片');
  await expect(root.locator('#ordinary-broken')).toHaveClass(/mbb-image-failed/);
  await expect(root.locator('p .mbb-image-unavailable')).toHaveCount(0);
  await expect(root.locator('#inline-emoji-broken')).not.toHaveClass(/mbb-image-failed/);
  await expect(root.locator('#inline-smiley-broken')).not.toHaveClass(/mbb-image-failed/);

  // WordPress may turn emoji alt text in a fallback link into another image.
  // A real failed descendant must be ignored even without an emoji class.
  await root.locator('.mbb-image-unavailable a').evaluate(async (link) => {
    const image = document.createElement('img');
    image.id = 'derived-broken';
    image.alt = '😀';
    const failed = new Promise((resolve) =>
      image.addEventListener('error', resolve, { once: true }),
    );
    link.append(image);
    image.src = 'https://review.invalid/derived-broken.png';
    await failed;
  });
  await page.waitForLoadState('networkidle');
  await expect(root.locator('.mbb-image-unavailable')).toHaveCount(1);
  await expect(root.locator('.mbb-image-unavailable .mbb-image-unavailable')).toHaveCount(0);
  await expect(root.locator('#derived-broken')).not.toHaveClass(/mbb-image-failed/);
  await expect(root.locator('.mbb-image-unavailable a')).toHaveAttribute(
    'href',
    'https://review.invalid/ordinary-broken.png',
  );
  expect(requests).toBe(4); // One author image, two inline emoji, one derived image; no retries.
});
test('missing static renderer exposes authored fallback but no reader-facing raw configuration', async ({
  page,
}) => {
  await page.goto('/front');
  const map = JSON.parse(fs.readFileSync(path.join(plugin, 'assets.json')));
  await page.addScriptTag({ path: path.join(plugin, map['projections.js']) });
  const result = await page.evaluate(() => {
    const root = document.createElement('article');
    root.innerHTML = '<section id="missing"><p>完整作者解释，不依赖交互。</p></section>';
    MarkBridgeProjection.insert(root, [
      {
        target: 'missing',
        component: 'missing',
        version: '1.0.0',
        fingerprint: null,
        state: 'unavailable',
        params: { privateLookingButPublicData: 'raw-json-sentinel' },
        projection: null,
      },
    ]);
    return { text: root.textContent, html: root.innerHTML };
  });
  expect(result.text).toContain('完整作者解释');
  expect(result.text).toContain('原文说明仍可阅读');
  expect(result.html).not.toContain('raw-json-sentinel');
  expect(result.html).not.toContain('Configuration');
});

test('catalog groups component types and exact versions under one actual provider plugin', async ({
  page,
}, info) => {
  await page.goto('/extension-catalog');
  await expect(page.locator('.mbb-provider-group')).toHaveCount(1);
  await expect(page.locator('.mbb-provider-group > h3')).toHaveText('Teaching Components');
  await expect(page.locator('.mbb-component-versions')).toHaveCount(2);
  await expect(
    page.getByText('One provider plugin can include many component types.', { exact: false }),
  ).toBeVisible();
  await page.locator('.mbb-component-versions').first().locator('summary').first().click();
  await expect(page.locator('.mbb-component-versions').first().locator('tbody > tr')).toHaveCount(
    2,
  );
  expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({
    path: info.outputPath('provider-catalog-' + info.project.name + '.png'),
    fullPage: true,
  });
});
