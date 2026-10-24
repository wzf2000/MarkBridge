import { useComponentDescriptor } from './component-catalog.js';
import { componentAuthor } from './component-authors.js';
import { componentParams } from './component-data.js';
import { translate as T, translateError as E } from './i18n.js';

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const clone = (value) => JSON.parse(JSON.stringify(value));
const keyOf = (path) => JSON.stringify(path);

/** Display-only labels; the registered schema, parameter keys and serialized data are untouched. */
export function parameterLabel(path) {
  const words = {
    dataset: T('Dataset'),
    kind: T('Kind'),
    value: T('Value'),
    values: T('Values'),
    title: T('Title'),
    label: T('Label'),
    name: T('Name'),
    items: T('Items'),
    rows: T('Rows'),
    columns: T('Columns'),
    nodes: T('Nodes'),
    edges: T('Edges'),
    source: T('Source'),
    target: T('Target'),
    start: T('Start'),
    count: T('Count'),
    size: T('Size'),
    enabled: T('Enabled'),
    mode: T('Mode'),
    details: T('Details'),
    unit: T('Unit'),
    series: T('Series'),
    initial: T('Initial values'),
    push: T('Append values'),
    pops: T('Removal count'),
    answer: T('Answer'),
    tolerance: T('Tolerance'),
    integer: T('Integers only'),
    options: T('Options'),
    correct: T('Correct option'),
    order: T('Order'),
    directed: T('Directed'),
    n: T('Count'),
  };
  return path.length
    ? path
        .map((key) =>
          typeof key === 'number'
            ? T('Item') + ' ' + (key + 1)
            : (own(words, key) ? words[key] : null) ||
              String(key)
                .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
                .replace(/[_-]+/g, ' ')
                .replace(/^./, (c) => c.toUpperCase()),
        )
        .join(' › ')
    : T('Parameters');
}

const equal = (a, b) => {
  if (typeof a !== typeof b || a === null || b === null) return a === b;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => equal(v, b[i]))
    );
  if (object(a)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length && keys.every((k) => own(b, k) && equal(a[k], b[k]))
    );
  }
  return a === b;
};

// A closed subset of the server's data-only schema contract. No callbacks/HTML.
export function parameterSchemaKnown(schema) {
  let nodes = 0;
  const walk = (s, depth) => {
    if (
      ++nodes > 1024 ||
      depth > 8 ||
      !object(s) ||
      !['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'].includes(s.type)
    )
      return false;
    const fields = {
      object: ['properties', 'required', 'additionalProperties'],
      array: ['items', 'minItems', 'maxItems'],
      string: ['minLength', 'maxLength'],
      number: ['minimum', 'maximum'],
      integer: ['minimum', 'maximum'],
      boolean: [],
      null: [],
    };
    if (Object.keys(s).some((k) => !['type', 'enum', ...fields[s.type]].includes(k))) return false;
    for (const k of ['minItems', 'maxItems', 'minLength', 'maxLength'])
      if (own(s, k) && (!Number.isInteger(s[k]) || s[k] < 0 || s[k] > 1024)) return false;
    for (const k of ['minimum', 'maximum'])
      if (own(s, k) && (typeof s[k] !== 'number' || !Number.isFinite(s[k]))) return false;
    for (const [min, max] of [
      ['minItems', 'maxItems'],
      ['minLength', 'maxLength'],
      ['minimum', 'maximum'],
    ])
      if (own(s, min) && own(s, max) && s[min] > s[max]) return false;
    if (s.type === 'object') {
      if (
        s.additionalProperties !== false ||
        !object(s.properties) ||
        Object.keys(s.properties).some((k) => forbidden.has(k))
      )
        return false;
      if (
        own(s, 'required') &&
        (!Array.isArray(s.required) ||
          new Set(s.required).size !== s.required.length ||
          s.required.some((k) => typeof k !== 'string' || !own(s.properties, k)))
      )
        return false;
      if (!Object.values(s.properties).every((child) => walk(child, depth + 1))) return false;
    }
    if (s.type === 'array' && !walk(s.items, depth + 1)) return false;
    if (own(s, 'enum')) {
      if (!Array.isArray(s.enum) || !s.enum.length) return false;
      const { enum: choices, ...base } = s;
      if (choices.some((value) => validateParameterSchema(value, base).length)) return false;
    }
    return true;
  };
  return walk(schema, 0);
}

