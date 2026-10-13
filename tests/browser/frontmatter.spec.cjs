// Real core/editor scripts and candidate converters, with modeled REST metadata storage.
// Actual WordPress receipt/transaction evidence belongs to guarded frontmatter-save.php.
const { test, expect } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const pageErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const errors = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(async ({ page }) => expect(pageErrors.get(page)).toEqual([]));
const head = (proposal, body = 'Author body.\n') =>
  '---\nmarkbridge: 1\n' +
  Object.entries(proposal)
    .map(([key, value]) => key + ': ' + JSON.stringify(value) + '\n')
    .join('') +
  '---\n\n' +
  body;
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
async function fixture(
  page,
  { isNew = true, readOnly = false, nativeHeader = false, source = 'Original body.\n' } = {},
) {
  test.skip(
    !process.env.MARKBRIDGE_TEST_RUNTIME,
    'Sanitized WordPress core editor runtime required.',
  );
  const initial = convert({ mode: 'markdown', source, documentId: 'FM-BROWSER' });
  const current = {
    title: 'Actual form title',
    excerpt: 'Current summary',
    slug: 'current-slug',
    status: 'draft',
    categories: ['existing'],
    tags: [],
    featured_media: 0,
  };
  const state = {
    previews: [],
    saves: [],
    current,
    document: initial,
    blocked: null,
    expected: 'baseline-1',
  };
  await page.route('**/wp-json/mbb/v1/**', async (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1);
    if (endpoint === 'document')
      return route.fulfill({
        json: {
          post_id: 12,
          expected: state.expected,
          title: current.title,
          post_status: current.status,
          featured_media: current.featured_media,
          source_managed: readOnly,
          source_write_available: false,
          source_sha256: readOnly ? 'f'.repeat(64) : null,
          frontmatter_current: current,
          document: state.document,
        },
      });
    if (endpoint === 'source')
      return route.fulfill({
        json: {
          expected: 'baseline-1',
          source: state.document.source,
          source_sha256: 'f'.repeat(64),
        },
      });
    const request = route.request().postDataJSON();
    if (endpoint === 'mock-native-save') {
      state.document = convert({
        mode: 'blocks',
        serialized: request.content,
        documentId: state.document.documentId,
        base: state.document,
      });
      current.title = request.title;
      state.expected = 'baseline-2';
      return route.fulfill({
        json: {
          id: 12,
          mbb_expected: state.expected,
          title: { raw: current.title },
          status: current.status,
          content: { raw: request.content },
          featured_media: current.featured_media,
        },
      });
    }
    if (endpoint === 'preview') {
      state.previews.push(request);
      if (Number(request.post_id) && request.expected !== state.expected)
        return route.fulfill({
          status: 409,
          json: { code: 'conflict', message: 'Synthetic baseline changed' },
        });
      const document = convert(
        request.mode === 'blocks'
          ? {
              mode: 'blocks',
              serialized: request.serialized,
              documentId: state.document.documentId,
              base: state.document,
            }
          : {
              mode: 'markdown',
              source: request.source,
              documentId: request.documentId || state.document.documentId,
            },
      );
      const proposal = await page.evaluate(
        (source) =>
          MBB.parseFrontmatter(source, (code, message) => {
            throw Error(message);
          })?.proposal || {},
        document.source,
      );
      const selected = request.frontmatter_selected || [];
      const effective = {
        title: request.title,
        status: request.post_status || 'draft',
        featured_media: request.featured_media || 0,
      };
      for (const key of selected) effective[key] = proposal[key];
      return route.fulfill({
        json: {
          before: isNew ? '' : state.document.source,
          document,
          html: '<p>Converted author body.</p>',
          title: effective.title,
          post_status: effective.status,
          featured_media: effective.featured_media,
          expected: isNew ? null : state.expected,
          frontmatter: {
            current,
            selected,
            fields: Object.entries(proposal).map(([field, value]) => ({
              field,
              before: current[field],
              proposal: value,
              selected: selected.includes(field),
              available: field !== state.blocked,
              reason: field === state.blocked ? 'Synthetic permission denial' : '',
              resolved: field === 'slug' ? String(value).toLowerCase() : value,
            })),
          },
          frontmatter_receipt: 'modeled-receipt-' + state.previews.length,
        },
      });
    }
    if (endpoint === 'save' || endpoint === 'source-save') {
      state.saves.push(request);
      state.document = convert({
        mode: 'markdown',
        source: request.source,
        documentId: request.documentId || state.document.documentId,
      });
      return route.fulfill({ json: { post_id: 12, editor_url: '/recovery-editor?new=1' } });
    }
    return route.fulfill({ status: 404, json: { code: 'fixture_only' } });
  });
  await page.goto(
    (nativeHeader ? '/wp-admin/post-new.php' : '/recovery-editor') +
      (isNew ? '?new=1' + (nativeHeader ? '&header=1' : '') : readOnly ? '?source=1' : ''),
  );
  await expect(page.locator('#task-editor .block-editor-rich-text__editable')).toHaveCount(2);
  if (!isNew) {
    await page.evaluate(
      ({ initial, current, readOnly }) => {
        MBB_EDITOR.state = {
          post_id: 12,
          expected: 'baseline-1',
          title: current.title,
          post_status: current.status,
          featured_media: 0,
          frontmatter_current: current,
          document: initial,
          source_managed: readOnly,
          source_write_available: false,
        };
        wp.data.dispatch('core/block-editor').resetBlocks(wp.blocks.parse(initial.serialized));
        recoveryFields.title = current.title;
      },
      { initial, current, readOnly },
    );
    await page.locator('#mbb-markdown').click();
  } else if (nativeHeader) {
    await page.evaluate(() => {
      wp.data.dispatch('core/block-editor').resetBlocks([]);
      wp.data.dispatch('core/editor').editPost({ title: '' });
    });
    await expect
      .poll(() => page.evaluate(() => wp.data.select('core/editor').getEditedPostContent()))
      .toBe('');
    await page.locator('#mbb-new-post').click();
  } else await page.locator('#mbb-new').click();
  await expect(page.locator('#mbb-dialog')).toBeVisible();
  await expect(page.locator('#mbb-source')).toBeEnabled();
  return state;
}

