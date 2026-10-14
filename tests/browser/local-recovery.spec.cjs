const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const crypto = require('node:crypto');
const original = '# Original\n\nOriginal body.\n';
const hash = (text) => crypto.createHash('sha256').update(text).digest('hex');
async function fixture(page, options = {}) {
  const state = {
    expected: 'baseline-1',
    identity: 'c'.repeat(64),
    permission: 'e'.repeat(64),
    active: 'ok',
    contextCalls: 0,
    previews: [],
    saves: [],
    delay: null,
  };
  await page.route('**/wp-json/mbb/v1/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      name = url.pathname.split('/').at(-1);
    if (name === 'recovery-context') {
      state.contextCalls++;
      const held = state.delay;
      if (state.delayOnce) {
        state.delay = null;
        state.delayOnce = false;
      }
      if (held) await held;
      const errors = {
        forbidden: [403, 'forbidden'],
        inactive: [409, 'inactive'],
        deleted: [404, 'not_found'],
        nonce: [403, 'rest_cookie_invalid_nonce'],
        offline: [503, 'unavailable'],
      };
      if (errors[state.active]) {
        const [status, code] = errors[state.active];
        return route.fulfill({ status, json: { code, message: 'Synthetic ' + code } });
      }
      const postId = Number(url.searchParams.get('post_id'));
      return route.fulfill({
        json: {
          schema: 1,
          siteKey: 'a'.repeat(64),
          userKey: 'b'.repeat(64),
          postId,
          newKey: postId ? null : url.searchParams.get('new_key'),
          identity: postId
            ? postId === 12
              ? state.identity
              : hash('post-' + postId)
            : hash(url.searchParams.get('new_key') || ''),
          baseline: hash(postId ? state.expected : 'new'),
          permission: state.permission,
          expected: postId ? state.expected : null,
          sourceDigest: options.source ? 'f'.repeat(64) : null,
          sourceManaged: !!options.source,
          sourceWriteAvailable: false,
        },
      });
    }
    if (name === 'document') {
      const serialized = await page.evaluate(
        (source) => MBB.importDocument(source, 'RECOVERY').serialized,
        original,
      );
      const title = state.expected === 'baseline-1' ? 'Original' : 'Server changed';
      return route.fulfill({
        json: {
          post_id: 12,
          expected: state.expected,
          title,
          post_status: 'draft',
          featured_media: 0,
          frontmatter_current: {
            title,
            excerpt: '',
            slug: '',
            status: 'draft',
            categories: [],
            tags: [],
            featured_media: 0,
          },
          source_managed: !!options.source,
          source_write_available: false,
          source_sha256: options.source ? 'f'.repeat(64) : null,
          document: {
            schema: 1,
            converter: '0.2.0',
            origin: 'markdown_import',
            documentId: 'RECOVERY',
            source: original,
            serialized,
          },
        },
      });
    }
    if (name === 'source')
      return route.fulfill({
        json: { expected: state.expected, source: original, source_sha256: 'f'.repeat(64) },
      });
    const data = request.postDataJSON();
    if (name === 'preview') {
      state.previews.push(data);
      const held = state.previewDelay;
      const error = state.previewError;
      state.previewDelay = null;
      state.previewError = null;
      if (held) await held;
      if (error)
        return route.fulfill({ status: 403, json: { code: error, message: 'Synthetic denial' } });
      if (Number(data.post_id) && data.expected !== state.expected)
        return route.fulfill({
          status: 409,
          json: { code: 'conflict', message: 'Version changed' },
        });
      const source =
        data.mode === 'blocks'
          ? await page.evaluate(
              (serialized) =>
                MBB.toMarkdown(wp.blocks.parse(serialized), { origin: 'markdown_import' }),
              data.serialized,
            )
          : data.source;
      return route.fulfill({
        json: {
          before: original,
          document: { source },
          html: '<p>Validated synthetic preview</p>',
          title: data.title,
        },
      });
    }
    if (name === 'mock-native-save') {
      if (state.saveDelay) await state.saveDelay;
      state.saves.push(data);
      state.expected = 'baseline-2';
      return route.fulfill({
        json: {
          id: 12,
          mbb_expected: state.expected,
          status: 'draft',
          title: { raw: data.title },
          content: { raw: data.content },
          featured_media: 0,
          ...state.nativeResponseOverrides,
        },
      });
    }
    if (name === 'save' || name === 'source-save') {
      state.saves.push(data);
      return route.fulfill({ json: { post_id: 12, editor_url: '/recovery-editor' } });
    }
    return route.fulfill({ status: 404, json: {} });
  });
  const query = new URLSearchParams();
  for (const key of ['source', 'new', 'sidebar']) if (options[key]) query.set(key, '1');
  await page.goto('/recovery-editor?' + query);
  await expect(page.locator('#task-editor .block-editor-rich-text__editable')).toHaveCount(2);
  await openRecovery(page);
  await expect(page.locator('#mbb-recovery-opt-in')).toBeEnabled();
  return state;
}
async function openRecovery(page) {
  const summary = page.locator('#mbb-local-recovery summary');
  await expect(summary).toBeAttached();
  if (await page.evaluate(() => !MBB_EDITOR.newPost)) {
    await expect(page.locator('#mbb-recovery-open')).toBeAttached();
  }
  const more = page.locator('#mbb-more > summary');
  if ((await page.locator('#mbb-local-recovery').getAttribute('open')) !== null) {
    await summary.click();
  } else if (await more.isVisible()) {
    if ((await page.locator('#mbb-more').getAttribute('open')) === null) await more.click();
    await page.locator('#mbb-recovery-open').click();
  } else {
    await summary.click();
  }
}
async function enable(page) {
  await page.locator('#mbb-recovery-opt-in').check();
  await expect(page.locator('#mbb-recovery-opt-in')).toBeChecked();
  await expect(page.locator('#mbb-recovery-opt-in')).toBeEnabled();
}
async function writeNative(page, text) {
  await page.locator('#task-editor .block-editor-rich-text__editable').nth(1).fill(text);
  await expect(page.locator('#mbb-local-recovery [role=status]')).toContainText('候选已更新');
}
const recordCount = (page) =>
  page.evaluate(
    () =>
      Object.keys(localStorage).filter(
        (key) => key.includes('mbb-local-recovery:v1:') && key.includes(':record:'),
      ).length,
  );
