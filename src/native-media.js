// Fixed native-media v1 subset. Numeric attachment IDs are local data, never anchors.
export const mediaKinds = new Set(['image', 'gallery']);
const error = (fail, code, message) => fail(code, message);
export function mediaCaption(value, fail) {
  if (
    typeof value !== 'string' ||
    new TextEncoder().encode(value).length > 4096 ||
    /[\x00\r\n\uD800-\uDFFF]/u.test(value)
  )
    error(fail, 'MEDIA_CAPTION', 'Media captions require bounded single-line safe inline content');
  const root = document.createElement('template');
  root.innerHTML = value;
  const walk = (node, depth = 0) => {
    if (depth > 16) error(fail, 'MEDIA_CAPTION', 'Media captions exceed their structure budget');
    if (node.nodeType === 3) return;
    if (
      node.nodeType !== 1 ||
      !['strong', 'em', 'del', 'code', 'br'].includes(node.localName) ||
      node.attributes.length
    )
      error(
        fail,
        'MEDIA_CAPTION',
        'Media captions only support text, strong, emphasis, deletion, code and line breaks',
      );
    for (const child of node.childNodes) walk(child, depth + 1);
  };
  for (const node of root.content.childNodes) walk(node);
  // Reject browser repairs instead of silently changing malformed author HTML.
  const normalize = (s) => s.replace(/<br\s*\/?\s*>/g, '<br>');
  if (normalize(root.innerHTML) !== normalize(value))
    error(fail, 'MEDIA_CAPTION', 'Media caption HTML must be canonical and balanced');
  return value;
}
export function mediaAttributes(kind, input, fail, source = true) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    error(fail, 'MEDIA_ATTRIBUTES', 'Native media attributes must be a closed object');
  // Gutenberg adds this equivalent default to native galleries on opening.
  // It is not part of the persisted Markdown directive's closed attribute set.
  if (!source && kind === 'gallery' && input.linkTo === 'none') {
    input = { ...input };
    delete input.linkTo;
  }
  const allowed =
    kind === 'image' ? ['caption', 'id', 'sizeSlug', 'linkDestination'] : ['columns', 'imageCrop'];
  if (Object.keys(input).some((k) => !allowed.includes(k)))
    error(fail, 'MEDIA_ATTRIBUTES', 'Unsupported native media attribute');
  const a = {};
  for (const key of allowed) if (Object.hasOwn(input, key)) a[key] = input[key];
  if (kind === 'image') {
    if (Object.hasOwn(a, 'caption')) mediaCaption(a.caption, fail);
    if (Object.hasOwn(a, 'id') && (!Number.isSafeInteger(a.id) || a.id < 1))
      error(fail, 'MEDIA_ID', 'Media attachment IDs must be positive safe integers');
    if (
      Object.hasOwn(a, 'sizeSlug') &&
      !['thumbnail', 'medium', 'large', 'full'].includes(a.sizeSlug)
    )
      error(fail, 'MEDIA_ATTRIBUTES', 'Unsupported native image size');
    if (Object.hasOwn(a, 'linkDestination') && a.linkDestination !== 'none')
      error(fail, 'MEDIA_LINK', 'Only unlinked native images are supported in this version');
  } else {
    if (
      Object.hasOwn(a, 'columns') &&
      (!Number.isInteger(a.columns) || a.columns < 1 || a.columns > 8)
    )
      error(fail, 'MEDIA_ATTRIBUTES', 'Gallery columns must be an integer from 1 to 8');
    if (Object.hasOwn(a, 'imageCrop') && typeof a.imageCrop !== 'boolean')
      error(fail, 'MEDIA_ATTRIBUTES', 'Gallery imageCrop must be a boolean');
  }
  if (kind === 'image' && a.caption === '') delete a.caption;
  return a;
}
export function mediaImageAttributes(input, fail) {
  const a = { ...input };
  if (a.isDecorative === false) delete a.isDecorative;
  for (const key of ['url', 'alt', 'title']) delete a[key];
  if (a.caption !== undefined && typeof a.caption !== 'string') a.caption = String(a.caption);
  return mediaAttributes('image', a, fail, false);
}
export function mediaGalleryAttributes(input, fail) {
  const a = { ...input },
    defaults = {
      caption: '',
      images: [],
      ids: [],
      shortCodeTransforms: [],
      navigationButtonType: 'icon',
      randomOrder: false,
      fixedHeight: true,
      sizeSlug: 'large',
      allowResize: false,
      aspectRatio: 'auto',
    };
  for (const [key, value] of Object.entries(defaults))
    if (JSON.stringify(a[key]) === JSON.stringify(value)) delete a[key];
  if (a.imageCrop === true) delete a.imageCrop;
  return mediaAttributes('gallery', a, fail, false);
}
export function assembleMedia(item, make, fail) {
  const a = mediaAttributes(item.kind, item.attrs, fail);
  if (item.kind === 'image') {
    if (
      item.children.length !== 1 ||
      item.children[0].name !== 'core/image' ||
      item.children[0].innerBlocks?.length ||
      Object.keys(mediaImageAttributes(item.children[0].attributes, fail)).length
    )
      error(
        fail,
        'MEDIA_STRUCTURE',
        'An image directive requires exactly one ordinary Markdown image',
      );
    return make('core/image', { ...item.children[0].attributes, ...a });
  }
  if (
    !item.children.length ||
    item.children.length > 32 ||
    item.children.some((b) => b.name !== 'core/image')
  )
    error(fail, 'MEDIA_STRUCTURE', 'A gallery requires 1 to 32 direct native images');
  return make('core/gallery', a, item.children);
}
export function validateMedia(blocks, fail, portable = false) {
  let budget = 0;
  const walk = (list, depth = 0) => {
    if (depth > 32)
      error(fail, 'MEDIA_STRUCTURE', 'Native media exceeds the document structure budget');
    for (const b of list) {
      if (++budget > 10000)
        error(fail, 'MEDIA_STRUCTURE', 'Native media exceeds the document structure budget');
      if (b.name === 'core/footnotes')
        error(
          fail,
          'NATIVE_FOOTNOTES',
          'Native footnotes require external post metadata and cannot be converted losslessly',
        );
      if (b.name === 'core/image') {
        const a = mediaImageAttributes(b.attributes || {}, fail);
        if ((b.innerBlocks || []).length)
          error(fail, 'MEDIA_STRUCTURE', 'Native image blocks cannot contain child blocks');
        if (portable && a.id)
          error(fail, 'MEDIA_LOCAL_ID', 'Portable exports cannot carry local media attachment IDs');
      }
      if (b.name === 'core/gallery') {
        mediaGalleryAttributes(b.attributes || {}, fail);
        const inner = b.innerBlocks || [];
        if (!inner.length || inner.length > 32 || inner.some((c) => c.name !== 'core/image'))
          error(fail, 'MEDIA_STRUCTURE', 'A gallery requires 1 to 32 direct native images');
      }
      walk(b.innerBlocks || [], depth + 1);
    }
  };
  walk(blocks);
}
export function validateMediaSerialized(serialized, fail) {
  for (const m of serialized.matchAll(/<!-- wp:(image|gallery)(?: (\{[\s\S]*?\}))? -->/g)) {
    let attrs;
    try {
      attrs = JSON.parse(m[2] || '{}');
    } catch {
      error(fail, 'MEDIA_ATTRIBUTES', 'Native media attributes must be a closed object');
    }
    mediaAttributes(m[1], attrs, fail, false);
  }
  if (/<!-- wp:footnotes(?:\s|\/)/.test(serialized))
    error(
      fail,
      'NATIVE_FOOTNOTES',
      'Native footnotes require external post metadata and cannot be converted losslessly',
    );
}
export function mediaDirective(kind, attrs, body) {
  return (
    ':::mbb:v1 ' + kind + ' ' + JSON.stringify(attrs) + '\n\n' + body.trimEnd() + '\n\n:::mbb:end'
  );
}
