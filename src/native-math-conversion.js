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
    return 'The native formula has no usable TeX or exceeds its length budget.';
  if (inline && (tex.trim() !== tex || /[\r\n]/.test(tex)))
    return 'Inline formulas must occupy one line without leading or trailing whitespace.';
  for (let index = 0; index < tex.length; index++) {
    if (tex[index] === '$' && !isEscaped(tex, index))
      return 'TeX contains unescaped dollar signs and cannot be converted without loss.';
  }
  const allowed = inline ? new Set(['data-latex']) : new Set(['latex', 'mathML']);
  if (Object.keys(attributes).some((key) => !allowed.has(key)))
    return 'The native formula has extra styles or attributes and cannot be converted without loss.';
  if (typeof mathML !== 'string') return 'The native MathML is invalid.';
  if (!mathML) return null;
  if (/<!|<\?|\]\]>/.test(mathML)) return 'The native MathML contains unsupported structure.';
  const parser = new owner.defaultView.DOMParser();
  const parsed = parser.parseFromString(
    `<math xmlns="${mathNS}">${mathML}</math>`,
    'application/xml',
  );
  if (parsed.querySelector('parsererror')) return 'The native MathML could not be parsed.';
  const root = parsed.documentElement;
  if (
    root.children.length !== 1 ||
    root.firstElementChild.localName !== 'semantics' ||
    root.firstElementChild.children.length < 2 ||
    [...root.childNodes, ...root.firstElementChild.childNodes].some(
      (node) => node.nodeType === 3 && node.textContent.trim(),
    )
  )
    return 'The native MathML lacks verifiable semantic structure.';
  let annotations = 0;
  for (const element of root.querySelectorAll('*')) {
    if (element.namespaceURI !== mathNS || !mathTags.has(element.localName))
      return 'The native MathML contains unsupported elements.';
    for (const attribute of element.attributes) {
      if (attribute.namespaceURI || !mathAttributes.has(attribute.localName))
        return 'The native MathML contains unsupported attributes.';
    }
    if (element.localName === 'annotation') {
      annotations++;
      if (element.getAttribute('encoding') !== 'application/x-tex' || element.textContent !== tex)
        return 'TeX inside native MathML differs from the formula source.';
    }
  }
  if (annotations !== 1) return 'The native MathML lacks a unique TeX source annotation.';
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
      : "The native formula's display structure differs from its TeX and cannot be converted without loss.";
  } catch {
    return "The native formula's display structure could not be verified. Preserve the native formula.";
  }
}
export async function verifyRenderedMath(tex, display, owner) {
  try {
    const html = await MBB_MATH.render(tex, display);
    const template = owner.createElement('template');
    template.innerHTML = html;
    return template.content.querySelector('mjx-merror,[data-mbb-math-error]')
      ? 'The formula engine cannot parse this TeX.'
      : null;
  } catch (error) {
    return error?.message || 'The formula engine did not verify this TeX.';
  }
}
