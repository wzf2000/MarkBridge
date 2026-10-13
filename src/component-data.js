// Provider-independent envelope validation. Author parameters never contain resources.
export function componentParams(value, fail) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('COMPONENT_PARAMS', 'Component parameters must be a JSON object');
  let nodes = 0;
  const walk = (v, depth) => {
    if (++nodes > 1024 || depth > 8)
      fail('COMPONENT_PARAMS', 'Component parameters exceed the depth or node budget');
    if (v === null || typeof v === 'boolean') return;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) fail('COMPONENT_PARAMS', 'Component numbers must be finite');
      return;
    }
    if (typeof v === 'string') {
      if (/[\uD800-\uDFFF]/u.test(v))
        fail('COMPONENT_PARAMS', 'Component text must be valid Unicode');
      return;
    }
    if (typeof v !== 'object')
      fail('COMPONENT_PARAMS', 'Component parameters must contain only JSON data');
    for (const [key, child] of Object.entries(v)) {
      if (/[\uD800-\uDFFF]/u.test(key) || ['__proto__', 'prototype', 'constructor'].includes(key))
        fail('COMPONENT_PARAMS', 'Invalid component property name');
      walk(child, depth + 1);
    }
  };
  walk(value, 0);
  if (new TextEncoder().encode(JSON.stringify(value)).length > 16384)
    fail('COMPONENT_PARAMS', 'Component parameters are limited to 16 KiB');
  return value;
}
