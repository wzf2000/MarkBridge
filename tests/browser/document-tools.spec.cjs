// Public SDK dialogs on a real browser DOM, using explicit synthetic Core/REST capabilities.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
test('document tool keeps its draft on cancel and explicitly applies without save', async ({
  page,
}) => {
  await page.goto('/');
  await page.setContent(
    '<main><details open><summary>More</summary><div id="menu"></div></details><textarea id="native"></textarea></main>',
  );
  await page.addStyleTag({ path: path.resolve(__dirname, '../../plugin/editor-ui.css') });
  await page.addScriptTag({
    content: fs.readFileSync(path.resolve(__dirname, '../../plugin/source-tools.js'), 'utf8'),
  });
  await page.addScriptTag({
    content: fs.readFileSync(path.resolve(__dirname, '../../plugin/document-tools.js'), 'utf8'),
  });
  await page.evaluate(() => {
    let stamp = 0;
    window.calls = [];
    window.applied = 0;
    window.disposed = 0;
    window.MBB_MATH = { preview: async (html) => html, style: '' };
    const core = MBBCreateDocumentTools({
      stamp: () => String(stamp),
      clean: () => true,
      context: () => ({ post_id: 1, expected: 'saved' }),
      styles: () => '',
      diff: (target, before, after) => {
        target.textContent = before + '\n' + after;
      },
      apply: () => {
        window.applied++;
        stamp++;
      },
      api: async (route, payload) => {
        window.calls.push(route);
        if (route.endsWith('capture'))
          return {
            source: 'Original',
            serialized: 'original-blocks',
            documentId: 'TestDoc',
            identity: null,
            sourceSha256: 'a',
            serializedSha256: 'b',
            receipt: 'synthetic',
          };
        if (payload.source === 'Invalid candidate')
          throw Object.assign(Error('Reject the invalid suggestion and retry'), {
            status: 422,
            code: 'UNSUPPORTED_BLOCK',
          });
        return {
          before: 'Original',
          html: '<p>Candidate</p><script>throw Error("unsafe")</script>',
          document: { source: payload.source, serialized: 'candidate-blocks' },
        };
      },
    });
    core.menu(document.querySelector('#menu'));
    MarkBridgeDocumentTools.registerTool('example', {
      label: 'Example review',
      render(host, api) {
        const draft = document.createElement('textarea');
        draft.setAttribute('aria-label', 'Tool draft');
        draft.value = 'Invalid candidate';
        const capture = document.createElement('button');
        capture.textContent = 'Capture original';
        const preview = document.createElement('button');
        preview.textContent = 'Propose candidate';
        const rejectBad = document.createElement('button');
        rejectBad.textContent = 'Reject invalid suggestion';
        rejectBad.onclick = () => {
          draft.value = 'Candidate';
        };
        let opening;
        capture.onclick = async () => {
          opening = await api.capture();
          capture.textContent = 'Captured';
        };
        preview.onclick = async () => {
          try {
            await api.propose({ openingToken: opening.openingToken, source: draft.value });
          } catch (error) {
            host.dataset.error = error.message;
            host.dataset.current = String(api.isCurrent(opening.openingToken));
            rejectBad.disabled = !api.isCurrent(opening.openingToken);
          }
        };
        host.append(draft, capture, preview, rejectBad);
        return () => {
          window.disposed++;
        };
      },
    });
  });
  await page.getByRole('button', { name: 'Example review' }).click();
  await page.getByRole('button', { name: 'Capture original' }).click();
  await expect(page.getByRole('button', { name: 'Captured' })).toBeVisible();
  await page.getByRole('button', { name: 'Propose candidate' }).click();
  await expect(page.locator('.mbb-document-tool-host')).toHaveAttribute('data-current', 'true');
  await expect(page.getByRole('button', { name: 'Reject invalid suggestion' })).toBeEnabled();
  await page.getByRole('button', { name: 'Reject invalid suggestion' }).click();
  await page.getByRole('button', { name: 'Propose candidate' }).click();
  await expect(page.getByRole('dialog', { name: 'Review document candidate' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByLabel('Tool draft')).toHaveValue('Candidate');
  expect(await page.evaluate(() => disposed)).toBe(0);
  await page.getByRole('button', { name: 'Propose candidate' }).click();
  await page.getByRole('button', { name: 'Apply to editor' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => ({ applied, disposed, calls }))).toEqual({
    applied: 1,
    disposed: 1,
    calls: [
      'document-tools/capture',
      'document-tools/preview',
      'document-tools/preview',
      'document-tools/preview',
      'document-tools/preview',
    ],
  });
});

test('Main source application uses existing byte-preserving Undo and never saves', async ({
  page,
}) => {
  const original = '# Original\r\n\r\nA\r\n',
    candidate = '# Candidate\r\n\r\nB\r\n';
  const calls = [];
  await page.route('**/wp-json/mbb/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/mbb/v1/')[1];
    calls.push(name);
    const common = {
      post_id: 12,
      source_managed: false,
      title: 'Fixture document',
      post_status: 'draft',
      featured_media: 0,
      expected: 'saved-baseline',
      document: { schema: 1, documentId: 'TestDoc', source: original, serialized: '' },
    };
    const data =
      name.startsWith('document?') || name === 'document'
        ? common
        : name === 'document-tools/capture'
          ? {
              source: original,
              serialized: '',
              documentId: 'TestDoc',
              identity: null,
              sourceSha256: 'a',
              serializedSha256: 'b',
              receipt: 'synthetic',
            }
          : name === 'document-tools/preview'
            ? {
                before: original,
                html: '<p>Candidate</p>',
                document: { source: candidate, serialized: '' },
              }
            : { message: 'No merge baseline in synthetic test', code: 'merge_unavailable' };
    return route.fulfill({
      status: name.startsWith('merge/') ? 409 : 200,
      contentType: 'application/json',
      body: JSON.stringify(data),
    });
  });
  await page.goto('/editor?locale=en_US');
  await page.evaluate(() => {
    MarkBridgeDocumentTools.registerTool('source-review', {
      label: 'Source review',
      render(host, api) {
        const button = document.createElement('button');
        button.textContent = 'Prepare source candidate';
        button.onclick = async () => {
          const opening = await api.capture();
          await api.propose({
            openingToken: opening.openingToken,
            source: '# Candidate\r\n\r\nB\r\n',
          });
        };
        host.append(button);
      },
    });
  });
  await page.locator('.mbb-open').click();
  await expect(page.locator('#mbb-source')).toHaveValue(original.replace(/\r\n/g, '\n'));
  await page.locator('.mbb-document-more summary').click();
  await page.getByRole('button', { name: 'Source review', exact: true }).click();
  await page.getByRole('button', { name: 'Prepare source candidate', exact: true }).click();
  await page.getByRole('button', { name: 'Apply to editor', exact: true }).click();
  await expect(page.locator('#mbb-dialog')).toBeVisible();
  await expect(page.locator('#mbb-source')).toHaveValue(candidate.replace(/\r\n/g, '\n'));
  await page.locator('#mbb-source').focus();
  await page.keyboard.press('Control+z');
  await expect(page.locator('#mbb-source')).toHaveValue(original.replace(/\r\n/g, '\n'));
  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('#mbb-source')).toHaveValue(candidate.replace(/\r\n/g, '\n'));
  expect(calls.filter((name) => name.endsWith('save'))).toEqual([]);
});