function requireCore() {
  test.skip(
    !process.env.MARKBRIDGE_TEST_RUNTIME,
    'A sanitized real WordPress core block-editor runtime is required.',
  );
}

test('recovery controls stay clickable above an open editor sidebar and toolbar stacking context', async ({
  page,
}) => {
  requireCore();
  await fixture(page, { sidebar: true });
  expect(
    await page
      .locator('#mbb-local-recovery')
      .evaluate((element) => element.parentElement === document.body),
  ).toBe(true);
  await expect(page.locator('.editor-sidebar')).toBeVisible();
  await enable(page);
  await writeNative(page, 'Sidebar remains open draft');
  await page.getByRole('button', { name: '恢复候选并查看差异', exact: true }).click();
  await expect(page.locator('#mbb-recovery-apply')).toBeEnabled();
  await page.locator('#mbb-dialog button[aria-label="关闭编辑桥"]').click();
  await expect(page.locator('.editor-sidebar')).toBeVisible();
  await openRecovery(page);
  await expect(page.locator('#mbb-local-recovery')).not.toHaveAttribute('open', '');
});

test('opt-in native editing survives reload, previews before applying, and successful native save clears it', async ({
  page,
}) => {
  requireCore();
  const state = await fixture(page);
  await page
    .locator('#task-editor .block-editor-rich-text__editable')
    .nth(1)
    .fill('No consent private text');
  await page.waitForTimeout(1400);
  expect(await recordCount(page)).toBe(0);
  await enable(page);
  await writeNative(page, 'Recovered core paragraph');
  const stored = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.includes('mbb-local-recovery'))
      .map((k) => localStorage.getItem(k))
      .join(''),
  );
  expect(stored).not.toContain('synthetic-nonce');
  expect(stored).not.toContain('nonce');
  expect(stored).not.toContain('source_path');
  await page.reload();
  await openRecovery(page);
  await expect(page.getByRole('button', { name: '恢复候选并查看差异', exact: true })).toHaveCount(
    1,
  );
  await expect(page.locator('#task-editor .block-editor-rich-text__editable').nth(1)).toContainText(
    'Original body',
  );
  await page.getByRole('button', { name: '恢复候选并查看差异', exact: true }).click();
  await expect(page.locator('#mbb-recovery-apply')).toBeEnabled();
  expect(state.saves).toHaveLength(0);
  await expect(page.locator('#task-editor .block-editor-rich-text__editable').nth(1)).toContainText(
    'Original body',
  );
  await page.locator('#mbb-recovery-apply').click();
  await expect(page.locator('#task-editor .block-editor-rich-text__editable').nth(1)).toContainText(
    'Recovered core paragraph',
  );
  expect(state.saves).toHaveLength(0);
  await page.locator('#fixture-native-save').click();
  await expect.poll(() => recordCount(page)).toBe(0);
  expect(state.saves).toHaveLength(1);
});

