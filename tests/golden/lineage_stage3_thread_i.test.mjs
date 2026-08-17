// Golden tests — 20_IDEA capability 1, Stage 3 (exact-text hashing) and the
// 00_INDEX thread (i) regression.
//
// Thread (i), as closed 2026-08-16: the syndication-collapse logic runs
// correctly at write time (canonical URL + normalized body hash + union-find)
// but never persists — it dies in an ephemeral stats.comparisons sample. The
// read path then recomputes by canonical URL ONLY, so a verbatim wire story
// republished under three URLs counts as three independent outlets in E2.
//
// The required regression case (brief Section 4): three URLs, one wire story,
// E2 must report ONE corroborating origin, not three.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { runPipeline, detectSyndicates, bodyHash, canonicalUrl } from '../../supabase/functions/source-comparison-run/lib.js'
import { buildStage3Assertions, selectGroupOrigin } from '../../supabase/functions/source-comparison-run/lineage.js'
import {
  collapseByPersistedLineage,
  collapseBySyndication,
  independentOutlets,
  buildClaimView,
  evidenceStrength,
} from '../../src/lib/sourceComparisonReadPath.js'

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/source_comparison.json', import.meta.url)))
const SCOPE = { articles_scanned: FIXTURE.articles.length, corpus: 'fixture' }
const AT = '2026-08-17T00:00:00.000Z'

const TRIPLE = FIXTURE.expectations.syndicated_triple_thread_i // ['a2','a2w2','a2w3']
const articleById = new Map(FIXTURE.articles.map((a) => [a.id, a]))

// ---------------------------------------------------------------------------
// The shape of the fixture case itself — this is what makes it a real
// regression rather than a restatement of the fix.
// ---------------------------------------------------------------------------

test('fixture: three DISTINCT URLs, one story — canonical URL cannot collapse any of them', () => {
  const [x, y, z] = TRIPLE.map((id) => articleById.get(id))

  // Three distinct article rows across three distinct outlets.
  assert.equal(new Set([x.outlet, y.outlet, z.outlet]).size, 3)

  // All three carry byte-identical normalized bodies — one wire story.
  assert.equal(bodyHash(x.body_text), bodyHash(y.body_text))
  assert.equal(bodyHash(x.body_text), bodyHash(z.body_text))

  // And NO two of them share a canonical URL. The body hash is the only thing
  // connecting them, which is exactly why a canonical-URL-only read path
  // cannot collapse the group at all.
  assert.equal(new Set([canonicalUrl(x.url), canonicalUrl(y.url), canonicalUrl(z.url)]).size, 3)
})

test('PRE-FIX behavior reproduced: canonical-URL-only read path reports THREE independent outlets', () => {
  // This is the live defect from thread (i), pinned so it cannot silently
  // return: one wire story read as three independent confirmations.
  const legacy = collapseBySyndication(TRIPLE.map((id) => articleById.get(id)))
  const outlets = independentOutlets(TRIPLE, articleById, legacy)
  assert.equal(outlets.length, 3, 'thread (i): the pre-fix path counts three independent outlets')
  // And it wrongly reads as corroborated.
  assert.equal(evidenceStrength({ independentOutletCount: outlets.length, hasPrimaryEvidence: false }), 'E2')
})

// ---------------------------------------------------------------------------
// Stage 3: persistence over the EXISTING collapse
// ---------------------------------------------------------------------------

test('Stage 3 consumes the pipeline\'s own syndicate map — no second detection', () => {
  const plan = runPipeline(FIXTURE.articles, FIXTURE.entity_pairs, FIXTURE.config, { entries: [] })
  // The map the write path already computed is now reachable on the plan.
  assert.ok(plan.syndicates instanceof Map)
  // Identical to calling the existing detector directly: same logic, one source.
  const direct = detectSyndicates(FIXTURE.articles)
  assert.deepEqual([...plan.syndicates.entries()].sort(), [...direct.entries()].sort())
})

