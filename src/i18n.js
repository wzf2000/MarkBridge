// Converter modules have an English fallback and do not depend on WordPress.
export const translate = (message) =>
  globalThis.MBBI18n?.t(message) ?? globalThis.wp?.i18n?.__(message, 'markbridge') ?? message;
export const format = (message, ...values) => {
  let next = 0;
  return String(message).replace(/%%|%(?:(\d+)\$)?([sd])/g, (token, index, kind) => {
    if (token === '%%') return '%';
    const value = values[index ? Number(index) - 1 : next++];
    return kind === 'd' ? String(Number(value)) : String(value ?? '');
  });
};

export const translateError = (error) =>
  globalThis.MBBI18n?.error(error) ?? translate(error.message);
