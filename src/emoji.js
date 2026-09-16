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
    node.nodeValue = node.nodeValue.replace(
      /:([a-zA-Z0-9_+\-]+):/g,
      (match, name) => emojis.lib[name]?.char ?? match,
    );
  }
}
if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', () => renderEmoji(document.body));
else renderEmoji(document.body);
