import {
  bibliographyTypes,
  bibliographyAuthor,
  bibliographyYear,
  emptyBibliographyEntry,
  migrateBibliography,
  parseCSL,
  cslCandidate,
  exportCSL,
} from './bibliography.js';
import { technicalReferenceCount } from './technical.js';
import { translate as T } from './i18n.js';

const typeLabel = (type) =>
  ({
    'article-journal': T('Journal article'),
    book: T('Book'),
    chapter: T('Book chapter'),
    'paper-conference': T('Conference paper'),
    report: T('Report'),
    thesis: T('Thesis'),
    webpage: T('Web page'),
    dataset: T('Dataset'),
    software: T('Software'),
    document: T('Document'),
  })[type] ?? type;

function mappedFields(entry) {
  const el = wp.element.createElement;
  const issued =
    entry.issued.literal !== undefined
      ? entry.issued.literal
      : entry.issued['date-parts']
          .map((p) => p.map((v, i) => (i ? String(v).padStart(2, '0') : String(v))).join('-'))
          .join('–');
  const fields = [
    [T('Issue date'), issued],
    [T('Publication title'), entry.containerTitle],
    [T('Publisher'), entry.publisher],
    [T('Volume'), entry.volume],
    [T('Issue'), entry.issue],
    [T('Pages'), entry.page],
    [T('DOI identifier (without URL prefix)'), entry.doi],
    [T('Reference URL (HTTP or HTTPS)'), entry.url],
    [T('Additional source text'), entry.source],
    ...Object.entries(entry.identifiers),
  ];
  return el(
    'details',
    {},
    el('summary', {}, T('Mapped publication fields')),
    el(
      'dl',
      {},
      ...fields
        .filter(([, v]) => v !== '')
        .flatMap(([label, value]) => [
          el('dt', { key: label + 'label' }, label),
          el('dd', { key: label + 'value' }, value),
        ]),
    ),
  );
}

