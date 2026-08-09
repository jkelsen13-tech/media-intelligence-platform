// G-ALG-0 — checkpoint hashing suite.
// Proves: checkpoint identity is deterministic (same input ⇒ same hashes),
// sensitive to real change (added node/edge, relabel, retype ⇒ new hashes),
// insensitive to row order and non-whitelisted fields (embedding, fetched_at),
// and exactly matches the graph_checkpoints column shape.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  computeCheckpoint,
  canonicalNodeRows,
  canonicalEdgeRows,
  hashRows,
} from '../../src/analysis/checkpoint.js'

const fx = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'golden', 'fixtures', 'graph_fixture.json'), 'utf8'),
)

const SHA256_RE = /^[0-9a-f]{64}$/

test('checkpoint: column shape and counts match graph_checkpoints', () => {
  const cp = computeCheckpoint(fx.nodes, fx.edges)
  assert.deepEqual(Object.keys(cp).sort(), ['edge_count', 'edges_hash', 'node_count', 'nodes_hash'])
  assert.equal(cp.node_count, fx.expect.node_count)
  assert.equal(cp.edge_count, fx.expect.edge_count)
  assert.match(cp.nodes_hash, SHA256_RE)
  assert.match(cp.edges_hash, SHA256_RE)
})

test('checkpoint: deterministic — identical input recomputes to identical hashes', () => {
  const a = computeCheckpoint(fx.nodes, fx.edges)
  const b = computeCheckpoint(
    JSON.parse(JSON.stringify(fx.nodes)),
    JSON.parse(JSON.stringify(fx.edges)),
  )
  assert.deepEqual(a, b)
})

test('checkpoint: insensitive to row order', () => {
  const a = computeCheckpoint(fx.nodes, fx.edges)
  const b = computeCheckpoint([...fx.nodes].reverse(), [...fx.edges].reverse())
  assert.equal(a.nodes_hash, b.nodes_hash)
  assert.equal(a.edges_hash, b.edges_hash)
})

test('checkpoint: insensitive to non-whitelisted fields (embedding, fetched_at)', () => {
  const taintedNodes = fx.nodes.map((n) => ({ ...n, embedding: [0.1, 0.2], fetched_at: '2026-08-04T00:00:00Z' }))
  const taintedEdges = fx.edges.map((e) => ({ ...e, created_at: '2026-08-04T00:00:00Z', evidence: 'x' }))
  const a = computeCheckpoint(fx.nodes, fx.edges)
  const b = computeCheckpoint(taintedNodes, taintedEdges)
  assert.equal(a.nodes_hash, b.nodes_hash)
  assert.equal(a.edges_hash, b.edges_hash)
})

test('checkpoint: sensitive to node set change (ingestion drift)', () => {
  const base = computeCheckpoint(fx.nodes, fx.edges)
  const added = computeCheckpoint([...fx.nodes, { id: 'evt-new', label: 'New', type: 'event' }], fx.edges)
  assert.equal(added.node_count, fx.expect.node_count + 1)
  assert.notEqual(added.nodes_hash, base.nodes_hash)
  assert.equal(added.edges_hash, base.edges_hash) // edges untouched
})

test('checkpoint: sensitive to edge set change', () => {
  const base = computeCheckpoint(fx.nodes, fx.edges)
  const removed = computeCheckpoint(fx.nodes, fx.edges.slice(1))
  assert.equal(removed.edge_count, fx.expect.edge_count - 1)
  assert.notEqual(removed.edges_hash, base.edges_hash)
})

test('checkpoint: sensitive to relabel and edge retype', () => {
  const base = computeCheckpoint(fx.nodes, fx.edges)
  const relabeled = fx.nodes.map((n) => (n.id === 'evt-alpha' ? { ...n, label: 'Alpha Event (renamed)' } : n))
  assert.notEqual(computeCheckpoint(relabeled, fx.edges).nodes_hash, base.nodes_hash)
  const retyped = fx.edges.map((e) => (e.id === 'fx-e1' ? { ...e, type: 'sequence' } : e))
  assert.notEqual(computeCheckpoint(fx.nodes, retyped).edges_hash, base.edges_hash)
})

test('checkpoint: sensitive to undefined-vs-null distinction in whitelisted fields', () => {
  const base = computeCheckpoint(fx.nodes, fx.edges)
  const withNull = fx.nodes.map((n) => ({ ...n, occurred_at: n.occurred_at ?? null }))
  // nodes missing occurred_at gain an explicit null — canonical form changes
  const changed = fx.nodes.some((n) => n.occurred_at === undefined)
  assert.equal(changed, true)
  assert.notEqual(computeCheckpoint(withNull, fx.edges).nodes_hash, base.nodes_hash)
})

test('canonical rows: sorted stably and key-ordered at every depth', () => {
  const nodes = canonicalNodeRows(fx.nodes)
  const ids = nodes.map((n) => String(n.id))
  assert.deepEqual(ids, [...ids].sort((a, b) => a.localeCompare(b)))
  for (const n of nodes) {
    const keys = Object.keys(n)
    assert.deepEqual(keys, [...keys].sort())
  }
  const edges = canonicalEdgeRows(fx.edges)
  for (let i = 1; i < edges.length; i++) {
    const prev = `${edges[i - 1].source_id}${edges[i - 1].target_id}${edges[i - 1].id ?? ''}`
    const cur = `${edges[i].source_id}${edges[i].target_id}${edges[i].id ?? ''}`
    assert.ok(prev.localeCompare(cur) <= 0, 'edge rows not stably sorted')
  }
})

test('hashRows: sha256 hex of the canonical serialization', () => {
  assert.match(hashRows([{ a: 1 }]), SHA256_RE)
  assert.equal(hashRows([{ b: 2, a: 1 }]), hashRows([{ a: 1, b: 2 }]))
  assert.notEqual(hashRows([{ a: 1 }]), hashRows([{ a: 2 }]))
})