test('Stage 3 turns the collapsed group into syndicated_from assertions', () => {
  const syndicates = detectSyndicates(FIXTURE.articles)
  const rows = buildStage3Assertions(FIXTURE.articles, syndicates, { corpusScope: SCOPE, checkedAt: AT })

  // The collapsed group is the triple plus a2w (a2's tracking-param
  // duplicate): four articles, one origin, three child rows.
  assert.equal(rows.length, 3)
  const origin = selectGroupOrigin(TRIPLE.map((id) => articleById.get(id)))
  assert.equal(origin.id, 'a2') // earliest published_at
  for (const r of rows) {
    assert.equal(r.parent_article_id, 'a2')
    assert.equal(r.relationship_class, 'derivation')
    assert.equal(r.relationship_type, 'syndicated_from')
    assert.equal(r.origin_status, null) // parent resolved -> no origin_status
    assert.equal(r.review_status, 'unreviewed')
    assert.equal(r.evidence_basis.group_size, 4)
    assert.deepEqual(r.evidence_basis.corpus_scope, SCOPE)
    assert.equal(r.evidence_basis.checked_at, AT)
  }
  assert.deepEqual(rows.map((r) => r.child_article_id).sort(), ['a2w', 'a2w2', 'a2w3'])
})

test('confidence_band tracks the match basis; exact hash reports 100%', () => {
  const rows = buildStage3Assertions(FIXTURE.articles, detectSyndicates(FIXTURE.articles), { corpusScope: SCOPE, checkedAt: AT })
  for (const r of rows) {
    assert.equal(r.evidence_basis.match_basis, 'exact_text_hash')
    assert.equal(r.evidence_basis.match_percent, 100)
    assert.equal(r.confidence_band, 'high')
    assert.equal(r.detection_method, 'exact_text_hash')
  }
})

test('URL-identical but text-unproven collapses at medium, not high', () => {
  // Same canonical URL, no usable body on either side (the live BBC duplicate
  // pair is this shape). The collapse is right; the TEXT match is unproven.
  const articles = [
    { id: 'u1', outlet: 'BBC', url: 'https://bbc.co.uk/news/articles/c2k7?utm_source=rss', body_text: null, published_at: '2026-08-01T10:00:00Z' },
    { id: 'u2', outlet: 'BBC', url: 'https://www.bbc.co.uk/news/articles/c2k7', body_text: null, published_at: '2026-08-01T11:00:00Z' },
  ]
  const rows = buildStage3Assertions(articles, detectSyndicates(articles), { corpusScope: SCOPE, checkedAt: AT })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].evidence_basis.match_basis, 'canonical_url')
  assert.equal(rows[0].evidence_basis.match_percent, null)
  assert.equal(rows[0].confidence_band, 'medium')
  assert.equal(rows[0].detection_method, 'canonical_url_match')
})

test('no composite score on any Stage 3 row; match_percent stays in evidence only', () => {
  const rows = buildStage3Assertions(FIXTURE.articles, detectSyndicates(FIXTURE.articles), { corpusScope: SCOPE, checkedAt: AT })
  for (const r of rows) {
    for (const [k, v] of Object.entries(r)) {
      assert.notEqual(typeof v, 'number', `${k} must not be a numeric score`)
      assert.ok(!/score/i.test(k), `${k} must not be a score field`)
    }
    assert.ok(['high', 'medium', 'low'].includes(r.confidence_band))
  }
})

// ---------------------------------------------------------------------------
// THE THREAD (i) REGRESSION — brief Section 4's required test
// ---------------------------------------------------------------------------

test('THREAD (i): a verbatim wire story under three URLs counts as ONE corroborating origin, not three', () => {
  // Write path: the existing collapse, now persisted.
  const plan = runPipeline(FIXTURE.articles, FIXTURE.entity_pairs, FIXTURE.config, { entries: [] })
  const persisted = buildStage3Assertions(FIXTURE.articles, plan.syndicates, { corpusScope: SCOPE, checkedAt: AT })

  // Read path: count persisted origin clusters instead of recomputing URLs.
  const clusters = collapseByPersistedLineage(persisted)
  const outlets = independentOutlets(TRIPLE, articleById, clusters)

  // THE ASSERTION THIS CHECKPOINT EXISTS FOR.
  assert.equal(outlets.length, 1, 'three URLs of one wire story must count as ONE origin')
  assert.notEqual(outlets.length, 3, 'must not read as three independent outlets')

  // All three articles land in the SAME origin cluster.
  const ids = TRIPLE.map((id) => clusters.get(id))
  assert.equal(new Set(ids).size, 1)
  assert.ok(ids.every(Boolean))

  // And the E2 consequence: a claim carried only by this wire story is no
  // longer "corroborated" — it is a single asserted source.
  assert.equal(evidenceStrength({ independentOutletCount: outlets.length, hasPrimaryEvidence: false }), 'E4')
})

