// Real core scripts/converter and modeled REST. Actual WordPress storage is verified by the guarded lab.
const { test, expect } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const raw = require('../fixtures/code-tabs.json')[0].source;
const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const found = [];
  errors.set(page, found);
  page.on('pageerror', (error) => found.push(error.message));
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
const convert = (source, id = 'RawSource') => {
  const result = JSON.parse(
    execFileSync(
      process.env.MARKBRIDGE_PHP || 'php',
      [
        '-r',
        'require $argv[1]; echo json_encode(\\MarkBridge\\Probe\\Worker::convert(json_decode(stream_get_contents(STDIN),true)));',
        path.resolve(__dirname, '../../plugin/includes/php-converter/Worker.php'),
      ],
      { input: JSON.stringify({ mode: 'markdown', source, documentId: id }), encoding: 'utf8' },
    ),
  );
  if (!result.ok) throw Error(JSON.stringify(result));
  return result.document;
};
async function fixture(page, { existing = false } = {}) {
  const state = { previews: [], saves: [], holdSave: null },
    document = convert(raw, 'RawSource');
  await page.route('**/wp-json/mbb/v1/**', async (route) => {
    const url = new URL(route.request().url()),
      name = url.pathname.split('/').at(-1);
    if (name === 'document')
      return route.fulfill({
        json: {
          post_id: 12,
          expected: 'baseline-1',
          title: 'Raw source',
          post_status: 'draft',
          featured_media: 0,
          source_managed: true,
          source_write_available: false,
          document,
        },
      });
    if (name === 'source')
      return route.fulfill({
        json: { expected: 'baseline-1', source_sha256: 'f'.repeat(64), source: raw },
      });
    const data = route.request().postDataJSON();
    if (name === 'preview' || name === 'save') {
      state[name === 'preview' ? 'previews' : 'saves'].push(data);
      if (name === 'save' && state.holdSave) await state.holdSave;
      const doc = convert(data.source, data.documentId);
      return route.fulfill({
        json: {
          post_id: name === 'save' ? 12 : data.post_id,
          expected: name === 'save' ? 'saved' : 'baseline-1',
          title: data.title,
          post_status: data.post_status,
          featured_media: 0,
          document: doc,
          before: existing ? raw : '',
          before_title: existing ? 'Raw source' : '',
          html: doc.serialized,
          editor_url: '/health',
        },
      });
    }
    return route.fulfill({ status: 404, json: { code: 'fixture_only' } });
  });
  await page.goto(existing ? '/recovery-editor?source=1' : '/recovery-editor?new=1');
  return state;
}
async function upload(page) {
  await page.locator('#mbb-new').click();
  await page.locator('#mbb-title').fill('Raw upload');
  await page.locator('#mbb-document-id').fill('RawSource');
  await page
    .locator('#mbb-upload')
    .setInputFiles({ name: 'raw.md', mimeType: 'text/markdown', buffer: Buffer.from(raw, 'utf8') });
  await expect(page.locator('#mbb-dialog > p[role=status]')).toContainText('文件已读取');
}
test('unedited MD upload previews and saves exact raw source while textarea displays normalized lines', async ({
  page,
}) => {
  const state = await fixture(page);
  await upload(page);
  await expect(page.locator('#mbb-source')).toHaveValue(raw.replace(/\r\n?/g, '\n'));
  await expect(page.locator('#mbb-source-eol')).toContainText('未编辑');
  await page.locator('#mbb-review').click();
  await expect(page.locator('#mbb-save')).toBeEnabled();
  expect(state.previews.at(-1).source).toBe(raw);
  expect(await page.evaluate(() => MarkBridgeEditorRecovery.snapshot().payload.content)).toBe(raw);
  await page.locator('#mbb-save').click();
  await expect.poll(() => state.saves.length).toBe(1);
  expect(state.saves[0].source).toBe(raw);
});
test('server source loading, explicit recovery and FrontMatter preparation retain untouched code bytes', async ({
  page,
}) => {
  await fixture(page, { existing: true });
  await page.locator('#mbb-markdown').click();
  await expect(page.locator('#mbb-source')).toHaveValue(raw.replace(/\r\n?/g, '\n'));
  expect(await page.evaluate(() => MarkBridgeEditorRecovery.snapshot().payload.content)).toBe(raw);
  await page.evaluate(
    (raw) =>
      MarkBridgeEditorRecovery.restore(
        {
          kind: 'markdown',
          context: { postId: 0, expected: null, sourceDigest: null },
          payload: {
            content: raw,
            title: 'Recovered',
            documentId: 'RawSource',
            status: 'draft',
            featuredMedia: 0,
          },
        },
        async () => true,
      ),
    raw,
  );
  expect(await page.evaluate(() => MarkBridgeEditorRecovery.snapshot().payload.content)).toBe(raw);
  await page.locator('#mbb-frontmatter-from-current').click();
  await expect
    .poll(() => page.evaluate(() => MarkBridgeEditorRecovery.snapshot().payload.content))
    .toContain(raw);
  await page.locator('#mbb-source').fill('Actual input\n');
  await expect(page.locator('#mbb-source-eol')).toContainText('已实际编辑');
  expect(await page.evaluate(() => MarkBridgeEditorRecovery.snapshot().payload.content)).toBe(
    'Actual input\n',
  );
});
test('saved A response leaves later edited B source and recovery snapshot intact', async ({
  page,
}) => {
  const state = await fixture(page);
  await upload(page);
  await page.locator('#mbb-review').click();
  await expect(page.locator('#mbb-save')).toBeEnabled();
  let release;
  state.holdSave = new Promise((resolve) => (release = resolve));
  await page.locator('#mbb-save').click();
  await expect.poll(() => state.saves.length).toBe(1);
  await page.locator('#mbb-source').fill('Later B\n');
  release();
  await expect(page.locator('#mbb-dialog > p[role=status]')).toContainText('新输入仍保留');
  expect(state.saves[0].source).toBe(raw);
  expect(await page.evaluate(() => MarkBridgeEditorRecovery.snapshot().payload.content)).toBe(
    'Later B\n',
  );
});

