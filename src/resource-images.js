// Only operate on a converter-validated serialized snapshot, never arbitrary Markdown.
export function rewriteSerializedImageURLs(serialized, mappings, fail) {
  if (!Array.isArray(mappings) || mappings.length > 256)
    fail('RESOURCE_MAP', '图片映射最多 256 种引用、32 个目标');
  const replacements = new Map();
  for (const item of mappings) {
    if (
      !item ||
      Object.keys(item).sort().join(',') !== 'from,to' ||
      typeof item.from !== 'string' ||
      typeof item.to !== 'string' ||
      !item.from ||
      [...item.from].length > 2048 ||
      [...item.to].length > 4096 ||
      /[\uD800-\uDFFF\x00]/u.test(item.from + item.to) ||
      replacements.has(item.from) ||
      !/^(?:https?:\/\/[^\s<>"'\\]+|mbb-import\/[a-f0-9]{64})$/.test(item.to)
    )
      fail('RESOURCE_MAP', '图片映射非法或重复');
    replacements.set(item.from, { url: item.to, count: 0 });
  }
  if (new Set([...replacements.values()].map((item) => item.url)).size > 32)
    fail('RESOURCE_MAP', '图片映射最多 32 个目标');
  const decode = (value) => {
    const element = document.createElement('textarea');
    element.innerHTML = value;
    return element.value;
  };
  const escape = (value) =>
    value.replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const result = serialized.replace(
    /<!--[\s\S]*?-->|<(pre|code)\b[^>]*>[\s\S]*?<\/\1\s*>|<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi,
    (tag) => {
      if (!/^<img\b/i.test(tag)) return tag;
      return tag.replace(
        /(\s+[a-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gi,
        (attr, name, double, single, plain) => {
          if (
            name.trim().toLowerCase() !== 'src' ||
            (double === undefined && single === undefined && plain === undefined)
          )
            return attr;
          const mapped = replacements.get(decode(double ?? single ?? plain));
          if (!mapped) return attr;
          mapped.count++;
          return name + '="' + escape(mapped.url) + '"';
        },
      );
    },
  );
  if ([...replacements.values()].some((item) => item.count === 0))
    fail('RESOURCE_TARGET', '图片映射必须指向实际作者图片');
  return result;
}