test('THREAD (i) end-to-end through buildClaimView: syndicated triple is one source', () => {
  const plan = runPipeline(FIXTURE.articles, FIXTURE.entity_pairs, FIXTURE.config, { entries: [] })
  const persisted = buildStage3Assertions(FIXTURE.articles, plan.syndicates, { corpusScope: SCOPE, checkedAt: AT })
  const clusters = collapseByPersistedLineage(persisted)

  const claim = { id: 'c-wire', canonical_text: 'US and Saudi Arabia signed a civil nuclear agreement', thin_extraction: false }
  const surfaces = TRIPLE.map((id, i) => ({ id: 's' + i, article_id: id, surface_text: 'wire text', loaded_language: [] }))

  const view = buildClaimView(claim, surfaces, {
    articlesById: articleById,
    syndicates: clusters,
    eventOutlets: TRIPLE.map((id) => articleById.get(id).outlet),
    eventArticlesByOutlet: new Map(TRIPLE.map((id) => [articleById.get(id).outlet, [articleById.get(id)]])),
    extractedArticleIds: new Set(TRIPLE),
    evidenceLinks: [], corrections: [], explanationsByArticle: new Map(),
  })

  assert.equal(view.independentOutlets.length, 1)
  assert.equal(view.syndicatedExtra, 2)      // three surfaces, one origin
  assert.equal(view.classification, 'unique') // not "shared" across outlets
  assert.equal(view.evidenceStrength, 'E4')   // not E2
})

// ---------------------------------------------------------------------------
// Collapse seam safety
// ---------------------------------------------------------------------------

test('citation assertions never collapse a cluster', () => {
  // A 'quotes' reference must not merge outlets: citation is never derivation
  // proof, and collapsing on it would UNDERCOUNT corroboration.
  const clusters = collapseByPersistedLineage([
    { child_article_id: 'x', parent_article_id: 'y', relationship_class: 'reference', relationship_type: 'quotes', review_status: 'unreviewed' },
  ])
  assert.equal(clusters.size, 0)
})

test('shadow and rejected assertions never collapse a cluster', () => {
  for (const review_status of ['shadow', 'rejected']) {
    const clusters = collapseByPersistedLineage([
      { child_article_id: 'x', parent_article_id: 'y', relationship_class: 'derivation', relationship_type: 'syndicated_from', review_status },
    ])
    assert.equal(clusters.size, 0, `${review_status} must not collapse`)
  }
  // Superseded history rows are inert too.
  assert.equal(collapseByPersistedLineage([
    { child_article_id: 'x', parent_article_id: 'y', relationship_class: 'derivation', review_status: 'unreviewed', is_current: false },
  ]).size, 0)
})

test('chained lineage A->B->C collapses to one origin cluster', () => {
  const clusters = collapseByPersistedLineage([
    { child_article_id: 'B', parent_article_id: 'A', relationship_class: 'derivation', review_status: 'unreviewed' },
    { child_article_id: 'C', parent_article_id: 'B', relationship_class: 'derivation', review_status: 'verified' },
  ])
  assert.equal(new Set(['A', 'B', 'C'].map((id) => clusters.get(id))).size, 1)
})

test('a parentless assertion never collapses anything', () => {
  // Stage 1's wire-attributed rows carry parent NULL. They must not merge the
  // article with anything — absence of a parent is not a shared origin.
  assert.equal(collapseByPersistedLineage([
    { child_article_id: 'z', parent_article_id: null, relationship_class: 'derivation', relationship_type: 'syndicated_from', origin_status: 'resolved_origin_found', review_status: 'unreviewed' },
  ]).size, 0)
})

test('unrelated articles stay independent — the fix does not over-collapse', () => {
  const plan = runPipeline(FIXTURE.articles, FIXTURE.entity_pairs, FIXTURE.config, { entries: [] })
  const clusters = collapseByPersistedLineage(
    buildStage3Assertions(FIXTURE.articles, plan.syndicates, { corpusScope: SCOPE, checkedAt: AT }),
  )
  // a1 (o1) and a3 (o3) are genuinely independent reporting.
  assert.equal(clusters.get('a1'), undefined)
  assert.equal(clusters.get('a3'), undefined)
  const outlets = independentOutlets(['a1', 'a2', 'a2w', 'a2w2', 'a2w3', 'a3'], articleById, clusters)
  assert.equal(outlets.length, 3) // o1, the wire group as one, o3
})
