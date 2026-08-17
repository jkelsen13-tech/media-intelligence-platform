// Golden tests — 20_IDEA capability 1, Graph projection read path
// (brief Section 5, checkpoint 7a).
//
// The exclusion of shadow/unreviewed rows is enforced in the DATABASE (the
// view's WHERE clause plus the base table's RLS), and is proven there by a
// direct query recorded in verifier/lineage-v1. These tests cover the read
// path's own obligations: the withhold gate, honest empty states, edge vs
// origin-annotation separation, guardrail-4 scope, and the standing
// no-composite-score rule.

import test from 'node:test'
import assert from 'node:assert/strict'
import { loadLineageGraph, loadLineageGraphFlag, originScopeLine } from '../../src/lib/lineageGraphReadPath.js'

// Minimal PostgREST-shaped stub. `reads` records every table touched so the
// withhold posture can be asserted on behavior, not on inspection.
function makeSupabase(tables, reads = []) {
  return {
    reads,
    from(table) {
      reads.push(table)
      let rows = [...(tables[table] ?? [])].map((r) => ({ ...r }))
      const b = {
        select: () => b,
        eq: (c, v) => { rows = rows.filter((r) => r[c] === v); return b },
        order: () => { rows.sort((x, y) => String(x.assertion_id ?? '').localeCompare(String(y.assertion_id ?? ''))); return b },
        gt: (c, v) => { rows = rows.filter((r) => String(r[c]) > String(v)); return b },
        limit: (n) => Promise.resolve({ data: rows.slice(0, n), error: null }),
        maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
        then: (res, rej) => Promise.resolve({ data: rows, error: null }).then(res, rej),
      }
      return b
    },
  }
}

const EDGE = {
  assertion_id: 'a1', child_article_id: 'child-1', parent_article_id: 'parent-1',
  projection_kind: 'edge', relationship_class: 'derivation', relationship_type: 'syndicated_from',
  origin_status: null, detection_method: 'exact_text_hash', confidence_band: 'high',
  evidence_basis: { match_basis: 'exact_text_hash', match_percent: 100, corpus_scope: { articles_scanned: 752 }, checked_at: '2026-08-17T00:00:00.000Z' },
  rule_version: 'lineage-v1', created_at: '2026-08-17T00:00:00Z', reviewed_at: '2026-08-17T01:00:00Z',
}

const ANNOTATION = {
  assertion_id: 'a2', child_article_id: 'child-2', parent_article_id: null,
  projection_kind: 'origin_annotation', relationship_class: 'origin_classification',
  relationship_type: 'origin_undetermined', origin_status: 'independent_origin_candidate',
  detection_method: 'corpus_scan', confidence_band: 'low',
  evidence_basis: { corpus_scope: { articles_scanned: 752 }, checked_at: '2026-08-17T00:00:00.000Z' },
  rule_version: 'lineage-v1', created_at: '2026-08-17T00:00:00Z', reviewed_at: '2026-08-17T01:00:00Z',
}

const enabled = (rows) => ({
  pipeline_config: [{ key: 'lineage_graph_mode', value: true }],
  article_lineage_graph: rows,
})

test('withhold posture: flag false -> no view read at all', async () => {
  const reads = []
  const client = makeSupabase({
    pipeline_config: [{ key: 'lineage_graph_mode', value: false }],
    article_lineage_graph: [EDGE, ANNOTATION],
  }, reads)

  const res = await loadLineageGraph({ supabaseClient: client })
  assert.equal(res.enabled, false)
  assert.deepEqual(res.edges, [])
  assert.deepEqual(res.originAnnotations, [])
  // The gate must prevent the read, not filter its result.
  assert.ok(!reads.includes('article_lineage_graph'), 'view must not be read while the flag is off')
})

test('withhold posture: a missing flag row is treated as off', async () => {
  const res = await loadLineageGraph({ supabaseClient: makeSupabase({ pipeline_config: [], article_lineage_graph: [EDGE] }) })
  assert.equal(res.enabled, false)
})

test('withhold posture: only boolean true enables — not "true", not 1', async () => {
  for (const value of ['true', 1, 'yes', null]) {
    const res = await loadLineageGraph({ supabaseClient: makeSupabase({ pipeline_config: [{ key: 'lineage_graph_mode', value }], article_lineage_graph: [EDGE] }) })
    assert.equal(res.enabled, false, `value ${JSON.stringify(value)} must not enable the mode`)
  }
  assert.equal(await loadLineageGraphFlag({ supabaseClient: makeSupabase({ pipeline_config: [{ key: 'lineage_graph_mode', value: true }] }) }), true)
})

