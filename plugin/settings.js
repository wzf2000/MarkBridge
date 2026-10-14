(() => {
  const start = () => {
    for (const form of document.querySelectorAll('.mbb-settings form')) {
      const fields = form.querySelector('[data-mbb-node-fields]');
      if (!fields) continue;
      const update = () => {
        fields.hidden =
          form.querySelector('input[name="converter[backend]"]:checked')?.value === 'php';
      };
      form.addEventListener('change', update);
      update();
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
