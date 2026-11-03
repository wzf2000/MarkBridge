import { translate as T } from './i18n.js';
import { componentParams } from './component-data.js';
// Exact data-only reading model; never starts a frame, worker or execution request.
export function codeRunnerModel(value, version = '0.1.0') {
  try {
    componentParams(value, () => {
      throw Error('invalid');
    });
    const keys = ['version', 'language', 'title', 'sourceChunks', 'stdinChunks'];
    const size = (s) => new TextEncoder().encode(s).length;
    if (
      Object.keys(value).length !== keys.length ||
      Object.keys(value).some((k) => !keys.includes(k)) ||
      !['0.1.0', '0.2.0'].includes(version) ||
      value.version !== (version === '0.2.0' ? 2 : 1) ||
      !(version === '0.2.0' ? ['javascript', 'python', 'cpp'] : ['python', 'cpp']).includes(
        value.language,
      ) ||
      typeof value.title !== 'string' ||
      size(value.title) < 1 ||
      size(value.title) > 160 ||
      /[\x00-\x1f\x7f]/.test(value.title)
    )
      return null;
    for (const [field, max] of [
      ['sourceChunks', 8],
      ['stdinChunks', 4],
    ]) {
      const a = value[field];
      if (
        !Array.isArray(a) ||
        a.length < 1 ||
        a.length > max ||
        a.some(
          (s) =>
            typeof s !== 'string' || size(s) > 1024 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s),
        )
      )
        return null;
    }
    return value;
  } catch {
    return null;
  }
}
export function codeRunnerStaticElement(el, params, version = '0.1.0') {
  const p = codeRunnerModel(params, version);
  if (!p)
    return el(
      'p',
      {},
      T(
        'The code example parameters are invalid. Preserve the original content and check the source and input.',
      ),
    );
  return el(
    'section',
    { className: 'mbb-code-runner-static' },
    el('h3', {}, p.title),
    el(
      'p',
      {},
      { javascript: 'JavaScript', python: 'Python', cpp: 'C++20' }[p.language] +
        ' · ' +
        T(
          p.language === 'javascript'
            ? 'Synchronous JavaScript. The input variable contains the standard input text. The editor preview does not execute programs.'
            : 'One source file and the standard library. The editor preview does not execute programs.',
        ),
    ),
    el('pre', {}, el('code', {}, p.sourceChunks.join(''))),
    el('p', {}, T('Standard input')),
    el('pre', {}, p.stdinChunks.join('')),
  );
}
