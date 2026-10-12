// Provider-independent envelope validation. Author parameters never contain resources.
export function componentParams(value, fail) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('COMPONENT_PARAMS', '组件参数必须为 JSON 对象');
  let nodes = 0;
  const walk = (v, depth) => {
    if (++nodes > 1024 || depth > 8) fail('COMPONENT_PARAMS', '组件参数超过深度或节点预算');
    if (v === null || typeof v === 'boolean') return;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) fail('COMPONENT_PARAMS', '组件数字必须有限');
      return;
    }
    if (typeof v === 'string') {
      if (/[\uD800-\uDFFF]/u.test(v)) fail('COMPONENT_PARAMS', '组件文字必须为有效 Unicode');
      return;
    }
    if (typeof v !== 'object') fail('COMPONENT_PARAMS', '组件参数只能是 JSON 数据');
    for (const [key, child] of Object.entries(v)) {
      if (/[\uD800-\uDFFF]/u.test(key) || ['__proto__', 'prototype', 'constructor'].includes(key))
        fail('COMPONENT_PARAMS', '组件属性名称非法');
      walk(child, depth + 1);
    }
  };
  walk(value, 0);
  if (new TextEncoder().encode(JSON.stringify(value)).length > 16384)
    fail('COMPONENT_PARAMS', '组件参数最多 16 KiB');
  return value;
}
