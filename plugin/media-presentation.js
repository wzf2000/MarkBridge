(() => {
  const T = (message) => globalThis.MBBI18n?.t(message) ?? message;
  const failures = new WeakMap();
  const managed = (image) =>
    image instanceof HTMLImageElement && image.closest('[data-mbb-content-view],.mbb-document');
  function failed(image) {
    if (!managed(image)) return;
    let url;
    try {
      url = new URL(image.currentSrc || image.getAttribute('src'), document.baseURI);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return;
    } catch {
      return;
    }
    const existing = failures.get(image);
    if (existing) {
      existing.querySelector('a').href = url.href;
      existing.querySelector('a').textContent = image.alt.trim() || T('Open the original image');
      return;
    }
    const fallback = document.createElement('span');
    fallback.className = 'mbb-image-unavailable';
    fallback.dataset.mbbGenerated = '';
    const label = document.createElement('span');
    label.textContent = T('Image unavailable.');
    const link = document.createElement('a');
    link.href = url.href;
    link.rel = 'noreferrer noopener';
    link.textContent = image.alt.trim() || T('Open the original image');
    fallback.append(label, ' ', link);
    // Never nest a new image link inside an author's separate destination link.
    const surrounding = image.closest('a');
    (surrounding || image).after(fallback);
    image.classList.add('mbb-image-failed');
    failures.set(image, fallback);
  }
  document.addEventListener('error', (event) => failed(event.target), true);
  document.addEventListener(
    'load',
    (event) => {
      const image = event.target;
      if (!managed(image) || !image.naturalWidth) return;
      failures.get(image)?.remove();
      failures.delete(image);
      image.classList.remove('mbb-image-failed');
    },
    true,
  );
  const check = () => {
    for (const image of document.querySelectorAll('[data-mbb-content-view] img,.mbb-document img'))
      if (image.complete && !image.naturalWidth && image.getAttribute('src')) failed(image);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', check);
  else check();
})();