test('recovery verification cannot replace later input or a reopened session on the same target', async ({
  page,
}) => {
  const state = await fixture(page);
  for (const [hold, reopen] of [
    [1, false],
    [2, false],
    [2, true],
  ]) {
    if (await page.locator('#mbb-dialog').isVisible()) {
      await page.getByRole('button', { name: '关闭编辑桥', exact: true }).click();
      await expect(page.locator('#mbb-dialog')).not.toBeVisible();
    }
    await upload(page);
    await page.evaluate(
      ({ raw, hold }) => {
        let calls = 0;
        window.rawRestoreHeld = false;
        window.rawRestoreResult = null;
        const record = {
          kind: 'markdown',
          context: { postId: 0, expected: null, sourceDigest: null },
          payload: {
            content: raw,
            title: 'Old recovery A',
            documentId: 'RawSource',
            status: 'draft',
            featuredMedia: 0,
          },
        };
        MarkBridgeEditorRecovery.restore(record, async () => {
          if (++calls === hold) {
            window.rawRestoreHeld = true;
            await new Promise((resolve) => (window.rawRestoreRelease = resolve));
          }
        }).then(
          () => (window.rawRestoreResult = { applied: true }),
          (e) => (window.rawRestoreResult = { error: e.message }),
        );
      },
      { raw, hold },
    );
    await expect.poll(() => page.evaluate(() => window.rawRestoreHeld)).toBe(true);
    if (reopen) {
      await page.getByRole('button', { name: '关闭编辑桥', exact: true }).click();
      await expect(page.locator('#mbb-dialog')).not.toBeVisible();
      await page.locator('#mbb-new').click();
    }
    await page.locator('#mbb-source').fill('Later B ' + hold + ' ' + reopen + '\n');
    const kept = await page.locator('#mbb-source').inputValue();
    const before = state.previews.length;
    await page.evaluate(() => window.rawRestoreRelease());
    await expect
      .poll(() => page.evaluate(() => window.rawRestoreResult?.error))
      .toContain('当前内容已保留');
    await expect(page.locator('#mbb-source')).toHaveValue(kept);
    expect(await page.evaluate(() => MarkBridgeEditorRecovery.snapshot().payload.content)).toBe(
      kept,
    );
    expect(state.previews.length).toBe(before);
  }
});
