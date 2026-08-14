// Mobile graph entry: top-N hubs ranked by degree centrality.
// Extracted from App.jsx 2026-08-14 after the e7e35b9 transcription
// regression corrupted the degree expression inline (`degree` became the
// node's UUID string, which produced the "actor · <uuid>" hub-meta render
// and broke the ranking). tests/hubs.test.mjs pins degree as a NUMBER so
// that class of edit fails CI instead of shipping.
export function computeHubs(nodes, edges, size = 30) {
  const degree = new Map()
  edges.forEach((e) => {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1)
  })
  return nodes
    .map((n) => ({ node: n, degree: degree.get(n.id ?? n.slug) ?? 0 }))
    .sort((a, b) => b.degree - a.degree)
    .slice(0, size)
}
