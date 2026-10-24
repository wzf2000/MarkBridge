const { test, expect } = require('@playwright/test');
test.skip(!process.env.MARKBRIDGE_TEST_RUNTIME, 'requires the real WordPress block runtime');
test('managed conversion hints show unsupported blocks without changing them', async ({ page }) => {
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  await page.goto('/task-editor');
  await page.locator('#export-tasks').waitFor();
  await page.evaluate(async () => {
    // Use the actual editor block registry; only post-save plumbing is synthetic.
    const select = wp.data.select.bind(wp.data);
    const dispatch = wp.data.dispatch.bind(wp.data);
    const editor = {
      getCurrentPostId: () => 12,
      getEditedPostContent: () => wp.blocks.serialize(taskBlocks),
      getEditedPostAttribute: (key) => (key === 'title' ? 'Managed fixture' : ''),
    };
    wp.data = {
      ...wp.data,
      select: (store) =>
        store === 'core/editor'
          ? editor
          : store === 'core/block-editor'
            ? taskRegistry.select(store)
            : select(store),
      dispatch: (store) =>
        store === 'core/editor'
          ? { lockPostAutosaving() {}, lockPostSaving() {} }
          : dispatch(store),
      subscribe: (callback) => taskRegistry.subscribe(callback),
    };
    window.MBB_EDITOR = {
      postId: 12,
      root: location.origin + '/wp-json/mbb/v1/',
      nonce: 'fixture',
      state: { expected: 'fixture-1', source_managed: false },
      supportedBlocks: MBB.supportedBlocks,
    };
    window.MBB_REVISIONS = { open() {} };
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/plugin/editor-ui.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
  });
  await expect(page.locator('.mbb-capabilities summary')).toHaveText('转换支持与当前内容');
  await page.evaluate(() => {
    taskRegistry
      .dispatch('core/block-editor')
      .insertBlocks(
        wp.blocks.createBlock('core/cover', {}, [
          wp.blocks.createBlock('core/paragraph', { content: 'KEEP_UNSUPPORTED' }),
        ]),
      );
    window.capabilityBefore = wp.blocks.serialize(
      taskRegistry.select('core/block-editor').getBlocks(),
    );
  });
  await expect(page.locator('.mbb-capabilities summary')).toContainText('1 个区块暂不支持');
  await expect(page.locator('.mbb-capabilities')).not.toHaveAttribute('open', '');
  await page.locator('#mbb-more > summary').click();
  await page.locator('.mbb-capabilities summary').click();
  await expect(page.locator('.mbb-capabilities [role="status"]')).toContainText(
    '尚不支持转换的区块',
  );
  await page.getByRole('button', { name: '检查当前区块转换' }).click();
  await expect(page.locator('.mbb-capabilities [role="status"]')).toContainText('第 2 个区块');
  expect(
    await page.evaluate(() =>
      wp.blocks.serialize(taskRegistry.select('core/block-editor').getBlocks()),
    ),
  ).toBe(await page.evaluate(() => capabilityBefore));
  expect(failures).toEqual([]);
});
