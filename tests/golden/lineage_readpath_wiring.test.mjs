// Golden tests — 00_INDEX thread (i) fix at its ACTUAL landing point:
// loadSourceComparisonView, the function the Source Comparison UI calls.
//
// The Checkpoint 4 tests proved the seam (collapseByPersistedLineage) and the
// claim view. These prove the loader itself reads persisted origin clusters
// and no longer recomputes canonical URLs — end to end, through the real
// async read path against a stubbed Supabase client.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { runPipeline } from '../../supabase/functions/source-comparison-run/lib.js'
import { buildStage3Assertions } from '../../supabase/functions/source-comparison-run/lineage.js'
import { loadSourceComparisonView } from '../../src/lib/sourceComparisonReadPath.js'

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/source_comparison.json', import.meta.url)))
const TRIPLE = FIXTURE.expectations.syndicated_triple_thread_i // ['a2','a2w2','a2w3']

// --- minimal PostgREST-shaped stub -----------------------------------------
// Supports only what the read path actually chains: select/eq/in/like/order/
// gt/limit/range/maybeSingle, plus direct await.
function makeSupabase(tables) {
  return {
    from(table) {
      let rows = [...(tables[table] ?? [])].map((r) => ({ ...r }))
      const result = () => Promise.resolve({ data: rows, error: null })
      const b = {
        select: () => b,
        eq: (c, v) => { rows = rows.filter((r) => r[c] === v); return b },
        in: (c, vs) => { rows = rows.filter((r) => vs.includes(r[c])); return b },
        like: (c, p) => {
          const re = new RegExp('^' + String(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$')
          rows = rows.filter((r) => re.test(String(r[c] ?? '')))
          return b
        },
        order: () => { rows.sort((x, y) => String(x.id ?? '').localeCompare(String(y.id ?? ''))); return b },
        gt: (c, v) => { rows = rows.filter((r) => String(r[c]) > String(v)); return b },
        limit: (n) => Promise.resolve({ data: rows.slice(0, n), error: null }),
        range: (from, to) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
        maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
        then: (res, rej) => result().then(res, rej),
      }
      return b
    },
  }
}

/** Fixture corpus -> the tables the read path expects, with one event. */
function buildTables({ lineage }) {
  const articles = FIXTURE.articles.map((a) => ({
    id: a.id, outlet: a.outlet, title: a.title, url: a.url,
    published_at: a.published_at, claims: a.claims ?? [], arc_id: null,
    unattributed: false, monoculture: false, is_digest: false,
  }))
  const memberIds = TRIPLE
  return {
    pipeline_config: [{ key: 'source_comparison_beta', value: true }],
    events: [{ id: 'evt-1', canonical_title: 'US-Saudi nuclear deal', occurred_at_start: '2026-08-01', occurred_at_end: '2026-08-01', status: 'candidate' }],
    event_articles: memberIds.map((id) => ({ event_id: 'evt-1', article_id: id, membership_method: 'embedding_cluster', membership_confidence: 0.9 })),
    claims: [{ id: 'claim-1', event_id: 'evt-1', canonical_text: 'The US and Saudi Arabia signed a civil nuclear cooperation agreement.', thin_extraction: false, status: 'active' }],
    article_claims: memberIds.map((id, i) => ({ id: 'ac-' + i, claim_id: 'claim-1', article_id: id, surface_text: 'wire text', stance: 'asserts', loaded_language: [], is_current: true })),
    claim_evidence_links: [],
    claim_corrections: [],
    explanations: [],
    articles,
    story_arcs: [],
    nodes: [],
    article_lineage_assertions: lineage,
  }
}

/** Stage 3 rows as the write path would persist them, shaped like DB rows. */
function persistedLineage() {
  const plan = runPipeline(FIXTURE.articles, FIXTURE.entity_pairs, FIXTURE.config, { entries: [] })
  return buildStage3Assertions(FIXTURE.articles, plan.syndicates, {
    corpusScope: { articles_scanned: FIXTURE.articles.length, corpus: 'fixture' },
    checkedAt: '2026-08-17T00:00:00.000Z',
  }).map((r, i) => ({ id: 'lin-' + i, ...r, is_current: true }))
}

const claimOf = (view) => view.events[0].claims[0]

// ---------------------------------------------------------------------------

test('THREAD (i) END TO END: loadSourceComparisonView reports ONE origin for the 3-URL wire story, not three', async () => {
  const lineage = persistedLineage()
  const view = await loadSourceComparisonView({
    supabaseClient: makeSupabase(buildTables({ lineage })),
  })

  assert.equal(view.enabled, true)
  assert.equal(view.events.length, 1)

  const claim = claimOf(view)
  // Three surfaces from three different outlets...
  assert.equal(claim.surfaces.length, 3)
  assert.equal(new Set(claim.surfaces.map((s) => s.outlet)).size, 3)

  // ...but ONE independent origin.
  assert.equal(claim.independentOutlets.length, 1, 'three URLs of one wire story must count as ONE origin')
  assert.notEqual(claim.independentOutlets.length, 3, 'must not read as three independent outlets')
  assert.equal(claim.syndicatedExtra, 2)

  // And the E2 consequence the brief names: not corroborated.
  assert.equal(claim.evidenceStrength, 'E4')
  assert.notEqual(claim.evidenceStrength, 'E2')
  assert.equal(claim.classification, 'unique')
})

test('with NO persisted lineage the same corpus reports three outlets — the fix is doing the work', async () => {
  // Control. If this also returned 1, the assertion above would be proving
  // nothing about the lineage table.
  const view = await loadSourceComparisonView({
    supabaseClient: makeSupabase(buildTables({ lineage: [] })),
  })
  const claim = claimOf(view)
  assert.equal(claim.independentOutlets.length, 3)
  assert.equal(claim.evidenceStrength, 'E2')
})

test('shadow assertions never collapse the count in the loader', async () => {
  // Guardrail 6 at the read path: shadow rows reaching the client (e.g. via a
  // future policy change) still must not affect corroboration counts.
  const lineage = persistedLineage().map((r) => ({ ...r, review_status: 'shadow' }))
  const claim = claimOf(await loadSourceComparisonView({
    supabaseClient: makeSupabase(buildTables({ lineage })),
  }))
  assert.equal(claim.independentOutlets.length, 3, 'shadow rows must not collapse origins')
})

test('rejected and superseded assertions never collapse the count in the loader', async () => {
  for (const patch of [{ review_status: 'rejected' }, { is_current: false }]) {
    const lineage = persistedLineage().map((r) => ({ ...r, ...patch }))
    const claim = claimOf(await loadSourceComparisonView({
      supabaseClient: makeSupabase(buildTables({ lineage })),
    }))
    assert.equal(claim.independentOutlets.length, 3, `${JSON.stringify(patch)} must not collapse origins`)
  }
})

test('citation assertions never collapse the count in the loader', async () => {
  const lineage = persistedLineage().map((r) => ({
    ...r, relationship_class: 'reference', relationship_type: 'quotes',
  }))
  const claim = claimOf(await loadSourceComparisonView({
    supabaseClient: makeSupabase(buildTables({ lineage })),
  }))
  assert.equal(claim.independentOutlets.length, 3, 'citation is never derivation proof')
})

test('an empty lineage table is honest degradation, not an error', async () => {
  const view = await loadSourceComparisonView({
    supabaseClient: makeSupabase(buildTables({ lineage: [] })),
  })
  assert.equal(view.enabled, true)
  assert.equal(view.loadError, undefined)
  assert.equal(view.events.length, 1)
})

// ---------------------------------------------------------------------------
// Static drift guard — repo precedent: the 15A guard that forbids the old
// read-then-write pattern from returning in either caller.
// ---------------------------------------------------------------------------

test('DRIFT GUARD: the loader never re-derives syndication from canonical URL', () => {
  const src = readFileSync(new URL('../../src/lib/sourceComparisonReadPath.js', import.meta.url), 'utf8')
  const loader = src.slice(src.indexOf('export async function loadSourceComparisonView'))
  assert.ok(loader.length > 0, 'loader not found')

  assert.ok(
    !/collapseBySyndication\s*\(/.test(loader),
    'loadSourceComparisonView must not call collapseBySyndication — thread (i) regression',
  )
  assert.ok(
    /collapseByPersistedLineage\s*\(/.test(loader),
    'loadSourceComparisonView must count persisted origin clusters',
  )
  // The legacy function still exists, but only as the regression fixture's
  // subject — it must have exactly one definition and no loader call site.
  assert.equal((src.match(/collapseBySyndication\s*\(/g) ?? []).length, 1)
})