test('Markdown new-draft identity survives reload and server-baseline changes remain visible without automatic rebasing', async ({
  page,
}) => {
  requireCore();
  const state = await fixture(page, { new: true });
  await enable(page);
  await page.locator('#mbb-new').click();
  await page.locator('#mbb-title').fill('Local new article');
  await page.locator('#mbb-document-id').fill('NEWRECOVERY');
  await page.locator('#mbb-edit-toggle').click();
  await page.locator('#mbb-source').fill('New private Markdown\n');
  await expect.poll(() => recordCount(page)).toBe(1);
  await page.locator('#mbb-dialog button[aria-label="关闭编辑桥"]').click();
  const keys = await page.evaluate(() =>
    Object.keys(sessionStorage).map((k) => sessionStorage.getItem(k)),
  );
  await page.reload();
  await openRecovery(page);
  expect(
    await page.evaluate(() => Object.keys(sessionStorage).map((k) => sessionStorage.getItem(k))),
  ).toEqual(keys);
  await page.getByRole('button', { name: '恢复候选并查看差异', exact: true }).click();
  await expect(page.locator('#mbb-source')).toHaveValue('New private Markdown\n');
  await expect(page.locator('#mbb-save')).toBeEnabled();
  expect(state.saves).toHaveLength(0);
  await expect(page.locator('#mbb-document-id')).toHaveValue('NEWRECOVERY');
});

test('old baseline keeps its draft and requires explicit conflict adoption followed by another preview', async ({
  page,
}) => {
  requireCore();
  const state = await fixture(page);
  await enable(page);
  await writeNative(page, 'Old baseline local edits');
  state.expected = 'baseline-new';
  await page.reload();
  await openRecovery(page);
  await expect(page.locator('#mbb-recovery-entries')).toContainText('旧版本基线');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载本地候选', exact: true }).click();
  expect(fs.readFileSync(await (await download).path(), 'utf8')).toContain(
    'Old baseline local edits',
  );
  await page.getByRole('button', { name: '恢复候选并查看差异', exact: true }).click();
  await expect(page.locator('#mbb-conflict')).toBeVisible();
  await expect(page.locator('#mbb-recovery-apply')).toBeDisabled();
  expect(state.previews.at(-1).expected).toBe('baseline-1');
  await expect(page.locator('#mbb-conflict-adopt')).toBeDisabled();
  await page.locator('.mbb-conflict-metadata select[data-field=title]').selectOption('mine');
  await page.locator('#mbb-conflict-adopt').click();
  await expect(page.locator('#mbb-recovery-apply')).toBeDisabled();
  await page.locator('#mbb-review').click();
  await expect(page.locator('#mbb-recovery-apply')).toBeEnabled();
  expect(state.previews.at(-1).expected).toBe('baseline-new');
  expect(state.saves).toHaveLength(0);
  await page.locator('#mbb-recovery-apply').click();
  await page.locator('#fixture-native-save').click();
  await expect.poll(() => state.saves.length).toBe(1);
  expect(state.saves[0].mbb_expected).toBe('baseline-new');
  await expect.poll(() => recordCount(page)).toBe(0);
});

test('lost permission and delayed validation after opt-out cannot expose or revive a draft', async ({
  page,
}) => {
  requireCore();
  const state = await fixture(page);
  await enable(page);
  await writeNative(page, 'Permission private draft');
  await page.evaluate(() => localStorage.setItem('unrelated', 'keep'));
  state.active = 'forbidden';
  await page.getByRole('button', { name: '恢复候选并查看差异', exact: true }).click();
  await expect(page.locator('#mbb-local-recovery [role=status]')).toContainText('权限已失效');
  await expect.poll(() => recordCount(page)).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('unrelated'))).toBe('keep');
  await expect(page.locator('#mbb-dialog')).toHaveCount(0);
  state.active = 'ok';
  await enable(page);
  let release;
  state.delay = new Promise((resolve) => {
    release = resolve;
  });
  await page
    .locator('#task-editor .block-editor-rich-text__editable')
    .nth(1)
    .fill('Late authorization');
  const calls = state.contextCalls;
  await expect.poll(() => state.contextCalls).toBeGreaterThan(calls);
  await page.locator('#mbb-recovery-opt-in').uncheck();
  release();
  state.delay = null;
  await page.waitForTimeout(300);
  await expect(page.locator('#mbb-recovery-opt-in')).not.toBeChecked();
  expect(await recordCount(page)).toBe(0);
});