/** Matches the server's type/bounds/required/enum rules; unknown schemas defer to it. */
export function validateParameterSchema(value, schema) {
  if (!parameterSchemaKnown(schema)) return [];
  const errors = [];
  const error = (path, code, message) => {
    if (errors.length < 32) errors.push({ path, code, message });
  };
  const walk = (v, s, path, depth) => {
    if (depth > 8) {
      error(path, 'depth', 'Parameters exceed the supported depth.');
      return;
    }
    const valid = {
      object: object(v),
      array: Array.isArray(v),
      string: typeof v === 'string',
      number: typeof v === 'number' && Number.isFinite(v),
      integer: typeof v === 'number' && Number.isInteger(v),
      boolean: typeof v === 'boolean',
      null: v === null,
    }[s.type];
    if (!valid) {
      error(path, 'type', 'The field has an invalid type.');
      return;
    }
    if (s.enum && !s.enum.some((candidate) => equal(v, candidate)))
      error(path, 'enum', 'Choose one of the registered values.');
    if (
      typeof v === 'number' &&
      ((own(s, 'minimum') && v < s.minimum) || (own(s, 'maximum') && v > s.maximum))
    )
      error(path, 'bounds', 'The number is outside the registered bounds.');
    if (
      typeof v === 'string' &&
      ((own(s, 'minLength') && [...v].length < s.minLength) ||
        (own(s, 'maxLength') && [...v].length > s.maxLength))
    )
      error(path, 'length', 'The text length is outside the registered bounds.');
    if (s.type === 'object') {
      for (const k of s.required || [])
        if (!own(v, k)) error([...path, k], 'required', 'This registered field is required.');
      for (const [k, child] of Object.entries(v)) {
        if (!own(s.properties, k))
          error([...path, k], 'unknown', 'This field is not in the registered schema.');
        else walk(child, s.properties[k], [...path, k], depth + 1);
      }
    }
    if (s.type === 'array') {
      if (v.length < (s.minItems || 0) || v.length > (s.maxItems ?? 1024))
        error(path, 'items', 'The item count is outside the registered bounds.');
      v.forEach((child, i) => walk(child, s.items, [...path, i], depth + 1));
    }
  };
  walk(value, schema, [], 0);
  return errors;
}

/** UI admission never deletes unsupported data. Larger/unknown structures use JSON. */
export function parameterFormSupport(schema, value) {
  if (!parameterSchemaKnown(schema) || schema.type !== 'object') return false;
  let controls = 0;
  const walk = (s, v, depth) => {
    if (++controls > 128 || depth > 6 || s.type === 'null') return false;
    if (s.enum && s.enum.some((item) => item !== null && typeof item === 'object')) return false;
    if (s.type === 'object') {
      if (v !== undefined && !object(v)) return false;
      if (
        Object.keys(s.properties).length > 32 ||
        (v && Object.keys(v).some((k) => !own(s.properties, k)))
      )
        return false;
      return Object.entries(s.properties).every(([k, child]) => walk(child, v?.[k], depth + 1));
    }
    if (s.type === 'array') {
      if (
        !Number.isInteger(s.maxItems) ||
        s.maxItems > 64 ||
        (v !== undefined && !Array.isArray(v))
      )
        return false;
      return (v || []).every((child) => walk(s.items, child, depth + 1));
    }
    return true;
  };
  return walk(schema, value, 0);
}

export function updateParameterValue(value, path, next, remove = false) {
  if (!path.length) return next;
  if (path.some((k) => forbidden.has(String(k)))) throw Error('Invalid component property name');
  const [key, ...rest] = path;
  const copy = Array.isArray(value) ? [...value] : { ...value };
  if (rest.length) copy[key] = updateParameterValue(value?.[key], rest, next, remove);
  else if (remove) {
    if (Array.isArray(copy)) copy.splice(Number(key), 1);
    else delete copy[key];
  } else copy[key] = next;
  return copy;
}

