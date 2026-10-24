// Fixed Main-owned HTTP frame bridge. No article source, paths or nonce are embedded here.
(() => {
  'use strict';
  // Replaced only by the Main-owned HTTP response, never by article/query data.
  const executionProfile = __MBB_FRAME_EXECUTION_PROFILE__;
  function readingLayout(protocol, token, activity) {
    let active = true,
      pending = false,
      previous = 0;
    const measure = () => {
      pending = false;
      if (!active || !document.body) return;
      const body = document.body;
      const children = [...body.children].filter((n) => !['SCRIPT', 'STYLE'].includes(n.tagName));
      // height:auto/min-height:0 in the fixed reading style makes this the natural
      // body box, including padding and descendant margins collapsed past <main>.
      // Unlike scrollHeight/clientHeight it has no current-viewport floor, so it can shrink.
      const bottom = Math.max(
        body.getBoundingClientRect().bottom +
          scrollY +
          (parseFloat(getComputedStyle(body).marginBottom) || 0),
        ...children.map((n) => {
          const rect = n.getBoundingClientRect();
          return rect.bottom + scrollY + (parseFloat(getComputedStyle(n).marginBottom) || 0);
        }),
      );
      const height = Math.min(4096, Math.max(160, Math.ceil(bottom + 2)));
      if (height !== previous) {
        previous = height;
        parent.postMessage({ protocol, session: token, type: 'layout-size', height }, '*');
      }
    };
    const schedule = () => {
      if (active && !pending) {
        pending = true;
        requestAnimationFrame(measure);
      }
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    const mutations = new MutationObserver(schedule);
    const start = () => {
      if (!active) return;
      observer?.observe(document.body);
      mutations.observe(document.body, { childList: true, subtree: true, attributes: true });
      document.fonts?.ready.then(schedule);
      schedule();
    };
    const dispose = () => {
      active = false;
      observer?.disconnect();
      mutations.disconnect();
      removeEventListener('resize', schedule);
      removeEventListener('message', cancel);
      document.removeEventListener('change', answer);
      document.removeEventListener('click', reset);
    };
    const cancel = (event) => {
      if (
        event.source === parent &&
        event.data?.protocol === protocol &&
        event.data.session === token &&
        event.data.type === 'cancel'
      )
        dispose();
    };
    const answer = (event) => {
      if (active && activity && event.target.matches?.('input[type="radio"]')) {
        const check = document.getElementById('check');
        if (check && !check.disabled) check.click();
      }
    };
    const reset = (event) => {
      if (active && activity && event.target.closest?.('#reset'))
        parent.postMessage({ protocol, session: token, type: 'activity-reset' }, '*');
    };
    document.addEventListener('change', answer);
    document.addEventListener('click', reset);
    addEventListener('message', cancel);
    addEventListener('resize', schedule);
    addEventListener('pagehide', dispose, { once: true });
    if (document.readyState === 'loading')
      document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
  const style = document.createElement('style');
  const readingStyle =
    'html,body{height:auto!important;min-height:0!important;min-block-size:0!important;overscroll-behavior:auto!important}body *:not(svg,svg *,textarea,input,select){max-height:none!important;max-block-size:none!important;overscroll-behavior:auto!important}';
  style.textContent = readingStyle;
  (document.head || document.documentElement).append(style);
  const initialize = (event) => {
    const data = event.data;
    if (
      parent === window ||
      event.source !== parent ||
      data?.protocol !== 'mbb-component/v2' ||
      data.type !== 'init' ||
      (executionProfile === null
        ? Object.hasOwn(data, 'executionProfile')
        : data.executionProfile !== executionProfile) ||
      typeof data.session !== 'string' ||
      !/^[a-f0-9]{32}$/.test(data.session)
    )
      return;
    removeEventListener('message', initialize);
    readingLayout('mbb-component/v2', data.session, !!data.activity);
  };
  addEventListener('message', initialize);
})();