// All controls edit the existing unapplied bibliography draft. Nothing saves on import.
export function BibliographyV2Fields({ a, setAttributes, registry, session, pending, Rename }) {
  const el = wp.element.createElement,
    [notice, setNotice] = wp.element.useState(''),
    [, refresh] = wp.element.useState(0);
  const update = (i, patch) =>
    setAttributes({ entries: a.entries.map((e, n) => (n === i ? { ...e, ...patch } : e)) });
  const text = (label, value, onChange) =>
    el(wp.components.TextControl, { label, value, onChange });
  return el(
    'div',
    {},
    el(wp.components.SelectControl, {
      label: T('Citation style'),
      value: a.style,
      options: [
        { value: 'author-year', label: T('Author–year') },
        { value: 'numeric', label: T('Numeric') },
      ],
      onChange: (style) => setAttributes({ style }),
    }),
    ...a.entries.map((e, i) =>
      el(
        wp.components.PanelBody,
        {
          key: e.key,
          title: (e.title || T('Untitled reference')) + ' (' + e.key + ')',
          opened: (session.openEntry ?? a.entries[0]?.key) === e.key,
          onToggle: () => {
            session.openEntry = (session.openEntry ?? a.entries[0]?.key) === e.key ? null : e.key;
            refresh((n) => n + 1);
          },
        },
        !pending ? el(Rename, { type: 'key', identity: e.key, registry, session }) : null,
        el(wp.components.SelectControl, {
          label: T('Reference type'),
          value: e.type,
          options: bibliographyTypes.map((type) => ({ value: type, label: typeLabel(type) })),
          onChange: (type) => update(i, { type }),
        }),
        text(T('Reference title'), e.title, (title) => update(i, { title })),
        el('h4', {}, T('Authors and institutions')),
        ...e.authors.map((n, j) =>
          el(
            'fieldset',
            { key: j, className: 'mbb-bibliography-author' },
            el('legend', {}, String(j + 1) + '. ' + bibliographyAuthor(n)),
            el(wp.components.SelectControl, {
              label: T('Name form'),
              value: n.literal !== undefined ? 'literal' : 'person',
              options: [
                { value: 'literal', label: T('Literal name or institution') },
                { value: 'person', label: T('Explicit person name') },
              ],
              onChange: (kind) =>
                update(i, {
                  authors: e.authors.map((v, k) =>
                    k === j
                      ? kind === 'literal'
                        ? { literal: bibliographyAuthor(v) }
                        : {
                            family: '',
                            given: '',
                            droppingParticle: '',
                            nonDroppingParticle: '',
                            suffix: '',
                          }
                      : v,
                  ),
                }),
            }),
            n.literal !== undefined
              ? text(T('Literal name or institution'), n.literal, (literal) =>
                  update(i, { authors: e.authors.map((v, k) => (k === j ? { literal } : v)) }),
                )
              : el(
                  'div',
                  {},
                  ...['family', 'given', 'droppingParticle', 'nonDroppingParticle', 'suffix'].map(
                    (f) =>
                      text(
                        {
                          family: T('Family name (explicit)'),
                          given: T('Given name'),
                          droppingParticle: T('Dropping particle'),
                          nonDroppingParticle: T('Non-dropping particle'),
                          suffix: T('Name suffix'),
                        }[f],
                        n[f],
                        (value) =>
                          update(i, {
                            authors: e.authors.map((v, k) => (k === j ? { ...v, [f]: value } : v)),
                          }),
                      ),
                  ),
                ),
            el(
              wp.components.Button,
              {
                variant: 'tertiary',
                onClick: () => update(i, { authors: e.authors.filter((_, k) => k !== j) }),
              },
              T('Remove author'),
            ),
          ),
        ),
        el(
          'p',
          { className: 'description' },
          T(
            'Literal names stay literal. Switching to person fields starts empty; enter the authored name parts explicitly.',
          ),
        ),
        el(
          wp.components.Button,
          {
            variant: 'secondary',
            disabled: e.authors.length >= 8,
            onClick: () => update(i, { authors: [...e.authors, { literal: '' }] }),
          },
          T('Add author or institution'),
        ),
        el(wp.components.SelectControl, {
          label: T('Issue date form'),
          value: e.issued.literal !== undefined ? 'literal' : 'parts',
          options: [
            { value: 'literal', label: T('Literal date') },
            { value: 'parts', label: T('Structured year, month and day') },
          ],
          onChange: (kind) =>
            update(i, {
              issued:
                kind === 'literal'
                  ? { literal: bibliographyYear(e.issued) }
                  : { 'date-parts': [[0]] },
            }),
        }),
        e.issued.literal !== undefined
          ? text(T('Literal issue date'), e.issued.literal, (literal) =>
              update(i, { issued: { literal } }),
            )
          : el(
              'div',
              {},
              ...e.issued['date-parts'].map((part, p) =>
                el(
                  'fieldset',
                  { key: p },
                  el('legend', {}, p ? T('End date') : T('Start date')),
                  ...[T('Year'), T('Month (optional)'), T('Day (optional)')].map((label, k) =>
                    el(wp.components.TextControl, {
                      key: k,
                      label,
                      type: 'number',
                      value: part[k] || '',
                      onChange: (value) => {
                        const next = [...part];
                        next[k] = value === '' ? 0 : Number(value);
                        while (next.length > 1 && !next.at(-1)) next.pop();
                        for (let n = 0; n < next.length; n++) next[n] ??= 0;
                        update(i, {
                          issued: {
                            'date-parts': e.issued['date-parts'].map((v, q) =>
                              q === p ? next : v,
                            ),
                          },
                        });
                      },
                    }),
                  ),
                ),
              ),
              el(
                wp.components.Button,
                {
                  variant: 'tertiary',
                  onClick: () =>
                    update(i, {
                      issued: {
                        'date-parts':
                          e.issued['date-parts'].length === 1
                            ? [e.issued['date-parts'][0], [0]]
                            : [e.issued['date-parts'][0]],
                      },
                    }),
                },
                e.issued['date-parts'].length === 1 ? T('Add end date') : T('Remove end date'),
              ),
            ),
        ...['containerTitle', 'publisher', 'volume', 'issue', 'page', 'doi', 'url', 'source'].map(
          (f) =>
            text(
              {
                containerTitle: T('Publication title'),
                publisher: T('Publisher'),
                volume: T('Volume'),
                issue: T('Issue'),
                page: T('Pages'),
                doi: T('DOI identifier (without URL prefix)'),
                url: T('Reference URL (HTTP or HTTPS)'),
                source: T('Additional source text'),
              }[f],
              e[f],
              (value) => update(i, { [f]: value }),
            ),
        ),
        el(
          'details',
          {},
          el('summary', {}, T('Additional identifiers')),
          ...Object.keys(e.identifiers).map((f) =>
            text(f, e.identifiers[f], (value) =>
              update(i, { identifiers: { ...e.identifiers, [f]: value } }),
            ),
          ),
        ),
        el(
          wp.components.Button,
          {
            variant: 'tertiary',
            onClick: () => {
              if (
                technicalReferenceCount(
                  registry.select('core/block-editor').getBlocks(),
                  'key',
                  e.key,
                )
              ) {
                setNotice(T('This entry is cited. Remove its citations before deleting it.'));
                return;
              }
              setNotice('');
              setAttributes({ entries: a.entries.filter((_, n) => n !== i) });
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
        disabled: a.entries.length >= 64,
        onClick: () => {
          const keys = new Set(a.entries.map((e) => e.key));
          let n = 1;
          while (keys.has('reference-' + n)) n++;
          session.openEntry = 'reference-' + n;
          setAttributes({ entries: [...a.entries, emptyBibliographyEntry('reference-' + n)] });
        },
      },
      T('Add bibliography entry'),
    ),
    notice ? el('p', { role: 'alert' }, notice) : null,
  );
}

export function CSLImport({ a, change, registry, clientId, session }) {
  const el = wp.element.createElement,
    [opened, setOpened] = wp.element.useState(false),
    [input, setInput] = wp.element.useState(''),
    [mode, setMode] = wp.element.useState('merge'),
    [keyMap, setKeyMap] = wp.element.useState({}),
    [report, setReport] = wp.element.useState(null),
    [error, setError] = wp.element.useState(''),
    [ackLoss, setAckLoss] = wp.element.useState(false),
    [ackKeys, setAckKeys] = wp.element.useState(false);
  const generation = wp.element.useRef(0),
    baseline = JSON.stringify(a);
  wp.element.useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const reset = () => {
    generation.current++;
    setReport(null);
    setError('');
    setAckLoss(false);
    setAckKeys(false);
  };
  const close = () => {
    reset();
    setOpened(false);
  };
  const referenced = () => {
    const blocks = registry.select('core/block-editor').getBlocks(),
      keys = new Set([...a.entries, ...(report?.entries || [])].map((e) => e.key));
    return [...keys].filter((key) => technicalReferenceCount(blocks, 'key', key));
  };
  const preview = () => {
    try {
      const parsed = parseCSL(input, keyMap);
      setReport({ ...parsed, baseline, mode, input, keyMap: JSON.stringify(keyMap) });
      setError('');
      setAckLoss(false);
      setAckKeys(false);
    } catch (e) {
      // Keep the editable key fields after a failed remap. It is still an old,
      // disabled preview until the current keys pass a fresh parse.
      if (report?.input !== input) setReport(null);
      setError(T(e.message));
    }
  };
  let candidate = null,
    candidateError = '';
  if (report) {
    try {
      if (
        report.baseline !== baseline ||
        report.mode !== mode ||
        report.input !== input ||
        report.keyMap !== JSON.stringify(keyMap)
      )
        throw Error(T('Bibliography edits changed. Preview the CSL-JSON mapping again.'));
      candidate = cslCandidate(
        a.version === 2 ? a.entries : migrateBibliography(a.entries),
        report,
        mode,
        referenced(),
        ackLoss,
        ackKeys,
      );
    } catch (e) {
      candidateError = T(e.message);
    }
  }
  const download = () => {
    try {
      const entries = a.version === 2 ? a.entries : migrateBibliography(a.entries),
        blob = new Blob([JSON.stringify(exportCSL(entries), null, 2) + '\n'], {
          type: 'application/json',
        }),
        url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = 'bibliography.csl.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setError('');
    } catch (e) {
      setError(T(e.message));
    }
  };
  return el(
    'div',
    { className: 'mbb-csl-tools' },
    el(
      wp.components.Button,
      {
        variant: 'secondary',
        onClick: () => {
          reset();
          setOpened(true);
        },
      },
      T('Import CSL-JSON'),
    ),
    el(
      wp.components.Button,
      { variant: 'tertiary', onClick: download },
      T('Download CSL-JSON subset'),
    ),
    error && !opened ? el('p', { role: 'alert' }, error) : null,
    opened
      ? el(
          wp.components.Modal,
          {
            title: T('Import bounded CSL-JSON'),
            onRequestClose: close,
            className: 'mbb-csl-modal',
          },
          el(
            'p',
            {},
            T(
              'This finite subset imports up to 64 records within 64 KiB. Review unsupported fields and key mappings explicitly. The original JSON is not stored, and import does not save the article.',
            ),
          ),
          el(
            'label',
            {},
            T('CSL-JSON file (optional)'),
            el('input', {
              type: 'file',
              accept: '.json,application/json',
              onChange: async (event) => {
                reset();
                setKeyMap({});
                const ticket = generation.current,
                  file = event.target.files?.[0];
                if (!file) return;
                if (file.size > 65536) {
                  setError(T('CSL-JSON input must be UTF-8 JSON within 64 KiB'));
                  return;
                }
                try {
                  const bytes = await file.arrayBuffer(),
                    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
                  if (ticket === generation.current) setInput(text);
                } catch {
                  if (ticket === generation.current) setError(T('CSL-JSON is invalid'));
                }
              },
            }),
          ),
          el(wp.components.TextareaControl, {
            label: T('CSL-JSON source (up to 64 KiB)'),
            value: input,
            rows: 8,
            onChange: (value) => {
              reset();
              setInput(value);
              setKeyMap({});
            },
          }),
          el(wp.components.SelectControl, {
            label: T('Import behavior'),
            value: mode,
            options: [
              { value: 'merge', label: T('Add entries') },
              { value: 'replace', label: T('Replace bibliography entries') },
            ],
            onChange: (value) => {
              reset();
              setMode(value);
            },
          }),
          el(
            wp.components.Button,
            { variant: 'secondary', onClick: preview },
            T('Preview CSL-JSON mapping'),
          ),
          error ? el('p', { role: 'alert' }, error) : null,
          report
            ? el(
                'div',
                {},
                el(
                  'div',
                  { className: 'mbb-csl-preview' },
                  ...report.entries.map((e, i) =>
                    el(
                      'section',
                      { key: i },
                      el('h3', {}, e.title),
                      el(
                        'p',
                        {},
                        typeLabel(e.type) +
                          ' · ' +
                          e.authors.map(bibliographyAuthor).join('; ') +
                          ' · ' +
                          bibliographyYear(e.issued),
                      ),
                      mappedFields(e),
                      el(wp.components.TextControl, {
                        label: T('Proposed citation key'),
                        value: keyMap[i] ?? e.key,
                        onChange: (value) => {
                          generation.current++;
                          setError('');
                          setAckKeys(false);
                          setAckLoss(false);
                          setKeyMap({ ...keyMap, [i]: value });
                        },
                      }),
                    ),
                  ),
                ),
                report.losses.length
                  ? el(
                      'div',
                      {},
                      el('p', {}, T('Unsupported fields that will not be stored:')),
                      el(
                        'ul',
                        {},
                        ...report.losses.map((l, i) =>
                          el('li', { key: i }, String(l.index + 1) + ': ' + l.field),
                        ),
                      ),
                      el(wp.components.CheckboxControl, {
                        label: T('I reviewed and accept the listed CSL-JSON field losses'),
                        checked: ackLoss,
                        onChange: setAckLoss,
                      }),
                    )
                  : null,
                report.keyMappings.length
                  ? el(
                      'div',
                      {},
                      el('p', {}, T('Citation key mappings:')),
                      el(
                        'ul',
                        {},
                        ...report.keyMappings.map((m, i) =>
                          el('li', { key: i }, m.from + ' → ' + m.to),
                        ),
                      ),
                      el(wp.components.CheckboxControl, {
                        label: T('I reviewed and accept the proposed citation keys'),
                        checked: ackKeys,
                        onChange: setAckKeys,
                      }),
                    )
                  : null,
                candidateError ? el('p', { role: 'status' }, candidateError) : null,
              )
            : null,
          el(
            wp.components.Button,
            {
              variant: 'primary',
              disabled: !candidate,
              onClick: () => {
                try {
                  const current = registry.select('core/block-editor').getBlock(clientId);
                  if (
                    !current ||
                    registry.select('core/block-editor').getSelectedBlockClientId() !== clientId
                  )
                    throw Error(
                      T('Select the same bibliography block before using this candidate'),
                    );
                  if (!candidate)
                    throw Error(
                      T('Bibliography edits changed. Preview the CSL-JSON mapping again.'),
                    );
                  const entries = cslCandidate(
                    a.version === 2 ? a.entries : migrateBibliography(a.entries),
                    report,
                    mode,
                    referenced(),
                    ackLoss,
                    ackKeys,
                  );
                  change({ version: 2, style: a.version === 2 ? a.style : 'author-year', entries });
                  session.openEntry = report.entries[0]?.key;
                  close();
                } catch (e) {
                  setError(T(e.message));
                }
              },
            },
            T('Use bibliography candidate'),
          ),
          el(
            wp.components.Button,
            { variant: 'tertiary', onClick: close },
            T('Cancel CSL-JSON import'),
          ),
        )
      : null,
  );
}