test('edges and origin annotations are separated, never conflated', async () => {
  const res = await loadLineageGraph({ supabaseClient: makeSupabase(enabled([EDGE, ANNOTATION])) })
  assert.equal(res.enabled, true)
  assert.equal(res.edges.length, 1)
  assert.equal(res.originAnnotations.length, 1)
  assert.equal(res.edges[0].relationshipType, 'syndicated_from')
  assert.equal(res.edges[0].parentArticleId, 'parent-1')
  // The annotation is a statement ABOUT one article — it has no endpoint to
  // draw to and must never be emitted as an edge.
  assert.equal(res.originAnnotations[0].parentArticleId, null)
  assert.equal(res.originAnnotations[0].originStatus, 'independent_origin_candidate')
})

test('an edge row missing its parent is never emitted as a drawable edge', async () => {
  // Defense in depth: the view guarantees this, but an edge without two
  // endpoints is undrawable and must not be trusted blind.
  const broken = { ...EDGE, assertion_id: 'a3', parent_article_id: null }
  const res = await loadLineageGraph({ supabaseClient: makeSupabase(enabled([broken])) })
  assert.equal(res.edges.length, 0)
})

test('no bare independence claim can appear in the projection', async () => {
  const res = await loadLineageGraph({ supabaseClient: makeSupabase(enabled([EDGE, ANNOTATION])) })
  const all = [...res.edges, ...res.originAnnotations]
  for (const p of all) {
    assert.notEqual(p.relationshipType, 'independent_origin')
    assert.notEqual(p.originStatus, 'independent_origin')
  }
  // Only the two sanctioned parentless vocabularies are permitted.
  for (const a of res.originAnnotations) {
    assert.ok(['independent_origin_candidate', 'no_shared_origin_detected_within_corpus'].includes(a.originStatus))
  }
})

test('no composite score anywhere in the projection output', async () => {
  const res = await loadLineageGraph({ supabaseClient: makeSupabase(enabled([EDGE, ANNOTATION])) })
  for (const p of [...res.edges, ...res.originAnnotations]) {
    for (const [k, v] of Object.entries(p)) {
      if (k === 'evidence') continue // match_percent lives here, never surfaced as a score
      assert.notEqual(typeof v, 'number', `${k} must not be a numeric score`)
      assert.ok(!/score/i.test(k), `${k} must not be a score field`)
    }
    // The three dimensions stay separate and independently readable.
    assert.ok(typeof p.relationshipType === 'string')
    assert.ok(['high', 'medium', 'low'].includes(p.confidenceBand))
  }
})

test('origin annotations carry method, corpus scope and check date (guardrail 4)', async () => {
  const res = await loadLineageGraph({ supabaseClient: makeSupabase(enabled([ANNOTATION])) })
  const line = originScopeLine(res.originAnnotations[0])
  assert.match(line, /Checked 752 articles/)
  assert.match(line, /2026-08-17/)
  assert.match(line, /corpus_scan/)
})

test('an unfalsifiable origin finding renders nothing rather than a bare claim', async () => {
  // No corpus scope and no check date -> the statement cannot be made honestly.
  assert.equal(originScopeLine({ evidence: {}, detectionMethod: 'corpus_scan' }), null)
  assert.equal(originScopeLine({ evidence: { corpus_scope: { articles_scanned: 752 } }, detectionMethod: 'x' }), null)
  assert.equal(originScopeLine(null), null)
})

test('an empty projection is a normal empty state, not an error', async () => {
  const res = await loadLineageGraph({ supabaseClient: makeSupabase(enabled([])) })
  assert.equal(res.enabled, true)
  assert.equal(res.loadError, undefined)
  assert.deepEqual(res.edges, [])
  assert.deepEqual(res.originAnnotations, [])
})

test('the read path reads the VIEW, never the base assertions table', async () => {
  const reads = []
  await loadLineageGraph({ supabaseClient: makeSupabase(enabled([EDGE]), reads) })
  assert.ok(reads.includes('article_lineage_graph'))
  assert.ok(
    !reads.includes('article_lineage_assertions'),
    'reading the base table would bypass the verified-only guarantee the view exists to provide',
  )
})
