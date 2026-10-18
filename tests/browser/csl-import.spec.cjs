const { test, expect } = require('@playwright/test');
const fs = require('node:fs'),
  path = require('node:path');
test.skip(!process.env.MARKBRIDGE_TEST_RUNTIME, 'Needs the actual WordPress editor runtime.');
async function selected(page) {
  await page.evaluate(() =>
    taskRegistry
      .dispatch('core/block-editor')
      .selectBlock(taskBlocks.find((b) => b.name === 'mbb/bibliography').clientId),
  );
}
const attrs = (page) =>
  page.evaluate(() =>
    JSON.stringify(taskBlocks.find((b) => b.name === 'mbb/bibliography').attributes),
  );
test('bibliography v2 migration stays a literal editable candidate until one apply', async ({
  page,
}, info) => {
  await page.setViewportSize(
    info.project.name.startsWith('mobile')
      ? { width: 390, height: 844 }
      : { width: 1440, height: 900 },
  );
  await page.goto('/technical-editor?locale=en_US');
  await expect(page.locator('iframe[name="editor-canvas"]')).toBeVisible();
  await selected(page);
  const original = await attrs(page);
  await page
    .getByRole('button', { name: 'Prepare bibliography v2 candidate', exact: true })
    .click();
  await expect(page.getByRole('combobox', { name: 'Citation style', exact: true })).toHaveValue(
    'author-year',
  );
  await expect(
    page.getByRole('textbox', { name: 'Literal name or institution', exact: true }),
  ).toHaveValue('A. 作者😀');
  expect(await attrs(page)).toBe(original);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.locator('#task-export')).toContainText(
    'ERROR: Parameters have not been applied',
  );
  await page.getByRole('combobox', { name: 'Citation style', exact: true }).selectOption('numeric');
  await page.getByRole('textbox', { name: 'Publisher', exact: true }).fill('Explicit publisher');
  await page.getByRole('button', { name: 'Discard bibliography edits', exact: true }).click();
  expect(await attrs(page)).toBe(original);
  await expect(
    page.getByRole('button', { name: 'Prepare bibliography v2 candidate', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Prepare bibliography v2 candidate', exact: true })
    .click();
  await page.getByRole('combobox', { name: 'Citation style', exact: true }).selectOption('numeric');
  const family = page.getByRole('combobox', { name: 'Name form', exact: true });
  await family.selectOption('person');
  await page
    .getByRole('textbox', { name: 'Family name (explicit)', exact: true })
    .fill('Explicit family');
  await page.getByRole('textbox', { name: 'Given name', exact: true }).fill('Explicit given');
  await page.getByRole('button', { name: 'Apply bibliography edits', exact: true }).click();
  await expect.poll(async () => JSON.parse(await attrs(page)).version).toBe(2);
  const value = JSON.parse(await attrs(page));
  expect(value.style).toBe('numeric');
  expect(value.entries[0].authors[0]).toEqual({
    family: 'Explicit family',
    given: 'Explicit given',
    droppingParticle: '',
    nonDroppingParticle: '',
    suffix: '',
  });
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.locator('#task-export')).toContainText(':::mbb:v2 bibliography');
  await expect(page.locator('#task-export')).not.toContainText('ERROR:');
  await page
    .getByRole('combobox', { name: 'Reference type', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('bibliography-v2-fields.png'), fullPage: true });
});
test('fixed citation styles keep matching readable bibliography labels in front and static HTML', async ({
  page,
}, info) => {
  await page.setViewportSize(
    info.project.name.startsWith('mobile')
      ? { width: 390, height: 844 }
      : { width: 1440, height: 900 },
  );
  const css = fs.readFileSync(path.resolve('plugin/technical.css'), 'utf8');
  await page.goto('/health');
  for (const style of ['author-year', 'numeric'])
    for (const mode of ['front', 'static']) {
      const result = await page.request.get(
        '/bibliography-presentation?style=' + style + (mode === 'static' ? '&static=1' : ''),
      );
      expect(result.ok()).toBe(true);
      await page.setContent(
        '<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{box-sizing:border-box;max-width:800px;margin:0 auto;padding:24px;font:17px/1.7 system-ui;}' +
          css +
          '</style><article><h1>Two explicit references</h1>' +
          (await result.text()) +
          '</article>',
      );
      const label = page.locator('.mbb-reference-label');
      if (style === 'numeric') {
        await expect(label).toHaveText('[1, 2]');
        await expect(page.locator('.mbb-bib-number')).toHaveText(['[1]', '[2]']);
        await expect(page.locator('.mbb-bib-number').first()).toBeVisible();
      } else {
        await expect(label).toHaveText(/2024a;.*2024b/);
        await expect(page.locator('.mbb-bib-number')).toHaveCount(0);
      }
      await expect(page.locator('article')).toContainText('DOI 10.1234/example');
      await expect(page.locator('article')).toContainText('研究机构');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (mode === 'static')
        await page.screenshot({
          path: info.outputPath('bibliography-' + style + '-static.png'),
          fullPage: true,
        });
    }
});
test('CSL import previews field loss and key mapping, blocks conflict and stale input, then adopts into the shared draft', async ({
  page,
}, info) => {
  await page.setViewportSize(
    info.project.name.startsWith('mobile')
      ? { width: 390, height: 844 }
      : { width: 1440, height: 900 },
  );
  await page.goto('/technical-editor?locale=en_US');
  await expect(page.locator('iframe[name="editor-canvas"]')).toBeVisible();
  await selected(page);
  const original = await attrs(page);
  await page.getByRole('button', { name: 'Import CSL-JSON', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'Import bounded CSL-JSON', exact: true }),
    input = modal.getByRole('textbox', { name: 'CSL-JSON source (up to 64 KiB)', exact: true }),
    preview = modal.getByRole('button', { name: 'Preview CSL-JSON mapping', exact: true }),
    use = modal.getByRole('button', { name: 'Use bibliography candidate', exact: true });
  const source = JSON.stringify([
    {
      id: 42,
      type: 'article-journal',
      title: 'Imported paper with explicit structured metadata',
      author: [{ family: 'Doe', given: 'Jane' }, { literal: 'Research institution' }],
      issued: { 'date-parts': [[2026, 10, 17]] },
      'container-title': 'Journal',
      volume: '4',
      issue: '2',
      page: '10–19',
      DOI: '10.1234/example',
      abstract: 'This unsupported field will be discarded only after acknowledgement',
    },
  ]);
  await page.evaluate(() => {
    window.originalCSLRead = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = () =>
      new Promise((resolve) => {
        window.resolveCSLFile = resolve;
      });
  });
  await modal.getByLabel('CSL-JSON file (optional)', { exact: true }).setInputFiles({
    name: 'late.json',
    mimeType: 'application/json',
    buffer: Buffer.from(source),
  });
  await expect.poll(() => page.evaluate(() => typeof window.resolveCSLFile)).toBe('function');
  await input.fill(source);
  await page.evaluate(() => {
    window.resolveCSLFile(
      new TextEncoder().encode('[{"id":"Late","type":"book","title":"Late file"}]').buffer,
    );
    File.prototype.arrayBuffer = window.originalCSLRead;
  });
  await expect(input).toHaveValue(source);
  await preview.click();
  await expect(modal).toContainText('abstract');
  await expect(modal).toContainText('42 → reference-1');
  await expect(use).toBeDisabled();
  await modal
    .getByRole('checkbox', {
      name: 'I reviewed and accept the listed CSL-JSON field losses',
      exact: true,
    })
    .check();
  await modal
    .getByRole('checkbox', {
      name: 'I reviewed and accept the proposed citation keys',
      exact: true,
    })
    .check();
  await expect(use).toBeEnabled();
  expect(await attrs(page)).toBe(original);
  const key = modal.getByRole('textbox', { name: 'Proposed citation key', exact: true });
  await key.fill('ImportedPaper');
  await expect(key).toBeFocused();
  await expect(key).toHaveValue('ImportedPaper');
  await expect(use).toBeDisabled();
  await key.fill('invalid key');
  await preview.click();
  await expect(key).toHaveValue('invalid key');
  await expect(use).toBeDisabled();
  await key.fill('ImportedPaper');
  await preview.click();
  await modal
    .getByRole('checkbox', {
      name: 'I reviewed and accept the listed CSL-JSON field losses',
      exact: true,
    })
    .check();
  await modal
    .getByRole('checkbox', {
      name: 'I reviewed and accept the proposed citation keys',
      exact: true,
    })
    .check();
  await modal.getByText('Mapped publication fields', { exact: true }).click();
  await expect(modal).toContainText('10.1234/example');
  await expect(modal).toContainText('2026-10-17');
  expect((await modal.boundingBox()).width).toBeLessThanOrEqual(721);
  await page.screenshot({ path: info.outputPath('csl-loss-and-key-preview.png'), fullPage: true });
  expect(await modal.evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
  await input.fill(source.replace('Imported paper', 'Changed after preview'));
  await expect(use).toBeDisabled();
  await preview.click();
  await modal
    .getByRole('checkbox', {
      name: 'I reviewed and accept the listed CSL-JSON field losses',
      exact: true,
    })
    .check();
  await modal
    .getByRole('checkbox', {
      name: 'I reviewed and accept the proposed citation keys',
      exact: true,
    })
    .check();
  await use.click();
  await expect(modal).toBeHidden();
  expect(await attrs(page)).toBe(original);
  await page.getByRole('button', { name: 'Apply bibliography edits', exact: true }).click();
  await expect.poll(async () => JSON.parse(await attrs(page)).entries.length).toBe(2);
  let value = JSON.parse(await attrs(page));
  expect(value.entries[0].authors[0]).toEqual({ literal: 'A. 作者😀' });
  expect(value.entries[1].doi).toBe('10.1234/example');
  await page.getByRole('button', { name: 'Import CSL-JSON', exact: true }).click();
  await input.fill('[{"id":"paper-a","type":"book","title":"Duplicate"}]');
  await preview.click();
  await expect(use).toBeDisabled();
  await expect(modal).toContainText('Bibliography keys must be unique');
  await input.fill('[{"id":"Replacement","type":"book","title":"Missing cited key"}]');
  await modal
    .getByRole('combobox', { name: 'Import behavior', exact: true })
    .selectOption('replace');
  await preview.click();
  await expect(use).toBeDisabled();
  await expect(modal).toContainText('The replacement would remove currently cited keys');
  await modal.getByRole('button', { name: 'Cancel CSL-JSON import', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSL-JSON subset', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('bibliography.csl.json');
});
