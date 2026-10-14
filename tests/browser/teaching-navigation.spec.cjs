const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const plugin = path.resolve(__dirname, '../../plugin');
const style = fs.readFileSync(path.join(plugin, 'teaching.css'), 'utf8');
const script = fs.readFileSync(path.join(plugin, 'teaching.js'), 'utf8');
const evidence = process.env.MARKBRIDGE_READING_EVIDENCE_DIR || 'test-results';
const fold = (id, config) =>
  `<div id="${id}" class="wp-block-mbb-collapse" data-mbb-teaching="collapse" data-mbb-teaching-config='${JSON.stringify(config)}'><p class="mbb-teaching-title">${id}</p><div class="mbb-teaching-body"><h3 id="${id}-target">Fold content</h3></div></div>`;
const reading = Array.from(
  { length: 20 },
  (_, i) =>
    `<p>Reading paragraph ${i + 1}: compare the current value with the sorted prefix. Keep the invariant in mind before moving to the next stage.</p>`,
).join('');
const course = (id) =>
  `<section id="${id}" class="wp-block-mbb-steps" data-mbb-teaching="steps" data-mbb-teaching-config='{"mode":"staged","previous":true,"next":true,"full":true}'><h2 class="mbb-teaching-title">Long course ${id}</h2><div class="mbb-teaching-body">${[1, 2].map((n) => `<section id="${id}-${n}" data-mbb-teaching="step"><h3 class="mbb-teaching-title">Stage ${n}</h3><div class="mbb-teaching-body"><p>Long reading stage</p><div style="min-height:1100px">${reading}</div>${fold(id + '-fold-' + n, {})}<h3 id="${id}-anchor-${n}">End of stage ${n}</h3><div style="height:500px"></div></div></section>`).join('')}</div></section>`;
async function load(page, enhance = true) {
  await page.goto('/health');
  await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>
    body{margin:0;font:16px/1.6 sans-serif;background:#fafafa;color:#243447}
    #wpadminbar{position:fixed;top:0;height:32px;width:100%;background:#222;color:white;z-index:1000}
    header{position:sticky;top:32px;height:64px;background:#edf2f6;z-index:100}
    main{margin:180px auto 0;max-width:860px;padding:16px;overflow:clip}
    .mbb-teaching-body{overflow:clip} ${style}
    </style><div id="wpadminbar">Synthetic admin bar</div><header data-mbb-teaching-sticky-obstruction>Site header</header><main>${course('alpha')}<p>Between courses</p>${course('beta')}${fold('explicit', { open: true })}${fold('closed', { open: false })}<div style="height:1200px"></div></main>`);
  if (enhance) await page.addScriptTag({ content: script });
}
const rect = (locator) =>
  locator.evaluate((node) => {
    const { top, bottom, height } = node.getBoundingClientRect();
    return { top, bottom, height };
  });

test('stage navigation sticks below headers, reveals anchors and leaves each group', async ({
  page,
}, info) => {
  await load(page);
  const bar = page.locator('#alpha > .mbb-stage-controls');
  await expect.poll(async () => (await rect(bar)).top).toBeGreaterThan(96);
  await page.evaluate(() => window.scrollTo(0, 800));
  await expect.poll(async () => (await rect(bar)).top).toBe(96);
  expect(await bar.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: path.join(evidence, `sticky-${info.project.name}.png`) });
  await bar.getByRole('button', { name: 'Next stage', exact: true }).click();
  await expect(page.locator('#alpha-2')).toBeVisible();
  await expect(page.locator('#alpha-1')).toBeHidden();
  await expect(page.locator('#alpha-2')).toBeFocused();
  expect((await rect(page.locator('#alpha-2'))).top).toBeGreaterThanOrEqual(
    (await rect(bar)).bottom,
  );
  await page.evaluate(() => {
    location.hash = 'alpha-fold-2-target';
  });
  await expect(page.locator('#alpha-fold-2-target')).toBeVisible();
  await expect
    .poll(async () => (await rect(page.locator('#alpha-fold-2-target'))).top)
    .toBeGreaterThanOrEqual((await rect(bar)).bottom);
  await page.evaluate(() => window.scrollTo(0, document.getElementById('beta').offsetTop + 500));
  await expect
    .poll(async () => (await rect(page.locator('#beta > .mbb-stage-controls'))).top)
    .toBe(96);
  expect((await rect(bar)).bottom).toBeLessThanOrEqual(96);
  await page.evaluate(() => (location.hash = 'alpha'));
  await expect
    .poll(async () => (await rect(page.locator('#alpha'))).top)
    .toBeGreaterThanOrEqual(96);
  await page.emulateMedia({ media: 'print' });
  await expect(bar).toBeHidden();
  await expect(page.locator('#alpha-1')).toBeVisible();
  await expect(page.locator('#alpha-fold-1-target')).toBeVisible();
});

test('navigation offset, toolbar resize and disappearing admin bar update anchor space', async ({
  page,
}) => {
  await load(page);
  const group = page.locator('#alpha');
  const bar = group.locator(':scope > .mbb-stage-controls');
  await group.evaluate((node) => node.style.setProperty('--mbb-teaching-sticky-offset', '150px'));
  await page.evaluate(() => window.scrollTo(0, 700));
  await expect.poll(async () => (await rect(bar)).top).toBe(150);
  await bar.evaluate((node) => (node.style.paddingBottom = '80px'));
  await expect
    .poll(async () => {
      const actual = (await rect(bar)).height;
      const measured = await group.evaluate((node) =>
        parseFloat(node.style.getPropertyValue('--mbb-teaching-controls-height')),
      );
      return Math.abs(actual - measured);
    })
    .toBeLessThan(1);
  await page.evaluate(() => {
    document.getElementById('alpha').style.removeProperty('--mbb-teaching-sticky-offset');
    document.getElementById('wpadminbar').style.position = 'absolute';
    document.querySelector('header').style.top = '0px';
    dispatchEvent(new Event('resize'));
  });
  await expect.poll(async () => (await rect(bar)).top).toBe(64);
  await page.evaluate(() => (location.hash = 'alpha-anchor-1'));
  await expect
    .poll(async () => (await rect(page.locator('#alpha-anchor-1'))).top)
    .toBeGreaterThanOrEqual((await rect(bar)).bottom);
});

test('fold defaults remain closed, explicit open is preserved, and static reading stays complete', async ({
  page,
}) => {
  await load(page, false);
  await expect(page.locator('#alpha-2')).toBeVisible();
  await expect(page.locator('#alpha-fold-1-target')).toBeVisible();
  await expect(page.locator('.mbb-stage-controls')).toHaveCount(0);
  await page.locator('#alpha').evaluate((node) => {
    const config = JSON.parse(node.dataset.mbbTeachingConfig);
    config.mode = 'full';
    node.dataset.mbbTeachingConfig = JSON.stringify(config);
  });
  await page.addScriptTag({ content: script });
  await expect(page.locator('#alpha-2')).toBeVisible();
  await expect(page.locator('#alpha-fold-1 > .mbb-teaching-body')).toBeHidden();
  await expect(page.locator('#closed > .mbb-teaching-body')).toBeHidden();
  await expect(page.locator('#explicit > .mbb-teaching-body')).toBeVisible();
  await page.locator('#alpha-fold-1 .mbb-collapse-toggle').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#alpha-fold-1-target')).toBeVisible();
});
