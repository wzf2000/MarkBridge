const { test, expect } = require('@playwright/test');

test('footnotes number references, isolate documents and navigate every backlink', async ({
  page,
}) => {
  await page.goto('/footnotes-front');
  const article = page.locator('#document-one');
  const refs = article.locator('a[href^="#"]').filter({ hasText: /[12]/ });
  const destinations = await article.evaluate((node) => {
    const references = [...node.querySelectorAll('.mbb-footnote-ref a')];
    return references.map((a) => ({
      id: a.id,
      target: a.getAttribute('href'),
      text: a.textContent,
    }));
  });
  expect(destinations).toHaveLength(3);
  expect(destinations.map((a) => a.text.replace(/\D/g, ''))).toEqual(['1', '1', '2']);
  const ids = await page.locator('[id]').evaluateAll((nodes) => nodes.map((n) => n.id));
  expect(new Set(ids).size).toBe(ids.length);
  for (const ref of destinations) {
    const link = page.locator(`[id="${ref.id}"]`);
    await link.focus();
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => decodeURIComponent(location.hash))).toBe(ref.target);
    await expect(page.locator(`[id="${ref.target.slice(1)}"]`)).toBeInViewport();
    const back = article.locator(`a[href="#${ref.id}"]`);
    await expect(back).toHaveCount(1);
    await expect(back).toHaveAttribute('aria-label', /.+/);
    await back.focus();
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => decodeURIComponent(location.hash))).toBe('#' + ref.id);
    await expect(link).toBeInViewport();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(article).toContainText('[^literal]');
});

test('real WordPress edits a footnote definition without losing its paired reference', async ({
  page,
}) => {
  test.skip(
    !process.env.MARKBRIDGE_TEST_RUNTIME,
    'Requires a sanitized real WordPress core-script runtime.',
  );
  await page.goto('/footnotes-editor');
  const text = page.locator('.wp-block-mbb-footnote .wp-block-paragraph[contenteditable="true"]');
  await text.fill('Updated footnote.');
  await page.locator('#export-tasks').click();
  await expect(page.locator('#task-export')).toContainText('[^note]: Updated footnote');
  await expect(page.locator('#task-export')).toContainText('Text[^note]');
  const valid = await page.evaluate(() => {
    const parsed = wp.blocks.parse(wp.blocks.serialize(taskBlocks));
    const walk = (blocks) => blocks.every((b) => b.isValid !== false && walk(b.innerBlocks));
    return walk(parsed);
  });
  expect(valid).toBe(true);
});

test('real WordPress toolbar inserts a repeated footnote reference', async ({ page }) => {
  test.skip(
    !process.env.MARKBRIDGE_TEST_RUNTIME,
    'Requires a sanitized real WordPress core-script runtime.',
  );
  await page.goto('/footnotes-editor');
  const paragraph = page
    .locator('#task-editor .wp-block-paragraph[contenteditable="true"]')
    .first();
  await paragraph.click();
  await paragraph.press('End');
  const button = page.getByRole('button', { name: '插入或修改脚注引用', exact: true });
  if (await button.isVisible()) await button.click();
  else {
    await page
      .getByRole('button', { name: /More|更多/ })
      .first()
      .click();
    await page.getByRole('menuitem', { name: /插入或修改脚注引用/ }).click();
  }
  await page.locator('.components-popover').getByLabel('脚注名称', { exact: true }).fill('note');
  await page.getByRole('button', { name: '插入引用', exact: true }).click();
  await page.locator('#export-tasks').click();
  const output = await page.locator('#task-export').textContent();
  expect(output).not.toContain('ERROR:');
  expect(output.match(/\[\^note\]/g)).toHaveLength(3); // two references plus definition
  const savedReferences = await page.evaluate(() => taskBlocks[0].attributes.content);
  expect(savedReferences.match(/data-mbb-footnote="note"/g)).toHaveLength(2);
});

test('renaming one adjacent reference keeps its neighbor intact', async ({ page }) => {
  test.skip(
    !process.env.MARKBRIDGE_TEST_RUNTIME,
    'Requires a sanitized real WordPress core-script runtime.',
  );
  await page.goto('/footnotes-adjacent-editor');
  await page.locator('#task-editor .mbb-footnote-ref').first().click();
  const button = page.getByRole('button', { name: '插入或修改脚注引用', exact: true });
  if (await button.isVisible()) await button.click();
  else {
    await page
      .getByRole('button', { name: /More|更多/ })
      .first()
      .click();
    await page.getByRole('menuitem', { name: /插入或修改脚注引用/ }).click();
  }
  await page.locator('.components-popover').getByLabel('脚注名称', { exact: true }).fill('b');
  await page.getByRole('button', { name: '插入引用', exact: true }).click();
  await page.locator('#export-tasks').click();
  const output = await page.locator('#task-export').textContent();
  expect(output).not.toContain('ERROR:');
  expect(output).toContain('Text[^b][^a]');
  expect(output.match(/\[\^a\]/g)).toHaveLength(2);
  expect(output.match(/\[\^b\]/g)).toHaveLength(3);
});

test('mock REST preview keeps footnote navigation inside its scriptless frame', async ({
  page,
  request,
}) => {
  const response = await request.get('/footnotes-front');
  const html = (await response.text()).match(/<body>([\s\S]*)<\/body>/)[1];
  const source = 'Text[^note].\n\n[^note]: Note.\n';
  await page.route('**/wp-json/mbb/v1/**', (route) => {
    const body = route.request().url().includes('/preview')
      ? { before: source, document: { source }, html }
      : {
          post_id: 12,
          source_managed: false,
          title: 'Footnote fixture',
          post_status: 'draft',
          featured_media: 0,
          expected: 'one',
          document: { schema: 1, documentId: 'fixture', source, serialized: '' },
        };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto('/editor');
  await page.getByRole('button', { name: '编辑现有文档' }).click();
  await expect(page.locator('#mbb-source')).toHaveValue(source);
  await page.locator('#mbb-review').click();
  const iframe = page.frameLocator('iframe[title="内置内容预览"]');
  const reference = iframe.locator('#document-one .mbb-footnote-ref a').first();
  const target = new URL(await reference.getAttribute('href')).hash;
  await reference.click();
  await expect(iframe.locator(`[id="${target.slice(1)}"]`)).toBeVisible();
  expect(await reference.evaluate((a) => getComputedStyle(a.parentElement).verticalAlign)).toBe(
    'super',
  );
  await expect(page.locator('#mbb-save')).toBeEnabled();
});
