// Only operate on a converter-validated serialized snapshot, never arbitrary Markdown.
export function rewriteSerializedImageURLs(serialized, mappings, fail, portable = false) {
  if (!Array.isArray(mappings) || mappings.length > 256)
    fail('RESOURCE_MAP', 'Image mappings are limited to 256 references and 32 targets');
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
      !(
        portable
          ? /^images\/[a-f0-9]{64}\.(?:png|jpg|gif|webp)$/
          : /^(?:https?:\/\/[^\s<>"'\\]+|mbb-import\/[a-f0-9]{64})$/
      ).test(item.to)
    )
      fail('RESOURCE_MAP', 'Image mappings are invalid or duplicated');
    replacements.set(item.from, { url: item.to, count: 0 });
  }
  if (new Set([...replacements.values()].map((item) => item.url)).size > 32)
    fail('RESOURCE_MAP', 'Image mappings are limited to 32 targets');
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
          if (portable) {
            const start = attr.indexOf('=') + 1;
            const prefix = attr.slice(0, start) + attr.slice(start).match(/^\s*/)[0];
            const quote = double !== undefined ? '"' : single !== undefined ? "'" : '';
            return prefix + quote + mapped.url + quote;
          }
          return name + '="' + escape(mapped.url) + '"';
        },
      );
    },
  );
  if ([...replacements.values()].some((item) => item.count === 0))
    fail('RESOURCE_TARGET', 'Image mappings must point to actual author images');
  return result;
}