function initialValue(schema, seed) {
  if (seed !== undefined) return clone(seed);
  if (schema.enum) return clone(schema.enum[0]);
  if (schema.type === 'object')
    return Object.fromEntries(
      (schema.required || []).map((k) => [k, initialValue(schema.properties[k])]),
    );
  if (schema.type === 'array')
    return Array.from({ length: schema.minItems || 0 }, () => initialValue(schema.items));
  if (schema.type === 'string') return '';
  if (schema.type === 'boolean') return false;
  if (schema.type === 'null') return null;
  return schema.minimum ?? Math.min(0, schema.maximum ?? 0);
}

// Local author input stays in the existing in-memory draft map, never attrs/source.
export function componentLocalDraft(value) {
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value))
    throw Error(T('Invalid local author draft'));
  let nodes = 0;
  const walk = (v, depth) => {
    if (++nodes > 1024 || depth > 8) throw Error(T('Invalid local author draft'));
    if (v === null || ['string', 'boolean', 'number'].includes(typeof v)) return;
    if (
      !v ||
      typeof v !== 'object' ||
      (!Array.isArray(v) && ![Object.prototype, null].includes(Object.getPrototypeOf(v)))
    )
      throw Error(T('Invalid local author draft'));
    if (Object.getOwnPropertySymbols(v).length) throw Error(T('Invalid local author draft'));
    const descriptors = Object.getOwnPropertyDescriptors(v);
    if (Object.values(descriptors).some((d) => d.get || d.set))
      throw Error(T('Invalid local author draft'));
    if (
      Array.isArray(v) &&
      (Object.keys(v).length !== v.length || Object.keys(v).some((k, i) => k !== String(i)))
    )
      throw Error(T('Invalid local author draft'));
    for (const [key, d] of Object.entries(descriptors)) {
      if (Array.isArray(v) && key === 'length') continue;
      if (!d.enumerable) throw Error(T('Invalid local author draft'));
      walk(d.value, depth + 1);
    }
  };
  walk(value, 0);
  componentParams(value, (_code, message) => {
    throw Error(message);
  });
  return clone(value);
}
function componentAuthorScope() {
  const cfg = globalThis.MBB_EDITOR;
  return JSON.stringify([
    cfg?.postId || 0,
    cfg?.state?.expected || null,
    cfg?.state?.source_sha256 || null,
  ]);
}