test('modeled REST: converter-only new screen selects seven proposals explicitly, then sends reviewed receipt', async ({
  page,
}) => {
  const state = await fixture(page);
  expect(await page.evaluate(() => wp.blocks.getBlockType('mbb/frontmatter'))).toBeUndefined();
  const proposal = {
    title: 'Header title',
    excerpt: 'Summary',
    slug: 'New-Slug',
    status: 'draft',
    categories: ['existing'],
    tags: [],
    featured_media: 0,
  };
  const source = head(proposal, 'Body $x$ and note[^n].\n\n- [ ] Task\n\n[^n]: Note\n');
  await page.locator('#mbb-source').fill(source);
  await expect(page.locator('#mbb-title')).toHaveValue('');
  await expect(page.locator('#mbb-frontmatter input:checked')).toHaveCount(0);
  for (const key of Object.keys(proposal)) await page.locator('#mbb-frontmatter-' + key).check();
  await page.locator('#mbb-review').click();
  await expect(page.locator('#mbb-save')).toBeEnabled();
  expect(state.previews.at(-1).frontmatter_selected.sort()).toEqual(Object.keys(proposal).sort());
  await expect(page.locator('[data-frontmatter-field=slug] [data-role=resolved]')).toContainText(
    'new-slug',
  );
  await page.locator('#mbb-save').click();
  await expect.poll(() => state.saves.length).toBe(1);
  expect(state.saves[0].source).toBe(source);
  expect(state.saves[0].frontmatter_receipt).toMatch(/^modeled-receipt-/);
  expect(state.document.source).toBe(source);
});

test('modeled REST: changing or cancelling selections requires another preview without rewriting form/header', async ({
  page,
}) => {
  const state = await fixture(page);
  const source = head({ title: 'Proposal', status: 'publish', featured_media: 123 });
  await page.locator('#mbb-title').fill('Form title');
  await page.locator('#mbb-source').fill(source);
  await page.locator('#mbb-review').click();
  await expect(page.locator('#mbb-save')).toHaveText('确认保存草稿');
  await page.locator('#mbb-frontmatter-status').check();
  await expect(page.locator('#mbb-save')).toBeDisabled();
  await page.locator('#mbb-review').click();
  await expect(page.locator('#mbb-save')).toHaveText('确认公开发布');
  await page.locator('#mbb-frontmatter-status').uncheck();
  await expect(page.locator('#mbb-save')).toBeDisabled();
  await expect(page.locator('#mbb-publication')).toHaveValue('draft');
  await expect(page.locator('#mbb-title')).toHaveValue('Form title');
  await expect(page.locator('#mbb-source')).toHaveValue(source);
  state.blocked = 'featured_media';
  await page.locator('#mbb-review').click();
  await expect(page.locator('#mbb-frontmatter-featured_media')).toBeDisabled();
  await expect(page.locator('[data-frontmatter-field=featured_media]')).toContainText(
    'Synthetic permission denial',
  );
  expect(state.saves).toHaveLength(0);
  await page.locator('#mbb-source').fill(head({ title: 'Changed proposal' }));
  await expect(page.locator('#mbb-save')).toBeDisabled();
  await expect(page.locator('#mbb-frontmatter-status')).toHaveCount(0);
});

