import messages from '../plugin/includes/php-converter/diagnostics.json';
import { format } from './i18n.js';
const known = new Set(messages);
const patterns = messages
  .filter(
    (value) => /%\d+\$s/.test(value) && /^(?:Unsupported |Expected |Block .* cannot )/.test(value),
  )
  .sort((a, b) => b.replace(/%\d+\$s/g, '').length - a.replace(/%\d+\$s/g, '').length)
  .map((id) => {
    const expression = id
      .split(/(%\d+\$s)/)
      .map((part) =>
        /^%\d+\$s$/.test(part) ? '([\\s\\S]{0,1024})' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      )
      .join('');
    return { id, regex: new RegExp('^' + expression + '$') };
  });
export function describeDiagnostic(message) {
  if (
    typeof message !== 'string' ||
    new TextEncoder().encode(message).length > 8192 ||
    /[\uD800-\uDFFF\0]/u.test(message)
  )
    return { id: null, args: [] };
  if (known.has(message)) return { id: message, args: [] };
  for (const { id, regex } of patterns) {
    const result = regex.exec(message);
    if (
      result &&
      result.length <= 9 &&
      result.slice(1).every((value) => new TextEncoder().encode(value).length <= 1024) &&
      format(id, ...result.slice(1)) === message
    )
      return { id, args: result.slice(1) };
  }
  return { id: null, args: [] };
}
