// G-ALG-0: deterministic layout seed.
//
// fCoSE has no seedable RNG, so determinism is achieved structurally:
//   1. fixed initial positions derived from a stable hash of each node id
//      (same graph ⇒ same starting geometry, on every machine, forever);
//   2. the renderer runs fCoSE with randomize:false against these positions;
//   3. the resulting coordinates are versioned server-side
//      (graph_layout_versions) so a re-visit replays a stored layout instead
//      of re-rolling one.
//
// This module implements step 1 only: a phyllotaxis (golden-angle spiral)
// placement keyed by each node's id hash. Pure; no DOM; no imports beyond
// node:crypto-free integer hashing (FNV-1a, implemented inline so the module
// also runs in the browser without a crypto polyfill).

// FNV-1a 32-bit hash — stable across engines (pure integer ops, no Math.random).
export function hashId(id) {
  let h = 0x811c9dc5
  const s = String(id)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)) // ≈ 2.399963 rad

/**
 * Deterministic phyllotaxis position for one node id.
 * The id hash sets the radial rank and angular offset; spacing scales with
 * sqrt(index) so density stays uniform as the graph grows.
 *
 * @param {string} id - node id.
 * @param {{ spacing?: number }} [opts]
 * @returns {{ x: number, y: number }}
 */
export function seedPosition(id, { spacing = 40 } = {}) {
  const h = hashId(id)
  const index = h % 100000 // stable pseudo-rank from the id
  const angle = index * GOLDEN_ANGLE + (h / 0xffffffff) * Math.PI * 2
  const radius = spacing * Math.sqrt(index + 0.5)
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) }
}

/**
 * Seed positions for every node of a Graphology graph (as a plain
 * { id: {x, y} } map — Graphology-free so it can hash/serialize cheaply).
 * Deterministic for a given node-id set.
 */
export function seedPositions(nodeIds, opts) {
  const positions = {}
  for (const id of nodeIds ?? []) positions[String(id)] = seedPosition(String(id), opts)
  return positions
}

/**
 * Attach seeded positions to a Graphology graph as x/y node attributes
 * (the shape cytoscape-fcose consumes via its `positions` option when
 * randomize:false). Returns the same map seedPositions would produce.
 */
export function applySeedPositions(graph, opts) {
  const positions = seedPositions(graph.nodes(), opts)
  for (const [id, p] of Object.entries(positions)) {
    graph.setNodeAttribute(id, 'x', p.x)
    graph.setNodeAttribute(id, 'y', p.y)
  }
  return positions
}
