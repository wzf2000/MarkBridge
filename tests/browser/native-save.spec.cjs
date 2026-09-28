const { test, expect } = require('@playwright/test');
test('native save is enabled and only successful saves advance the paired baseline', async ({
  page,
}) => {
  await page.goto('/native-editor');
  await page.locator('#mbb-toolbar').waitFor();
  expect(await page.evaluate(() => nativeLocks)).toEqual(['autosave:mbb-paired-save']);
  await expect(page.locator('#mbb-block-review')).toHaveText('查看差异与预览');
  await page.evaluate(() => {
    window.nativeResult = () =>
      Promise.resolve({
        id: 12,
        mbb_expected: 'baseline-2',
        status: 'pending',
        title: { raw: 'Changed' },
        featured_media: 7,
      });
  });
  await page.evaluate(() =>
    wp.apiFetch({
      path: '/wp/v2/posts/12?context=edit',
      method: 'POST',
      data: { content: 'candidate', title: 'title', tags: [3] },
    }),
  );
  expect(await page.evaluate(() => MBB_EDITOR.state.post_status)).toBe('pending');
  expect(await page.evaluate(() => MBB_EDITOR.state.title)).toBe('Changed');
  expect(await page.evaluate(() => nativeRequests[0].data)).toEqual({
    content: 'candidate',
    title: 'title',
    tags: [3],
    mbb_expected: 'baseline-1',
  });
  await page.evaluate(async () => {
    window.nativeResult = () => Promise.reject({ code: 'conflict', message: 'changed' });
    try {
      await wp.apiFetch({ path: '/wp/v2/posts/12', method: 'POST', data: { content: 'unsaved' } });
    } catch {}
  });
  expect(await page.evaluate(() => MBB_EDITOR.state.expected)).toBe('baseline-2');
  expect(await page.evaluate(() => nativeRequests[1].data.mbb_expected)).toBe('baseline-2');
});
test('other documents and autosaves are not rewritten; source files keep their confirmation gate', async ({
  page,
}) => {
  await page.goto('/native-editor');
  await page.locator('#mbb-toolbar').waitFor();
  await page.evaluate(async () => {
    await wp.apiFetch({ path: '/wp/v2/posts/13', method: 'POST', data: { content: 'other' } });
    await wp.apiFetch({
      path: '/wp/v2/posts/12/autosaves',
      method: 'POST',
      data: { content: 'auto' },
    });
  });
  expect(await page.evaluate(() => nativeRequests.every((r) => !('mbb_expected' in r.data)))).toBe(
    true,
  );
  await page.goto('/native-editor?source');
  await page.locator('#mbb-toolbar').waitFor();
  expect(await page.evaluate(() => nativeLocks)).toContain('mbb-paired-save');
  await expect(page.locator('#mbb-toolbar')).toContainText('需预览后确认写回');
});
test('query-style REST URLs carry the same token and unparsed responses are preserved', async ({
  page,
}) => {
  await page.goto('/native-editor');
  await page.locator('#mbb-toolbar').waitFor();
  const result = await page.evaluate(async () => {
    window.nativeResult = () =>
      Promise.resolve(new Response(JSON.stringify({ mbb_expected: 'query-next' })));
    const r = await wp.apiFetch({
      url: location.origin + '/?rest_route=/wp/v2/posts/12',
      method: 'PUT',
      parse: false,
      data: { content: 'candidate' },
    });
    return {
      response: r instanceof Response,
      json: await r.json(),
      expected: MBB_EDITOR.state.expected,
      sent: nativeRequests[0].data.mbb_expected,
    };
  });
  expect(result).toEqual({
    response: true,
    json: { mbb_expected: 'query-next' },
    expected: 'query-next',
    sent: 'baseline-1',
  });
});
