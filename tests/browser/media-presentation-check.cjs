const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');

// Standalone source-CSS check: no build, shared server or WordPress writes.
// Optionally test against installed core styles using MARKBRIDGE_WP_BLOCK_CSS_ROOT.
const plugin = path.resolve(__dirname, '../../plugin');
const evidence = process.env.MARKBRIDGE_MEDIA_EVIDENCE || '/tmp/markbridge-gallery-check';
const executablePath = process.env.MARKBRIDGE_CHROMIUM_PATH;
const coreRoot = process.env.MARKBRIDGE_WP_BLOCK_CSS_ROOT;
const coreCss = coreRoot
  ? ['gallery/style.css', 'image/style.css']
      .map((name) => fs.readFileSync(path.join(coreRoot, name), 'utf8'))
      .join('\n')
  : `.wp-block-gallery.has-nested-images figure.wp-block-image:not(#individual-image){width:calc(50% - 8px)}
     .wp-block-gallery.has-nested-images figure.wp-block-image{display:flex;position:relative;flex-direction:column}
     .wp-block-gallery.has-nested-images figure.wp-block-image figcaption{position:absolute;bottom:0;max-height:100%;overflow:auto;padding:1em;color:white;text-shadow:0 0 1.5px black;background:linear-gradient(0deg,#0006,transparent)}
     .wp-block-gallery.has-nested-images figure.wp-block-image:has(figcaption)::before{content:"";position:absolute;bottom:0;height:3em;backdrop-filter:blur(3px)}`;