test('storage quota, UTF-8/JSON overflow and corruption retain editing and offer explicit recovery', async ({
  page,
}) => {
  requireCore();
  await fixture(page);
  await enable(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.includes(':record:')) throw Error('Synthetic quota unavailable');
      return original.call(this, key, value);
    };
    window.restoreStorage = () => {
      Storage.prototype.setItem = original;
    };
  });
  await page
    .locator('#task-editor .block-editor-rich-text__editable')
    .nth(1)
    .fill('Quota unsaved text');
  await expect(page.locator('#mbb-local-recovery [role=status]')).toContainText('quota');
  await expect(page.locator('#task-editor .block-editor-rich-text__editable').nth(1)).toContainText(
    'Quota unsaved text',
  );
  await expect(page.getByRole('button', { name: '下载当前未保存候选', exact: true })).toBeEnabled();
  await page.evaluate(() => restoreStorage());
  await page.getByRole('button', { name: '重试本地恢复校验', exact: true }).click();
  await expect.poll(() => recordCount(page)).toBe(1);
  await page.locator('#mbb-markdown').click();
  await page.locator('#mbb-edit-toggle').click();
  await page.locator('#mbb-source').fill('界'.repeat(90000));
  await expect(page.locator('#mbb-local-recovery [role=status]')).toContainText('256 KiB');
  await expect(page.locator('#mbb-source')).toHaveValue('界'.repeat(90000));
  await page.locator('#mbb-dialog button[aria-label="关闭编辑桥"]').click();
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.includes(':record:'));
    localStorage.setItem(key, 'bad JSON');
  });
  await page.getByRole('button', { name: '重试本地恢复校验', exact: true }).click();
  await expect(page.getByRole('button', { name: '恢复候选并查看差异', exact: true })).toHaveCount(
    1,
  );
  await page.getByRole('button', { name: '恢复候选并查看差异', exact: true }).click();
  await expect(page.locator('#mbb-local-recovery [role=status]')).toContainText('损坏');
});

test('source files stay preview-only and inactive/deleted articles never apply or recreate the old id', async ({
  page,
}) => {
  requireCore();
  const state = await fixture(page, { source: true });
  await enable(page);
  await writeNative(page, 'Source draft only');
  await page.getByRole('button', { name: '恢复候选并查看差异', exact: true }).click();
  await expect(page.locator('#mbb-recovery-apply')).toBeDisabled();
  await expect(page.locator('#mbb-save')).toBeDisabled();
  await expect(page.locator('#mbb-dialog .mbb-dialog-footer > p[role=status]')).toContainText(
    '仅供预览',
  );
  expect(await page.evaluate(() => recoveryLocks)).toContain('mbb-paired-save');
  await page.locator('#mbb-dialog button[aria-label="关闭编辑桥"]').click();
  state.active = 'inactive';
  await page.getByRole('button', { name: '恢复候选并查看差异', exact: true }).click();
  await expect(page.locator('#mbb-recovery-opt-in')).not.toBeChecked();
  expect(await recordCount(page)).toBe(1);
  state.active = 'deleted';
  await page.getByRole('button', { name: '重试本地恢复校验', exact: true }).click();
  await expect(page.locator('#mbb-recovery-opt-in')).not.toBeChecked();
  expect(await recordCount(page)).toBe(1);
  expect(state.saves).toHaveLength(0);
});

test('new native auto-draft recovery explicitly creates a managed pair instead of applying to an unmanaged editor', async ({
  page,
}) => {
  requireCore();
  const state = await fixture(page, { new: true });
  await enable(page);
  await writeNative(page, 'New core unsaved draft');
  await page.reload();
  await openRecovery(page);
  await page.getByRole('button', { name: '恢复候选并查看差异', exact: true }).click();
  await expect(page.locator('#mbb-save')).toBeEnabled();
  await expect(page.locator('#mbb-recovery-apply')).toBeHidden();
  expect(state.saves).toHaveLength(0);
  const navigation = page.waitForURL('**/recovery-editor');
  await page.locator('#mbb-save').click();
  await navigation;
  expect(state.saves).toHaveLength(1);
  expect(state.saves[0]).toMatchObject({
    post_id: 0,
    mode: 'markdown',
    post_status: 'draft',
  });
  expect(state.saves[0].new_blocks_original).toContain('New core unsaved draft');
  expect(state.saves[0].source).toContain('New core unsaved draft');
  expect(state.saves[0].documentId).toMatch(/^LOCAL_[a-f0-9]{16}$/);
  expect(await page.evaluate(() => nativePosts)).toEqual([]);
  expect(await recordCount(page)).toBe(0);
});

