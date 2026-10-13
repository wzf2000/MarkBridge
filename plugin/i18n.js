(() => {
  'use strict';
  const api = () => globalThis.wp?.i18n;
  const safe = (source, translated) => {
    if (
      typeof translated !== 'string' ||
      translated.length > 32768 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\uD800-\uDFFF]/u.test(translated)
    )
      return false;
    const placeholders = (value) =>
      [...value.matchAll(/%(?:\d+\$)?[a-zA-Z%]|%\d+\$?|%/g)]
        .map((part) => part[0])
        .sort()
        .join('|');
    if (placeholders(source) !== placeholders(translated)) return false;
    const shape = (value) => {
      const tags = [];
      for (let offset = 0; offset < value.length; offset++) {
        if (value[offset] !== '<') continue;
        const start = offset;
        let quote = null;
        for (offset++; offset < value.length; offset++) {
          const character = value[offset];
          if (quote !== null) {
            if (character === quote) quote = null;
          } else if (character === "'" || character === '"') {
            quote = character;
          } else if (character === '>') {
            break;
          } else if (character === '<') {
            return null;
          }
        }
        // An unfinished tag/attribute at the message boundary remains immutable too.
        tags.push(value.slice(start, Math.min(offset + 1, value.length)));
      }
      return JSON.stringify([tags, /^['"]?>/.exec(value)?.[0] ?? '']);
    };
    return shape(source) !== null && shape(source) === shape(translated);
  };
  const t = (message) => {
    const translated = api()?.__(message, 'markbridge') ?? message;
    return safe(message, translated) ? translated : message;
  };
  const format = (message, ...values) => {
    let next = 0;
    return String(message).replace(/%%|%(?:(\d+)\$)?([sd])/g, (token, index, kind) => {
      if (token === '%%') return '%';
      const value = values[index ? Number(index) - 1 : next++];
      return kind === 'd' ? String(Number(value)) : String(value ?? '');
    });
  };
  const n = (single, plural, count) => {
    const source = count === 1 ? single : plural;
    const translated = api()?._n(single, plural, count, 'markbridge') ?? source;
    return safe(source, translated) ? translated : source;
  };
  const error = (value) => {
    const id = value?.messageId ?? value?.message_id;
    const args = value?.messageArgs ?? value?.message_args;
    if (
      typeof id === 'string' &&
      id.length <= 8192 &&
      Array.isArray(args) &&
      args.length <= 8 &&
      args.every((arg) => typeof arg === 'string' && arg.length <= 1024) &&
      format(id, ...args) === value.message
    )
      return format(t(id), ...args);
    return t(String(value?.message ?? value ?? ''));
  };
  globalThis.MBBI18n = Object.freeze({ t, format, n, error, safe });
})();
