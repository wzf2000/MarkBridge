// Installed extensions may register fixed host code; authored JSON never names a callback/URL.
const authors = new Map();
const token = /^[a-z][a-z0-9-]{0,63}$/;
const version = /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/;
export function registerComponentAuthor(descriptor) {
  if (
    !descriptor ||
    ![1, 2].includes(descriptor.apiVersion) ||
    Object.keys(descriptor).some(
      (key) =>
        ![
          ...['apiVersion', 'component', 'componentVersion', 'Editor', 'supports', 'upgrade'],
          ...(descriptor.apiVersion === 2 ? ['validate', 'create'] : []),
        ].includes(key),
    ) ||
    typeof descriptor.component !== 'string' ||
    !token.test(descriptor.component) ||
    typeof descriptor.componentVersion !== 'string' ||
    !version.test(descriptor.componentVersion) ||
    ('Editor' in descriptor && typeof descriptor.Editor !== 'function') ||
    (typeof descriptor.Editor !== 'function' && !descriptor.upgrade) ||
    (descriptor.apiVersion === 2 &&
      (typeof descriptor.validate !== 'function' || typeof descriptor.create !== 'function')) ||
    typeof descriptor.supports !== 'function'
  )
    throw Error('Invalid component author registration');
  if (
    descriptor.upgrade &&
    (typeof descriptor.upgrade.componentVersion !== 'string' ||
      !version.test(descriptor.upgrade.componentVersion) ||
      descriptor.upgrade.componentVersion === descriptor.componentVersion ||
      typeof descriptor.upgrade.migrate !== 'function' ||
      Object.keys(descriptor.upgrade).some((key) => !['componentVersion', 'migrate'].includes(key)))
  )
    throw Error('Invalid component author upgrade');
  const key = descriptor.component + '@' + descriptor.componentVersion;
  if (authors.has(key) || authors.size >= 32)
    throw Error('Duplicate or excessive component author registration');
  authors.set(
    key,
    Object.freeze({
      ...descriptor,
      ...(descriptor.upgrade ? { upgrade: Object.freeze({ ...descriptor.upgrade }) } : {}),
    }),
  );
}
export const componentAuthor = (component, componentVersion) =>
  authors.get(component + '@' + componentVersion);
globalThis.MarkBridgeComponentAuthors = Object.freeze({
  apiVersion: 1,
  activityVersion: 1,
  templates: () =>
    [...authors.values()]
      .filter((a) => a.apiVersion === 2)
      .map((a) => ({ component: a.component, componentVersion: a.componentVersion })),
  create(component, version, id) {
    const a = authors.get(component + '@' + version);
    if (a?.apiVersion !== 2 || !/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(id))
      throw Error('Invalid activity template');
    return a.create({ id });
  },
  register: registerComponentAuthor,
});