test('two editor tabs retain independent drafts, restore their own after reload, and shared opt-out revokes delayed writes', async ({
  page,
  context,
}) => {
  requireCore();
  const a = await fixture(page);
  await enable(page);
  const other = await context.newPage();
  const b = await fixture(other);
  await enable(other);
  await Promise.all([
    writeNative(page, 'Tab A independent draft'),
    writeNative(other, 'Tab B independent draft'),
  ]);
  expect(await recordCount(page)).toBe(2);
  await page.bringToFront();
  await page.reload();
  await other.bringToFront();
  await other.reload();
  for (const p of [page, other]) {
    await p.bringToFront();
    await openRecovery(p);
    await expect(p.locator('#mbb-recovery-entries .mbb-recovery-row')).toHaveCount(2);
    const own = p.locator('.mbb-recovery-row').filter({ hasText: '本标签页' });
    await own.getByRole('button', { name: '恢复候选并查看差异', exact: true }).click();
    await expect(p.locator('#mbb-recovery-apply')).toBeEnabled();
    await p.locator('#mbb-recovery-apply').click();
  }
  await expect(page.locator('#task-editor .block-editor-rich-text__editable').nth(1)).toContainText(
    'Tab A',
  );
  await expect(
    other.locator('#task-editor .block-editor-rich-text__editable').nth(1),
  ).toContainText('Tab B');
  let release;
  b.delay = new Promise((resolve) => {
    release = resolve;
  });
  await other
    .locator('#task-editor .block-editor-rich-text__editable')
    .nth(1)
    .fill('Late other tab');
  const calls = b.contextCalls;
  await expect.poll(() => b.contextCalls).toBeGreaterThan(calls);
  await page.bringToFront();
  await page.locator('#mbb-recovery-opt-in').uncheck();
  await expect(other.locator('#mbb-recovery-opt-in')).not.toBeChecked();
  release();
  b.delay = null;
  await other.waitForTimeout(300);
  expect(await recordCount(page)).toBe(0);
  expect(a.saves).toHaveLength(0);
  expect(b.saves).toHaveLength(0);
});

test('two new-document tabs use separate stable identities and list retained new drafts without silent overwrite', async ({
  page,
  context,
}) => {
  requireCore();
  await fixture(page, { new: true });
  await enable(page);
  const other = await context.newPage();
  await fixture(other, { new: true });
  await enable(other);
  for (const [p, label] of [
    [page, 'NEW_A'],
    [other, 'NEW_B'],
  ]) {
    await p.locator('#mbb-new').click();
    await p.locator('#mbb-title').fill(label);
    await p.locator('#mbb-document-id').fill(label);
    await p.locator('#mbb-source').fill(label + ' private\n');
    await expect(p.locator('#mbb-local-recovery [role=status]')).toContainText('候选已更新');
    await p.locator('#mbb-dialog button[aria-label="关闭编辑桥"]').click();
  }
  expect(await recordCount(page)).toBe(2);
  await page.reload();
  await openRecovery(page);
  await expect(page.locator('.mbb-recovery-row')).toHaveCount(2);
  await page
    .locator('.mbb-recovery-row')
    .filter({ hasText: '本标签页' })
    .getByRole('button', { name: '恢复候选并查看差异', exact: true })
    .click();
  await expect(page.locator('#mbb-source')).toHaveValue('NEW_A private\n');
  await expect(page.locator('#mbb-save')).toBeEnabled();
});

test('nonce expiry preserves candidates, renewed authorization restores them, and capability changes preserve but disable old-permission data', async ({
  page,
}) => {
  requireCore();
  const state = await fixture(page);
  await enable(page);
  await writeNative(page, 'Nonce renewal draft');
  state.active = 'nonce';
  await page.getByRole('button', { name: '恢复候选并查看差异', exact: true }).click();
  await expect(page.locator('#mbb-local-recovery [role=status]')).toContainText('认证已过期');
  expect(await recordCount(page)).toBe(1);
  await expect(
    page.getByRole('button', { name: '下载当前未保存候选', exact: true }),
  ).toBeDisabled();
  state.active = 'ok';
  await page.reload();
  await openRecovery(page);
  await expect(page.getByRole('button', { name: '恢复候选并查看差异', exact: true })).toBeEnabled();
  state.permission = '7'.repeat(64);
  await page.getByRole('button', { name: '恢复候选并查看差异', exact: true }).click();
  await expect(page.locator('#mbb-local-recovery [role=status]')).toContainText('权限指纹已变化');
  expect(await recordCount(page)).toBe(1);
  await page.getByRole('button', { name: '重试本地恢复校验', exact: true }).click();
  await expect(page.locator('#mbb-recovery-entries')).toContainText('权限已变');
  await expect(
    page.getByRole('button', { name: '恢复候选并查看差异', exact: true }),
  ).toBeDisabled();
});

