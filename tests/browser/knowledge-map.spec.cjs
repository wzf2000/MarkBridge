const { test, expect } = require('@playwright/test');
const fs = require('node:fs'),
  path = require('node:path');
const plugin = path.resolve(__dirname, '../../plugin');
const author = require('../fixtures/knowledge-map.json').find((c) => c.id === 'defaults').params;
const drawing = {
  format: 'relation-map/v1',
  title: author.title,
  groups: author.groups,
  nodes: author.nodes.map((n, i) => ({
    id: n.id,
    group: n.group,
    title: '[Concept] ' + n.title,
    url: '#target-' + i,
    ...(n.description ? { description: n.description } : {}),
  })),
  edges: author.edges.map((e) => ({
    from: e.from,
    to: e.to,
    kind: { prerequisite: 'recommended', explains: 'compare', practises: 'optimization' }[e.kind],
    ...(e.why ? { why: e.why } : {}),
  })),
};
test('controlled static plans show unavailable notice only when needed and accept older plans', async ({
  page,
}) => {
  await page.goto('/health');
  await page.addScriptTag({ path: path.join(plugin, 'relation-map.js') });
  const profile = JSON.parse(
    fs.readFileSync(path.join(plugin, 'projections-profile.json'), 'utf8'),
  );
  await page.addScriptTag({
    content: fs
      .readFileSync(path.join(plugin, 'projections.js'), 'utf8')
      .replace('__MBB_PROJECTION_PROFILE__', JSON.stringify(profile)),
  });
  for (const schema of ['relation-map/public-v2', 'knowledge-map/public-v1']) {
    for (const incomplete of [undefined, true, false]) {
      const text = await page.evaluate(
        ({ drawing, schema, incomplete }) => {
          const root = document.createElement('div');
          root.innerHTML = '<div id="map"><p>Author fallback</p></div>';
          const projection = {
            schema,
            map: drawing,
            locale: 'en',
            edgeIds: drawing.edges.map((e, i) => 'e_' + String(i).padStart(32, '0')),
            interactive: false,
          };
          if (incomplete !== undefined) projection.incomplete = incomplete;
          MarkBridgeProjection.insert(root, [
            {
              target: 'map',
              component: 'knowledge-map',
              version: '0.1.0',
              fingerprint: null,
              state: 'author-fallback',
              params: drawing,
              projection,
            },
          ]);
          return root.textContent;
        },
        { drawing, schema, incomplete },
      );
      expect(text.includes('Some articles may be unavailable.')).toBe(incomplete !== false);
      expect(text).toContain(drawing.nodes[0].title);
      expect(text).toContain('Author fallback');
    }
  }
});
for (const width of [1440, 390, 320])
  test(`knowledge-map fixed native semantics and navigation ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/health');
    await page.setContent(
      `<html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:12px;font:16px/1.7 system-ui}#map{max-width:1000px;margin:auto}${fs.readFileSync(path.join(plugin, 'relation-map.css'), 'utf8')}</style><div id="map"><div class="mbb-teaching-body">Author explanation</div></div></html>`,
    );
    await page.addScriptTag({ path: path.join(plugin, 'relation-map.js') });
    await page.evaluate(
      (p) =>
        MBBRelationMap.enhance(document.querySelector('#map'), p, [], {
          semantics: 'knowledge-map/v1',
        }),
      drawing,
    );
    await expect(page.locator('.mbb-relation-legend')).toHaveText(
      'Prior understandingExplanation relationshipRelated practice',
    );
    await expect(page.locator('.mbb-relation-legend')).not.toContainText('Suggested reading order');
    if (width < 700) await page.getByRole('button', { name: 'View full map', exact: true }).click();
    await expect(page.locator('.mbb-relation-node')).toHaveCount(drawing.nodes.length);
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect(page.locator('.mbb-relation-status')).toContainText('125%');
    await page.getByRole('button', { name: 'Reset view', exact: true }).click();
    await expect(page.locator('.mbb-relation-status')).toContainText('100%');
    await page.getByRole('button', { name: 'Drag canvas: off', exact: true }).click();
    const first = page.locator('.mbb-relation-node').first(),
      box = await first.boundingBox();
    await page.mouse.move(box.x + 10, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 45, box.y + 35, { steps: 4 });
    await page.mouse.up();
    expect(page.url()).not.toContain('#target-');
    await page.getByRole('button', { name: 'Reset view', exact: true }).click();
    await page.locator('summary').click();
    await expect(page.locator('.mbb-relation-static')).not.toContainText('Compare ideas');
    await expect(page.locator('.mbb-relation-static')).toContainText('without restricting access');
    await expect(page.locator('.mbb-teaching-body')).toContainText('Author explanation');
    await page.screenshot({ path: info.outputPath(`knowledge-map-${width}.png`), fullPage: true });
    await first.focus();
    await page.keyboard.press('Enter');
    expect(page.url()).toContain('#target-0');
  });
