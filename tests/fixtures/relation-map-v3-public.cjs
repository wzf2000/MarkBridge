const opaque = (kind, i) => kind + '_' + i.toString(16).padStart(32, '0');
const map = {
  format: 'relation-map/v1',
  title: 'Dense public relationships',
  groups: [{ id: opaque('g', 1), title: 'A group' }],
  nodes: Array.from({ length: 16 }, (_, i) => ({
    id: opaque('n', i),
    group: opaque('g', 1),
    title: 'Article ' + i,
    description: 'Reader details for this article and its relationship.',
    url: 'https://example.test/reader/article/' + i,
  })),
  edges: [],
};
for (let from = 0; from < 16 && map.edges.length < 128; from++)
  for (let to = 0; to < 16 && map.edges.length < 128; to++)
    if (from !== to)
      map.edges.push({ from: opaque('n', from), to: opaque('n', to), kind: 'recommended' });
const edgeIds = map.edges.map((_, i) => opaque('e', i));
module.exports = { map, edgeIds };
