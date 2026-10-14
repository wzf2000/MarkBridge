// Real core editor + candidate assets; modeled REST is not actual WordPress authorization.
const { test, expect } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');
const hash = (text) => crypto.createHash('sha256').update(text).digest('hex');
function convert(input) {
  const value = JSON.parse(
    execFileSync(
      process.env.MARKBRIDGE_PHP || 'php',
      [
        '-r',
        'require $argv[1]; echo json_encode(\\MarkBridge\\Probe\\Worker::convert(json_decode(stream_get_contents(STDIN),true)));',
        path.resolve(__dirname, '../../plugin/includes/php-converter/Worker.php'),
      ],
      { input: JSON.stringify(input), encoding: 'utf8' },
    ),
  );
  if (!value.ok) throw Error(value.message);
  return value.document;
}
let errors;
test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});
async function fixture(page, options = {}) {
  const source = options.source || 'First.\r\n\r\nSecond.\r\n';
  const initial = convert({ mode: 'markdown', source, documentId: 'MERGE-BROWSER' });
  const state = {
    current: {
      post_id: 12,
      title: 'Opening title',
      post_status: 'draft',
      featured_media: 0,
      expected: 'a'.repeat(64),
      source_managed: !!options.sourceManaged,
      source_write_available: !!options.sourceManaged,
      source_sha256: options.sourceManaged ? hash(source) : null,
      document: initial,
      frontmatter_current: { title: 'Opening title', status: 'draft', featured_media: 0 },
      editor_url: '/recovery-editor',
    },
    calls: [],
    saves: [],
    openingDelay: null,
    adoptDelay: null,
    previewDelay: null,
    previewError: null,
    saveDelay: null,
    saveError: null,
    expired: false,
  };
  function envelope(value, kind, data = {}) {
    return {
      schema: 1,
      document: value.document,
      title: value.title,
      post_status: value.post_status,
      featured_media: value.featured_media,
      expected: value.expected,
      source_managed: !!value.source_managed,
      source_sha256: value.source_sha256 ?? null,
      claims: {
        post: 12,
        expires: Math.floor(Date.now() / 1000) + 900,
        kind,
        sourceSha: hash(value.document.source),
        serializedSha: hash(value.document.serialized),
        ...data,
      },
      signature: hash(kind + value.expected),
    };
  }
  state.change = (source, metadata = {}) => {
    state.current = {
      ...state.current,
      ...metadata,
      document: convert({ mode: 'markdown', source, documentId: 'MERGE-BROWSER' }),
      expected: hash(source + JSON.stringify(metadata)),
      source_sha256: options.sourceManaged ? hash(source) : null,
    };
  };
  await page.route('**/wp-json/mbb/v1/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/mbb/v1/')[1],
      data = route.request().postDataJSON();
    state.calls.push({ name, data });
    const ok = (json) => route.fulfill({ json }),
      bad = (code, message = code, status = 409) =>
        route.fulfill({ status, json: { code, message } });
    if (name === 'document') return ok(state.current);
    if (name === 'source') {
      if (state.onSource) state.onSource();
      return ok({
        expected: state.current.expected,
        source: state.current.document.source,
        source_sha256: state.current.source_sha256,
      });
    }
    if (name === 'merge/open') {
      if (state.rejectOpening && state.calls.filter((r) => r.name === 'merge/open').length > 1)
        return bad('merge_conflict');
      const snapshot = structuredClone(state.current);
      if (state.openingDelay) await state.openingDelay;
      if (data.expected !== snapshot.expected) return bad('merge_conflict');
      return ok(envelope(snapshot, 'opening'));
    }
    if (name === 'merge/latest') {
      if (state.expired) return bad('merge_expired', '打开基线已过期，当前候选仍保留');
      return ok(
        envelope(state.current, 'latest', { candidate: hash(JSON.stringify(data.candidate)) }),
      );
    }
    if (name === 'merge/adopt') {
      if (state.adoptDelay) await state.adoptDelay;
      if (data.latest.expected !== state.current.expected)
        return bad('merge_conflict', '服务器在采用期间变化');
      return ok({
        schema: 1,
        saved: false,
        document: convert({ mode: 'markdown', source: data.source, documentId: 'MERGE-BROWSER' }),
        newbase: state.current,
      });
    }
    if (name === 'preview') {
      if (state.previewDelay) await state.previewDelay;
      if (state.previewError)
        return bad(state.previewError.code, 'Synthetic preview failure', state.previewError.status);
      if (data.expected !== state.current.expected) return bad('conflict', '服务器已变化');
      const document =
        data.mode === 'blocks'
          ? convert({
              mode: 'blocks',
              base: state.current.document,
              serialized: data.serialized,
              documentId: 'MERGE-BROWSER',
            })
          : convert({ mode: 'markdown', source: data.source, documentId: 'MERGE-BROWSER' });
      return ok({
        document,
        title: data.title,
        post_status: data.post_status || state.current.post_status,
        html: '<p>Model preview</p>',
        before: state.current.document.source,
        frontmatter: null,
        frontmatter_receipt: null,
      });
    }
    if (name === 'save') {
      state.saves.push(data);
      if (state.saveDelay) await state.saveDelay;
      if (state.saveError)
        return bad(state.saveError.code, 'Synthetic save failure', state.saveError.status);
      return ok({ ...state.current, editor_url: '/recovery-editor' });
    }
    if (name === 'recovery-context') return bad('recovery_auth_expired');
    return bad('unknown');
  });
  if (options.tool)
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const button = document.createElement('button');
        button.id = 'fixture-tool-open';
        button.className = 'mbb-open';
        button.dataset.post = '12';
        button.textContent = 'Tool existing source';
        document.body.append(button);
      });
    });
  await page.goto('/recovery-editor' + (options.tool ? '?new=1' : ''));
  await page.waitForFunction(
    () => !!window.MarkBridgeEditorRecovery && !!window.MBB?.planMerge && !!window.taskRegistry,
  );
  await page.evaluate((value) => {
    MBB_EDITOR.state = value;
    recoveryFields.title = value.title;
    recoveryFields.status = value.post_status;
    recoveryFields.featured_media = value.featured_media;
    taskRegistry
      .dispatch('core/block-editor')
      .resetBlocks(wp.blocks.parse(value.document.serialized));
  }, state.current);
  return state;
}
async function open(page) {
  await page.locator('#mbb-markdown').click();
  await expect(page.locator('#mbb-source')).toBeEnabled();
}
async function conflict(page, state, mine, latest, metadata = {}) {
  await open(page);
  await page.locator('#mbb-edit-toggle').click();
  await page.locator('#mbb-source').fill(mine);
  state.change(latest, metadata);
  await page.getByRole('button', { name: '查看差异与预览', exact: true }).last().click();
  await expect(page.locator('#mbb-conflict')).toBeVisible();
  await expect(page.locator('#mbb-merge-open')).toBeEnabled();
}
test('independent body changes preserve C metadata and require normal preview before saving', async ({
  page,
}) => {
  const state = await fixture(page);
  const a = state.current.document.source;
  await conflict(page, state, a.replace('First', 'Mine'), a.replace('Second', 'Server'), {
    title: 'Server title',
    post_status: 'pending',
    featured_media: 2,
  });
  expect(state.calls.findIndex((r) => r.name === 'merge/open')).toBeLessThan(
    state.calls.findIndex((r) => r.name === 'preview'),
  );
  await page.locator('#mbb-merge-open').click();
  await expect(page.locator('#mbb-merge-adopt')).toBeEnabled();
  expect(await page.locator('#mbb-merge-base').inputValue()).toContain('First.');
  await page.locator('#mbb-merge-adopt').click();
  await expect(page.locator('#mbb-source')).toHaveValue('Mine.\n\nServer.\n');
  await expect(page.locator('#mbb-title')).toHaveValue('Server title');
  await expect(page.locator('#mbb-publication')).toHaveValue('pending');
  expect(state.saves).toHaveLength(0);
  await expect(page.getByRole('button', { name: '确认提交审核', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '查看差异与预览', exact: true }).last().click();
  await expect(page.getByRole('button', { name: '确认提交审核', exact: true })).toBeEnabled();
  const request = state.calls.filter((r) => r.name === 'preview').at(-1).data;
  expect(request.expected).toBe(state.current.expected);
  expect(request.featured_media).toBe(2);
  expect(request.post_id).toBe(12);
  expect(request.source).toBe(a.replace('First', 'Mine').replace('Second', 'Server'));
});
test('overlapping body and all metadata fields require explicit choices', async ({ page }) => {
  const state = await fixture(page);
  await open(page);
  await page.locator('#mbb-edit-toggle').click();
  await page.locator('#mbb-source').fill('Mine.\n');
  await page.locator('#mbb-title').fill('Mine title');
  await page.locator('#mbb-publication').selectOption('private');
  await page.evaluate(() => {
    recoveryFields.featured_media = 1;
  });
  state.change('Server.\n', { title: 'Server title', post_status: 'pending', featured_media: 2 });
  await page.getByRole('button', { name: '查看差异与预览', exact: true }).last().click();
  await expect(page.locator('#mbb-merge-open')).toBeEnabled();
  await page.locator('#mbb-merge-open').click();
  await expect(page.locator('#mbb-merge-panel select[data-hunk]')).toHaveCount(1);
  await expect(page.locator('#mbb-merge-adopt')).toBeDisabled();
  await page.locator('#mbb-merge-panel select[data-hunk]').selectOption('mine');
  for (const field of ['title', 'post_status', 'featured_media'])
    await page
      .locator(`#mbb-merge-panel select[data-field=${field}]`)
      .selectOption(field === 'title' ? 'mine' : 'latest');
  await expect(page.locator('#mbb-merge-adopt')).toBeEnabled();
  await page.locator('#mbb-merge-adopt').click();
  await expect(page.locator('#mbb-title')).toHaveValue('Mine title');
  await expect(page.locator('#mbb-publication')).toHaveValue('pending');
  expect(state.saves).toHaveLength(0);
});
test('expired signed baseline keeps B downloadable without authorizing adoption', async ({
  page,
}) => {
  const state = await fixture(page);
  const a = state.current.document.source;
  await conflict(page, state, 'Mine candidate\n', a.replace('Second', 'Server'));
  state.expired = true;
  await page.locator('#mbb-merge-open').click();
  await expect(page.locator('#mbb-merge-panel')).toContainText('过期');
  await expect(page.locator('#mbb-merge-adopt')).toBeDisabled();
  const download = page.waitForEvent('download');
  await page.locator('#mbb-conflict-download').click();
  const value = await download;
  const fs = require('node:fs');
  expect(fs.readFileSync(await value.path(), 'utf8')).toBe('Mine candidate\n');
  expect(state.saves).toHaveLength(0);
});
test('late opening response cannot overwrite a reopened target or entered B', async ({ page }) => {
  const state = await fixture(page);
  let release;
  state.openingDelay = new Promise((r) => {
    release = r;
  });
  await page.locator('#mbb-markdown').click();
  await expect.poll(() => state.calls.some((r) => r.name === 'merge/open')).toBe(true);
  await page.keyboard.press('Escape');
  state.openingDelay = null;
  await page.locator('#mbb-new').click();
  await expect(page.locator('#mbb-source')).toBeEnabled();
  await page.locator('#mbb-edit-toggle').click();
  await page.locator('#mbb-source').fill('New target B raw\n');
  release();
  await expect(page.locator('#mbb-source')).toHaveValue('New target B raw\n');
  expect(state.saves).toHaveLength(0);
});
test('server race during adoption retains original B and cannot rebase it', async ({ page }) => {
  const state = await fixture(page);
  const a = state.current.document.source;
  await conflict(page, state, 'Mine candidate\n', a.replace('Second', 'Server'));
  await page.locator('#mbb-merge-open').click();
  await expect(page.locator('#mbb-merge-panel select[data-hunk]')).toHaveCount(1);
  await page.locator('#mbb-merge-panel select[data-hunk]').selectOption('mine');
  await expect(page.locator('#mbb-merge-adopt')).toBeEnabled();
  let release;
  state.adoptDelay = new Promise((r) => {
    release = r;
  });
  await page.locator('#mbb-merge-adopt').click();
  await expect.poll(() => state.calls.some((r) => r.name === 'merge/adopt')).toBe(true);
  state.change('Later race\n');
  release();
  await expect(page.locator('#mbb-merge-panel')).toContainText('采用期间变化');
  await expect(page.locator('#mbb-source')).toHaveValue('Mine candidate\n');
  expect(state.saves).toHaveLength(0);
});

test('merge budget fallback keeps B downloadable and does not send adoption', async ({ page }) => {
  const state = await fixture(page);
  await conflict(page, state, 'Mine retained\n', '\n'.repeat(32769));
  await page.locator('#mbb-merge-open').click();
  await expect(page.locator('#mbb-merge-panel')).toContainText('32,768');
  await expect(page.locator('#mbb-merge-adopt')).toBeDisabled();
  const request = page.waitForEvent('download');
  await page.locator('#mbb-conflict-download').click();
  const download = await request;
  expect(require('node:fs').readFileSync(await download.path(), 'utf8')).toBe('Mine retained\n');
  expect(state.calls.some((r) => r.name === 'merge/adopt')).toBe(false);
});

test('adoption waiting for a fresh opening cannot overwrite a new target B', async ({ page }) => {
  const state = await fixture(page);
  const a = state.current.document.source;
  await conflict(page, state, a.replace('First', 'Mine'), a.replace('Second', 'Server'));
  await page.locator('#mbb-merge-open').click();
  await expect(page.locator('#mbb-merge-adopt')).toBeEnabled();
  let release;
  state.openingDelay = new Promise((resolve) => {
    release = resolve;
  });
  await page.locator('#mbb-merge-adopt').click();
  await expect.poll(() => state.calls.filter((r) => r.name === 'merge/open').length).toBe(2);
  await page.keyboard.press('Escape');
  state.openingDelay = null;
  await page.locator('#mbb-new').click();
  await expect(page.locator('#mbb-source')).toBeEnabled();
  await page.locator('#mbb-edit-toggle').click();
  await page.locator('#mbb-source').fill('New different target B\n');
  release();
  await expect(page.locator('#mbb-source')).toHaveValue('New different target B\n');
  await expect(page.locator('#mbb-document-id')).toBeEditable();
  expect(state.saves).toHaveLength(0);
});

test('unchanged FrontMatter selection survives adoption but receives a new preview authority', async ({
  page,
}) => {
  const raw = '---\nmarkbridge: 1\ntitle: "Header proposal"\n---\n\nFirst.\n\nSecond.\n';
  const state = await fixture(page, { source: raw });
  await open(page);
  await page.locator('#mbb-edit-toggle').click();
  await page.locator('#mbb-frontmatter-title').check();
  await page.locator('#mbb-edit-toggle').click();
  await page.locator('#mbb-source').fill(raw.replace('First', 'Mine'));
  state.change(raw.replace('Second', 'Server'));
  await page.getByRole('button', { name: '查看差异与预览', exact: true }).last().click();
  await expect(page.locator('#mbb-merge-open')).toBeEnabled();
  await page.locator('#mbb-merge-open').click();
  await expect(page.locator('#mbb-merge-adopt')).toBeEnabled();
  await page.locator('#mbb-merge-adopt').click();
  await expect(page.locator('#mbb-frontmatter-title')).toBeChecked();
  await page.getByRole('button', { name: '查看差异与预览', exact: true }).last().click();
  expect(state.calls.filter((r) => r.name === 'preview').at(-1).data.frontmatter_selected).toEqual([
    'title',
  ]);
  expect(state.saves).toHaveLength(0);
});

test('changed FrontMatter header resets prior selections explicitly and still requires a new preview', async ({
  page,
}) => {
  const raw = '---\nmarkbridge: 1\ntitle: "Header proposal"\n---\n\nFirst.\n\nSecond.\n';
  const state = await fixture(page, { source: raw });
  await open(page);
  await page.locator('#mbb-edit-toggle').click();
  await page.locator('#mbb-frontmatter-title').check();
  await page.locator('#mbb-edit-toggle').click();
  await page.locator('#mbb-source').fill(raw.replace('First', 'Mine'));
  state.change(raw.replace('Header proposal', 'Server proposal').replace('Second', 'Server'));
  await page.locator('#mbb-review').click();
  await expect(page.locator('#mbb-merge-open')).toBeEnabled();
  await page.locator('#mbb-merge-open').click();
  await expect(page.locator('#mbb-merge-adopt')).toBeEnabled();
  await page.locator('#mbb-merge-adopt').click();
  await expect(page.locator('#mbb-frontmatter-title')).not.toBeChecked();
  await expect(page.locator('#mbb-dialog .mbb-dialog-footer > p[role=status]')).toContainText(
    '原元数据选择已重置',
  );
  await expect(page.locator('#mbb-save')).toBeDisabled();
  await page.locator('#mbb-review').click();
  expect(state.calls.filter((r) => r.name === 'preview').at(-1).data.frontmatter_selected).toEqual(
    [],
  );
  expect(state.saves).toHaveLength(0);
});

for (const [phase, status, code] of [
  ['preview', 409, 'conflict'],
  ['preview', 422, 'conversion_failed'],
  ['save', 409, 'conflict'],
  ['save', 500, 'save_failed'],
]) {
  test(`late ${phase} ${status} cannot lock or replace newer same-session source and metadata`, async ({
    page,
  }) => {
    const state = await fixture(page, { source: 'First.\n\nSecond.\n' });
    await open(page);
    await page.locator('#mbb-edit-toggle').click();
    await page.locator('#mbb-source').fill('Candidate B1.\n');
    await page.locator('#mbb-title').fill('Title B1');
    if (phase === 'save') {
      await page.locator('#mbb-review').click();
      await expect(page.locator('#mbb-save')).toBeEnabled();
    }
    let release;
    state[phase + 'Delay'] = new Promise((resolve) => {
      release = resolve;
    });
    state[phase + 'Error'] = { status, code };
    const prior = state.calls.filter((r) => r.name === phase).length;
    await page.locator(phase === 'save' ? '#mbb-save' : '#mbb-review').click();
    await expect.poll(() => state.calls.filter((r) => r.name === phase).length).toBe(prior + 1);
    await page.locator('#mbb-edit-toggle').click();
    await page.locator('#mbb-source').fill('Candidate B2 with later input.\n');
    await page.locator('#mbb-title').fill('Title B2');
    await page.locator('#mbb-publication').selectOption('pending');
    await page.evaluate(() => {
      recoveryFields.featured_media = 3;
    });
    release();
    await expect(page.locator('#mbb-dialog .mbb-dialog-footer > p[role=status]')).toContainText(
      '新输入已保留',
    );
    await expect(page.locator('#mbb-conflict')).toBeHidden();
    await expect(page.locator('#mbb-source')).toBeEditable();
    await expect(page.locator('#mbb-source')).toHaveValue('Candidate B2 with later input.\n');
    await expect(page.locator('#mbb-title')).toHaveValue('Title B2');
    await expect(page.locator('#mbb-publication')).toHaveValue('pending');
    await expect(page.locator('#mbb-save')).toBeDisabled();
    state[phase + 'Delay'] = state[phase + 'Error'] = null;
    await page.locator('#mbb-review').click();
    await expect(page.locator('#mbb-save')).toBeEnabled();
    expect(state.calls.filter((r) => r.name === 'preview').at(-1).data).toMatchObject({
      source: 'Candidate B2 with later input.\n',
      title: 'Title B2',
      post_status: 'pending',
      featured_media: 3,
    });
    expect(state.current.document.source).toBe('First.\n\nSecond.\n');
    expect(state.saves).toHaveLength(phase === 'save' ? 1 : 0);
  });
}

for (const rejected of [false, true]) {
  test(`tool source refresh ${rejected ? 'falls back to manual if final signature races' : 'resigns final C before merging later D metadata'}`, async ({
    page,
  }) => {
    const raw = 'First.\n\nSecond.\n';
    const state = await fixture(page, { source: raw, tool: true, sourceManaged: true });
    state.onSource = () => {
      state.onSource = null;
      state.change(raw.replace('Second', 'C second'), {
        title: 'C title',
        post_status: 'pending',
        featured_media: 2,
      });
    };
    state.rejectOpening = rejected;
    await page.locator('#fixture-tool-open').click();
    await expect(page.locator('#mbb-source')).toBeEnabled();
    await expect(page.locator('#mbb-source')).toHaveValue(raw.replace('Second', 'C second'));
    await expect(page.locator('#mbb-title')).toHaveValue('C title');
    await expect(page.locator('#mbb-publication')).toHaveValue('pending');
    expect(state.calls.filter((r) => r.name === 'merge/open').map((r) => r.data.expected)).toEqual([
      'a'.repeat(64),
      state.current.expected,
    ]);
    const mine = raw.replace('First', 'Mine').replace('Second', 'C second');
    await page.locator('#mbb-edit-toggle').click();
    await page.locator('#mbb-source').fill(mine);
    state.change(raw.replace('Second', 'D second'), {
      title: 'D title',
      post_status: 'private',
      featured_media: 3,
    });
    await page.locator('#mbb-review').click();
    await expect(page.locator('#mbb-conflict')).toBeVisible();
    if (rejected) {
      await expect(page.locator('#mbb-merge-open')).toBeDisabled();
      await expect(page.locator('#mbb-source')).toHaveValue(mine);
    } else {
      await expect(page.locator('#mbb-merge-open')).toBeEnabled();
      await page.locator('#mbb-merge-open').click();
      await expect(page.locator('#mbb-merge-adopt')).toBeEnabled();
      expect(
        state.calls.filter((r) => r.name === 'merge/latest').at(-1).data.opening.featured_media,
      ).toBe(2);
      await expect(page.locator('#mbb-merge-panel select[data-field]')).toHaveCount(0);
      await expect(page.locator('#mbb-merge-panel select[data-hunk]')).toHaveCount(0);
      await page.locator('#mbb-merge-adopt').click();
      await expect(page.locator('#mbb-source')).toHaveValue(
        raw.replace('First', 'Mine').replace('Second', 'D second'),
      );
      await expect(page.locator('#mbb-title')).toHaveValue('D title');
      await expect(page.locator('#mbb-publication')).toHaveValue('private');
      await page.locator('#mbb-review').click();
      expect(state.calls.filter((r) => r.name === 'preview').at(-1).data.featured_media).toBe(3);
    }
    expect(state.saves).toHaveLength(0);
  });
}
