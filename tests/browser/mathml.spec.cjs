const { test, expect } = require('@playwright/test');
const path = require('node:path');
test('pinned spacing CHTML strips only finite generated collapse metadata before MathML fallback', async ({
  page,
}) => {
  await page.goto('/front');
  await page.waitForFunction(() => !!MBB_MATH.presentationMathML);
  await page.addScriptTag({ path: path.resolve('plugin/static-export.js') });
  const value = await (await page.request.get('/static-export-descriptor')).json();
  const result = await page.evaluate(async (value) => {
    value.body =
      '<p><span class="mbb-math" data-mbb-tex="\\hspace{1cm}x">x</span></p>' + value.body;
    const original = MBB_MATH.preview,
      rendered = await original(value.body),
      html = await (await MarkBridgeStaticExport.build(value)).text(),
      negative = [];
    try {
      for (const [tag, attr] of [
        ['mjx-math', 'javascript:bad()'],
        ['mjx-mi', '(3 (c 2) 0 1)'],
      ]) {
        const d = new DOMParser().parseFromString(rendered, 'text/html');
        d.querySelector(tag).setAttribute('data-semantic-collapsed', attr);
        MBB_MATH.preview = async () => d.body.innerHTML;
        try {
          await MarkBridgeStaticExport.build(value);
          negative.push('accepted');
        } catch {
          negative.push('refused');
        }
      }
      MBB_MATH.preview = original;
      try {
        await MarkBridgeStaticExport.build({
          ...value,
          body: value.body + '<span data-semantic-collapsed="(3 (c 2) 0 1)">source</span>',
        });
        negative.push('accepted');
      } catch {
        negative.push('refused');
      }
    } finally {
      MBB_MATH.preview = original;
    }
    return { html, negative };
  }, value);
  expect(result.html).not.toContain('data-semantic-collapsed');
  expect(result.negative).toEqual(Array(3).fill('refused'));
});
test('Presentation MathML has independent finite byte, node and depth budgets', async ({
  page,
}) => {
  await page.goto('/front');
  await page.waitForFunction(() => !!window.MarkBridgeMathML);
  const results = await page.evaluate(() => {
    const wrap = (s) => '<math xmlns="http://www.w3.org/1998/Math/MathML">' + s + '</math>';
    return [
      wrap('<mi>x</mi>'.repeat(4096)),
      wrap('<mrow>'.repeat(33) + '<mi>x</mi>' + '</mrow>'.repeat(33)),
      wrap('<mtext>' + 'x'.repeat(131072) + '</mtext>'),
    ].map((raw) => {
      try {
        MarkBridgeMathML.validate(raw, 'x');
        return 'accepted';
      } catch (e) {
        return e.mbbCode;
      }
    });
  });
  expect(results).toEqual(Array(3).fill('MATHML_UNSUPPORTED'));
});
test('queued pinned engine returns finite Presentation MathML and visible TeX fallback', async ({
  page,
}) => {
  await page.goto('/front');
  await page.waitForFunction(() => !!MBB_MATH.presentationMathML);
  const result = await page.evaluate(async () => {
    const expressions = [
      '\\frac{a}{d}',
      '\\operatorname{KL}(P\\Vert Q)',
      '\\mathbb{E}[X]',
      '\\begin{cases}x&x>0\\\\-x&x\\le0\\end{cases}',
    ];
    const out = await Promise.all(expressions.map((tex) => MBB_MATH.presentationMathML(tex, true)));
    return out.map((r, i) => {
      if (!r.mathml) return r;
      const doc = new DOMParser().parseFromString(r.mathml, 'application/xml');
      return {
        reason: r.reason,
        errors: doc.querySelectorAll('parsererror').length,
        root: doc.documentElement.localName,
        namespace: doc.documentElement.namespaceURI,
        tex: doc.querySelector('annotation')?.textContent,
        expected: expressions[i],
        data: doc.querySelectorAll('[data-latex],[data-semantic-id]').length,
      };
    });
  });
  for (const row of result) {
    expect(row.reason).toBe(null);
    expect(row.root).toBe('math');
    expect(row.errors).toBe(0);
    expect(row.namespace).toBe('http://www.w3.org/1998/Math/MathML');
    expect(row.tex).toBe(row.expected);
    expect(row.data).toBe(0);
  }
});
test('the real supported base spacing outside the MathML subset is an explicit fallback', async ({
  page,
}) => {
  await page.goto('/front');
  await page.waitForFunction(() => !!MBB_MATH.presentationMathML);
  const result = await page.evaluate(() => MBB_MATH.presentationMathML('\\hspace{1cm}x', false));
  expect(result.mathml).toBe(null);
  expect(result.reason).toBe('MATHML_UNSUPPORTED');
});
test('derived MathML closes unsafe XML and distinguishes an unsupported finite subset', async ({
  page,
}) => {
  await page.goto('/front');
  await page.waitForFunction(() => !!window.MarkBridgeMathML);
  const cases = await page.evaluate(() => {
    const wrap = (s) => '<math xmlns="http://www.w3.org/1998/Math/MathML">' + s + '</math>';
    return [
      '<mi href="https://example.invalid">x</mi>',
      '<mi style="color:red">x</mi>',
      '<mi onclick="x()">x</mi>',
      '<annotation-xml encoding="text/html"><p>x</p></annotation-xml>',
      '<maction><mi>x</mi></maction>',
      '<mi xmlns="urn:evil">x</mi>',
      '<mfrac><mi>x</mi></mfrac>',
      '<merror><mtext>bad</mtext></merror>',
      '<mstack><mn>1</mn></mstack>',
    ].map((s) => {
      try {
        MarkBridgeMathML.validate(wrap(s), 'x');
        return 'accepted';
      } catch (e) {
        return e.mbbCode;
      }
    });
  });
  expect(cases.slice(0, 7)).toEqual(Array(7).fill('MATHML_UNSAFE'));
  expect(cases.slice(7)).toEqual(['MATHML_UNSUPPORTED', 'MATHML_UNSUPPORTED']);
});
