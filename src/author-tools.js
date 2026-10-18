import { translate as T } from './i18n.js';
// Trusted author code only. This registry never owns article persistence.
const tools = new Map();
const clone = (v) => JSON.parse(JSON.stringify(v));
const token = /^[a-z][a-z0-9-]{0,63}$/;
export function registerAuthorTool(d) {
  if (
    !d ||
    Object.keys(d).sort().join(',') !== 'Editor,id,slot,version' ||
    typeof d.id !== 'string' ||
    !token.test(d.id) ||
    typeof d.version !== 'string' ||
    !/^\d+\.\d+\.\d+$/.test(d.version) ||
    d.slot !== 'bibliography/v2' ||
    typeof d.Editor !== 'function' ||
    tools.size >= 32 ||
    tools.has(d.id)
  )
    throw Error(T('Invalid or duplicate author tool registration'));
  tools.set(d.id, Object.freeze({ ...d }));
}
function scope() {
  const cfg = globalThis.MBB_EDITOR;
  return JSON.stringify([
    cfg?.postId || 0,
    cfg?.state?.expected || null,
    cfg?.state?.source_sha256 || null,
  ]);
}
export function AuthorTools({ slot, draft, change, registry, clientId, session }) {
  const { useRef, useEffect, createElement: el } = wp.element;
  const state = useRef({ signature: '', generation: 0, active: true });
  const signature = JSON.stringify([clientId, scope(), draft]);
  if (state.current.signature !== signature) {
    state.current.signature = signature;
    state.current.generation++;
  }
  const generation = state.current.generation,
    openingScope = scope();
  useEffect(() => {
    state.current.active = true;
    return () => {
      state.current.active = false;
      state.current.generation++;
    };
  }, [clientId]);
  const patch = (value) => {
    if (
      !state.current.active ||
      state.current.generation !== generation ||
      openingScope !== scope()
    )
      throw Error(T('The author candidate changed. Preview again.'));
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).some((k) => !['entries', 'origins', 'style'].includes(k)) ||
      ['entries', 'origins'].some(
        (k) =>
          Object.hasOwn(value, k) &&
          (!Array.isArray(value[k]) ||
            value[k].length > 64 ||
            value[k].some(
              (v) => !v || typeof v !== 'object' || Array.isArray(v) || typeof v.key !== 'string',
            )),
      ) ||
      (Object.hasOwn(value, 'style') && !['numeric', 'author-year'].includes(value.style)) ||
      new TextEncoder().encode(JSON.stringify(value)).length > 262144
    )
      throw Error(T('Invalid author candidate patch'));
    const claimed = ++state.current.generation;
    try {
      change(clone(value));
    } catch (error) {
      if (state.current.generation === claimed) state.current.generation--;
      throw error;
    }
  };
  return el(
    'div',
    { className: 'mbb-author-tools' },
    ...[...tools.values()]
      .filter((d) => d.slot === slot)
      .map((d) =>
        el(d.Editor, {
          key: d.id,
          draft: clone(draft),
          change: patch,
          registry,
          clientId,
          session,
          generation,
          baseline: signature,
        }),
      ),
  );
}
globalThis.MarkBridgeAuthorTools = Object.freeze({ apiVersion: 1, register: registerAuthorTool });
// Existing typed registries remain the authority for their own candidates/grants.
globalThis.MarkBridgeExtensions = Object.freeze({
  apiVersion: 1,
  registerAuthorTool,
  registerComponentAuthor(d) {
    return globalThis.MarkBridgeComponentAuthors.register(d);
  },
  registerPublicationClient(id, d) {
    return globalThis.MarkBridgeCollections.registerClient(id, d);
  },
});
