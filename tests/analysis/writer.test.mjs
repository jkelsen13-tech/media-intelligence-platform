// G-ALG-1 — writer planning suite (pure; no database).
// Proves: the write plan is idempotent (matching checkpoint hashes ⇒ reuse,
// never duplicate; identical layout identity ⇒ reuse, never duplicate), a
// drifted graph inserts a fresh checkpoint and a superseding layout version,
// and the layout payload exactly matches the graph_layout_versions column
// shape with deterministic positions covering every input node.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  computeCheckpoint,
  planWrites,
  buildLayoutPayload,
  LAYOUT_ALGORITHM,
  LAYOUT_ALGORITHM_VERSION,
  LAYOUT_SEED,
  LAYOUT_CONFIG,
} from '../../supabase/functions/graph-analysis-run/lib.js'

const fx = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'golden', 'fixtures', 'graph_fixture.json'), 'utf8'),
)

test('writer: layout payload matches graph_layout_versions column shape', () => {
  const p = buildLayoutPayload(fx.nodes)
  assert.deepEqual(
    Object.keys(p).sort(),
    ['algorithm', 'algorithm_version', 'config', 'positions', 'seed', 'supersedes'],
  )
  assert.equal(p.algorithm, LAYOUT_ALGORITHM)
  assert.equal(p.algorithm_version, LAYOUT_ALGORITHM_VERSION)
  assert.equal(p.seed, LAYOUT_SEED)
  assert.deepEqual(p.config, LAYOUT_CONFIG)
  assert.equal(p.supersedes, null)
})

test('writer: positions cover every node id and are deterministic', () => {
  const a = buildLayoutPayload(fx.nodes)
  const b = buildLayoutPayload([...fx.nodes].reverse())
  assert.deepEqual(a.positions, b.positions)
  assert.equal(Object.keys(a.positions).length, fx.expect.node_count)
  for (const n of fx.nodes) {
    const p = a.positions[String(n.id)]
    assert.ok(p && Number.isFinite(p.x) && Number.isFinite(p.y), `missing position for ${n.id}`)
  }
})

test('writer: first run on empty tables inserts checkpoint + layout', async () => {
  const cp = await computeCheckpoint(fx.nodes, fx.edges)
  const plan = planWrites(cp, [], [])
  assert.equal(plan.checkpointAction, 'insert')
  assert.equal(plan.checkpointId, null)
  assert.equal(plan.layoutAction, 'insert')
  assert.equal(plan.supersedes, null)
})

test('writer: second run with unchanged graph reuses both rows (idempotent)', async () => {
  const cp = await computeCheckpoint(fx.nodes, fx.edges)
  const stored = { id: 'cp-1', nodes_hash: cp.nodes_hash, edges_hash: cp.edges_hash }
  const layout = {
    id: 'lv-1',
    checkpoint_id: 'cp-1',
    algorithm: LAYOUT_ALGORITHM,
    algorithm_version: LAYOUT_ALGORITHM_VERSION,
    config: { ...LAYOUT_CONFIG },
    seed: LAYOUT_SEED,
  }
  const plan = planWrites(cp, [stored], [layout])
  assert.equal(plan.checkpointAction, 'reuse')
  assert.equal(plan.checkpointId, 'cp-1')
  assert.equal(plan.layoutAction, 'reuse')
  assert.equal(plan.layoutId, 'lv-1')
})

test('writer: drifted graph inserts a new checkpoint and a superseding layout', async () => {
  const cpOld = await computeCheckpoint(fx.nodes, fx.edges)
  const cpNew = await computeCheckpoint(
    [...fx.nodes, { id: 'evt-new', label: 'New', type: 'event' }],
    fx.edges,
  )
  const stored = { id: 'cp-1', nodes_hash: cpOld.nodes_hash, edges_hash: cpOld.edges_hash }
  const plan = planWrites(cpNew, [stored], [])
  assert.equal(plan.checkpointAction, 'insert')
  assert.equal(plan.layoutAction, 'insert')
  assert.equal(plan.supersedes, null) // no layout exists for the NEW checkpoint
})

test('writer: known checkpoint with different layout identity inserts superseding version', async () => {
  const cp = await computeCheckpoint(fx.nodes, fx.edges)
  const stored = { id: 'cp-1', nodes_hash: cp.nodes_hash, edges_hash: cp.edges_hash }
  const oldLayout = {
    id: 'lv-old',
    checkpoint_id: 'cp-1',
    algorithm: LAYOUT_ALGORITHM,
    algorithm_version: '0.9.0', // superseded identity
    config: { spacing: 25 },
    seed: LAYOUT_SEED,
  }
  const plan = planWrites(cp, [stored], [oldLayout])
  assert.equal(plan.checkpointAction, 'reuse')
  assert.equal(plan.layoutAction, 'insert')
  assert.equal(plan.supersedes, 'lv-old')
})

test('writer: layouts for other checkpoints never trigger reuse', async () => {
  const cp = await computeCheckpoint(fx.nodes, fx.edges)
  const stored = { id: 'cp-1', nodes_hash: cp.nodes_hash, edges_hash: cp.edges_hash }
  const foreign = {
    id: 'lv-foreign',
    checkpoint_id: 'cp-other',
    algorithm: LAYOUT_ALGORITHM,
    algorithm_version: LAYOUT_ALGORITHM_VERSION,
    config: { ...LAYOUT_CONFIG },
    seed: LAYOUT_SEED,
  }
  const plan = planWrites(cp, [stored], [foreign])
  assert.equal(plan.layoutAction, 'insert')
  assert.equal(plan.supersedes, null)
})
