// The core owns relationships, not question types or answer rules. No second body.
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const closed = (v, keys) =>
  object(v) && Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));
const id = (v) => typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(v);
export function activityRelations(value, fail) {
  const bad = () =>
    fail(
      'ACTIVITY_RELATION',
      'Activity relations require a closed map of unique local static targets',
    );
  if (
    !closed(value, ['schema', 'prompt', 'options', 'hints', 'feedback', 'explanation']) ||
    value.schema !== 1 ||
    !id(value.prompt) ||
    !id(value.explanation) ||
    !Array.isArray(value.options) ||
    value.options.length > 8 ||
    !Array.isArray(value.hints) ||
    value.hints.length > 3 ||
    !value.hints.every(id) ||
    !closed(value.feedback, ['correct', 'incorrect']) ||
    !id(value.feedback.correct) ||
    !id(value.feedback.incorrect)
  )
    bad();
  const keys = new Set();
  for (const option of value.options) {
    if (
      !closed(option, ['key', 'target']) ||
      typeof option.key !== 'string' ||
      !/^[a-z][a-z0-9_-]{0,15}$/.test(option.key) ||
      keys.has(option.key) ||
      !id(option.target)
    )
      bad();
    keys.add(option.key);
  }
  const targets = [
    value.prompt,
    ...value.options.map((o) => o.target),
    ...value.hints,
    value.feedback.correct,
    value.feedback.incorrect,
    value.explanation,
  ];
  if (new Set(targets).size !== targets.length) bad();
  return targets;
}
export function activityParts(block) {
  const parts = new Map();
  const visit = (list) => {
    for (const child of list || []) {
      if ((child.name || child.blockName) === 'mbb/component') continue;
      if ((child.name || child.blockName) === 'mbb/collapse')
        parts.set((child.attributes || child.attrs).id, child);
      visit(child.innerBlocks);
    }
  };
  visit(block.innerBlocks);
  return parts;
}
export function validateActivity(block, fail) {
  const a = block.attributes || block.attrs;
  if (a?.version !== 2 || (block.name || block.blockName) !== 'mbb/component') return;
  const targets = activityRelations(a.activity, fail),
    parts = activityParts(block),
    direct = new Map(
      (block.innerBlocks || [])
        .filter((b) => (b.name || b.blockName) === 'mbb/collapse')
        .map((b) => [(b.attributes || b.attrs).id, b]),
    );
  if (
    targets.some((target) => !parts.has(target)) ||
    [a.activity.prompt, ...a.activity.options.map((o) => o.target)].some(
      (target) =>
        !direct.has(target) ||
        (direct.get(target).attributes || direct.get(target).attrs).open !== true,
    )
  )
    fail(
      'ACTIVITY_TARGET',
      'Activity targets must exist within their own component; prompts and options must be direct open static parts',
    );
}