const mediaCss = fs.readFileSync(path.join(plugin, 'media-presentation.css'), 'utf8');
function image(width, height, color, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${color}"/><rect x="20" y="20" width="${width - 40}" height="${height - 40}" fill="none" stroke="white" stroke-width="3"/><text x="50%" y="50%" text-anchor="middle" fill="white" font-family="sans-serif" font-size="24">${label}</text></svg>`;
  return `<img width="${width}" height="${height}" alt="${label}" src="data:image/svg+xml,${encodeURIComponent(svg)}">`;
}
function figure(content, caption = '', cls = '') {
  return `<figure class="wp-block-image ${cls}">${content}<figcaption class="wp-element-caption">${caption}</figcaption></figure>`;
}
function fixture() {
  const wide = image(900, 300, '#3d667b', 'Wide landscape');
  const tall = image(300, 450, '#596f51', 'Portrait');
  const square = image(400, 400, '#8b674b', 'Square');
  return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Native media reading fixture</title>
  <style>body{font:18px/1.7 system-ui,sans-serif;color:#293630;background:#fafbf9;margin:0;padding:24px}main{max-width:820px;margin:auto}h1{font-size:26px}h2{font-size:21px;margin:32px 0 14px}figure{margin:1.25rem 0}a{color:inherit}aside img{max-width:100%;height:auto}html.dark body{color:#e3e9e5;background:#18211e}</style>
  <main data-mbb-content-view><h1>图片与图注 · 阅读示例</h1>
  <h2>单张宽图</h2>${figure(wide, '图 1. 宽图保留原比例；说明在图片下方，链接 <a href="#gallery">查看对比</a>。')}
  <h2 id="gallery">混合比例画廊</h2><figure class="wp-block-gallery has-nested-images columns-3">
  ${figure(`<a href="#gallery">${wide}</a>`, '第一张：宽图，完整呈现图片内容。')}
  ${figure(tall, '第二张：纵向照片。很长的中文图注会自然换行，仍能阅读全部说明。<a href="#gallery">图注中的链接</a>可用键盘访问。' + '补充说明，确保图注不被图片边界裁切。'.repeat(3))}
  ${figure(square, '')}<figcaption>整组说明：不同图片比例与空图注可以共存。</figcaption></figure>
  <h2>方形裁切画廊</h2><figure class="wp-block-gallery has-nested-images columns-2 is-cropped">${figure(`<a href="#gallery">${wide}</a>`, '显式裁切保持方形，图注仍在图外。' + image(24, 24, '#526577', 'Emoji'))}${figure(tall, '纵图的裁切样式。')}</figure>
  <h2>单项画廊</h2><figure class="wp-block-gallery has-nested-images columns-default">${figure(wide, '只有一项时占满画廊宽度。')}</figure>
  <h2>长链接与空图注</h2>${figure(square, '<a href="#gallery">https://example.test/' + 'long-segment'.repeat(18) + '</a>')}
  </main><aside><figure class="wp-block-gallery has-nested-images">${figure(square, 'Outside scope')}</figure></aside>`;
}
async function inspect(page, width, mode, order) {
  await page.setViewportSize({ width, height: 900 });
  await page.setContent(fixture());
  const styles =
    order === 'no-core'
      ? [mediaCss]
      : order === 'core-last'
        ? [mediaCss, coreCss]
        : [coreCss, mediaCss];
  for (const css of styles) {
    await page.addStyleTag({ content: css });
  }
  if (mode === 'dark') await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.emulateMedia({ media: mode === 'print' ? 'print' : 'screen' });
  await page
    .locator('main img')
    .evaluateAll((images) => Promise.all(images.map((img) => img.decode())));
  const result = await page.evaluate(() => {
    const root = document.querySelector('main');
    const captions = [...root.querySelectorAll('.wp-block-image > figcaption')].filter(
      (el) => el.textContent,
    );
    const checks = captions.map((caption) => {
      const figure = caption.parentElement;
      const img = figure.querySelector('img');
      const style = getComputedStyle(caption);
      return {
        below: caption.getBoundingClientRect().top >= img.getBoundingClientRect().bottom,
        unclipped: caption.scrollHeight <= caption.clientHeight + 1,
        position: style.position,
        background: style.backgroundImage,
        color: style.color,
        shadow: style.textShadow,
        pseudo: getComputedStyle(figure, '::before').content,
      };
    });
    const gallery = root.querySelector('.columns-3');
    const single = root.querySelector('.columns-default');
    const cropped = root.querySelector('.is-cropped img').getBoundingClientRect();
    const wide = root.querySelector('.wp-block-image img').getBoundingClientRect();
    return {
      checks,
      columns: getComputedStyle(gallery).gridTemplateColumns.split(' ').length,
      singleFull: Math.abs(single.clientWidth - single.firstElementChild.clientWidth) < 2,
      cropRatio: cropped.width / cropped.height,
      captionImageHeight: root.querySelector('.is-cropped figcaption img').getBoundingClientRect()
        .height,
      naturalRatio: wide.width / wide.height,
      noOverflow: document.documentElement.scrollWidth <= innerWidth,
      emptyHidden: getComputedStyle(root.querySelector('figcaption:empty')).display === 'none',
      outsidePosition: getComputedStyle(document.querySelector('aside figcaption')).position,
    };
  });
  assert(result.noOverflow, `${width}/${mode}/${order}: horizontal overflow`);
  assert(result.emptyHidden, 'Empty caption should not reserve space');
  assert(result.singleFull, 'Single-item gallery should span the grid');
  assert(result.captionImageHeight <= 18, 'Caption inline images must remain text-sized');
  assert(
    Math.abs(result.cropRatio - 1) < 0.01,
    `Authored square crop should remain square: ${width}/${mode}/${order} ${JSON.stringify(result)}`,
  );
  assert(Math.abs(result.naturalRatio - 3) < 0.01, 'Natural wide image should keep its ratio');
  assert.equal(
    result.outsidePosition,
    order === 'no-core' ? 'static' : 'absolute',
    'Media outside the managed scope must retain host styles',
  );
  for (const check of result.checks) {
    assert(check.below && check.unclipped, `Caption is clipped/overlaid: ${JSON.stringify(check)}`);
    assert.equal(check.position, 'static');
    assert.equal(check.background, 'none');
    assert.equal(check.shadow, 'none');
    assert.equal(check.pseudo, 'none');
  }
  if (mode !== 'print') assert.equal(result.columns, width <= 480 ? 1 : width <= 700 ? 2 : 3);
  await page.locator('main figcaption a').first().focus();
  assert.equal(
    await page
      .locator('main figcaption a')
      .first()
      .evaluate((el) => getComputedStyle(el).outlineStyle),
    'solid',
  );
  if (order === 'core-last') {
    await page
      .locator('main')
      .screenshot({ path: path.join(evidence, `gallery-${width}-${mode}.png`) });
  }
  return { width, mode, order, ...result };
}
(async () => {
  fs.mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    const results = [];
    for (const [width, mode] of [
      [1440, 'light'],
      [390, 'light'],
      [600, 'light'],
      [390, 'dark'],
      [1440, 'print'],
    ]) {
      for (const order of ['core-first', 'core-last'])
        results.push(await inspect(page, width, mode, order));
    }
    for (const width of [1440, 390]) results.push(await inspect(page, width, 'light', 'no-core'));
    await page.emulateMedia({ media: 'screen' });
    await page.addStyleTag({
      content:
        '[data-mbb-content-view] { --mbb-caption-color: rgb(160, 180, 200); --mbb-caption-size: 20px; --mbb-gallery-gap: 24px; }',
    });
    assert.equal(
      await page
        .locator('main figcaption')
        .first()
        .evaluate((el) => getComputedStyle(el).color),
      'rgb(160, 180, 200)',
    );
    assert.equal(
      await page
        .locator('main figcaption')
        .first()
        .evaluate((el) => getComputedStyle(el).fontSize),
      '20px',
    );
    assert.equal(
      await page
        .locator('main .wp-block-gallery')
        .first()
        .evaluate((el) => getComputedStyle(el).gap),
      '24px',
    );
    fs.writeFileSync(
      path.join(evidence, 'gallery-results.json'),
      JSON.stringify(results, null, 2) + '\n',
    );
    console.log(
      `Media presentation: ${results.length} source-CSS checks passed. Evidence: ${evidence}`,
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