test('modeled REST: current metadata only prepares a header; old literal and read-only sources cannot apply it', async ({
  page,
}) => {
  const source = '---\ntitle: Old YAML\n---\n\nLiteral author body.\n';
  const state = await fixture(page, { isNew: false, source });
  await expect(page.locator('#mbb-frontmatter input')).toHaveCount(0);
  await page.locator('#mbb-frontmatter-from-current').click();
  await expect(page.locator('#mbb-source')).toHaveValue(head(state.current, source));
  await expect(page.locator('#mbb-frontmatter input:checked')).toHaveCount(0);
  expect(state.saves).toHaveLength(0);
  await page.locator('#mbb-dialog button[aria-label="关闭编辑桥"]').click();
  await fixture(page, {
    isNew: false,
    readOnly: true,
    source: head({ title: 'Read-only proposal' }),
  });
  await expect(page.locator('#mbb-source')).toHaveAttribute('readonly', '');
  await expect(page.locator('#mbb-frontmatter-title')).toBeDisabled();
  await expect(page.locator('#mbb-frontmatter-from-current')).toBeDisabled();
});

test('real core carrier serializes required attributes, stays valid on edit, and roundtrips root footnotes', async ({
  page,
}) => {
  await fixture(page, { isNew: false });
  const result = await page.evaluate(
    (source) => {
      const doc = MBB.importDocument(source, 'CORE-FM');
      const blocks = wp.blocks.parse(doc.serialized);
      blocks[0].attributes.raw = blocks[0].attributes.raw.replace('Original', 'Edited');
      const serialized = wp.blocks.serialize(blocks);
      const markdown = MBB.toMarkdown(wp.blocks.parse(serialized), { origin: 'markdown_import' });
      return {
        attrs: blocks[0].attributes,
        valid: blocks.every((block) => block.isValid),
        serialized,
        markdown,
      };
    },
    head({ title: 'Original' }, 'Author note[^a].\n\n[^a]: Note\n'),
  );
  expect(result.valid).toBe(true);
  expect(result.attrs.version).toBe(1);
  expect(result.serialized).toContain('"version":1');
  expect(result.serialized).toContain('<!-- /wp:mbb/frontmatter -->');
  expect(result.markdown).toContain('title: "Edited"');
  expect(result.markdown).toContain('[^a]: Note');
  expect(
    convert({ mode: 'markdown', source: result.markdown, documentId: 'CORE-FM' }).serialized,
  ).toBe(result.serialized);
});

test('modeled REST: recovered blocks read their own header and disable metadata application', async ({
  page,
}) => {
  const state = await fixture(page, { isNew: false, source: head({ title: 'Server proposal' }) });
  await page.locator('#mbb-dialog button[aria-label="关闭编辑桥"]').click();
  const candidate = convert({
    mode: 'markdown',
    source: head({ title: 'Recovery proposal', excerpt: 'Recovered summary' }),
    documentId: state.document.documentId,
  });
  await page.evaluate(async (candidate) => {
    await MarkBridgeEditorRecovery.restore(
      {
        kind: 'blocks',
        context: { postId: 12 },
        payload: {
          content: candidate.serialized,
          title: 'Recovered form title',
          status: 'draft',
          featuredMedia: 0,
          documentId: candidate.documentId,
        },
      },
      async () => {},
    );
  }, candidate);
  await expect(page.locator('[data-frontmatter-field=title] [data-role=proposal]')).toContainText(
    'Recovery proposal',
  );
  await expect(page.locator('#mbb-frontmatter-title')).toBeDisabled();
  await expect(page.locator('[data-frontmatter-field=title]')).toContainText('只还原候选');
  expect(state.previews.at(-1).frontmatter_selected).toEqual([]);
  expect(state.saves).toHaveLength(0);
});

