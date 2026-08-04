// G-ALG-0: input checkpoint hashing.
//
// Every derived row (layout version, community assignment, metric snapshot)
// references a graph_checkpoints row identified by two sha256 hashes:
//   nodes_hash — over the canonical serialization of the node set
//   edges_hash — over the canonical serialization of the edge set
// Same input ⇒ same hashes ⇒ derived data is provably computed against the
// graph state it claims to describe. Drift (new ingestion, deletions) changes
// the hashes and invalidates derived rows by construction.
//
// Canonicalization rules (must stay stable forever once shipped):
//   - rows reduced to their whitelisted model attributes
//     (src/analysis/graphModel.js NODE_ATTRIBUTES / EDGE_ATTRIBUTES);
//   - object keys sorted lexicographically at every depth;
//   - rows sorted by id (nodes) and by (source, target, id) (edges);
//   - undefined values dropped, null preserved, numbers via JSON.stringify.
//
// Uses node:crypto (tests + any future Node-side writer). Browser consumers
// must not import this module — the read path fetches stored checkpoints.

import { createHash } from 'node:crypto'
import { NODE_ATTRIBUTES, EDGE_ATTRIBUTES } from './graphModel.js'

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) out[key] = canonicalize(value[key])
    }
    return out
  }
  return value
}

function pickDefined(row, keys) {
  const out = {}
  for (const k of keys) {
    if (row[k] !== undefined) out[k] = row[k]
  }
  return out
}

/** Canonical node rows: whitelisted attributes, sorted by string id. */
export function canonicalNodeRows(nodeRows) {
  return (nodeRows ?? [])
    .map((r) => pickDefined(r, NODE_ATTRIBUTES))
    .map(canonicalize)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
}

/** Canonical edge rows: whitelisted attributes, sorted by (source, target, id). */
export function canonicalEdgeRows(edgeRows) {
  return (edgeRows ?? [])
    .map((r) => pickDefined(r, EDGE_ATTRIBUTES))
    .map(canonicalize)
    .sort((a, b) => {
      const s = String(a.source).localeCompare(String(b.source))
      if (s !== 0) return s
      const t = String(a.target).localeCompare(String(b.target))
      if (t !== 0) return t
      return String(a.id ?? '').localeCompare(String(b.id ?? ''))
    })
}

export function hashRows(rows) {
  return createHash('sha256').update(JSON.stringify(canonicalize(rows))).digest('hex')
}

/**
 * Compute the checkpoint identity of a graph input.
 * @returns {{ node_count: number, edge_count: number, nodes_hash: string, edges_hash: string }}
 *   Exact column set of graph_checkpoints (minus id/created_at), ready to insert.
 */
export function computeCheckpoint(nodeRows, edgeRows) {
  const nodes = canonicalNodeRows(nodeRows)
  const edges = canonicalEdgeRows(edgeRows)
  return {
    node_count: nodes.length,
    edge_count: edges.length,
    nodes_hash: hashRows(nodes),
    edges_hash: hashRows(edges),
  }
}
