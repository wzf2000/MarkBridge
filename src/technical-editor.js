import { bibliographyProjection, migrateBibliography } from './bibliography.js';
import { BibliographyV2Fields, CSLImport } from './bibliography-editor.js';
import { parseBibTeX, bibtexCandidate } from './bibtex.js';
import {
  technicalSchemas,
  technicalDiagnostics,
  technicalAttributes,
  validateTechnical,
  technicalIndex,
  technicalRenamePlan,
  technicalReferenceCount,
  technicalReferenceSelection,
  referenceHTML,
} from './technical.js';
import { translate as T, format as F } from './i18n.js';
const kinds = {
  equation: () => T('Equation'),
  figure: () => T('Figure'),
  table: () => T('Table'),
  listing: () => T('Listing'),
  definition: () => T('Definition'),
  theorem: () => T('Theorem'),
  proof: () => T('Proof'),
};
const bodyTypes = {
  equation: 'mbb/math',
  figure: 'core/image',
  table: 'core/table',
  listing: 'mbb/code',
};
const entry = (key) => ({
  key,
  authors: [],
  title: T('Reference title'),
  year: '',
  source: '',
  url: '',
});
const indexCache = new WeakMap();
function editorState(blocks) {
  let state = indexCache.get(blocks);
  if (!state) {
    state = { ...technicalIndex(blocks), ...technicalDiagnostics(blocks) };
    indexCache.set(blocks, state);
  }
  return state;
}
function issueText(issue) {
  const messages = {
    'duplicate-id': T('Duplicate stable label: %1$s'),
    'duplicate-key': T('Duplicate bibliography key: %1$s'),
    'missing-target': T('Missing reference target: %1$s'),
    'missing-key': T('Missing bibliography entry: %1$s'),
    'reference-marker': T('A reference marker is malformed. Correct it before saving.'),
    'object-body': T(
      'Object %1$s must contain exactly one matching formula, image, table or code block. The existing body has been preserved.',
    ),
    'statement-body': T('Statement %1$s requires body content.'),
    attributes: T('Technical block %1$s has incomplete or invalid fields.'),
  };
  return F(
    messages[issue.code] || T('Technical block %1$s has incomplete or invalid fields.'),
    issue.identity,
  );
}
export function technicalSave(kind, a) {
  const el = wp.element.createElement;
  const body = () =>
    el('div', { className: 'mbb-technical-body' }, el(wp.blockEditor.InnerBlocks.Content));
  if (kind === 'object')
    return el(
      'figure',
      { id: a.id, className: 'mbb-technical-object', 'data-mbb-object-kind': a.kind },
      body(),
      el('figcaption', { className: 'mbb-technical-caption' }, a.caption),
    );
  if (kind === 'statement') {
    const proof = a.kind === 'proof';
    return el(
      proof ? 'details' : 'section',
      {
        id: a.id,
        className: 'mbb-technical-statement',
        'data-mbb-statement-kind': a.kind,
        ...(proof && a.open ? { open: true } : {}),
      },
      el(proof ? 'summary' : 'p', { className: 'mbb-technical-heading' }, a.title),
      body(),
    );
  }
  return el(
    'section',
    {
      id: a.id,
      className: 'mbb-bibliography',
      ...(a.version === 2
        ? { 'data-mbb-bibliography-version': '2', 'data-mbb-citation-style': a.style }
        : {}),
    },
    el('p', { className: 'mbb-bibliography-title' }, 'Bibliography'),
    el(
      'ol',
      {},
      ...(a.entries || [])
        .map((value) => (a.version === 2 ? bibliographyProjection(value) : value))
        .map((item) =>
          el(
            'li',
            { key: item.key, 'data-mbb-bib-key': item.key },
            ...['authors', 'title', 'year', 'source', 'url'].map((field) =>
              el(
                'span',
                { key: field, className: 'mbb-bib-' + field },
                field === 'authors' ? item.authors.join(', ') : item[field],
              ),
            ),
          ),
        ),
    ),
  );
}
function Rename({ type, identity, registry, session }) {
  const proposalKey = type + ':' + identity;
  const el = wp.element.createElement;
  const [proposed, setProposed] = wp.element.useState(
      session.renames[proposalKey] ?? identity ?? '',
    ),
    [notice, setNotice] = wp.element.useState(''),
    [plan, setPlan] = wp.element.useState(null);
  wp.element.useEffect(() => {
    setProposed(session.renames[proposalKey] ?? identity ?? '');
    setPlan(null);
    setNotice('');
  }, [identity]);
  const preflight = () => {
    const next = technicalRenamePlan(
      registry.select('core/block-editor').getBlocks(),
      type,
      identity,
      proposed,
      (code, message) => {
        throw Error(T(message));
      },
    );
    return next;
  };
  return el(
    'div',
    {},
    el(wp.components.TextControl, {
      label: type === 'label' ? T('Proposed stable ID') : T('Proposed reference key'),
      value: proposed,
      onChange: (value) => {
        session.renames[proposalKey] = value;
        setProposed(value);
        setPlan(null);
        setNotice('');
      },
    }),
    el(
      wp.components.Button,
      {
        variant: 'secondary',
        disabled: proposed === identity,
        onClick: () => {
          try {
            const next = preflight();
            setPlan(next);
            setNotice(
              F(
                T('%1$s reference markers will be updated. No change has been applied.'),
                next.affectedReferences,
              ),
            );
          } catch (error) {
            setPlan(null);
            setNotice(error.message);
          }
        },
      },
      T('Check label rename'),
    ),
    notice ? el('p', { role: plan ? 'status' : 'alert' }, notice) : null,
    plan
      ? el(
          wp.components.Button,
          {
            variant: 'primary',
            onClick: () => {
              try {
                // Recheck against the current tree, not a stale modal snapshot. One store
                // action updates the identity and all affected inline fields together.
                const next = preflight();
                delete session.renames[proposalKey];
                if (type === 'key' && session.openEntry === identity) session.openEntry = proposed;
                registry.dispatch('core/block-editor').updateBlockAttributes(
                  next.patches.map((p) => p.clientId),
                  Object.fromEntries(next.patches.map((p) => [p.clientId, p.attributes])),
                  true,
                );
                setPlan(null);
                setNotice('');
              } catch (error) {
                setPlan(null);
                setNotice(error.message);
              }
            },
          },
          T('Rename label and references'),
        )
      : null,
  );
}
function BibliographyFields({ a, setAttributes, registry, session, pending }) {
  const el = wp.element.createElement,
    [notice, setNotice] = wp.element.useState(''),
    [, refresh] = wp.element.useState(0);
  const update = (index, patch) =>
    setAttributes({
      entries: (a.entries || []).map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  return el(
    'div',
    {},
    ...(a.entries || []).map((item, index) =>
      el(
        wp.components.PanelBody,
        {
          key: item.key,
          title: item.title + ' (' + item.key + ')',
          opened: (session.openEntry ?? a.entries?.[0]?.key) === item.key,
          onToggle: () => {
            session.openEntry =
              (session.openEntry ?? a.entries?.[0]?.key) === item.key ? null : item.key;
            refresh((n) => n + 1);
          },
        },
        !pending ? el(Rename, { type: 'key', identity: item.key, registry, session }) : null,
        ...['authors', 'title', 'year', 'source', 'url'].map((field) =>
          el(field === 'authors' ? wp.components.TextareaControl : wp.components.TextControl, {
            key: field,
            label: {
              authors: T('Authors (one per line, at most eight)'),
              title: T('Reference title'),
              year: T('Year'),
              source: T('Publication or source'),
              url: T('Reference URL (HTTP or HTTPS)'),
            }[field],
            value: field === 'authors' ? item.authors.join('\n') : item[field],
            onChange: (value) =>
              update(index, {
                [field]: field === 'authors' ? (value ? value.split('\n') : []) : value,
              }),
          }),
        ),
        el(
          wp.components.Button,
          {
            variant: 'tertiary',
            onClick: () => {
              try {
                if (
                  technicalReferenceCount(
                    registry.select('core/block-editor').getBlocks(),
                    'key',
                    item.key,
                  )
                )
                  throw Error(T('This entry is cited. Remove its citations before deleting it.'));
                setAttributes({ entries: a.entries.filter((_, i) => i !== index) });
                setNotice('');
              } catch (error) {
                setNotice(error.message);
              }
            },
          },
          T('Remove bibliography entry'),
        ),
      ),
    ),
    el(
      wp.components.Button,
      {
        variant: 'secondary',
        disabled: (a.entries || []).length >= 64,
        onClick: () => {
          const used = new Set((a.entries || []).map((item) => item.key));
          let n = 1;
          while (used.has('reference-' + n)) n++;
          session.openEntry = 'reference-' + n;
          setAttributes({ entries: [...(a.entries || []), entry('reference-' + n)] });
        },
      },
      T('Add bibliography entry'),
    ),
    notice ? el('p', { role: 'alert' }, notice) : null,
  );
}
function TechnicalTextDraft({ kind, a, setAttributes, clientId, drafts, syncDraftLock }) {
  const el = wp.element.createElement,
    field = kind === 'object' ? 'caption' : 'title',
    original = a[field] || '';
  const [text, setText] = wp.element.useState(drafts.get(clientId)?.text ?? original);
  const [error, setError] = wp.element.useState('');
  const pending = drafts.get(clientId);
  wp.element.useEffect(() => {
    setText(drafts.get(clientId)?.text ?? original);
  }, [original]);
  const clear = () => {
    drafts.delete(clientId);
    syncDraftLock();
    setError('');
  };
  return el(
    'div',
    {},
    el(wp.components.TextControl, {
      label: kind === 'object' ? T('Caption') : T('Title'),
      value: text,
      onChange: (next) => {
        setText(next);
        setError('');
        if (next === original) drafts.delete(clientId);
        else
          drafts.set(clientId, {
            text: next,
            baseline: drafts.get(clientId)?.baseline ?? original,
          });
        syncDraftLock();
      },
    }),
    error ? el('p', { role: 'alert' }, error) : null,
    pending
      ? el(
          'p',
          { role: 'status' },
          T('Text edits have not been applied. Apply or discard them before saving.'),
        )
      : null,
    el(
      wp.components.Button,
      {
        variant: 'primary',
        disabled: !pending,
        onClick: () => {
          try {
            technicalAttributes(kind, { ...a, [field]: text }, (code, message) => {
              throw Error(T(message));
            });
            setAttributes({ [field]: text });
            clear();
          } catch (error) {
            setError(error.message);
          }
        },
      },
      T('Apply text edits'),
    ),
    el(
      wp.components.Button,
      {
        variant: 'tertiary',
        disabled: !pending,
        onClick: () => {
          clear();
          setText(original);
        },
      },
      T('Discard text edits'),
    ),
  );
}
function BibTeXImport({ entries, change, registry, clientId, session }) {
  const el = wp.element.createElement;
  const state = (session.bibtex ??= { input: '', mode: 'merge', preview: null });
  const [opened, setOpened] = wp.element.useState(false),
    [error, setError] = wp.element.useState(''),
    [, refresh] = wp.element.useState(0);
  const lifetime = wp.element.useRef({ alive: true, sequence: 0 });
  wp.element.useEffect(() => {
    lifetime.current.alive = true;
    return () => {
      lifetime.current.alive = false;
      lifetime.current.sequence++;
      state.preview = null;
    };
  }, []);
  const fail = (code, message) => {
    throw Error(T(message));
  };
  const update = (patch) => {
    Object.assign(state, patch, { preview: null });
    setError('');
    refresh((n) => n + 1);
  };
  const close = () => {
    lifetime.current.sequence++;
    state.preview = null;
    setOpened(false);
  };
  const currentKeys = () => {
    const blocks = registry.select('core/block-editor').getBlocks();
    return [...new Set(entries.map((item) => item.key))].filter((key) =>
      technicalReferenceCount(blocks, 'key', key),
    );
  };
  return el(
    wp.element.Fragment,
    {},
    el(
      wp.components.Button,
      { variant: 'secondary', onClick: () => setOpened(true) },
      T('Import BibTeX'),
    ),
    opened
      ? el(
          wp.components.Modal,
          { title: T('Import BibTeX bibliography'), onRequestClose: close },
          el(
            'p',
            {},
            T(
              'Preview the mapping to the existing six bibliography fields. The entry type and original BibTeX are not stored separately. Nothing is applied until you apply bibliography edits.',
            ),
          ),
          el(wp.components.TextareaControl, {
            label: T('BibTeX source (up to 64 KiB)'),
            value: state.input,
            onChange: (value) => {
              lifetime.current.sequence++;
              if (new TextEncoder().encode(value).length > 65536) {
                update({});
                setError(T('BibTeX input must be UTF-8 text within 64 KiB'));
                return;
              }
              update({ input: value });
            },
          }),
          el(
            'label',
            {},
            T('Upload a .bib file'),
            el('input', {
              type: 'file',
              accept: '.bib',
              onChange: async (event) => {
                const file = event.target.files?.[0],
                  sequence = ++lifetime.current.sequence;
                update({});
                if (!file) return;
                try {
                  if (!/\.bib$/i.test(file.name) || file.size > 65536)
                    throw Error(T('Choose a .bib file within 64 KiB'));
                  const bytes = await file.arrayBuffer();
                  const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
                  if (!lifetime.current.alive || sequence !== lifetime.current.sequence) return;
                  update({ input: value });
                } catch (error) {
                  if (lifetime.current.alive && sequence === lifetime.current.sequence)
                    setError(T('The BibTeX file could not be read as bounded UTF-8 text'));
                }
              },
            }),
          ),
          el(wp.components.SelectControl, {
            label: T('Import operation'),
            value: state.mode,
            options: [
              { value: 'merge', label: T('Merge without overwriting keys') },
              { value: 'replace', label: T('Replace bibliography entries') },
            ],
            onChange: (mode) => {
              lifetime.current.sequence++;
              update({ mode });
            },
          }),
          el(
            wp.components.Button,
            {
              variant: 'secondary',
              onClick: () => {
                try {
                  const incoming = parseBibTeX(state.input, fail),
                    candidate = bibtexCandidate(entries, incoming, state.mode, currentKeys(), fail);
                  state.preview = { incoming, candidate, baseline: JSON.stringify(entries) };
                  setError('');
                  refresh((n) => n + 1);
                } catch (error) {
                  state.preview = null;
                  setError(error.message);
                  refresh((n) => n + 1);
                }
              },
            },
            T('Preview BibTeX mapping'),
          ),
          error ? el('p', { role: 'alert' }, error) : null,
          state.preview
            ? el(
                'div',
                {},
                el(
                  'p',
                  { role: 'status' },
                  T(
                    'Mapped entries are a preview. Existing unapplied edits are preserved until you choose this candidate.',
                  ),
                ),
                ...state.preview.candidate.map((item, index) =>
                  el(
                    'details',
                    { key: item.key, open: index === 0 },
                    el('summary', {}, item.key + ' — ' + item.title),
                    el(
                      'dl',
                      {},
                      ...[
                        ['Authors', item.authors.join('; ')],
                        ['Year', item.year],
                        ['Publication or source', item.source],
                        ['Reference URL (HTTP or HTTPS)', item.url],
                      ].flatMap(([label, value]) => [
                        el('dt', { key: label + '-label' }, T(label)),
                        el('dd', { key: label }, value),
                      ]),
                    ),
                  ),
                ),
              )
            : null,
          el(
            wp.components.Button,
            {
              variant: 'primary',
              disabled: !state.preview,
              onClick: () => {
                try {
                  const store = registry.select('core/block-editor');
                  if (!store.getBlock(clientId) || store.getSelectedBlockClientId() !== clientId)
                    throw Error(
                      T('Select the same bibliography block before using this candidate'),
                    );
                  if (state.preview.baseline !== JSON.stringify(entries))
                    throw Error(T('Bibliography edits changed. Preview the BibTeX mapping again'));
                  const candidate = bibtexCandidate(
                    entries,
                    state.preview.incoming,
                    state.mode,
                    currentKeys(),
                    fail,
                  );
                  change({ entries: candidate });
                  state.preview = null;
                  close();
                } catch (error) {
                  state.preview = null;
                  setError(error.message);
                  refresh((n) => n + 1);
                }
              },
            },
            T('Use bibliography candidate'),
          ),
          el(
            wp.components.Button,
            { variant: 'tertiary', onClick: close },
            T('Cancel BibTeX import'),
          ),
        )
      : null,
  );
}
function BibliographyOrigins({ a }) {
  const el = wp.element.createElement,
    [states, setStates] = wp.element.useState({});
  wp.element.useEffect(() => {
    let active = true;
    Promise.all(
      (a.origins || []).map(async (origin) => {
        const entry = a.entries.find((e) => e.key === origin.key);
        try {
          return [origin.key, (await window.MBB.bibliographyEntryHash(entry)) === origin.hash];
        } catch {
          return [origin.key, null];
        }
      }),
    ).then((values) => {
      if (active) setStates(Object.fromEntries(values));
    });
    return () => {
      active = false;
    };
  }, [JSON.stringify(a.entries), JSON.stringify(a.origins)]);
  if (!a.origins?.length) return null;
  return el(
    'details',
    {},
    el('summary', {}, T('Library source declarations')),
    el(
      'p',
      {},
      T(
        'Source declarations do not prove authenticity or grant library access. Article snapshots remain readable without the library.',
      ),
    ),
    ...a.origins.map((origin) =>
      el(
        'p',
        { key: origin.key },
        origin.key +
          ': ' +
          (states[origin.key] === true
            ? T('Snapshot matches declared version')
            : states[origin.key] === false
              ? T('Locally modified snapshot')
              : T('Source comparison unavailable')),
      ),
    ),
  );
}
function BibliographyDraft({
  a,
  setAttributes,
  registry,
  clientId,
  session,
  drafts,
  syncDraftLock,
}) {
  const el = wp.element.createElement;
  const saved = {
    version: a.version ?? 1,
    ...(a.version === 2 ? { style: a.style } : {}),
    ...(a.version === 2 && Object.hasOwn(a, 'origins') ? { origins: a.origins } : {}),
    entries: a.entries || [],
  };
  const original = JSON.stringify(saved);
  const [draft, setDraft] = wp.element.useState(drafts.get(clientId)?.value ?? saved),
    [error, setError] = wp.element.useState('');
  const pending = drafts.get(clientId);
  wp.element.useEffect(() => {
    setDraft(drafts.get(clientId)?.value ?? saved);
  }, [original]);
  const change = (patch) => {
    const next = { ...draft, ...patch };
    // Removing an entry removes its declaration; editing fields retains it as a local modification.
    if (Object.hasOwn(next, 'origins'))
      next.origins = next.origins.filter((o) => next.entries.some((e) => e.key === o.key));
    setDraft(next);
    setError('');
    if (JSON.stringify(next) === original) drafts.delete(clientId);
    else
      drafts.set(clientId, { value: next, baseline: drafts.get(clientId)?.baseline ?? original });
    syncDraftLock();
  };
  const apply = () => {
    try {
      if (!pending || pending.baseline !== original)
        throw Error(
          T('Applied bibliography changed. The current candidate is preserved and unapplied.'),
        );
      technicalAttributes('bibliography', { ...a, ...draft }, (code, message) => {
        throw Error(T(message));
      });
      const patched = registry
        .select('core/block-editor')
        .getBlocks()
        .map((block) =>
          block.clientId === clientId
            ? { ...block, attributes: { ...block.attributes, ...draft } }
            : block,
        );
      validateTechnical(patched, (code, message) => {
        throw Error(T(message));
      });
      setAttributes(draft);
      drafts.delete(clientId);
      syncDraftLock();
      setError('');
    } catch (error) {
      setError(error.message);
    }
  };
  return el(
    'div',
    {},
    el(CSLImport, { a: draft, change, registry, clientId, session }),
    el(BibliographyOrigins, { a: draft }),
    draft.version === 2 && window.MBBScholarlyTool
      ? el(window.MBBScholarlyTool, { draft, change, registry, clientId, session })
      : null,
    draft.version === 2
      ? el(BibliographyV2Fields, {
          a: draft,
          setAttributes: change,
          registry,
          session,
          pending: !!pending,
          Rename,
        })
      : el(
          'div',
          {},
          el(
            'p',
            {},
            T(
              'This bibliography uses the original six-field format. It stays unchanged until you explicitly upgrade or adopt a CSL-JSON candidate.',
            ),
          ),
          el(
            wp.components.Button,
            {
              variant: 'secondary',
              onClick: () =>
                change({
                  version: 2,
                  style: 'author-year',
                  entries: migrateBibliography(draft.entries),
                }),
            },
            T('Prepare bibliography v2 candidate'),
          ),
          el(BibTeXImport, { entries: draft.entries, change, registry, clientId, session }),
          el(BibliographyFields, {
            a: { ...a, entries: draft.entries },
            setAttributes: change,
            registry,
            session,
            pending: !!pending,
          }),
        ),
    pending
      ? el(
          'p',
          { role: 'status' },
          pending.baseline !== original
            ? T('Applied bibliography changed. The current candidate is preserved and unapplied.')
            : T(
                'Bibliography edits have not been applied. Apply or discard them before saving or renaming keys.',
              ),
        )
      : null,
    error ? el('p', { role: 'alert' }, error) : null,
    el(
      wp.components.Button,
      { variant: 'primary', disabled: !pending, onClick: apply },
      T('Apply bibliography edits'),
    ),
    el(
      wp.components.Button,
      {
        variant: 'tertiary',
        disabled: !pending,
        onClick: () => {
          drafts.delete(clientId);
          syncDraftLock();
          setDraft(saved);
          setError('');
        },
      },
      T('Discard bibliography edits'),
    ),
  );
}

function registerReferences() {
  // Parser-only runtimes intentionally omit editor stores and UI hooks.
  if (
    typeof wp.data?.select !== 'function' ||
    typeof wp.data?.useRegistry !== 'function' ||
    typeof wp.data?.useSelect !== 'function' ||
    typeof wp.richText?.registerFormatType !== 'function'
  )
    return;
  const formats = wp.data.select('core/rich-text');
  if (typeof formats?.getFormatType !== 'function') return;
  const el = wp.element.createElement;
  for (const refKind of ['xref', 'cite']) {
    const name = 'mbb/' + refKind;
    if (formats.getFormatType(name)) continue;
    wp.richText.registerFormatType(name, {
      title: refKind === 'xref' ? T('Cross-reference') : T('Literature citation'),
      tagName: 'span',
      className: 'mbb-' + refKind,
      attributes: {
        identity: refKind === 'xref' ? 'data-mbb-target' : 'data-mbb-keys',
        version: 'data-mbb-version',
        ...(refKind === 'xref'
          ? {
              namespace: 'data-mbb-namespace',
              document: 'data-mbb-document',
              targetKind: 'data-mbb-kind',
            }
          : {}),
      },
      edit: ({ value, onChange, isActive }) => {
        const registry = wp.data.useRegistry(),
          blocks = wp.data.useSelect((select) => select('core/block-editor').getBlocks(), []);
        const [opened, setOpened] = wp.element.useState(false),
          [selected, setSelected] = wp.element.useState([]),
          [error, setError] = wp.element.useState('');
        let index = { targets: [], entries: [], validTargets: [], validKeys: [], issues: [] };
        try {
          index = editorState(blocks);
        } catch {}
        const options =
          refKind === 'xref'
            ? index.targets
                .filter((item) => index.validTargets.includes(item.id))
                .map((item) => ({
                  value: item.id,
                  label:
                    (item.title || (kinds[item.kind]?.() || item.kind) + ' ' + item.number) +
                    ' (' +
                    item.id +
                    ')',
                }))
            : index.entries
                .filter((item) => index.validKeys.includes(item.key))
                .map((item) => ({
                  value: item.key,
                  label: '[' + item.number + '] ' + item.title + ' (' + item.key + ')',
                }));
        const active = wp.richText.getActiveFormat(value, name),
          hasLink = !!wp.richText.getActiveFormat(value, 'core/link');
        const preview =
          refKind === 'xref'
            ? options.find((option) => option.value === selected[0])?.label
            : selected
                .map((key) => index.entries.find((item) => item.key === key)?.number)
                .filter(Boolean)
                .sort((a, b) => a - b)
                .map((n) => '[' + n + ']')
                .join(', ');
        return el(
          wp.element.Fragment,
          {},
          el(wp.blockEditor.RichTextToolbarButton, {
            icon: refKind === 'xref' ? 'admin-links' : 'book',
            title:
              refKind === 'xref' ? T('Insert cross-reference') : T('Insert literature citation'),
            isActive,
            onClick: () => {
              setSelected(active?.attributes?.identity?.split(',') || []);
              setError('');
              setOpened(true);
            },
          }),
          opened
            ? el(
                wp.components.Modal,
                {
                  title:
                    refKind === 'xref'
                      ? T('Choose a reference target')
                      : T('Choose bibliography entries'),
                  onRequestClose: () => setOpened(false),
                },
                ...index.issues.map((issue, i) =>
                  el('p', { key: i, role: 'alert' }, issueText(issue)),
                ),
                hasLink
                  ? el(
                      'p',
                      { role: 'alert' },
                      T('Technical references must not be inside links or images'),
                    )
                  : null,
                el(wp.components.SelectControl, {
                  label:
                    refKind === 'xref'
                      ? T('Reference target')
                      : T('Bibliography keys (at most eight)'),
                  multiple: refKind === 'cite',
                  value: refKind === 'cite' ? selected : selected[0] || '',
                  options:
                    refKind === 'xref'
                      ? [{ label: T('Choose a reference target'), value: '' }, ...options]
                      : options,
                  onChange: (next) =>
                    setSelected(Array.isArray(next) ? next : [next].filter(Boolean)),
                }),
                preview ? el('p', { role: 'status' }, preview) : null,
                error ? el('p', { role: 'alert' }, error) : null,
                el(
                  wp.components.Button,
                  {
                    variant: 'primary',
                    disabled: hasLink || !selected.length || selected.length > 8,
                    onClick: () => {
                      try {
                        if (selected.some((key) => !options.some((option) => option.value === key)))
                          throw Error(T('The selected reference target no longer exists.'));
                        let start = value.start,
                          end = value.end;
                        if (active)
                          ({ start, end } = technicalReferenceSelection(
                            value,
                            refKind,
                            active.attributes.identity,
                          ));
                        onChange(
                          wp.richText.insert(
                            value,
                            wp.richText.create({ html: referenceHTML(refKind, selected) }),
                            start,
                            end,
                          ),
                        );
                        setOpened(false);
                      } catch (error) {
                        setError(error.message);
                      }
                    },
                  },
                  T('Insert reference'),
                ),
              )
            : null,
        );
      },
    });
  }
}
export function registerTechnical({ drafts, syncDraftLock, retainDraftOwner }) {
  const el = wp.element.createElement;
  for (const [kind, schema] of Object.entries(technicalSchemas)) {
    const name = 'mbb/' + kind;
    if (wp.blocks.getBlockType(name)) continue;
    wp.blocks.registerBlockType(name, {
      apiVersion: 3,
      title: {
        object: T('Numbered object'),
        statement: T('Definition, theorem or proof'),
        bibliography: T('Bibliography'),
      }[kind],
      category: 'text',
      attributes: Object.fromEntries(
        Object.entries({
          ...schema,
          ...(kind === 'bibliography' ? { style: 'string', origins: 'array' } : {}),
          version: 'number',
        }).map(([key, type]) => [key, { type: key === 'entries' ? 'array' : type }]),
      ),
      supports: {
        html: false,
        className: false,
        customClassName: false,
        anchor: false,
        ...(kind === 'bibliography' ? { multiple: false } : {}),
      },
      edit: ({ attributes: a, setAttributes, clientId, isSelected }) => {
        const registry = wp.data.useRegistry(),
          blocks = wp.data.useSelect((select) => select('core/block-editor').getBlocks(), []);
        const session = wp.element.useRef({ renames: {} }).current;
        wp.element.useEffect(() => retainDraftOwner(registry, clientId), [registry, clientId]);
        let derived;
        try {
          derived = editorState(blocks).targets.find((target) => target.clientId === clientId);
        } catch {}
        wp.element.useEffect(() => {
          const defaults = {
            id: 'mbb-' + clientId,
            version: 1,
            ...(kind === 'object'
              ? { kind: 'equation', caption: T('Caption') }
              : kind === 'statement'
                ? { kind: 'definition', title: T('Title'), open: true }
                : { entries: [entry('reference-1')] }),
          };
          const patch = Object.fromEntries(
            Object.entries(defaults).filter(([key]) => a[key] === undefined),
          );
          if (Object.keys(patch).length) setAttributes(patch);
        }, []);
        const caption =
          (kinds[a.kind]?.() || '') +
          (derived ? ' ' + derived.number : '') +
          ': ' +
          (a.caption ?? a.title ?? '');
        const body =
          kind === 'bibliography'
            ? null
            : el(
                'div',
                { className: 'mbb-technical-body' },
                el(
                  wp.blockEditor.InnerBlocks,
                  kind === 'object'
                    ? {
                        allowedBlocks: [bodyTypes[a.kind || 'equation']],
                        template: [
                          [
                            bodyTypes[a.kind || 'equation'],
                            a.kind === 'equation' || a.kind === undefined
                              ? { tex: 'x' }
                              : a.kind === 'listing'
                                ? { code: '\n', language: '' }
                                : {},
                          ],
                        ],
                        templateLock: false,
                      }
                    : {},
                ),
              );
        let bibNumbers = new Map();
        try {
          bibNumbers = new Map(
            technicalIndex(blocks).entries.map((item) => [item.key, item.number]),
          );
        } catch {}
        let issues = [];
        try {
          issues = editorState(blocks).issues;
        } catch {}
        return el(
          'div',
          wp.blockEditor.useBlockProps({ className: 'mbb-technical-editor' }),
          isSelected
            ? el(
                wp.blockEditor.InspectorControls,
                {},
                el(
                  wp.components.PanelBody,
                  {
                    title:
                      kind === 'bibliography'
                        ? T('Bibliography settings')
                        : T('Technical object settings'),
                    initialOpen: true,
                    className: 'mbb-technical-settings',
                  },
                  ...issues.map((issue, i) => el('p', { key: i, role: 'alert' }, issueText(issue))),
                  el(wp.components.TextControl, {
                    label: T('Stable ID'),
                    value: a.id || '',
                    readOnly: true,
                  }),
                  kind !== 'bibliography'
                    ? el(TechnicalTextDraft, {
                        kind,
                        a,
                        setAttributes,
                        clientId,
                        drafts,
                        syncDraftLock,
                      })
                    : null,
                  kind !== 'bibliography'
                    ? el(Rename, { type: 'label', identity: a.id, registry, session })
                    : null,
                  kind !== 'bibliography'
                    ? el(wp.components.SelectControl, {
                        label: T('Object or statement kind'),
                        value: a.kind || '',
                        options: (kind === 'object'
                          ? ['equation', 'figure', 'table', 'listing']
                          : ['definition', 'theorem', 'proof']
                        ).map((value) => ({ label: kinds[value](), value })),
                        onChange: (value) =>
                          setAttributes({
                            kind: value,
                            ...(kind === 'statement' && value !== 'proof' ? { open: true } : {}),
                          }),
                      })
                    : null,
                  kind === 'statement' && a.kind === 'proof'
                    ? el(wp.components.ToggleControl, {
                        label: T('Initially open'),
                        checked: a.open !== false,
                        onChange: (open) => setAttributes({ open }),
                      })
                    : null,
                  kind === 'bibliography'
                    ? el(BibliographyDraft, {
                        a,
                        setAttributes,
                        registry,
                        clientId,
                        session,
                        drafts,
                        syncDraftLock,
                      })
                    : null,
                ),
              )
            : null,
          kind === 'bibliography'
            ? el(
                'section',
                { className: 'mbb-bibliography' },
                el('p', { className: 'mbb-bibliography-title' }, T('Bibliography')),
                el(
                  'ul',
                  {},
                  ...(a.entries || [])
                    .map((value) => (a.version === 2 ? bibliographyProjection(value) : value))
                    .map((item) =>
                      el(
                        'li',
                        { key: item.key },
                        '[' +
                          (bibNumbers.get(item.key) || '?') +
                          '] ' +
                          item.title +
                          (item.authors.length ? ' — ' + item.authors.join(', ') : '') +
                          (item.year ? ' (' + item.year + ')' : ''),
                      ),
                    ),
                ),
              )
            : el(
                kind === 'object' ? 'figure' : 'section',
                {
                  className: kind === 'object' ? 'mbb-technical-object' : 'mbb-technical-statement',
                },
                kind === 'statement'
                  ? el('p', { className: 'mbb-technical-heading' }, caption)
                  : null,
                body,
                kind === 'object'
                  ? el('figcaption', { className: 'mbb-technical-caption' }, caption)
                  : null,
              ),
        );
      },
      save: ({ attributes }) => technicalSave(kind, attributes),
    });
  }
  registerReferences();
}
