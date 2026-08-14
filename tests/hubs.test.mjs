// Regression guard for the e7e35b9 class of transcription bug (2026-08-13):
// the hub-degree expression in App.jsx was corrupted from
//   degree.get(n.id ?? n.slug) ?? 0
// to
//   (n.id ?? n.slug) ?? 0
// so every hub card's metadata rendered "actor · <uuid> links" and the hub
// ranking sorted by UUID string. It shipped because nothing asserted the
// degree is a number. These tests pin the contract on the extracted
// computeHubs helper (src/lib/hubs.js), which App.jsx now calls.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeHubs } from '../src/lib/hubs.js'

const N = (id) => ({ id, label: `node-${id}` })

const nodes = [N('a'), N('b'), N('c'), N('d'), N('e')]
const edges = [
  { source: 'a', target: 'b' },
  { source: 'a', target: 'c' },
  { source: 'a', target: 'd' },
  { source: 'b', target: 'c' },
  // 'e' is deliberately zero-degree
]

test('hub degree is always a finite number (never an id/string/undefined)', () => {
  const hubs = computeHubs(nodes, edges)
  assert.equal(hubs.length, nodes.length)
  for (const h of hubs) {
    assert.equal(typeof h.degree, 'number', `degree for ${h.node.id} must be a number`)
    assert.ok(Number.isFinite(h.degree), `degree for ${h.node.id} must be finite`)
    assert.ok(h.degree >= 0, `degree for ${h.node.id} must be >= 0`)
  }
})

test('hub degree equals the actual edge count per node', () => {
  const hubs = computeHubs(nodes, edges)
  const byId = new Map(hubs.map((h) => [h.node.id, h.degree]))
  assert.equal(byId.get('a'), 3)
  assert.equal(byId.get('b'), 2)
  assert.equal(byId.get('c'), 2)
  assert.equal(byId.get('d'), 1)
  assert.equal(byId.get('e'), 0)
})

test('hubs are sorted by descending degree', () => {
  const hubs = computeHubs(nodes, edges)
  for (let i = 1; i < hubs.length; i++) {
    assert.ok(hubs[i - 1].degree >= hubs[i].degree, 'descending order')
  }
  assert.equal(hubs[0].node.id, 'a')
})

test('size cap slices AFTER sorting (top-N by degree)', () => {
  const hubs = computeHubs(nodes, edges, 2)
  assert.equal(hubs.length, 2)
  assert.equal(hubs[0].node.id, 'a')
  assert.equal(hubs[1].degree, 2)
})

test('nodes keyed by slug instead of id still get numeric degrees', () => {
  const slugNodes = [{ slug: 's1' }, { slug: 's2' }]
  const slugEdges = [{ source: 's1', target: 's2' }]
  const hubs = computeHubs(slugNodes, slugEdges)
  for (const h of hubs) assert.equal(typeof h.degree, 'number')
  assert.equal(hubs[0].degree, 1)
})

test('empty edge list yields all-zero numeric degrees', () => {
  const hubs = computeHubs(nodes, [])
  assert.equal(hubs.length, nodes.length)
  for (const h of hubs) assert.equal(h.degree, 0)
})
