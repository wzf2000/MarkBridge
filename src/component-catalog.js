import { translate as T } from './i18n.js';
import { componentAuthor } from './component-authors.js';

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
export async function componentCatalogPage(
  page = 1,
  type = '',
  perPage = 20,
  view = 'all',
  purpose = '',
) {
  const cfg = config();
  if (!cfg) {
    const all = providers();
    const items = (view === 'latest' ? latestComponentChoices(all) : all).filter(
      (p) =>
        (!type || p.id === type) &&
        (!purpose || componentPurposeUnknown(p) || componentPurposes(p).includes(purpose)),
    );
    return {
      items,
      total: items.length,
      perPage: 50,
      page: 1,
      purposes: [...new Set(all.flatMap(componentPurposes))],
    };
  }
  const opening = cfg.fingerprint;
  const result = await request('catalog', {
    page,
    type,
    per_page: perPage,
    fingerprint: opening,
    view,
    purpose,
  });
  if (config() !== cfg || result.fingerprint !== opening)
    throw Error(T('The component catalog changed. Refresh the list before continuing.'));
  return result;
}
/** Intersect trusted author callbacks with bounded lightweight activity capability data. */
export async function componentActivityTemplates(templates) {
  if (!Array.isArray(templates) || templates.length > 32)
    throw Error(T('Invalid activity template'));
  if (!templates.length) return [];
  const openingConfig = config(),
    openingScope = scope();
  const remaining = new Set(templates.map((t) => t.component + '@' + t.componentVersion));
  const allowed = new Map();
  let perPage = 50,
    page;
  try {
    page = await componentCatalogPage(1, '', perPage);
  } catch (error) {
    if (error.code !== 'component_catalog_limit') throw error;
    perPage = 20;
    page = await componentCatalogPage(1, '', perPage);
  }
  for (let n = 1; n <= Math.ceil(256 / perPage); n++) {
    if (config() !== openingConfig || scope() !== openingScope)
      throw Error(T('The component catalog changed. Refresh the list before continuing.'));
    for (const entry of page.items) {
      const key = entry.id + '@' + entry.version;
      if (!remaining.has(key)) continue;
      remaining.delete(key);
      if (entry.activityVersion === 1) allowed.set(key, entry);
    }
    if (!remaining.size || page.page * page.perPage >= page.total) break;
    page = await componentCatalogPage(page.page + 1, '', perPage);
  }
  return templates.flatMap((t) => {
    const entry = allowed.get(t.component + '@' + t.componentVersion);
    return entry ? [{ ...t, title: entry.title }] : [];
  });
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
  if (!cfg)
    return find(id, preferred) || latestComponentChoices(providers()).find((p) => p.id === id);
  if (!preferred) {
    const latest = await componentCatalogPage(1, id, 20, 'latest');
    return latest.items[0] ? resolveComponent(id, latest.items[0].version) : null;
  }
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
export function componentPurposes(p) {
  return (
    p.purposes ||
    (p.activityVersion === 1
      ? ['Self checks']
      : p.readerMode
        ? ['Diagrams and relationships']
        : ['Unclassified purpose'])
  );
}
function componentPurposeUnknown(p) {
  return p.purposeUnknown ?? (!p.purposes && p.activityVersion !== 1 && !p.readerMode);
}
const groupKey = (p) => p.id + '@' + (p.authoringGroup || p.title);
const compareVersions = (a, b) => {
  const left = a.split('.').map(Number),
    right = b.split('.').map(Number);
  for (let n = 0; n < 3; n++) if (left[n] !== right[n]) return left[n] - right[n];
  return 0;
};
export function latestComponentChoices(items) {
  const latest = new Map();
  for (const p of items) {
    if (p.status && !['available', 'indexed'].includes(p.status)) continue;
    const key = groupKey(p),
      previous = latest.get(key);
    if (!previous || compareVersions(p.version, previous.version) > 0) latest.set(key, p);
  }
  return [...latest.values()];
}
export function componentDependencies(blocks, items) {
  const uses = new Map();
  const walk = (list) => {
    for (const block of list || []) {
      const { component: id, componentVersion: version } = block.attributes || {};
      if (block.name === 'mbb/component' && id && version) {
        const key = id + '@' + version;
        if (!uses.has(key)) uses.set(key, { id, version, clients: [], instances: [], title: id });
        uses.get(key).clients.push(block.clientId);
        uses.get(key).instances.push(block.attributes);
      }
      walk(block.innerBlocks);
    }
  };
  walk(blocks);
  return [...uses.values()].map((use) => {
    const exact = items.find((p) => p.id === use.id && p.version === use.version);
    const available = exact && (!exact.status || ['available', 'indexed'].includes(exact.status));
    const newer =
      exact &&
      items.filter(
        (p) =>
          groupKey(p) === groupKey(exact) &&
          (!p.status || ['available', 'indexed'].includes(p.status)) &&
          compareVersions(p.version, use.version) > 0,
      );
    const author = componentAuthor(use.id, use.version);
    const supported =
      author &&
      use.instances.some((attrs) => {
        try {
          return author.supports(JSON.parse(JSON.stringify(attrs.params || {})), {
            activity: attrs.activity,
          });
        } catch {
          return false;
        }
      });
    const upgrade = supported && author?.upgrade;
    const target =
      upgrade && items.find((p) => p.id === use.id && p.version === upgrade.componentVersion);
    return {
      ...use,
      title: exact?.title || use.id,
      status: !exact
        ? 'missing'
        : !available
          ? 'unavailable'
          : target && (!target.status || ['available', 'indexed'].includes(target.status))
            ? 'upgrade'
            : newer?.length
              ? 'newer'
              : 'current',
      target: target?.version,
    };
  });
}
let catalogSnapshot;
function allComponentEntries() {
  const cfg = config() || providers(),
    identity = scope(),
    fingerprint = config()?.fingerprint;
  if (
    catalogSnapshot?.config === cfg &&
    catalogSnapshot?.scope === identity &&
    catalogSnapshot?.fingerprint === fingerprint
  )
    return catalogSnapshot.promise;
  const promise = readAllComponentEntries();
  const snapshot = { config: cfg, scope: identity, fingerprint, promise };
  catalogSnapshot = snapshot;
  promise.catch(() => {
    if (catalogSnapshot === snapshot) catalogSnapshot = null;
  });
  return promise;
}
async function readAllComponentEntries() {
  const result = [];
  let page = await componentCatalogPage(1, '', 20);
  while (true) {
    result.push(...page.items);
    if (page.page * page.perPage >= page.total) return result;
    if (result.length >= 256)
      throw Error(T('The installed extension catalog exceeds its display budget.'));
    page = await componentCatalogPage(page.page + 1, '', 20);
  }
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
    const [history, setHistory] = wp.element.useState(false);
    const [purpose, setPurpose] = wp.element.useState('');
    const [expanded, setExpanded] = wp.element.useState(false);
    const [dependencies, setDependencies] = wp.element.useState(null);
    const [dependencyError, setDependencyError] = wp.element.useState('');
    const blocks = wp.data.useSelect((select) => select('core/block-editor').getBlocks(), []);
    const documentKeys = JSON.stringify(
      componentDependencies(blocks, []).map(({ id, version, clients, instances }) => [
        id,
        version,
        clients,
        instances,
      ]),
    );
    const [data, setData] = wp.element.useState(null);
    const [error, setError] = wp.element.useState('');
    const [loading, setLoading] = wp.element.useState(false);
    const live = wp.element.useRef({});
    const signature = JSON.stringify([
      component,
      version,
      clientId,
      draftFingerprint,
      scope(),
      history,
      purpose,
      page,
    ]);
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
      componentCatalogPage(page, '', 20, history ? 'all' : 'latest', purpose).then(
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
    }, [page, history, purpose, config()?.fingerprint]);
    wp.element.useEffect(() => {
      let active = true;
      const openingScope = scope();
      setDependencies(null);
      setDependencyError('');
      if (!expanded) return;
      allComponentEntries().then(
        async (snapshot) => {
          const items = snapshot.map((p) => ({ ...p }));
          const used = componentDependencies(blocks, items);
          const keys = new Map();
          for (const use of used) {
            keys.set(use.id + '@' + use.version, [use.id, use.version]);
            const target = componentAuthor(use.id, use.version)?.upgrade?.componentVersion;
            if (target) keys.set(use.id + '@' + target, [use.id, target]);
          }
          await Promise.all(
            [...keys.values()].map(async ([id, exact]) => {
              const entry = items.find((p) => p.id === id && p.version === exact);
              if (!entry) return;
              try {
                const provider = await resolveComponent(id, exact);
                entry.status = provider?.status || 'available';
              } catch {
                entry.status = 'unavailable';
              }
            }),
          );
          if (active && scope() === openingScope)
            setDependencies(componentDependencies(blocks, items));
        },
        (e) => {
          if (active) setDependencyError(e.message);
        },
      );
      return () => {
        active = false;
      };
    }, [expanded, documentKeys, config()?.fingerprint, scope()]);
    wp.element.useEffect(
      () => () => {
        live.current.signature = '';
      },
      [],
    );
    const current = component + '@' + version;
    const items = data?.items || (history ? providers() : latestComponentChoices(providers()));
    return el(
      'div',
      {},
      el(wp.components.SelectControl, {
        label: T('Component purpose'),
        value: purpose,
        disabled: loading,
        options: [
          { label: T('All purposes'), value: '' },
          ...(data?.purposes || [...new Set(items.flatMap(componentPurposes))]).map((p) => ({
            label: T(p),
            value: p,
          })),
        ],
        onChange: (value) => {
          setPage(1);
          setPurpose(value);
        },
      }),
      el(wp.components.CheckboxControl, {
        label: T('Choose a historical version'),
        checked: history,
        onChange: (value) => {
          setPage(1);
          setHistory(value);
        },
      }),
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
            label:
              p.title +
              ' ' +
              p.version +
              (componentPurposeUnknown(p) ? ' · ' + T('Unclassified purpose') : ''),
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
      data?.unverifiedGroups
        ? el(
            'p',
            { role: 'status' },
            T(
              'Some component families have no verified available version. Choose a historical version to inspect them.',
            ),
          )
        : null,
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
      el(
        'details',
        {
          className: 'mbb-component-dependencies',
          onToggle: (event) => setExpanded(event.currentTarget.open),
        },
        el('summary', {}, T('Components in this article')),
        el(
          'p',
          {},
          T(
            'Inspect exact versions in the current article. Select an instance to review its parameters and prepare any supported upgrade.',
          ),
        ),
        dependencyError
          ? el('p', { role: 'alert' }, dependencyError)
          : !dependencies
            ? expanded
              ? el('p', { role: 'status' }, T('Loading component description…'))
              : null
            : el(
                'ul',
                {},
                ...dependencies.map((use) =>
                  el(
                    'li',
                    { key: use.id + '@' + use.version },
                    el('strong', {}, use.title + ' ' + use.version),
                    el(
                      'p',
                      {},
                      T(
                        {
                          missing: 'Exact version is missing',
                          unavailable: 'Exact version is unavailable',
                          upgrade: 'Upgrade candidate available',
                          newer: 'A newer version exists; no migration is declared',
                          current: 'No declared upgrade',
                        }[use.status],
                      ) + (use.status === 'upgrade' ? ' → ' + use.target : ''),
                    ),
                    ...use.clients.map((id, n) =>
                      el(
                        wp.components.Button,
                        {
                          key: id,
                          variant: 'link',
                          onClick: () => wp.data.dispatch('core/block-editor').selectBlock(id),
                        },
                        T('Select instance') + ' ' + (n + 1),
                      ),
                    ),
                  ),
                ),
              ),
      ),
    );
  };
}
globalThis.MarkBridgeComponentCatalog = Object.freeze({
  page: componentCatalogPage,
  activities: componentActivityTemplates,
  resolve: resolveComponent,
  resolveDefault: resolveDefaultComponent,
  scope,
});
