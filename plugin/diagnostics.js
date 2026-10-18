(() => {
  'use strict';
  if (window.MBB_DIAGNOSTICS) return;
  const T = (message) => globalThis.MBBI18n?.t(message) ?? message;
  const stages = new Set([
    'resource',
    'integrity',
    'initialization',
    'typesetting',
    'font',
    'execution',
  ]);
  const codes = new Set([
    'UNAVAILABLE',
    'NETWORK',
    'HTTP',
    'RESOURCE_SIZE',
    'RESOURCE_TYPE',
    'RESOURCE_ORIGIN',
    'DIGEST',
    'UNSUPPORTED',
    'BUSY',
    'STARTUP_TIMEOUT',
    'INITIALIZATION',
    'NAVIGATION',
    'PROTOCOL',
    'RUN_BUDGET',
    'EXECUTION',
    'TYPESET',
    'TYPESET_TIMEOUT',
    'FONT',
    'FONT_SIZE',
    'FONT_INVALID',
  ]);
  const records = new WeakMap();
  const version = (value) =>
    typeof value === 'string' &&
    /^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/i.test(value) &&
    value.length <= 64
      ? value
      : undefined;
  const elapsed = (start) =>
    Math.min(180000, Math.max(0, Math.round((performance.now() - start) / 10) * 10));
  function begin(feature, component) {
    const start = performance.now();
    let stage = feature === 'math' ? 'initialization' : 'resource';
    const durations = {};
    let stageStart = start;
    const id =
      typeof component?.id === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(component.id)
        ? component.id
        : undefined;
    return {
      stage(next) {
        if (!stages.has(next)) return;
        durations[stage] = Math.min(180000, (durations[stage] || 0) + elapsed(stageStart));
        stage = next;
        stageStart = performance.now();
      },
      failure(code) {
        return Object.freeze({
          schema: 1,
          pluginVersion: version(window.MBB_DIAGNOSTICS_CONFIG?.version),
          feature: feature === 'math' ? 'math' : 'component',
          component: id,
          componentVersion: version(component?.version),
          stage,
          code: codes.has(code) ? code : 'UNAVAILABLE',
          elapsedMs: elapsed(start),
          stagesMs: Object.freeze({
            ...durations,
            [stage]: Math.min(180000, (durations[stage] || 0) + elapsed(stageStart)),
          }),
        });
      },
    };
  }
  function clear(parent) {
    records.delete(parent);
    parent.querySelectorAll(':scope > .mbb-diagnostic').forEach((node) => node.remove());
  }
  function show(parent, input) {
    clear(parent);
    const record = Object.freeze({
      schema: 1,
      pluginVersion: version(window.MBB_DIAGNOSTICS_CONFIG?.version),
      feature: input?.feature === 'math' ? 'math' : 'component',
      component:
        typeof input?.component === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(input.component)
          ? input.component
          : undefined,
      componentVersion: version(input?.componentVersion),
      code: codes.has(input?.code) ? input.code : 'UNAVAILABLE',
      stage: stages.has(input?.stage) ? input.stage : 'initialization',
      elapsedMs: Number.isFinite(input?.elapsedMs)
        ? Math.min(180000, Math.max(0, Math.round(input.elapsedMs / 10) * 10))
        : 0,
      stagesMs: Object.fromEntries(
        [...stages]
          .map((k) => [k, input?.stagesMs?.[k]])
          .filter(([, v]) => Number.isFinite(v) && v >= 0 && v <= 180000)
          .map(([k, v]) => [k, Math.round(v / 10) * 10]),
      ),
    });
    // Only closed, locally generated fields are serialized. No exception text,
    // document contents, resource URLs, browser identity, or credentials enter it.
    if (window.MBB_DIAGNOSTICS_CONFIG?.canCopy !== true) return;
    records.set(parent, record);
    const details = document.createElement('details');
    details.className = 'mbb-diagnostic';
    details.dataset.mbbGenerated = '';
    const summary = document.createElement('summary');
    summary.textContent = T('Technical details');
    const description = document.createElement('p');
    description.textContent = T('This summary contains versions, error codes and timings only.');
    const source = document.createElement('textarea');
    source.readOnly = true;
    source.rows = 8;
    source.setAttribute('aria-label', T('Diagnostic summary'));
    source.value = JSON.stringify(record, null, 2);
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = T('Copy diagnostic summary');
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(source.value);
        if (details.isConnected && records.get(parent) === record)
          status.textContent = T('Diagnostic summary copied.');
      } catch {
        if (!details.isConnected || records.get(parent) !== record) return;
        source.focus();
        source.select();
        status.textContent = T('Automatic copy failed. Select the summary to copy it manually.');
      }
    };
    details.append(summary, description, source, copy, status);
    parent.append(details);
  }
  window.MBB_DIAGNOSTICS = Object.freeze({ begin, show, clear });
})();
