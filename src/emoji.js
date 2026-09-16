import emojis from 'emojilib';
// Unicode uses the reader's own emoji font. No inherited emoji image pack is redistributed.
function renderEmoji(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (
      node.parentElement?.closest(
        'pre,code,script,style,textarea,[contenteditable],.mbb-math,.mbb-typeset',
      )
    )
      continue;
    const images = window.MBB_EMOJI_IMAGES || {};
    const parts = node.nodeValue.split(/(:[a-zA-Z0-9_+\-]+:)/g);
    if (parts.length === 1) continue;
    const fragment = document.createDocumentFragment();
    for (const part of parts) {
      const name = part.startsWith(':') && part.endsWith(':') ? part.slice(1, -1) : '';
      const fallback = emojis.lib[name]?.char ?? part;
      if (name && Object.hasOwn(images, name)) {
        const img = document.createElement('img');
        img.src = images[name];
        img.alt = part;
        img.width = img.height = 20;
        img.className = 'mbb-emoji';
        img.style.cssText = 'display:inline-block;width:1.25em;height:1.25em;vertical-align:middle';
        img.addEventListener('error', () => img.replaceWith(document.createTextNode(fallback)), {
          once: true,
        });
        fragment.append(img);
      } else fragment.append(document.createTextNode(fallback));
    }
    node.replaceWith(fragment);
  }
}
if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', () => renderEmoji(document.body));
else renderEmoji(document.body);
