const { test, expect } = require('@playwright/test');
test('real engine semantic structures provide bounded Chinese readings and explicit unsupported fallback', async ({
  page,
}, info) => {
  await page.goto('/front?locale=en_US');
  await expect(page.locator('#inline-line mjx-container')).toBeVisible();
  const result = await page.evaluate(async () => {
    const values = {};
    for (const tex of [
      '\\frac{a}{d}',
      'x^2',
      'x_i',
      '\\sqrt{x}',
      '\\sqrt[3]{x}',
      'a+b=c',
      '\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}',
      '\\int_0^1 x\\,dx',
      'A^T',
      '-x',
      '\\hbar',
      '\\binom{n}{k}',
    ]) {
      const html = await MBB_MATH.preview(
        '<span class="mbb-math" data-mbb-tex="' + tex.replaceAll('"', '&quot;') + '"></span>',
      );
      const doc = new DOMParser().parseFromString(html, 'text/html');
      try {
        const tree = MBBMathExplorer.semanticTree(doc);
        values[tex] = {
          reading: MBBMathExplorer.chineseReading(tree),
          nodes: [...tree.nodes.values()].map((n) => ({
            id: n.id,
            type: n.type,
            children: n.children,
            content: n.content,
            parent: n.parent,
            latex: n.latex,
            english: n.english,
          })),
        };
      } catch (e) {
        values[tex] = { error: e.message, html: doc.querySelector('mjx-container')?.outerHTML };
      }
    }
    return values;
  });
  require('fs').writeFileSync(
    info.outputPath('real-semantics.json'),
    JSON.stringify(result, null, 2),
  );
  expect(result['\\frac{a}{d}'].reading).toBe('分数开始；分子 a；分母 d；分数结束');
  expect(result['x^2'].reading).toBe('x 的 2 次方');
  expect(result['x_i'].reading).toContain('下标 i');
  expect(result['\\sqrt{x}'].reading).toBe('根号开始 x 根号结束');
  expect(result['\\sqrt[3]{x}'].reading).toBe('3 次根号开始 x 根号结束');
  expect(result['a+b=c'].reading).toBe('a 加 b 等于 c');
  expect(result['\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}'].reading).toContain('第 2 行');
  expect(result['\\int_0^1 x\\,dx'].reading).toBeNull();
  expect(result['A^T'].reading).toContain('上标 T');
  expect(result['A^T'].reading).not.toContain('次方');
  expect(result['-x'].reading).toBe('负 x');
  expect(result['\\hbar'].reading).toBeNull();
  expect(result['\\binom{n}{k}'].reading).toBeNull();
});
test('formula reader explores the rendered expression and exits without changing author content', async ({
  page,
}, info) => {
  await page.goto('/front?locale=en_US');
  const formula = page.locator('#inline-line .mbb-math');
  await expect(formula.locator('mjx-container')).toBeVisible();
  const before = await formula.getAttribute('data-mbb-tex');
  await formula.focus();
  await page.keyboard.press('Enter');
  const reader = page.locator('dialog.mbb-math-reader');
  await expect(reader).toBeVisible();
  const panel = reader.locator('.mbb-math-explorer');
  await panel.locator('summary').click();
  await panel.getByRole('combobox').selectOption('zh_CN');
  const region = panel.getByRole('group');
  await expect(region).toContainText('次方');
  await panel.getByRole('button', { name: 'Explore with keyboard' }).click();
  await expect(region).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(reader.locator('.mbb-math-explorer-current')).toHaveCount(1);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Home');
  await expect(region).toContainText('次方');
  await page.screenshot({ path: info.outputPath('math-exploration.png') });
  await page.keyboard.press('Escape');
  await expect(panel.getByRole('button', { name: 'Explore with keyboard' })).toBeFocused();
  await expect(reader).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(reader).toBeHidden();
  await expect(formula).toBeFocused();
  expect(await formula.getAttribute('data-mbb-tex')).toBe(before);
});
