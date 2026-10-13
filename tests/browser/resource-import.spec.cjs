// Core editor + candidate converters with modeled resource REST. No actual media writes are claimed.
const { test, expect } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const path = require('node:path');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
function convert(input) {
  const result = JSON.parse(
    execFileSync(
      process.env.MARKBRIDGE_PHP || 'php',
      [
        '-r',
        'require $argv[1]; echo json_encode(\\MarkBridge\\Probe\\Worker::convert(json_decode(stream_get_contents(STDIN), true)));',
        path.resolve(__dirname, '../../plugin/includes/php-converter/Worker.php'),
      ],
      { input: JSON.stringify(input), encoding: 'utf8' },
    ),
  );
  if (!result.ok) throw Error(result.message);
  return result.document;
}
function png() {
  const crc = (data) => {
    let value = 0xffffffff;
    for (const n of data) {
      value ^= n;
      for (let i = 0; i < 8; i++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (name, content) => {
    const data = Buffer.concat([Buffer.from(name), content]),
      size = Buffer.alloc(4),
      digest = Buffer.alloc(4);
    size.writeUInt32BE(content.length);
    digest.writeUInt32BE(crc(data));
    return Buffer.concat([size, data, digest]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(48);
  ihdr.writeUInt32BE(32, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk(
      'IDAT',
      zlib.deflateSync(
        Buffer.concat(
          Array.from({ length: 32 }, () =>
            Buffer.concat([Buffer.from([0]), Buffer.alloc(48 * 3, 100)]),
          ),
        ),
      ),
    ),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const imageBytes = png();
const image = {
  key: 'a'.repeat(64),
  path: 'images/a.png',
  sha256: hash(imageBytes),
  bytes: imageBytes.length,
  mime: 'image/png',
  width: 48,
  height: 32,
};
const zipSource =
  '---\nmarkbridge: 1\ntitle: "ZIP proposal"\n---\n\n![image](images/a.png)\n\n[ordinary](images/a.png)\n\n`![literal](images/a.png)`\n';
const errors = new WeakMap();
test.beforeEach(({ page }) => {
  const list = [];
  errors.set(page, list);
  page.on('pageerror', (error) => list.push(error.message));
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));
async function fixture(page, { pixelBudget = false, byteBudget = false } = {}) {
  expect(
    process.env.MARKBRIDGE_TEST_RUNTIME,
    'Dedicated sanitized core runtime required',
  ).toBeTruthy();
  const state = {
    prepares: 0,
    previews: [],
    saves: [],
    cancelled: [],
    images: 0,
    holdPrepare: null,
    holdPreview: null,
    holdSave: null,
    imageError: null,
    body: zipSource,
    holdRecovery: null,
    heldRecovery: 0,
  };
  const mediaBytes = byteBudget
    ? Buffer.concat([imageBytes, Buffer.alloc(4 * 1048576 - imageBytes.length)])
    : imageBytes;
  const media = { ...image, bytes: mediaBytes.length, sha256: hash(mediaBytes) };
  if (byteBudget) state.body += '\n\n' + Array(4).fill('![image](images/a.png)').join('\n\n');
  await page.route('**/wp-json/mbb/v1/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      endpoint = url.pathname.split('/').at(-1);
    if (endpoint === 'recovery-context') {
      if (Number(url.searchParams.get('post_id')) && state.holdRecovery) {
        state.heldRecovery++;
        await state.holdRecovery;
      }
      return route.fulfill({
        json: {
          schema: 1,
          siteKey: 'a'.repeat(64),
          userKey: 'b'.repeat(64),
          postId: Number(url.searchParams.get('post_id')) || 0,
          newKey: Number(url.searchParams.get('post_id')) ? null : url.searchParams.get('new_key'),
          identity: hash(
            Number(url.searchParams.get('post_id'))
              ? 'post-12'
              : url.searchParams.get('new_key') || '',
          ),
          baseline: hash(Number(url.searchParams.get('post_id')) ? 'saved-baseline' : 'new'),
          permission: 'e'.repeat(64),
          expected: Number(url.searchParams.get('post_id')) ? 'saved-baseline' : null,
          sourceDigest: null,
          sourceManaged: false,
          sourceWriteAvailable: false,
        },
      });
    }
    if (endpoint === 'prepare') {
      state.prepares++;
      const token = String(state.prepares).padStart(64, '0'),
        source = state.body;
      if (state.holdPrepare) await state.holdPrepare;
      return route.fulfill({
        json: {
          schema: 1,
          token,
          expiresAt: Math.floor(Date.now() / 1000) + 900,
          source,
          requirements: { schema: 1, basePath: 'lesson.md', paths: ['images/a.png'] },
          images: [{ ...media, ...(pixelBudget ? { width: 5000, height: 4000 } : {}) }],
          warnings: { publicMedia: true },
        },
      });
    }
    if (request.method() === 'DELETE') {
      state.cancelled.push(endpoint);
      return route.fulfill({ json: { cancelled: true } });
    }
    if (url.pathname.includes('/image/')) {
      state.images++;
      if (state.imageError === 'forbidden')
        return route.fulfill({
          status: 403,
          json: { code: 'forbidden', message: 'Synthetic media permission lost' },
        });
      return route.fulfill({
        contentType: state.imageError === 'type' ? 'text/html' : 'image/png',
        body: state.imageError === 'sha' ? Buffer.alloc(mediaBytes.length, 0) : mediaBytes,
      });
    }
    const data = request.postDataJSON();
    if (endpoint === 'preview') {
      state.previews.push(data);
      if (state.holdPreview) await state.holdPreview;
      const document = convert({
        mode: 'markdown',
        source: data.source,
        documentId: data.documentId,
      });
      if (!data.resource_import && data.requires_resources && data.source.includes('images/a.png'))
        return route.fulfill({
          status: 422,
          json: { code: 'resource_required', message: 'Needs ZIP reupload' },
        });
      const resource = data.resource_import;
      const projected = resource
        ? convert({
            mode: 'resource_images',
            base: document,
            documentId: document.documentId,
            mappings: data.source.includes('![image]')
              ? [{ from: 'images/a.png', to: 'mbb-import/' + image.key }]
              : [],
          })
        : document;
      return route.fulfill({
        json: {
          document,
          title: data.title,
          post_status: data.post_status,
          featured_media: 0,
          before: '',
          frontmatter: {
            current: {
              title: '',
              excerpt: '',
              slug: '',
              status: 'draft',
              categories: [],
              tags: [],
              featured_media: 0,
            },
            selected: [],
            fields: [],
          },
          frontmatter_receipt: null,
          resource_receipt: resource?.ack_public_media ? 'modeled-resource-receipt' : null,
          ...(resource
            ? {
                resource_plan: {
                  schema: 1,
                  token: resource.token,
                  images: [{ ...media, ...(pixelBudget ? { width: 5000, height: 4000 } : {}) }],
                  projectedDocument: projected,
                },
              }
            : {}),
          html:
            resource && data.source.includes('![image]')
              ? Array(byteBudget ? 5 : 1)
                  .fill('<p><img src="mbb-import/' + image.key + '" alt="Synthetic image"></p>')
                  .join('')
              : '<p>Author text</p>',
        },
      });
    }
    if (endpoint === 'save') {
      state.saves.push(data);
      if (state.holdSave) await state.holdSave;
      const document = convert({
        mode: 'markdown',
        source: data.source,
        documentId: data.documentId,
      });
      return route.fulfill({
        json: {
          post_id: 12,
          expected: 'saved-baseline',
          title: data.title,
          post_status: data.post_status,
          featured_media: 0,
          document,
          editor_url: '/recovery-editor?new=1',
        },
      });
    }
    return route.fulfill({ status: 404, json: { code: 'fixture_only' } });
  });
  await page.goto('/recovery-editor?new=1');
  await expect(page.locator('#task-editor .block-editor-rich-text__editable')).toHaveCount(2);
  await page.evaluate(() => {
    MBB_EDITOR.resources = { schema: 1, available: true };
  });
  await page.locator('#mbb-new').click();
  await expect(page.locator('#mbb-source')).toBeEnabled();
  await page.locator('#mbb-title').fill('Form image title');
  return state;
}
async function upload(page) {
  await page.locator('#mbb-upload').setInputFiles({
    name: 'lesson.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('synthetic REST models the verified ZIP'),
  });
}
async function prepared(page) {
  await upload(page);
  await expect(page.locator('#mbb-resource-public-ack')).toBeEnabled();
}
async function review(page) {
  await page.locator('#mbb-resource-public-ack').check();
  await page.locator('#mbb-review').click();
}
test('ZIP consent, projected image targets and opaque data-image preview', async ({ page }) => {
  const state = await fixture(page);
  await prepared(page);
  await expect(page.locator('#mbb-save')).toBeDisabled();
  await page.locator('#mbb-review').click();
  await expect(page.locator('#mbb-resource-projected')).toHaveValue(/mbb-import\//);
  await expect(page.locator('#mbb-save')).toBeDisabled();
  await review(page);
  await expect(page.locator('#mbb-save')).toBeEnabled();
  await expect(page.locator('#mbb-resource-projected')).toHaveValue(/mbb-import\//);
  await expect(page.locator('#mbb-source')).toHaveValue(zipSource);
  const frame = page.frameLocator('iframe[title="内置内容预览"]');
  await expect.poll(() => frame.locator('img').evaluate((node) => node.naturalWidth)).toBe(48);
  await expect(page.locator('iframe[title="内置内容预览"]')).toHaveAttribute('sandbox', '');
  await expect(frame.locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/);
  expect(state.previews.at(-1).resource_import.ack_public_media).toBe(true);
  expect(await page.locator('#mbb-source').inputValue()).not.toContain('data:image');
});
test('cancelled resources persist only a reupload hint, never credentials or bytes', async ({
  page,
}) => {
  const state = await fixture(page);
  await page.locator('#mbb-dialog [aria-label="关闭编辑桥"]').click();
  await page.locator('#mbb-local-recovery summary').click();
  await page.locator('#mbb-recovery-opt-in').check();
  await page.locator('#mbb-new').click();
  await page.locator('#mbb-title').fill('Recovery image');
  await prepared(page);
  await page.locator('#mbb-resource-cancel').click();
  await page.locator('#mbb-review').click();
  await expect(page.locator('#mbb-dialog > p[role="status"]')).toContainText('Needs ZIP reupload');
  await expect(page.locator('#mbb-save')).toBeDisabled();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.values(localStorage)
          .filter((value) => value.includes('requiresResources'))
          .join(''),
      ),
    )
    .toContain('images/a.png');
  const stored = await page.evaluate(() => Object.values(localStorage).join(''));
  expect(stored).not.toContain('synthetic-nonce-not-for-storage');
  expect(stored).not.toContain('resource_import');
  expect(stored).not.toContain('resource_receipt');
  expect(stored).not.toContain('data:image');
  expect(stored).not.toContain('0'.repeat(63) + '1');
  await expect.poll(() => state.cancelled.length).toBe(1);
});
test('late ZIP preparation preserves text entered while reading', async ({ page }) => {
  const state = await fixture(page);
  let release;
  state.holdPrepare = new Promise((resolve) => (release = resolve));
  await upload(page);
  await expect.poll(() => state.prepares).toBe(1);
  await page.locator('#mbb-source').fill('Later author input B.\n');
  release();
  await expect(page.locator('#mbb-resource-public-ack')).toBeEnabled();
  await expect(page.locator('#mbb-source')).toHaveValue('Later author input B.\n');
});
test('closing and reopening cannot revive a late prepared batch', async ({ page }) => {
  const state = await fixture(page);
  let release;
  state.holdPrepare = new Promise((resolve) => (release = resolve));
  await upload(page);
  await expect.poll(() => state.prepares).toBe(1);
  await page.locator('#mbb-dialog [aria-label="关闭编辑桥"]').click();
  await page.locator('#mbb-new').click();
  await page.locator('#mbb-source').fill('New target B.\n');
  release();
  await expect.poll(() => state.cancelled.length).toBe(1);
  await expect(page.locator('#mbb-resources')).toBeHidden();
  await expect(page.locator('#mbb-source')).toHaveValue('New target B.\n');
});
test('late preview cannot confirm a later candidate', async ({ page }) => {
  const state = await fixture(page);
  await prepared(page);
  let release;
  state.holdPreview = new Promise((resolve) => (release = resolve));
  await review(page);
  await expect.poll(() => state.previews.length).toBe(1);
  await page.locator('#mbb-source').fill('Preview B preserved.\n');
  release();
  await expect(page.locator('#mbb-dialog > p[role="status"]')).toContainText('内容已变化');
  await expect(page.locator('#mbb-save')).toBeDisabled();
  await expect(page.locator('#mbb-source')).toHaveValue('Preview B preserved.\n');
});
for (const failure of ['sha', 'type', 'forbidden'])
  test(
    'image ' + failure + ' failure refuses confirmation without discarding text',
    async ({ page }) => {
      const state = await fixture(page);
      await prepared(page);
      state.imageError = failure;
      await review(page);
      await expect(page.locator('#mbb-save')).toBeDisabled();
      await expect(page.locator('#mbb-dialog > p[role="status"]')).toContainText(
        failure === 'sha'
          ? '校验失败'
          : failure === 'type'
            ? '类型无效'
            : 'Synthetic media permission lost',
      );
      await expect(page.locator('#mbb-source')).toHaveValue(zipSource);
      expect(state.saves).toHaveLength(0);
    },
  );
test('pixel capacity placeholder is explicit and permits confirmed save', async ({ page }) => {
  const state = await fixture(page, { pixelBudget: true });
  await prepared(page);
  await review(page);
  await expect(page.locator('#mbb-save')).toBeEnabled();
  await expect(page.frameLocator('iframe[title="内置内容预览"]').locator('body')).toContainText(
    '16 MP',
  );
  expect(state.images).toBe(0);
});
test('repeated images count toward the total encoded byte budget', async ({ page }) => {
  const state = await fixture(page, { byteBudget: true });
  await prepared(page);
  await review(page);
  await expect(page.locator('#mbb-save')).toBeEnabled();
  const frame = page.frameLocator('iframe[title="内置内容预览"]');
  await expect(frame.locator('img')).toHaveCount(2);
  await expect(frame.locator('span')).toHaveCount(3);
  await expect
    .poll(() =>
      frame
        .locator('img')
        .first()
        .evaluate((node) => node.naturalWidth),
    )
    .toBe(48);
  expect(state.images).toBe(1);
  expect(
    (await page.locator('iframe[title="内置内容预览"]').getAttribute('srcdoc')).length,
  ).toBeLessThan(12 * 1048576);
});
test('missing Web Crypto stops ZIP before any private staging, ordinary Markdown works', async ({
  page,
}) => {
  const state = await fixture(page);
  await page.evaluate(() =>
    Object.defineProperty(crypto, 'subtle', { value: undefined, configurable: true }),
  );
  await upload(page);
  await expect(page.locator('#mbb-dialog > p[role="status"]')).toContainText('HTTPS');
  expect(state.prepares).toBe(0);
  await page.locator('#mbb-upload').setInputFiles({
    name: 'ordinary.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('Ordinary Markdown remains.\n'),
  });
  await expect(page.locator('#mbb-source')).toHaveValue('Ordinary Markdown remains.\n');
  await page.locator('#mbb-review').click();
  await expect(page.locator('#mbb-save')).toBeEnabled();
});
test('a delayed recovery cleanup after save A cannot replace reopened target B', async ({
  page,
}) => {
  const state = await fixture(page);
  await page.locator('#mbb-dialog [aria-label="关闭编辑桥"]').click();
  await page.locator('#mbb-local-recovery summary').click();
  await page.locator('#mbb-recovery-opt-in').check();
  await page.locator('#mbb-new').click();
  await page.locator('#mbb-title').fill('A title');
  await prepared(page);
  await review(page);
  await expect(page.locator('#mbb-save')).toBeEnabled();
  let release;
  state.holdRecovery = new Promise((resolve) => (release = resolve));
  await page.locator('#mbb-save').click();
  await expect.poll(() => state.heldRecovery).toBe(1);
  await page.locator('#mbb-dialog [aria-label="关闭编辑桥"]').click();
  state.body = zipSource + '\nTarget B body.\n';
  await page.locator('#mbb-new').click();
  await page.locator('#mbb-title').fill('B title');
  await prepared(page);
  const bId = await page.locator('#mbb-document-id').inputValue();
  release();
  await review(page);
  await expect(page.locator('#mbb-save')).toBeEnabled();
  await expect(page.locator('#mbb-title')).toHaveValue('B title');
  await expect(page.locator('#mbb-source')).toHaveValue(state.body);
  await expect(page.locator('#mbb-document-id')).toHaveValue(bId);
  expect(state.previews.at(-1).post_id).toBe(0);
  expect(state.previews.at(-1).resource_import.token).toBe('2'.padStart(64, '0'));
});
test('saving A retains later B and avoids redirect or credential persistence', async ({ page }) => {
  const state = await fixture(page);
  await page.locator('#mbb-dialog [aria-label="关闭编辑桥"]').click();
  await page.locator('#mbb-local-recovery summary').click();
  await page.locator('#mbb-recovery-opt-in').check();
  await page.locator('#mbb-new').click();
  await page.locator('#mbb-title').fill('Saved A title');
  await prepared(page);
  await review(page);
  await expect(page.locator('#mbb-save')).toBeEnabled();
  let release;
  state.holdSave = new Promise((resolve) => (release = resolve));
  await page.locator('#mbb-save').click();
  await expect.poll(() => state.saves.length).toBe(1);
  await page.locator('#mbb-source').fill('Unsaved B after confirmed A.\n');
  release();
  await expect(page.locator('#mbb-dialog > p[role="status"]')).toContainText('新输入仍保留');
  await expect(page.locator('#mbb-source')).toHaveValue('Unsaved B after confirmed A.\n');
  await expect(page.locator('#mbb-dialog')).toBeVisible();
  expect(state.saves[0].source).toBe(zipSource);
  await page.locator('#mbb-dialog [aria-label="关闭编辑桥"]').click();
  await expect
    .poll(() => page.evaluate(() => Object.values(localStorage).join('')))
    .toContain('Unsaved B after confirmed A.');
  const downloadButton = page
    .locator('#mbb-local-recovery')
    .getByRole('button', { name: '下载当前未保存候选', exact: true });
  await expect(downloadButton).toBeEnabled();
  const downloaded = page.waitForEvent('download');
  await downloadButton.click();
  const file = await downloaded;
  expect(require('node:fs').readFileSync(await file.path(), 'utf8')).toBe(
    'Unsaved B after confirmed A.\n',
  );
});
