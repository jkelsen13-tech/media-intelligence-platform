// G-ALG-0: graph model — rows → Graphology DirectedGraph.
//
// Pure, deterministic, no DOM, no supabase import: callers pass plain node and
// edge rows (the same shapes loadGraph() returns from Supabase or demoData
// provides offline) and receive a Graphology graph ready for headless
// analysis (layouts, communities, metrics).
//
// Boundary rule (owner-approved G-ALG-0 scope): this module READS row data
// handed to it. It never fetches and never writes — persistence into the
// graph_* derived tables happens in a separately authorized writer slice.
//
// Attribute policy: every attribute copied from a row is whitelisted below so
// analysis results depend only on declared inputs (keeps checkpoint hashing
// honest — see src/analysis/checkpoint.js).

import Graph from 'graphology'

export const NODE_ATTRIBUTES = Object.freeze(['id', 'slug', 'label', 'type', 'arc_id', 'confidence', 'occurred_at'])
export const EDGE_ATTRIBUTES = Object.freeze(['id', 'source_id', 'target_id', 'type', 'signal_source', 'doc_strength', 'reliability', 'similarity'])

function pick(row, keys) {
  const out = {}
  for (const k of keys) {
    if (row[k] !== undefined) out[k] = row[k]
  }
  return out
}

/**
 * Build a Graphology DirectedGraph from node and edge rows.
 *
 * @param {Array<object>} nodeRows - rows with at least an `id`.
 * @param {Array<object>} edgeRows - rows with `source_id` and `target_id` node ids.
 * @returns {{ graph: Graph, droppedEdges: Array<object> }}
 *   droppedEdges lists edges referencing unknown endpoints (they are excluded
 *   from the model, never silently re-pointed) so callers can audit them.
 *
 * Duplicate node ids are rejected: the checkpoint hash assumes a 1:1 row→node
 * mapping, and a silent merge would make analysis non-reproducible.
 */
export function buildGraphModel(nodeRows, edgeRows) {
  const graph = new Graph({ type: 'directed', multi: false })
  for (const row of nodeRows ?? []) {
    if (row == null || row.id == null) {
      throw new Error('buildGraphModel: node row missing id')
    }
    const id = String(row.id)
    if (graph.hasNode(id)) {
      throw new Error(`buildGraphModel: duplicate node id ${id}`)
    }
    graph.addNode(id, pick(row, NODE_ATTRIBUTES))
  }
  const droppedEdges = []
  for (const row of edgeRows ?? []) {
    if (row == null || row.source_id == null || row.target_id == null) continue
    const source = String(row.source_id)
    const target = String(row.target_id)
    if (!graph.hasNode(source) || !graph.hasNode(target)) {
      droppedEdges.push({ id: row.id ?? null, source_id: source, target_id: target, reason: 'unknown-endpoint' })
      continue
    }
    const key = row.id != null ? String(row.id) : undefined
    if (key != null && graph.hasEdge(key)) {
      throw new Error(`buildGraphModel: duplicate edge id ${key}`)
    }
    if (key != null) graph.addEdgeWithKey(key, source, target, pick(row, EDGE_ATTRIBUTES))
    else graph.addEdge(source, target, pick(row, EDGE_ATTRIBUTES))
  }
  return { graph, droppedEdges }
}

/**
 * Serialize a graph back to plain row arrays (stable order: insertion order).
 * Inverse of buildGraphModel for checkpoint + persistence code.
 */
export function graphToRows(graph) {
  const nodes = graph.mapNodes((id, attrs) => ({ id, ...attrs }))
  const edges = graph.mapEdges((key, attrs, source, target) => ({ id: key, source_id: source, target_id: target, ...attrs }))
  return { nodes, edges }
}
