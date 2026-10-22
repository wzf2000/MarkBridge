// Local synthetic security probe only. Never shipped as a Scientific runtime.
'use strict';
onmessage = async ({ data }) => {
  const result = { compiled: false, networkBlocked: false, evalBlocked: false };
  try {
    const m = await WebAssembly.compile(data.module);
    result.compiled = WebAssembly.Module.imports(m).length === 0;
  } catch {}
  try {
    await fetch(data.probe, { mode: 'no-cors', credentials: 'omit' });
  } catch {
    result.networkBlocked = true;
  }
  try {
    Function('return 1')();
  } catch {
    result.evalBlocked = true;
  }
  postMessage(result);
};
