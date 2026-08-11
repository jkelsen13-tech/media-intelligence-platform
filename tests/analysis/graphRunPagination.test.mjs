// Doc 13 site 3 regression test (owner-authorized 2026-08-11):
// graph-analysis-run must hash the COMPLETE node/edge sets past the
// PostgREST 1000-row ceiling. The checkpoint hash is computed JS-side over
// the returned rows (confirmed in the audit), so a truncated read would mint
// a hash describing a PARTIAL graph — the worst failure mode for this site:
// a checkpoint that looks valid but does not describe the live graph.
//
// Proof shape (owner bar): not a count match. (a) The paginated read's hash
// EQUALS the hash computed directly over the full fixture — the hash
// provably describes the complete set. (b) Flipping a SPECIFIC row at
// position 1001 (the first row a truncated read drops) changes the hash —
// that row is provably inside the hashed set.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  keysetAll,
  computeCheckpoint,
  NODE_ATTRIBUTES,
  EDGE_ATTRIBUTES,
} from '../../supabase/functions/graph-analysis-run/lib.js'

// --- Minimal PostgREST emulation (1000-row cap = the bug under test) --------
function fakePostgrest(tables) {
  return {
    from(table) {
      let rows = [...(tables[table] ?? [])]
      const state = { limit: null }
      const q = {
        select: () => q,
        gt: (c, v) => { rows = rows.filter((r) => String(r[c]) > String(v)); return q },
        order: (c, { ascending = true } = {}) => {
          rows = [...rows].sort((a, b) => (String(a[c] ?? '') < String(b[c] ?? '') ? -1 : String(a[c] ?? '') > String(b[c] ?? '') ? 1 : 0) * (ascending ? 1 : -1))
          return q
        },
        limit: (n) => { state.limit = n; return q },
        then: (resolve) => {
          let r = rows
          if (state.limit) r = r.slice(0, state.limit)
          r = r.slice(0, 1000) // PostgREST max-rows cap — the bug under test
          resolve({ data: r, error: null })
        },
      }
      return q
    },
  }
}

const pad = (n) => String(n).padStart(6, '0')
const N_NODES = 1200
const N_EDGES = 1500

function buildTables() {
  const nodes = []
  for (let i = 1; i <= N_NODES; i++) {
    nodes.push({ id: `n-${pad(i)}`, slug: `evt-y${i}`, label: `Node ${i}`, type: 'event', arc_id: null, confidence: 0.8, occurred_at: '2026-07-01' })
  }
  const edges = []
  for (let i = 1; i <= N_EDGES; i++) {
    edges.push({ id: `e-${pad(i)}`, source_id: `n-${pad(((i - 1) % N_NODES) + 1)}`, target_id: `n-${pad((i % N_NODES) + 1)}`, type: 'causal', signal_source: 'wire', doc_strength: 2, reliability: 0.9, similarity: null })
  }
  return { nodes, edges }
}

// Read both tables through the SAME paginated path the edge function uses.
async function readGraph(db) {
  const { data: nodeRows, error: nErr } = await keysetAll(db, 'nodes', NODE_ATTRIBUTES.join(','))
  assert.equal(nErr, null)
  const { data: edgeRows, error: eErr } = await keysetAll(db, 'edges', EDGE_ATTRIBUTES.join(','))
  assert.equal(eErr, null)
  return { nodeRows, edgeRows }
}

test('control: the fake PostgREST really does cap naive selects at 1000', async () => {
  const db = fakePostgrest(buildTables())
  const { data } = await db.from('nodes').select('id')
  assert.equal(data.length, 1000)
})

test('paginated read returns the complete set past 1000 on both tables', async () => {
  const { nodeRows, edgeRows } = await readGraph(fakePostgrest(buildTables()))
  assert.equal(nodeRows.length, N_NODES)
  assert.equal(edgeRows.length, N_EDGES)
  // SPECIFIC rows a truncated read would have dropped
  assert.ok(nodeRows.some((r) => r.id === `n-${pad(1001)}`), 'node at position 1001 missing')
  assert.ok(nodeRows.some((r) => r.id === `n-${pad(N_NODES)}`), 'final node missing')
  assert.ok(edgeRows.some((r) => r.id === `e-${pad(1001)}`), 'edge at position 1001 missing')
  assert.ok(edgeRows.some((r) => r.id === `e-${pad(N_EDGES)}`), 'final edge missing')
})

test('checkpoint hash over the paginated read EQUALS the hash over the full fixture', async () => {
  const tables = buildTables()
  const { nodeRows, edgeRows } = await readGraph(fakePostgrest(tables))
  const viaRead = await computeCheckpoint(nodeRows, edgeRows)
  // Ground truth: hash the complete fixture with no PostgREST in between.
  const direct = await computeCheckpoint(tables.nodes, tables.edges)
  assert.equal(viaRead.node_count, N_NODES)
  assert.equal(viaRead.edge_count, N_EDGES)
  assert.equal(viaRead.nodes_hash, direct.nodes_hash)
  assert.equal(viaRead.edges_hash, direct.edges_hash)
})

test('the hash is SENSITIVE to specific rows at position 1001 (provably inside the hashed set)', async () => {
  const tables = buildTables()
  const base = await readGraph(fakePostgrest(tables))
  const baseCp = await computeCheckpoint(base.nodeRows, base.edgeRows)

  // Flip the label of ONLY the node at position 1001 in id order.
  const mutated = buildTables()
  const targetNode = mutated.nodes.find((r) => r.id === `n-${pad(1001)}`)
  targetNode.label = 'MUTATED at position 1001'
  const viaMutated = await readGraph(fakePostgrest(mutated))
  const mutatedCp = await computeCheckpoint(viaMutated.nodeRows, viaMutated.edgeRows)
  assert.notEqual(mutatedCp.nodes_hash, baseCp.nodes_hash, 'node at position 1001 not inside nodes_hash')
  assert.equal(mutatedCp.edges_hash, baseCp.edges_hash, 'unrelated edges_hash should be untouched')

  // Same for the edge at position 1001.
  const mutated2 = buildTables()
  const targetEdge = mutated2.edges.find((r) => r.id === `e-${pad(1001)}`)
  targetEdge.reliability = 0.1
  const viaMutated2 = await readGraph(fakePostgrest(mutated2))
  const mutatedCp2 = await computeCheckpoint(viaMutated2.nodeRows, viaMutated2.edgeRows)
  assert.notEqual(mutatedCp2.edges_hash, baseCp.edges_hash, 'edge at position 1001 not inside edges_hash')
  assert.equal(mutatedCp2.nodes_hash, baseCp.nodes_hash, 'unrelated nodes_hash should be untouched')
})
