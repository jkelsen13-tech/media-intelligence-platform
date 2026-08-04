// G-ALG-1 — runtime-equivalence suite.
// The edge function ships a runtime-portable twin of the G-ALG-0 reference
// modules (Web Crypto instead of node:crypto). This suite pins the twin
// (supabase/functions/graph-analysis-run/lib.js) against the references
// (src/analysis/checkpoint.js, src/analysis/layoutSeed.js) on the frozen
// fixture: identical checkpoint hashes, identical canonical rows, identical
// seed positions — including order-permuted and non-whitelisted-tainted
// variants. If these ever diverge, server-persisted checkpoints would
// disagree with the Node-side analysis layer; that is a hard failure.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as ref from '../../src/analysis/checkpoint.js'
import { NODE_ATTRIBUTES as REF_NODE_ATTRIBUTES, EDGE_ATTRIBUTES as REF_EDGE_ATTRIBUTES } from '../../src/analysis/graphModel.js'
import * as seedRef from '../../src/analysis/layoutSeed.js'
import * as twin from '../../supabase/functions/graph-analysis-run/lib.js'

const fx = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'golden', 'fixtures', 'graph_fixture.json'), 'utf8'),
)

test('equivalence: checkpoint hashes identical across runtimes (fixture)', async () => {
  const a = ref.computeCheckpoint(fx.nodes, fx.edges)
  const b = await twin.computeCheckpoint(fx.nodes, fx.edges)
  assert.deepEqual(b, a)
})

test('equivalence: identical under row-order permutation', async () => {
  const a = ref.computeCheckpoint([...fx.nodes].reverse(), [...fx.edges].reverse())
  const b = await twin.computeCheckpoint([...fx.nodes].reverse(), [...fx.edges].reverse())
  assert.deepEqual(b, a)
})

test('equivalence: identical under non-whitelisted field taint', async () => {
  const tn = fx.nodes.map((n) => ({ ...n, embedding: [0.1], fetched_at: '2026-08-05T00:00:00Z' }))
  const te = fx.edges.map((e) => ({ ...e, created_at: '2026-08-05T00:00:00Z' }))
  const a = ref.computeCheckpoint(tn, te)
  const b = await twin.computeCheckpoint(tn, te)
  assert.deepEqual(b, a)
})

test('equivalence: canonical rows byte-identical across runtimes', () => {
  assert.deepEqual(twin.canonicalNodeRows(fx.nodes), ref.canonicalNodeRows(fx.nodes))
  assert.deepEqual(twin.canonicalEdgeRows(fx.edges), ref.canonicalEdgeRows(fx.edges))
})

test('equivalence: hashRows matches node:crypto reference', async () => {
  const rows = [{ b: 2, a: 1 }, { a: [1, { z: null, y: 2 }] }, {}]
  assert.equal(await twin.hashRows(rows), ref.hashRows(rows))
})

test('equivalence: whitelists match the reference model exactly', () => {
  assert.deepEqual([...twin.NODE_ATTRIBUTES], [...REF_NODE_ATTRIBUTES])
  assert.deepEqual([...twin.EDGE_ATTRIBUTES], [...REF_EDGE_ATTRIBUTES])
})

test('equivalence: seed positions identical across runtimes', () => {
  const ids = fx.nodes.map((n) => n.id)
  assert.deepEqual(twin.seedPositions(ids), seedRef.seedPositions(ids))
  for (const id of ids) {
    assert.equal(twin.hashId(id), seedRef.hashId(id))
    assert.deepEqual(twin.seedPosition(id), seedRef.seedPosition(id))
  }
})
