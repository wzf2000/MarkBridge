const mathNS = 'http://www.w3.org/1998/Math/MathML';
const mathTags = new Set([
  'semantics',
  'mrow',
  'mi',
  'mn',
  'mo',
  'mfrac',
  'msup',
  'msub',
  'msubsup',
  'msqrt',
  'mroot',
  'mover',
  'munder',
  'munderover',
  'mtable',
  'mtr',
  'mtd',
  'mtext',
  'mspace',
  'mpadded',
  'mphantom',
  'menclose',
  'mmultiscripts',
  'mprescripts',
  'none',
  'annotation',
]);
const mathAttributes = new Set([
  'encoding',
  'lspace',
  'rspace',
  'stretchy',
  'fence',
  'separator',
  'form',
  'mathvariant',
  'mathsize',
  'minsize',
  'maxsize',
  'displaystyle',
  'scriptlevel',
  'accent',
  'accentunder',
  'linethickness',
  'bevelled',
  'mathcolor',
  'mathbackground',
  'width',
  'height',
  'depth',
  'voffset',
  'notation',
  'columnalign',
  'rowalign',
  'groupalign',
  'columnspacing',
  'rowspacing',
  'framespacing',
  'columnlines',
  'rowlines',
  'frame',
  'side',
  'minlabelspacing',
  'movablelimits',
  'largeop',
  'symmetric',
]);
const isEscaped = (text, index) => {
  let slashes = 0;
  while (index - slashes - 1 >= 0 && text[index - slashes - 1] === '\\') slashes++;
  return slashes % 2 === 1;
};
export function inspectNativeMath({ tex, mathML = '', attributes = {}, inline = false }, owner) {
  if (typeof tex !== 'string' || !tex.trim() || tex.length > 20000)
    return '原生公式缺少可用的 TeX，或公式超过长度限制。';
  if (inline && (tex.trim() !== tex || /[\r\n]/.test(tex)))
    return '行内公式必须为单行且两端没有空白。';
  for (let index = 0; index < tex.length; index++) {
    if (tex[index] === '$' && !isEscaped(tex, index)) return 'TeX 含未转义美元符，无法无损转换。';
  }
  const allowed = inline ? new Set(['data-latex']) : new Set(['latex', 'mathML']);
  if (Object.keys(attributes).some((key) => !allowed.has(key)))
    return '原生公式带有额外样式或属性，无法无损转换。';
  if (typeof mathML !== 'string') return '原生 MathML 无效。';
  if (!mathML) return null;
  if (/<!|<\?|\]\]>/.test(mathML)) return '原生 MathML 含不支持的结构。';
  const parser = new owner.defaultView.DOMParser();
  const parsed = parser.parseFromString(
    `<math xmlns="${mathNS}">${mathML}</math>`,
    'application/xml',
  );
  if (parsed.querySelector('parsererror')) return '原生 MathML 无法解析。';
  const root = parsed.documentElement;
  if (
    root.children.length !== 1 ||
    root.firstElementChild.localName !== 'semantics' ||
    root.firstElementChild.children.length < 2 ||
    [...root.childNodes, ...root.firstElementChild.childNodes].some(
      (node) => node.nodeType === 3 && node.textContent.trim(),
    )
  )
    return '原生 MathML 缺少可核对的语义结构。';
  let annotations = 0;
  for (const element of root.querySelectorAll('*')) {
    if (element.namespaceURI !== mathNS || !mathTags.has(element.localName))
      return '原生 MathML 含不支持的元素。';
    for (const attribute of element.attributes) {
      if (attribute.namespaceURI || !mathAttributes.has(attribute.localName))
        return '原生 MathML 含不支持的属性。';
    }
    if (element.localName === 'annotation') {
      annotations++;
      if (element.getAttribute('encoding') !== 'application/x-tex' || element.textContent !== tex)
        return '原生 MathML 内的 TeX 与公式源码不一致。';
    }
  }
  if (annotations !== 1) return '原生 MathML 缺少唯一的 TeX 源码注释。';
  return null;
}
function mathTree(markup, owner) {
  const parsed = new owner.defaultView.DOMParser().parseFromString(
    `<math xmlns="${mathNS}">${markup}</math>`,
    'application/xml',
  );
  if (parsed.querySelector('parsererror')) return null;
  const normalize = (node) => {
    if (node.nodeType === 3) {
      if (
        !node.textContent.trim() &&
        !['mi', 'mn', 'mo', 'mtext', 'annotation'].includes(node.parentNode.localName)
      )
        return null;
      return ['text', node.textContent];
    }
    if (node.nodeType !== 1) return ['unsupported', node.nodeType];
    return [
      node.namespaceURI,
      node.localName,
      [...node.attributes]
        .map((attr) => [attr.namespaceURI, attr.name, attr.value])
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
      [...node.childNodes].map(normalize).filter(Boolean),
    ];
  };
  return JSON.stringify(normalize(parsed.documentElement));
}
export async function verifyNativeMathML(tex, mathML, display, owner) {
  if (!mathML) return null;
  try {
    const { default: latexToMathML } = await import('@wordpress/latex-to-mathml');
    const generated = latexToMathML(tex, { displayMode: display });
    const originalTree = mathTree(mathML, owner);
    const generatedTree = mathTree(generated, owner);
    return originalTree && originalTree === generatedTree
      ? null
      : '原生公式的显示结构与 TeX 不一致，无法无损转换。';
  } catch {
    return '无法核对原生公式的显示结构，请保留原生公式。';
  }
}
export async function verifyRenderedMath(tex, display, owner) {
  try {
    const html = await MBB_MATH.render(tex, display);
    const template = owner.createElement('template');
    template.innerHTML = html;
    return template.content.querySelector('mjx-merror,[data-mbb-math-error]')
      ? '公式引擎无法解析该 TeX。'
      : null;
  } catch (error) {
    return error?.message || '公式引擎未能验证该 TeX。';
  }
}
