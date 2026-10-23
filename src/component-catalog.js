import { translate as T } from './i18n.js';

const pending = new Map();
let catalogGeneration = 0;
const config = () => globalThis.MBBComponentCatalog;
const providers = () => globalThis.MBBComponents || [];
const find = (id, version) => providers().find((p) => p.id === id && p.version === version);
const scope = () =>
  JSON.stringify([
    config()?.postId,
    globalThis.MBB_EDITOR?.postId,
    globalThis.MBB_EDITOR?.state?.expected,
  ]);
function request(path, fields = {}) {
  const cfg = config();
  const url = new URL(cfg.url, globalThis.location?.href || 'http://markbridge.invalid/');
  if (url.searchParams.has('rest_route')) {
    const route = url.searchParams.get('rest_route');
    url.searchParams.set('rest_route', route.replace(/\/?$/, '/') + path);
  } else {
    url.pathname = url.pathname.replace(/\/?$/, '/') + path;
  }
  for (const [key, value] of Object.entries({ post_id: cfg.postId || 0, ...fields }))
    url.searchParams.set(key, value);
  return globalThis.wp.apiFetch({ url: url.href });
}
export async function componentCatalogPage(page = 1, type = '') {
  const cfg = config();
  if (!cfg) return { items: providers(), total: providers().length, perPage: 50, page: 1 };
  const opening = cfg.fingerprint;
  const result = await request('catalog', { page, type, fingerprint: opening });
  if (config() !== cfg || result.fingerprint !== opening)
    throw Error(T('The component catalog changed. Refresh the list before continuing.'));
  return result;
}
export async function resolveComponent(id, version) {
  const cfg = config();
  if (!cfg) return find(id, version);
  const key = cfg.fingerprint + ':' + id + '@' + version;
  // Initial article descriptors have already passed the server's exact resolution.
  const existing = find(id, version);
  if (existing) return existing;
  if (pending.has(key)) return pending.get(key);
  const job = (async () => {
    const result = await request(
      'descriptor/' + encodeURIComponent(id) + '/' + encodeURIComponent(version),
      { fingerprint: cfg.fingerprint },
    );
    const p = result.provider;
    if (
      config() !== cfg ||
      result.fingerprint !== cfg.fingerprint ||
      !p ||
      p.id !== id ||
      p.version !== version
    )
      throw Error(T('The component catalog changed. Refresh the list before continuing.'));
    if (!find(id, version)) {
      if (
        providers().length >= 256 ||
        new TextEncoder().encode(JSON.stringify([...providers(), p])).length > 4194304
      )
        throw Error(T('The installed extension catalog exceeds its display budget.'));
      globalThis.MBBComponents = [...providers(), p];
      globalThis.dispatchEvent(new Event('mbb-component-descriptor'));
    }
    return p;
  })();
  pending.set(key, job);
  try {
    return await job;
  } finally {
    pending.delete(key);
  }
}
export async function resolveDefaultComponent(id, preferred = '') {
  const cfg = config();
  if (!cfg) return find(id, preferred) || providers().find((p) => p.id === id);
  let page = await componentCatalogPage(1, id);
  const fallback = page.defaults[id];
  while (
    preferred &&
    !page.items.some((p) => p.version === preferred) &&
    page.page * page.perPage < page.total
  )
    page = await componentCatalogPage(page.page + 1, id);
  const version = page.items.some((p) => p.version === preferred) ? preferred : fallback;
  return version ? resolveComponent(id, version) : null;
}
export function useComponentDescriptor(wp, id, version) {
  const [, render] = wp.element.useState(0);
  wp.element.useEffect(() => {
    let active = true;
    if (id && version)
      resolveComponent(id, version).then(
        () => {
          if (active) render((n) => n + 1);
        },
        () => {},
      );
    return () => {
      active = false;
    };
  }, [id, version, config()?.fingerprint]);
  return find(id, version);
}
export function createComponentSelector(wp) {
  const el = wp.element.createElement;
  return function ComponentSelector({
    component,
    version,
    disabled,
    onChange,
    clientId,
    draftFingerprint,
    draftGeneration,
  }) {
    const [page, setPage] = wp.element.useState(1);
    const [data, setData] = wp.element.useState(null);
    const [error, setError] = wp.element.useState('');
    const [loading, setLoading] = wp.element.useState(false);
    const live = wp.element.useRef({});
    const signature = JSON.stringify([component, version, clientId, draftFingerprint, scope()]);
    const interruptedSelection =
      live.current.signature !== signature && live.current.pendingSelection != null;
    if (live.current.signature !== signature) {
      live.current.signature = signature;
      live.current.generation = ++catalogGeneration;
      live.current.pendingSelection = null;
    }
    wp.element.useEffect(() => {
      if (interruptedSelection) setLoading(false);
    }, [signature]);
    wp.element.useEffect(() => {
      let active = true;
      setLoading(true);
      componentCatalogPage(page).then(
        (next) => {
          if (active) {
            setData(next);
            setError('');
            setLoading(false);
          }
        },
        (e) => {
          if (active) {
            setError(e.message);
            setLoading(false);
          }
        },
      );
      return () => {
        active = false;
        live.current.generation = ++catalogGeneration;
      };
    }, [page]);
    wp.element.useEffect(
      () => () => {
        live.current.signature = '';
      },
      [],
    );
    const current = component + '@' + version;
    const items = data?.items || providers();
    return el(
      'div',
      {},
      el(wp.components.SelectControl, {
        label: T('Registered teaching component'),
        disabled: disabled || loading,
        value: current,
        options: [
          ...(!items.some((p) => p.id + '@' + p.version === current)
            ? [
                {
                  label:
                    T('Preserve current component ') +
                    (component || T('Awaiting selection')) +
                    ' ' +
                    (version || ''),
                  value: current,
                },
              ]
            : []),
          ...items.map((p) => ({
            label: p.title + ' ' + p.version,
            value: p.id + '@' + p.version,
          })),
        ],
        onChange: async (key) => {
          const generation = ++catalogGeneration;
          live.current.generation = generation;
          live.current.pendingSelection = generation;
          const opening = live.current.signature;
          const openingScope = scope();
          const openingDraftGeneration = draftGeneration?.();
          const selected = wp.data?.select?.('core/block-editor')?.getSelectedBlockClientId?.();
          setLoading(true);
          try {
            const [id, exact] = key.split('@');
            const p = await resolveComponent(id, exact);
            if (
              p &&
              live.current.generation === generation &&
              live.current.signature === opening &&
              draftGeneration?.() === openingDraftGeneration &&
              scope() === openingScope &&
              selected === wp.data?.select?.('core/block-editor')?.getSelectedBlockClientId?.()
            )
              onChange(p);
          } catch (e) {
            if (live.current.generation === generation) setError(e.message);
          } finally {
            if (live.current.generation === generation) {
              live.current.pendingSelection = null;
              setLoading(false);
            }
          }
        },
      }),
      loading ? el('p', { role: 'status' }, T('Loading component description…')) : null,
      error ? el('p', { role: 'alert' }, error) : null,
      config()
        ? el(
            'div',
            {},
            el(
              wp.components.Button,
              {
                variant: 'secondary',
                disabled: page <= 1 || loading,
                onClick: () => setPage(page - 1),
              },
              T('Previous page'),
            ),
            ' ' + page + ' ',
            el(
              wp.components.Button,
              {
                variant: 'secondary',
                disabled: !data || page * data.perPage >= data.total || loading,
                onClick: () => setPage(page + 1),
              },
              T('Next page'),
            ),
          )
        : null,
    );
  };
}
globalThis.MarkBridgeComponentCatalog = Object.freeze({
  page: componentCatalogPage,
  resolve: resolveComponent,
  resolveDefault: resolveDefaultComponent,
  scope,
});