test('true article permission loss only removes that article and keeps other authorized draft slots', async ({
  page,
}) => {
  requireCore();
  const state = await fixture(page);
  await enable(page);
  await writeNative(page, 'Article 12 draft');
  await page.evaluate(() =>
    MarkBridgeLocalRecovery.changed('markdown', () => ({
      postId: 13,
      expected: 'baseline-1',
      sourceDigest: null,
      payload: {
        content: 'Other article 13 draft',
        title: 'Other',
        documentId: 'OTHER',
        status: 'draft',
        featuredMedia: 0,
      },
    })),
  );
  await expect.poll(() => recordCount(page)).toBe(2);
  state.active = 'forbidden';
  await page.getByRole('button', { name: '恢复候选并查看差异', exact: true }).click();
  await expect.poll(() => recordCount(page)).toBe(1);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem(Object.keys(localStorage).find((k) => k.includes(':record:'))),
        ).context.postId,
    ),
  ).toBe(13);
});

test('typing B while native save A waits preserves B and captures it against the new saved baseline', async ({
  page,
}) => {
  requireCore();
  const state = await fixture(page);
  await enable(page);
  await writeNative(page, 'Saved A');
  let release;
  state.saveDelay = new Promise((resolve) => {
    release = resolve;
  });
  await page.locator('#fixture-native-save').click();
  await page.locator('#task-editor .block-editor-rich-text__editable').nth(1).fill('Continuing B');
  await expect(page.locator('#mbb-local-recovery [role=status]')).toContainText('候选已更新');
  release();
  state.saveDelay = null;
  await expect(page.locator('#mbb-local-recovery [role=status]')).toContainText('候选已更新');
  await expect
    .poll(async () =>
      page.evaluate(() =>
        Object.keys(localStorage)
          .filter((k) => k.includes(':record:'))
          .map((k) => JSON.parse(localStorage.getItem(k)))
          .some(
            (r) =>
              r.context.expected === 'baseline-2' && r.payload.content.includes('Continuing B'),
          ),
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(
      (saved) =>
        Object.keys(localStorage)
          .filter((k) => k.includes(':record:'))
          .map((k) => JSON.parse(localStorage.getItem(k)))
          .some((r) => r.payload.content === saved),
      state.saves[0].content,
    ),
  ).toBe(false);
});

test('quick Markdown close retains its snapshot and BFCache resume explicitly reauthorizes before restarting capture', async ({
  page,
}) => {
  requireCore();
  await fixture(page, { new: true });
  await enable(page);
  await page.locator('#mbb-new').click();
  await page.locator('#mbb-title').fill('Quick close');
  await page.locator('#mbb-document-id').fill('QUICK');
  await page.locator('#mbb-edit-toggle').click();
  await page.locator('#mbb-source').fill('Fast close local draft\n');
  await page.locator('#mbb-dialog button[aria-label="关闭编辑桥"]').click();
  await expect.poll(() => recordCount(page)).toBe(1);
  // Synthetic lifecycle events exercise the real controller; this is not a browser BFCache traversal claim.
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await expect(page.locator('#mbb-recovery-opt-in')).not.toBeChecked();
  await expect(page.locator('#mbb-local-recovery [role=status]')).toContainText('重新激活');
  await page.getByRole('button', { name: '重试本地恢复校验', exact: true }).click();
  await expect(page.locator('#mbb-recovery-opt-in')).toBeChecked();
  await page.locator('#mbb-new').click();
  await page.locator('#mbb-edit-toggle').click();
  await page.locator('#mbb-source').fill('After lifecycle draft\n');
  await expect(page.locator('#mbb-local-recovery [role=status]')).toContainText('候选已更新');
});

test('a late validation of older input cannot overwrite the latest draft, and unsupported storage locks leave normal editing usable', async ({
  page,
}) => {
  requireCore();
  const state = await fixture(page);
  await enable(page);
  let release;
  state.delay = new Promise((resolve) => {
    release = resolve;
  });
  state.delayOnce = true;
  const calls = state.contextCalls;
  await page.locator('#task-editor .block-editor-rich-text__editable').nth(1).fill('Old pending');
  await expect.poll(() => state.contextCalls).toBeGreaterThan(calls);
  await writeNative(page, 'Latest input');
  release();
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((k) => k.includes(':record:'))
        .map((k) => JSON.parse(localStorage.getItem(k)))
        .every((r) => !r.payload.content.includes('Old pending')),
    ),
  ).toBe(true);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true }),
  );
  await page.reload();
  await openRecovery(page);
  await expect(page.locator('#mbb-local-recovery [role=status]')).toContainText('存储锁');
  await page
    .locator('#task-editor .block-editor-rich-text__editable')
    .nth(1)
    .fill('Normal editing without locks');
  await expect(page.locator('#task-editor .block-editor-rich-text__editable').nth(1)).toContainText(
    'Normal editing without locks',
  );
});

