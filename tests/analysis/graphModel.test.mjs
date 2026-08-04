// G-ALG-0 — graph model + seeded layout suite.
// Proves: rows→Graphology build is total and attribute-whitelisted; dangling
// endpoints are dropped into an audit list (never re-pointed); duplicate ids
// are rejected; seeded positions are deterministic per node id and identical
// across runs; the model never mutates its input rows.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildGraphModel, graphToRows, NODE_ATTRIBUTES, EDGE_ATTRIBUTES } from '../../src/analysis/graphModel.js'
import { hashId, seedPosition, seedPositions, applySeedPositions } from '../../src/analysis/layoutSeed.js'

const fx = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'golden', 'fixtures', 'graph_fixture.json'), 'utf8'),
)

test('model build: node/edge counts match the frozen fixture', () => {
  const { graph, droppedEdges } = buildGraphModel(fx.nodes, fx.edges)
  assert.equal(graph.order, fx.expect.node_count)
  assert.equal(graph.size, fx.expect.edge_count)
  assert.equal(droppedEdges.length, 0)
})

test('model build: dangling endpoint is dropped into the audit list, never re-pointed', () => {
  const { graph, droppedEdges } = buildGraphModel(fx.nodes, [...fx.edges, fx.danglingEdge])
  assert.equal(graph.size, fx.expect.edge_count) // dangling edge NOT added
  assert.equal(droppedEdges.length, fx.expect.dropped_on_build)
  assert.equal(droppedEdges[0].id, 'fx-dangling')
  assert.equal(droppedEdges[0].reason, 'unknown-endpoint')
})

test('model build: only whitelisted attributes cross the boundary', () => {
  const tainted = [{ id: 'n1', label: 'N1', type: 'event', embedding: [0.1], fetched_at: 'x' }]
  const { graph } = buildGraphModel(tainted, [])
  const attrs = graph.getNodeAttributes('n1')
  for (const key of Object.keys(attrs)) {
    assert.ok(NODE_ATTRIBUTES.includes(key), `non-whitelisted attribute leaked: ${key}`)
  }
  assert.equal(attrs.embedding, undefined)
  assert.equal(attrs.fetched_at, undefined)
})

test('model build: duplicate node id is rejected (no silent merge)', () => {
  assert.throws(
    () => buildGraphModel([fx.nodes[0], fx.nodes[0]], []),
    /duplicate node id/,
  )
})

test('model build: duplicate edge id is rejected', () => {
  const dup = { ...fx.edges[0] }
  assert.throws(
    () => buildGraphModel(fx.nodes, [fx.edges[0], dup]),
    /duplicate edge id/,
  )
})

test('round trip: graphToRows preserves ids and whitelisted attributes', () => {
  const { graph } = buildGraphModel(fx.nodes, fx.edges)
  const { nodes, edges } = graphToRows(graph)
  assert.equal(nodes.length, fx.expect.node_count)
  assert.equal(edges.length, fx.expect.edge_count)
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))
  assert.equal(byId['evt-alpha'].label, 'Alpha Event')
  assert.equal(byId['evt-alpha'].confidence, 65)
  for (const e of edges) {
    for (const key of Object.keys(e)) {
      assert.ok(['id', 'source', 'target', ...EDGE_ATTRIBUTES].includes(key), `unexpected edge attribute ${key}`)
    }
  }
})

test('model build: input rows are never mutated', () => {
  const nodes = JSON.parse(JSON.stringify(fx.nodes))
  const edges = JSON.parse(JSON.stringify(fx.edges))
  const snapshot = JSON.stringify({ nodes, edges })
  buildGraphModel(nodes, edges)
  assert.equal(JSON.stringify({ nodes, edges }), snapshot)
})

test('layout seed: hashId is a stable 32-bit integer', () => {
  const h = hashId('evt-alpha')
  assert.equal(typeof h, 'number')
  assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff)
  assert.equal(hashId('evt-alpha'), h) // stable across calls
  assert.notEqual(hashId('evt-alpha'), hashId('evt-beta'))
})

test('layout seed: same id set yields byte-identical positions across runs', () => {
  const ids = fx.nodes.map((n) => n.id)
  const a = seedPositions(ids)
  const b = seedPositions([...ids].reverse()) // order-independent per id
  assert.deepEqual(a, b)
  for (const id of ids) {
    const p = seedPosition(id)
    assert.deepEqual(a[id], p)
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y))
  }
})

test('layout seed: positions differ across distinct ids (no degenerate collapse)', () => {
  const positions = seedPositions(fx.nodes.map((n) => n.id))
  const seen = new Set(Object.values(positions).map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`))
  assert.equal(seen.size, fx.expect.node_count)
})

test('layout seed: applySeedPositions writes x/y onto the graph deterministically', () => {
  const { graph } = buildGraphModel(fx.nodes, fx.edges)
  const positions = applySeedPositions(graph)
  for (const [id, p] of Object.entries(positions)) {
    assert.equal(graph.getNodeAttribute(id, 'x'), p.x)
    assert.equal(graph.getNodeAttribute(id, 'y'), p.y)
  }
  // second application is a no-op replay
  const again = applySeedPositions(graph)
  assert.deepEqual(again, positions)
})
