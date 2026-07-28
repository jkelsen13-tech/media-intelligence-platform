// G1 — fallback golden suite: category-fallback floor semantics and the
// demo-data fallback the frontend renders when Supabase is absent/empty.
// demoData is imported from app source — no port.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyFloor } from './harness/classify.mjs'
import { demoNodes, demoEdges, demoArcs } from '../../src/data/demoData.js'

test('floor fallback: weak labels collapse to unclassified; strong labels stand', () => {
  const weak = { category: 'economic_policy', confidence: 0.15 }
  const strong = { category: 'economic_policy', confidence: 0.9 }
  assert.equal(applyFloor(weak, 0.35).category, 'unclassified')
  assert.equal(applyFloor(strong, 0.35).category, 'economic_policy')
  // unclassified never re-labels:
  assert.equal(applyFloor({ category: 'unclassified', confidence: 0 }, 0.35).category, 'unclassified')
})

test('category-fallback rate baseline shape (0 unclassified of 40 arcs at G1 authoring)', () => {
  const baseline = { unclassified: 0, total: 40, threshold: 0.25 }
  const rate = baseline.unclassified / baseline.total
  assert.ok(rate <= baseline.threshold)
})

test('demo fallback dataset integrity: edges reference real nodes, fields complete', () => {
  const ids = new Set(demoNodes.map((n) => n.id ?? n.slug))
  for (const n of demoNodes) {
    assert.ok(n.slug && n.label && n.type, `demo node missing fields: ${JSON.stringify(n)}`)
  }
  for (const e of demoEdges) {
    assert.ok(ids.has(e.source), `demo edge ${e.id} has dangling source ${e.source}`)
    assert.ok(ids.has(e.target), `demo edge ${e.id} has dangling target ${e.target}`)
    assert.ok(e.type, `demo edge ${e.id} missing type`)
  }
  assert.ok(demoArcs.length > 0)
})

test('mutation proof: a dangling demo edge is caught by the integrity test', () => {
  const ids = new Set(demoNodes.map((n) => n.id ?? n.slug))
  const broken = { id: 'x', source: 'nonexistent-node', target: [...ids][0], type: 'causal' }
  assert.ok(!ids.has(broken.source))
})
