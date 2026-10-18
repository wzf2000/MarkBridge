const { test, expect } = require('@playwright/test');
const raw =
  '# 中文😀\r\n\r\n重复段落。\r\n\r\n重复段落。\r\n\r\n```python\r\nprint(1)\r\n```\r\n\r\n$$\r\n\\frac{a}{d}\r\n$$\r\n';
async function open(page) {
  const requests = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/navigation-fixture/preview'
    )
      requests.push(request.postDataJSON());
  });
  await page.goto('/navigation-editor?locale=en_US');
  await page.getByRole('button', { name: '编辑现有文档' }).click();
  await expect(page.locator('#mbb-source')).toHaveValue(raw.replace(/\r\n/g, '\n'));
  return requests;
}
async function review(page) {
  const completed = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/navigation-fixture/preview',
  );
  await page.locator('#mbb-review').click();
  expect((await completed).status()).toBe(200);
}
test('opaque trusted bridge selects repeated source objects and rejects stale or forged messages', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const requests = await open(page);
  await review(page);
  const locate = page.getByRole('button', { name: 'Locate source', exact: true });
  await expect(locate).toBeEnabled();
  const iframe = page.locator('iframe[title="Built-in content preview"]');
  expect(await iframe.getAttribute('sandbox')).toBe('allow-scripts');
  const frame = page.frameLocator('iframe[title="Built-in content preview"]');
  await expect(frame.locator('[data-mbb-preview-range="r2"]')).toBeVisible();
  expect(await page.evaluate(() => document.body.dataset.previewInjection)).toBeUndefined();
  await locate.click();
  await expect(frame.locator('[data-mbb-preview-range="r4"] mjx-container')).toBeVisible();
  await locate.click();
  await expect(frame.locator('[data-mbb-preview-range="r3"]')).toHaveAttribute('tabindex', '0');
  await locate.click();
  await frame.locator('[data-mbb-preview-range="r4"]').click();
  await expect
    .poll(() =>
      page
        .locator('#mbb-source')
        .evaluate((node) => node.value.slice(node.selectionStart, node.selectionEnd)),
    )
    .toBe('$$\n\\frac{a}{d}\n$$\n');
  await page.locator('#mbb-preview-toggle').click();
  await frame.locator('[data-mbb-preview-range="r2"]').click();
  await expect
    .poll(() =>
      page.locator('#mbb-source').evaluate((node) => [node.selectionStart, node.selectionEnd]),
    )
    .toEqual([
      raw.replace(/\r\n/g, '\n').lastIndexOf('重复'),
      raw.replace(/\r\n/g, '\n').lastIndexOf('重复') + 5,
    ]);
  // Reverse selection uses provenance, never repeated rendered text.
  await page.getByText('Find, replace and navigate', { exact: true }).click();
  await page.getByRole('button', { name: 'Locate selection in preview', exact: true }).click();
  await expect(frame.locator('[data-mbb-preview-highlight]')).toHaveAttribute(
    'data-mbb-preview-range',
    'r2',
  );
  const old = await frame.locator('html').evaluate((node) => ({
    session: node.dataset.mbbPreviewSession,
    sourceHash: node.dataset.mbbPreviewSource,
  }));
  const beforeForged = await page.locator('#mbb-source').evaluate((node) => ({
    value: node.value,
    selection: [node.selectionStart, node.selectionEnd],
  }));
  await page.evaluate(() => {
    window.navigationRejectProbe = [];
    addEventListener('message', (event) => {
      if (event.data?.type !== 'mbb-author-navigation/v1' || event.data.id !== 'r0') return;
      window.navigationRejectProbe.push({
        fromFrame:
          event.source ===
          document.querySelector('iframe[title="Built-in content preview"]').contentWindow,
        fromSelf: event.source === window,
        origin: event.origin,
      });
    });
  });
  await page.evaluate(
    (old) =>
      window.postMessage(
        { type: 'mbb-author-navigation/v1', action: 'select', id: 'r0', ...old },
        '*',
      ),
    old,
  );
  await expect.poll(() => page.evaluate(() => navigationRejectProbe.length)).toBe(1);
  expect(await page.evaluate(() => navigationRejectProbe[0].fromSelf)).toBe(true);
  expect(
    await page.locator('#mbb-source').evaluate((node) => ({
      value: node.value,
      selection: [node.selectionStart, node.selectionEnd],
    })),
  ).toEqual(beforeForged);
  await page.locator('#mbb-edit-toggle').click();
  await page.locator('#mbb-source').press('End');
  await page.locator('#mbb-source').pressSequentially(' new');
  const unchanged = await page.locator('#mbb-source').evaluate((node) => ({
    value: node.value,
    selection: [node.selectionStart, node.selectionEnd],
  }));
  // A genuine opaque-frame message with the old session/hash is also rejected after editing.
  await frame.locator('html').evaluate((node) =>
    parent.postMessage(
      {
        type: 'mbb-author-navigation/v1',
        action: 'select',
        id: 'r0',
        session: node.dataset.mbbPreviewSession,
        sourceHash: node.dataset.mbbPreviewSource,
      },
      '*',
    ),
  );
  await expect.poll(() => page.evaluate(() => navigationRejectProbe.length)).toBe(2);
  expect(await page.evaluate(() => navigationRejectProbe[1])).toEqual({
    fromFrame: true,
    fromSelf: false,
    origin: 'null',
  });
  expect(
    await page.locator('#mbb-source').evaluate((node) => ({
      value: node.value,
      selection: [node.selectionStart, node.selectionEnd],
    })),
  ).toEqual(unchanged);
  expect(unchanged.value).toContain(' new');
  await expect(page.locator('#mbb-save')).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Locate selection in preview', exact: true }),
  ).toBeDisabled();
  expect(requests[0].source).toBe(raw);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: test.info().outputPath('source-navigation-' + info.project.name + '.png'),
  });
});
test('a delayed empty navigation and messages from the retired frame cannot replace the new preview', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page);
  await page.evaluate(() => {
    const old = document.querySelector('iframe[title="Built-in content preview"]');
    window.retiredPreview = old;
    window.retiredPreviewWindow = old.contentWindow;
    const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'srcdoc');
    window.pendingEmptyNavigations = [];
    Object.defineProperty(old, 'srcdoc', {
      ...descriptor,
      set(value) {
        if (value === '') {
          // Deterministically hold the old empty navigation until the new document is ready.
          pendingEmptyNavigations.push(
            () =>
              new Promise((resolve) => {
                old.addEventListener('load', resolve, { once: true });
                descriptor.set.call(old, value);
                if (!old.isConnected) old.dispatchEvent(new Event('load'));
              }),
          );
        } else descriptor.set.call(old, value);
      },
    });
  });
  await review(page);
  const iframe = page.locator('iframe[title="Built-in content preview"]');
  await expect(page.getByRole('button', { name: 'Locate source', exact: true })).toBeEnabled();
  expect(await iframe.getAttribute('sandbox')).toBe('allow-scripts');
  expect(await page.evaluate(() => pendingEmptyNavigations.length)).toBeGreaterThan(0);
  const frame = page.frameLocator('iframe[title="Built-in content preview"]');
  await expect(frame.locator('[data-mbb-preview-range="r4"] mjx-container')).toBeVisible();
  const identity = await frame.locator('html').evaluate((node) => ({
    session: node.dataset.mbbPreviewSession,
    sourceHash: node.dataset.mbbPreviewSource,
  }));
  await page.evaluate(() =>
    Promise.all(pendingEmptyNavigations.splice(0).map((release) => release())),
  );
  // Functional negative control: the old in-place implementation loses this rendered content.
  await expect(frame.locator('[data-mbb-preview-range="r4"] mjx-container')).toBeVisible();
  await expect(frame.locator('[data-mbb-preview-range="r2"]')).toHaveText('重复段落。');
  expect(await iframe.evaluate((node) => node !== retiredPreview)).toBe(true);
  await page.getByRole('button', { name: 'Locate source', exact: true }).click();
  await expect(frame.locator('html')).toHaveAttribute('data-mbb-preview-locate', '');
  await page.locator('#mbb-source').evaluate((node) => node.setSelectionRange(2, 4));
  const unchanged = await page.locator('#mbb-source').evaluate((node) => ({
    value: node.value,
    selection: [node.selectionStart, node.selectionEnd],
  }));
  const delivered = await page.evaluate((identity) => {
    const data = { type: 'mbb-author-navigation/v1', action: 'select', id: 'r0', ...identity };
    let observed = false;
    const witness = (event) => {
      if (event.source === retiredPreviewWindow && event.data === data) observed = true;
    };
    addEventListener('message', witness);
    // The current session/hash deliberately match: source-window provenance must reject this.
    // Artificial delayed delivery retains the actual retired proxy. WebKit's native
    // MessageEvent getter drops a discarded context, so do not use that constructor here.
    const event = new Event('message');
    Object.defineProperties(event, {
      source: { value: retiredPreviewWindow },
      origin: { value: 'null' },
      data: { value: data },
    });
    dispatchEvent(event);
    removeEventListener('message', witness);
    return observed;
  }, identity);
  expect(delivered).toBe(true);
  expect(
    await page.locator('#mbb-source').evaluate((node) => ({
      value: node.value,
      selection: [node.selectionStart, node.selectionEnd],
    })),
  ).toEqual(unchanged);
  await expect(frame.locator('[data-mbb-preview-range="r2"]')).toHaveText('重复段落。');
  await expect(frame.locator('[data-mbb-preview-range="r4"] mjx-container')).toBeVisible();
  expect(await iframe.evaluate((node) => node.isConnected && !retiredPreview.isConnected)).toBe(
    true,
  );
  await page.screenshot({
    path: info.outputPath('preview-generation-' + info.project.name + '.png'),
  });
  expect(errors).toEqual([]);
});
test('literal replacements preserve untouched CRLF and undo; IME composition is one source transaction', async ({
  page,
}) => {
  const requests = await open(page);
  await page.getByText('Find, replace and navigate', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Find text', exact: true }).fill('重复段落。');
  await page.getByRole('textbox', { name: 'Replace with', exact: true }).fill('替换。');
  await page.getByRole('button', { name: 'Replace all', exact: true }).click();
  await review(page);
  expect(requests.at(-1).source).toBe(raw.replaceAll('重复段落。', '替换。'));
  await page.locator('#mbb-edit-toggle').click();
  await page.getByRole('button', { name: 'Undo source change', exact: true }).click();
  await review(page);
  expect(requests.at(-1).source).toBe(raw);
  await page.locator('#mbb-edit-toggle').click();
  await page.locator('#mbb-source').evaluate((node) => {
    node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    node.value += '中';
    node.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    node.value += '文';
    node.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
  });
  await page.getByRole('button', { name: 'Undo source change', exact: true }).click();
  await expect(page.locator('#mbb-source')).toHaveValue(raw.replace(/\r\n/g, '\n'));
  await review(page);
  expect(requests.at(-1).source).toBe(raw);
});
test('desktop split view and narrow switching preserve source; examples are explicit unsaved candidates', async ({
  page,
}, info) => {
  await open(page);
  await review(page);
  const split = page.getByRole('button', { name: 'Source beside preview', exact: true });
  if (info.project.name.startsWith('desktop')) {
    await split.click();
    await expect(page.locator('#mbb-source')).toBeVisible();
    await expect(page.locator('#mbb-preview-body')).toBeVisible();
  } else {
    await expect(split).toBeHidden();
    await page.locator('#mbb-edit-toggle').click();
    await expect(page.locator('#mbb-preview-body')).toBeHidden();
  }
  await page.getByText('Find, replace and navigate', { exact: true }).click();
  await page.getByText('Insert a teaching structure', { exact: true }).click();
  await page.getByRole('button', { name: 'Insert example at selection', exact: true }).click();
  await expect(page.locator('#mbb-source')).toContainText('');
  expect(await page.locator('#mbb-source').inputValue()).toContain(':::mbb:v1 collapse');
  await expect(page.locator('#mbb-save')).toBeDisabled();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: test.info().outputPath('authoring-workspace-' + info.project.name + '.png'),
  });
});