test('modeled REST: reopening after native save fills source and metadata at the returned fingerprint', async ({
  page,
}) => {
  const state = await fixture(page, {
    isNew: false,
    source: head({ title: 'Unapplied proposal' }),
  });
  await page.locator('#mbb-dialog button[aria-label="关闭编辑桥"]').click();
  await page.evaluate(async () => {
    const blocks = wp.data.select('core/block-editor').getBlocks();
    blocks.at(-1).attributes.content = 'Native edited body';
    wp.data.dispatch('core/block-editor').resetBlocks(blocks);
    wp.data.dispatch('core/editor').editPost({ title: 'Native edited title' });
    await wp.apiFetch({
      path: '/wp/v2/posts/12',
      method: 'POST',
      data: {
        title: 'Native edited title',
        content: wp.blocks.serialize(blocks),
        status: 'draft',
        featured_media: 0,
      },
    });
  });
  await page.locator('#mbb-markdown').click();
  await expect.poll(() => page.locator('#mbb-source').inputValue()).toContain('Native edited body');
  await expect(page.locator('[data-frontmatter-field=title] [data-role=before]')).toContainText(
    'Native edited title',
  );
  expect(await page.evaluate(() => MBB_EDITOR.state.document.source)).toBe(state.document.source);
  expect(await page.evaluate(() => MBB_EDITOR.state.expected)).toBe('baseline-2');
  await expect(page.locator('[data-frontmatter-field=title] [data-role=proposal]')).toContainText(
    'Unapplied proposal',
  );
});

test('modeled REST: from-current refreshes displayed term slugs at the same baseline without saving', async ({
  page,
}) => {
  const state = await fixture(page, { isNew: false, source: head({ categories: ['existing'] }) });
  // A term slug can change while this post retains the same assigned IDs/fingerprint.
  state.current.categories = ['renamed-existing'];
  await page.locator('#mbb-frontmatter-from-current').click();
  await expect
    .poll(() => page.locator('#mbb-source').inputValue())
    .toContain('categories: ["renamed-existing"]');
  await expect(
    page.locator('[data-frontmatter-field=categories] [data-role=before]'),
  ).toContainText('renamed-existing');
  expect(await page.evaluate(() => MBB_EDITOR.state.expected)).toBe('baseline-1');
  expect(state.saves).toHaveLength(0);
});

test('modeled REST: reopening never adopts a different fingerprint from a metadata refresh', async ({
  page,
}) => {
  const state = await fixture(page, { isNew: false, source: head({ title: 'Old proposal' }) });
  await page.locator('#mbb-dialog button[aria-label="关闭编辑桥"]').click();
  state.expected = 'external-baseline';
  state.current.title = 'External title';
  state.document = convert({
    mode: 'markdown',
    source: head({ title: 'External proposal' }),
    documentId: state.document.documentId,
  });
  await page.locator('#mbb-markdown').click();
  await expect(page.locator('#mbb-dialog > p[role=status]')).toContainText(
    'Synthetic baseline changed',
  );
  expect(await page.evaluate(() => MBB_EDITOR.state.expected)).toBe('baseline-1');
  expect(await page.evaluate(() => MBB_EDITOR.state.document.source)).not.toBe(
    state.document.source,
  );
  expect(state.previews.at(-1).expected).toBe('baseline-1');
  expect(state.saves).toHaveLength(0);
});

test('real core new-screen import stays clickable with the compact WordPress settings toolbar', async ({
  page,
}) => {
  await fixture(page, { nativeHeader: true });
  await expect(
    page.locator('.editor-header__settings .editor-header__post-preview-button'),
  ).toBeVisible();
  await expect(page.locator('#mbb-dialog')).toBeVisible();
  const compact = page.viewportSize().width <= 782;
  expect(
    await page
      .locator('#mbb-new-post')
      .evaluate((button) => button.parentElement === document.body),
  ).toBe(compact);
  await page.locator('#mbb-dialog button[aria-label="关闭编辑桥"]').click();
  await page.setViewportSize({ width: compact ? 1440 : 390, height: 900 });
  await expect
    .poll(() =>
      page.locator('#mbb-new-post').evaluate((button) => button.parentElement === document.body),
    )
    .toBe(!compact);
  await page.locator('#mbb-new-post').click();
  await expect(page.locator('#mbb-dialog')).toBeVisible();
});