export function createParameterEditor({
  wp,
  drafts,
  syncDraftLock,
  parse,
  providers = () => window.MBBComponents || [],
}) {
  const el = wp.element.createElement;
  const find = (component, version) =>
    providers().find((p) => p.id === component && p.version === version);
  return function ParameterEditor({
    value,
    onCommit,
    clientId,
    component,
    componentVersion,
    instanceId,
    activity,
    parts = [],
  }) {
    const original = JSON.stringify(value || {}, null, 2);
    const identity =
      component +
      '@' +
      componentVersion +
      ':' +
      (instanceId || '') +
      (activity ? ':' + JSON.stringify(activity) : '');
    const [candidateActivity, setCandidateActivity] = wp.element.useState(
      drafts.get(clientId)?.activity ?? activity,
    );
    const [candidateVersion, setCandidateVersion] = wp.element.useState(
      drafts.get(clientId)?.componentVersion ?? componentVersion,
    );
    useComponentDescriptor(wp, component, candidateVersion);
    const provider = find(component, candidateVersion);
    const schema = provider?.schema;
    const [raw, setRaw] = wp.element.useState(drafts.get(clientId)?.raw ?? original);
    const [error, setError] = wp.element.useState(drafts.get(clientId)?.error || '');
    const [mode, setMode] = wp.element.useState('form');
    const authorSession = wp.element.useRef({});
    const authorLife = wp.element.useRef({ active: true, signature: '', generation: 0 });
    const [, refreshLocalDraft] = wp.element.useState(0);
    const localDraft = drafts.get(clientId)?.localDraft ?? null;
    const openingScope = componentAuthorScope();
    const fingerprint = () => {
      const d = drafts.get(clientId);
      return JSON.stringify([
        d?.raw ?? original,
        d?.componentVersion ?? componentVersion,
        d?.activity ?? activity,
        d?.localDraft ?? null,
        d?.baseline ?? original,
        d?.identity ?? identity,
        d?.error ?? '',
      ]);
    };
    const openingFingerprint = fingerprint();
    const authorSignature = JSON.stringify([
      clientId,
      identity,
      original,
      raw,
      candidateVersion,
      candidateActivity,
      localDraft,
      mode,
      openingScope,
    ]);
    if (authorLife.current.signature !== authorSignature) {
      authorLife.current.signature = authorSignature;
      authorLife.current.generation++;
    }
    const generation = authorLife.current.generation,
      session = authorSession.current;
    wp.element.useEffect(() => {
      authorLife.current.active = true;
      return () => {
        authorLife.current.active = false;
      };
    }, [clientId]);
    const assertAuthorCurrent = () => {
      const d = drafts.get(clientId);
      if (
        !authorLife.current.active ||
        authorLife.current.generation !== generation ||
        authorSession.current !== session ||
        openingScope !== componentAuthorScope() ||
        openingFingerprint !== fingerprint() ||
        (d && (d.identity !== identity || d.baseline !== original))
      )
        throw Error(T('The author candidate changed. Preview again.'));
    };
    const chooseMode = (next) => {
      if (next === mode) return;
      authorLife.current.generation++;
      setMode(next);
    };

    let candidate, parseError;
    try {
      candidate = parse(raw);
    } catch (e) {
      parseError = E(e);
    }
    const schemaErrors = candidate === undefined ? [] : validateParameterSchema(candidate, schema);
    const errors = new Map(schemaErrors.map((e) => [keyOf(e.path), T(e.message)]));
    const form = candidate !== undefined && parameterFormSupport(schema, candidate);
    const author = provider ? componentAuthor(component, candidateVersion) : undefined;
    let authorSupported = false;
    try {
      authorSupported =
        candidate !== undefined &&
        !!author?.supports(clone(candidate), { activity: candidateActivity });
    } catch {}

    useComponentDescriptor(
      wp,
      component,
      authorSupported ? author?.upgrade?.componentVersion : undefined,
    );
    const upgrade =
      authorSupported && author?.upgrade && find(component, author.upgrade.componentVersion);
    const currentIssues = (text, currentSchema = schema) => {
      try {
        const parsed = parse(text);
        componentParams(parsed, (code, message) => {
          throw Error(message);
        });
        return validateParameterSchema(parsed, currentSchema);
      } catch (e) {
        return [{ path: [], message: E(e) }];
      }
    };
    wp.element.useEffect(() => {
      const pending = drafts.get(clientId);
      if (pending) {
        // A replacement inspector can render before the previous instance's
        // final input event commits. Read the shared candidate again at commit
        // time, rather than relying only on the useState initializer.
        setRaw(pending.raw);
        setCandidateActivity(pending.activity ?? activity);
        setCandidateVersion(pending.componentVersion ?? componentVersion);
        setError(pending.error || '');
      } else {
        setRaw(original);
        setCandidateActivity(activity);
        setCandidateVersion(componentVersion);
        setError('');
        if (currentIssues(original, find(component, componentVersion)?.schema).length) {
          drafts.set(clientId, { raw: original, baseline: original, identity });
          syncDraftLock();
        }
      }
    }, [original, identity, JSON.stringify(schema)]);
    const change = (text, targetVersion = candidateVersion, consumeLocalDraft = false) => {
      authorLife.current.generation++;
      setCandidateVersion(targetVersion);
      setRaw(text);
      setError('');
      const prior = drafts.get(clientId);
      if (
        text === original &&
        targetVersion === componentVersion &&
        equal(candidateActivity, activity) &&
        (consumeLocalDraft || prior?.localDraft == null) &&
        !currentIssues(text).length
      )
        drafts.delete(clientId);
      else
        drafts.set(clientId, {
          raw: text,
          ...(candidateActivity ? { activity: clone(candidateActivity) } : {}),
          componentVersion: targetVersion,
          error: '',
          baseline: prior?.baseline ?? original,
          identity: prior?.identity ?? identity,
          ...(!consumeLocalDraft && prior?.localDraft != null
            ? { localDraft: prior.localDraft }
            : {}),
        });
      syncDraftLock();
      // A same-value update can still consume local input or rotate its callback.
      refreshLocalDraft((n) => n + 1);
    };
    const updateLocalDraft = (next) => {
      assertAuthorCurrent();
      const checked = componentLocalDraft(next);
      if (checked === null) change(raw, candidateVersion, true);
      else {
        const prior = drafts.get(clientId);
        authorLife.current.generation++;
        drafts.set(clientId, {
          raw,
          ...(candidateActivity ? { activity: clone(candidateActivity) } : {}),
          componentVersion: candidateVersion,
          error: '',
          baseline: prior?.baseline ?? original,
          identity: prior?.identity ?? identity,
          localDraft: checked,
        });
        setError('');
        syncDraftLock();
      }
      refreshLocalDraft((n) => n + 1);
    };
    const commit = () => {
      try {
        if (drafts.get(clientId)?.localDraft != null)
          throw Error(T('Prepare or discard local author edits before applying parameters.'));
        // Re-read the currently registered exact id/version, not author-supplied metadata.
        const registered = find(component, candidateVersion);
        if (activity && (!registered || registered.activityVersion !== 1))
          throw Error(
            T(
              'The component is missing or incompatible. Preserve its configuration or enable the matching extension before editing.',
            ),
          );
        if (candidateVersion !== componentVersion && !registered)
          throw Error(
            T(
              'The upgrade target is no longer registered. Discard the candidate or restore the extension.',
            ),
          );
        const parsed = parse(raw);
        componentParams(parsed, (code, message) => {
          throw Error(message);
        });
        const issues = validateParameterSchema(parsed, registered?.schema);
        if (issues.length)
          throw Error(parameterLabel(issues[0].path) + ': ' + T(issues[0].message));
        if (author?.apiVersion === 2) author.validate(parsed, candidateActivity);
        const pending = drafts.get(clientId);
        if (pending && (pending.identity !== identity || pending.baseline !== original))
          throw Error(
            T(
              'The component changed while this candidate was open. Review or discard the candidate.',
            ),
          );
        if (
          !equal(parsed, value) ||
          candidateVersion !== componentVersion ||
          !equal(candidateActivity, activity)
        )
          onCommit(parsed, {
            componentVersion: candidateVersion,
            ...(candidateActivity ? { activity: clone(candidateActivity) } : {}),
          });
        drafts.delete(clientId);
        authorLife.current.generation++;
        authorSession.current = {};
        refreshLocalDraft((n) => n + 1);
        syncDraftLock();
        setError('');
      } catch (e) {
        const message = E(e);
        setError(message);
        drafts.set(clientId, {
          raw,
          ...(candidateActivity ? { activity: clone(candidateActivity) } : {}),
          componentVersion: candidateVersion,
          error: message,
          baseline: drafts.get(clientId)?.baseline ?? original,
          identity: drafts.get(clientId)?.identity ?? identity,
          ...(drafts.get(clientId)?.localDraft != null
            ? { localDraft: drafts.get(clientId).localDraft }
            : {}),
        });
        syncDraftLock();
      }
    };
    const set = (path, next, remove) =>
      change(JSON.stringify(updateParameterValue(candidate, path, next, remove), null, 2));
    const render = (s, v, path, required = true, seed) => {
      const label = parameterLabel(path),
        issue = errors.get(keyOf(path));
      if (v === undefined)
        return el(
          'div',
          { key: keyOf(path), className: 'mbb-parameter-missing' },
          el(
            wp.components.Button,
            { variant: 'secondary', onClick: () => set(path, initialValue(s, seed)) },
            T('Add field') + ': ' + label,
          ),
          issue ? el('p', { role: 'alert' }, issue) : null,
        );
      const common = {
        key: keyOf(path),
        label,
        help: issue,
        'aria-invalid': issue ? 'true' : undefined,
      };
      let control;
      if (s.enum) {
        const options = s.enum.map((item, i) => ({
          label: typeof item === 'string' ? item : JSON.stringify(item),
          value: String(i),
        }));
        const index = s.enum.findIndex((item) => equal(v, item));
        if (index < 0)
          options.unshift({
            label: T('Current value is outside the registered choices'),
            value: '',
          });
        control = el(wp.components.SelectControl, {
          ...common,
          options,
          value: index < 0 ? '' : String(index),
          onChange: (n) => {
            if (n !== '') set(path, clone(s.enum[Number(n)]));
          },
        });
      } else if (s.type === 'object')
        control = el(
          'fieldset',
          { key: keyOf(path) },
          el('legend', {}, label),
          ...Object.entries(s.properties).map(([k, child]) =>
            render(child, v[k], [...path, k], (s.required || []).includes(k), seed?.[k]),
          ),
        );
      else if (s.type === 'array')
        control = el(
          'fieldset',
          { key: keyOf(path) },
          el('legend', {}, label),
          issue ? el('p', { role: 'alert' }, issue) : null,
          ...v.map((child, i) =>
            el(
              'div',
              {
                key: i,
                className:
                  'mbb-parameter-array-item' +
                  (['string', 'number', 'integer'].includes(s.items.type)
                    ? ' mbb-parameter-scalar-item'
                    : ''),
              },
              render(s.items, child, [...path, i], true, seed?.[i]),
              el(
                wp.components.Button,
                {
                  variant: 'tertiary',
                  disabled: v.length <= (s.minItems || 0),
                  onClick: () => set([...path, i], undefined, true),
                },
                T('Remove item') + ' ' + (i + 1),
              ),
            ),
          ),
          el(
            wp.components.Button,
            {
              variant: 'secondary',
              disabled: v.length >= s.maxItems,
              onClick: () => set(path, [...v, initialValue(s.items)]),
            },
            T('Add item') + ': ' + label,
          ),
        );
      else if (s.type === 'boolean')
        control = el(wp.components.ToggleControl, {
          ...common,
          checked: v === true,
          onChange: (next) => set(path, next),
        });
      else if (s.type === 'number' || s.type === 'integer')
        control = el(wp.components.TextControl, {
          ...common,
          type: 'text',
          inputMode: 'decimal',
          value: String(v),
          onChange: (text) => {
            const valid =
              /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text) &&
              Number.isFinite(Number(text));
            set(path, valid ? Number(text) : text);
          },
        });
      else
        control = el(wp.components.TextareaControl, {
          ...common,
          rows: 2,
          value: typeof v === 'string' ? v : JSON.stringify(v),
          onChange: (text) => set(path, text),
        });
      return required || !path.length
        ? control
        : el(
            'div',
            { key: keyOf(path) },
            control,
            el(
              wp.components.Button,
              { variant: 'tertiary', onClick: () => set(path, undefined, true) },
              T('Remove field') + ': ' + label,
            ),
          );
    };
    const draft = drafts.get(clientId);
    const notice =
      error ||
      (draft
        ? draft.baseline !== original || (draft.identity && draft.identity !== identity)
          ? T(
              'Applied configuration changed. The current candidate is preserved and unapplied. Saving is paused.',
            )
          : draft.localDraft != null
            ? T(
                'Local author edits are unapplied and not saved. Prepare or discard them to continue.',
              )
            : T(
                'Parameters are unapplied; article saving is paused. Apply or discard them to continue.',
              )
        : '');
    return el(
      'div',
      { className: 'mbb-parameter-editor' },
      form || (authorSupported && author?.Editor)
        ? el(
            'div',
            { className: 'mbb-parameter-modes' },
            authorSupported && author?.Editor
              ? el(
                  wp.components.Button,
                  {
                    variant: mode === 'author' ? 'primary' : 'secondary',
                    'aria-pressed': mode === 'author',
                    onClick: () => chooseMode('author'),
                  },
                  T('Visual editor'),
                )
              : null,
            form
              ? el(
                  wp.components.Button,
                  {
                    variant: mode === 'form' ? 'primary' : 'secondary',
                    'aria-pressed': mode === 'form',
                    onClick: () => chooseMode('form'),
                  },
                  T('Parameter form'),
                )
              : null,
            el(
              wp.components.Button,
              {
                variant: mode === 'json' ? 'primary' : 'secondary',
                'aria-pressed': mode === 'json',
                onClick: () => chooseMode('json'),
              },
              T('Advanced JSON'),
            ),
          )
        : null,
      el(
        'details',
        { className: 'mbb-parameter-technical' },
        el('summary', {}, T('Component details')),
        el('p', {}, component + '@' + candidateVersion),
        el('pre', {}, JSON.stringify(candidate, null, 2)),
      ),
      authorSupported && author?.Editor && mode === 'author'
        ? el(author.Editor, {
            wp,
            session,
            generation,
            baseline: JSON.stringify([identity, original, openingScope]),
            localDraft: clone(localDraft),
            onLocalDraftChange: updateLocalDraft,
            ...(author.apiVersion === 2
              ? {
                  activity: clone(candidateActivity ?? null),
                  parts: clone(parts),
                  onActivityChange(next) {
                    assertAuthorCurrent();
                    authorLife.current.generation++;
                    setCandidateActivity(clone(next));
                    const prior = drafts.get(clientId);
                    drafts.set(clientId, {
                      raw,
                      activity: clone(next),
                      componentVersion: candidateVersion,
                      error: '',
                      baseline: prior?.baseline ?? original,
                      identity: prior?.identity ?? identity,
                      ...(prior?.localDraft != null ? { localDraft: prior.localDraft } : {}),
                    });
                    syncDraftLock();
                  },
                }
              : {}),
            value: clone(candidate),
            onChange: (next, options = {}) => {
              assertAuthorCurrent();
              try {
                if (
                  !object(options) ||
                  Object.keys(options).some((k) => k !== 'consumeLocalDraft') ||
                  (own(options, 'consumeLocalDraft') &&
                    typeof options.consumeLocalDraft !== 'boolean')
                )
                  throw Error(T('Invalid local author draft'));
                componentParams(next, (code, message) => {
                  throw Error(message);
                });
                if (options.consumeLocalDraft === true) {
                  const current = find(component, candidateVersion);
                  if (!current)
                    throw Error(
                      T(
                        'The upgrade target is no longer registered. Discard the candidate or restore the extension.',
                      ),
                    );
                  const issues = validateParameterSchema(next, current.schema);
                  if (issues.length)
                    throw Error(parameterLabel(issues[0].path) + ': ' + T(issues[0].message));
                  if (author.apiVersion === 2) author.validate(next, candidateActivity);
                }
                change(
                  JSON.stringify(next, null, 2),
                  candidateVersion,
                  options.consumeLocalDraft === true,
                );
                return true;
              } catch (e) {
                setError(E(e));
                return false;
              }
            },
          })
        : form && mode === 'form'
          ? el(
              'div',
              { className: 'mbb-parameter-form' },
              render(schema, candidate, [], true, provider?.defaults),
            )
          : el(wp.components.TextareaControl, {
              label: T('Parameter JSON (data only)'),
              value: raw,
              onChange: change,
              help: form
                ? undefined
                : T(
                    'These parameters use the JSON editor. All fields are preserved; the server verifies them when saving.',
                  ),
            }),
      upgrade
        ? el(
            wp.components.Button,
            {
              variant: 'secondary',
              onClick: () => {
                try {
                  const next = author.upgrade.migrate(clone(candidate));
                  componentParams(next, (code, message) => {
                    throw Error(message);
                  });
                  const issues = validateParameterSchema(next, upgrade.schema);
                  if (issues.length) throw Error(T(issues[0].message));
                  change(JSON.stringify(next, null, 2), upgrade.version);
                  setMode('author');
                } catch (e) {
                  setError(E(e));
                }
              },
            },
            T('Upgrade diagram to use the visual editor'),
          )
        : null,
      candidateVersion !== componentVersion
        ? el(
            'p',
            { role: 'status' },
            T('Unapplied component version change:') +
              ' ' +
              componentVersion +
              ' → ' +
              candidateVersion,
          )
        : null,
      notice || parseError
        ? el('p', { role: error ? 'alert' : 'status' }, notice || parseError)
        : null,
      el(wp.components.Button, { variant: 'primary', onClick: commit }, T('Apply parameters')),
      el(
        wp.components.Button,
        {
          variant: 'tertiary',
          onClick: () => {
            drafts.delete(clientId);
            authorLife.current.generation++;
            refreshLocalDraft((n) => n + 1);
            setCandidateVersion(componentVersion);
            authorSession.current = {};
            if (currentIssues(original, find(component, componentVersion)?.schema).length)
              drafts.set(clientId, { raw: original, baseline: original, identity });
            syncDraftLock();
            setRaw(original);
            setCandidateActivity(activity);
            setError('');
          },
        },
        T('Discard parameter input'),
      ),
    );
  };
}