test('ordinary new-post editing loads only the converter and keeps literal math and normal native saving', async ({
  page,
}) => {
  requireCore();
  const state = await fixture(page, { new: true });
  expect(
    await page.evaluate(() => ({
      only: window.MBB_CONVERTER_ONLY,
      blocks: wp.blocks
        .getBlockTypes()
        .filter((b) => b.name.startsWith('mbb/'))
        .map((b) => b.name),
      math: !!wp.data.select('core/rich-text').getFormatType('mbb/math'),
      conversionHook: wp.hooks.hasFilter('editor.BlockEdit', 'mbb/native-math-conversion'),
    })),
  ).toEqual({ only: true, blocks: [], math: false, conversionHook: false });
  await page
    .locator('#task-editor .block-editor-rich-text__editable')
    .nth(1)
    .fill('Literal $x^2$ text');
  expect(await page.evaluate(() => taskBlocks[1].name)).toBe('core/paragraph');
  expect(await page.evaluate(() => wp.blocks.serialize(taskBlocks))).toContain(
    'Literal $x^2$ text',
  );
  await page.locator('#fixture-native-save').click();
  await expect.poll(() => state.saves.length).toBe(1);
  expect(state.saves[0]).not.toHaveProperty('mbb_expected');
  expect(state.previews).toHaveLength(0);
  expect(await recordCount(page)).toBe(0);
});

test('offline validation preserves the current editor snapshot for network-free rescue download', async ({
  page,
}) => {
  requireCore();
  const state = await fixture(page);
  await enable(page);
  await writeNative(page, 'Stored candidate A');
  state.active = 'offline';
  await page
    .locator('#task-editor .block-editor-rich-text__editable')
    .nth(1)
    .fill('Offline private B');
  await expect(page.locator('#mbb-local-recovery [role=status]')).toContainText('已暂停');
  await expect(page.getByRole('button', { name: '下载当前未保存候选', exact: true })).toBeEnabled();
  const calls = state.contextCalls;
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载当前未保存候选', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.blocks\.txt$/);
  expect(fs.readFileSync(await file.path(), 'utf8')).toContain('Offline private B');
  expect(state.contextCalls).toBe(calls);
  expect(await recordCount(page)).toBe(1);
  expect(state.saves).toHaveLength(0);
});

test('ordinary opt-in new-post saving clears only its matching blocks candidate without creating a managed pair', async ({
  page,
}) => {
  requireCore();
  const state = await fixture(page, { new: true });
  await enable(page);
  await writeNative(page, 'Ordinary saved new draft');
  await page.locator('#fixture-native-save').click();
  await expect.poll(() => recordCount(page)).toBe(0);
  expect(state.saves).toHaveLength(1);
  expect(state.saves[0]).not.toHaveProperty('mbb_expected');
  expect(state.previews).toHaveLength(0);
  expect(await page.evaluate(() => MBB_EDITOR.state)).toBe(null);
  await expect(page.locator('#mbb-local-recovery')).toContainText('不会自动转为托管文章');
  await writeNative(page, 'Candidate retained after normalization');
  state.nativeResponseOverrides = { title: { raw: 'Server-normalized title' } };
  await page.locator('#fixture-native-save').click();
  await expect(page.locator('#mbb-local-recovery [role=status]')).toContainText(
    '响应与本地候选不同',
  );
  expect(await recordCount(page)).toBe(1);
  state.nativeResponseOverrides = {};
  await page.evaluate(() =>
    wp.apiFetch({
      path: '/wp/v2/posts/12',
      method: 'POST',
      data: {
        content: wp.blocks.serialize(taskBlocks),
        title: recoveryFields.title,
        status: 'draft',
        unknown_metadata: 'unconfirmed',
      },
    }),
  );
  expect(await recordCount(page)).toBe(1);
  await writeNative(page, 'URL-only plain permalink save');
  await page.evaluate(() =>
    wp.apiFetch({
      url: location.origin + '/index.php?rest_route=%2Fwp%2Fv2%2Fposts%2F12',
      method: 'POST',
      data: {
        content: wp.blocks.serialize(taskBlocks),
        title: recoveryFields.title,
        status: 'draft',
      },
    }),
  );
  await expect.poll(() => recordCount(page)).toBe(0);
  expect(await page.evaluate(() => nativePosts.at(-1).path)).toBeUndefined();
  expect(await page.evaluate(() => nativePosts.at(-1).data)).not.toHaveProperty('mbb_expected');
});

test('ordinary new-post saving A preserves B typed while saving and keeps WordPress saving unchanged', async ({
  page,
}) => {
  requireCore();
  const state = await fixture(page, { new: true });
  await enable(page);
  await writeNative(page, 'Ordinary native A');
  let release;
  state.saveDelay = new Promise((resolve) => {
    release = resolve;
  });
  await page.locator('#fixture-native-save').click();
  await page
    .locator('#task-editor .block-editor-rich-text__editable')
    .nth(1)
    .fill('Ordinary continuing B');
  release();
  await expect.poll(() => state.saves.length).toBe(1);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage)
          .filter((key) => key.includes(':record:'))
          .map((key) => JSON.parse(localStorage.getItem(key)))
          .some(
            (record) =>
              record.context.postId === 0 &&
              record.payload.content.includes('Ordinary continuing B'),
          ),
      ),
    )
    .toBe(true);
  expect(state.saves[0]).not.toHaveProperty('mbb_expected');
  expect(await page.evaluate(() => MBB_EDITOR.state)).toBe(null);
  await expect(page.locator('#mbb-local-recovery')).toContainText(
    'WordPress 已保存本次普通文章提交',
  );
});

test('a late forbidden preview from the old article cannot purge or stop the new Markdown session', async ({
  page,
}) => {
  requireCore();
  const state = await fixture(page);
  await enable(page);
  await writeNative(page, 'Article A candidate');
  let release;
  state.previewDelay = new Promise((resolve) => {
    release = resolve;
  });
  state.previewError = 'forbidden';
  await page.getByRole('button', { name: '恢复候选并查看差异', exact: true }).click();
  await expect.poll(() => state.previews.length).toBe(1);
  // The busy toolbar is disabled, but the native dialog's Escape cancellation remains available.
  await page.keyboard.press('Escape');
  await expect(page.locator('#mbb-dialog')).not.toBeVisible();
  await page.locator('#mbb-new').click();
  await page.locator('#mbb-edit-toggle').click();
  await page.locator('#mbb-source').fill('New target B private draft\n');
  await expect.poll(() => recordCount(page)).toBe(2);
  release();
  await page.waitForTimeout(300);
  await expect(page.locator('#mbb-recovery-opt-in')).toBeChecked();
  expect(await recordCount(page)).toBe(2);
  await page.locator('#mbb-edit-toggle').click();
  await page.locator('#mbb-source').fill('New target B continued\n');
  await expect(page.locator('#mbb-local-recovery [role=status]')).toContainText('候选已更新');
});

test('an old native-save response cannot cancel the pending Markdown candidate in a different target', async ({
  page,
}) => {
  requireCore();
  const state = await fixture(page);
  await enable(page);
  await writeNative(page, 'Saved article A');
  let release;
  state.saveDelay = new Promise((resolve) => {
    release = resolve;
  });
  await page.locator('#fixture-native-save').click();
  await page.locator('#mbb-new').click();
  await page.locator('#mbb-edit-toggle').click();
  await page.locator('#mbb-source').fill('Pending new B\n');
  release();
  await expect.poll(() => state.saves.length).toBe(1);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage)
          .filter((k) => k.includes(':record:'))
          .map((k) => JSON.parse(localStorage.getItem(k)))
          .some((r) => r.context.postId === 0 && r.payload.content === 'Pending new B\n'),
      ),
    )
    .toBe(true);
  await expect(page.locator('#mbb-recovery-opt-in')).toBeChecked();
});
