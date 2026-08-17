// Golden tests — 20_IDEA capability 1, Graph lineage mode elements
// (brief Section 5, checkpoint 7b).
//
// Covers the mapping from the projection to canvas elements: relationship
// vocabulary, the edge-vs-state distinction, guardrail-4 scope on every
// origin state, honest degradation, and the standing no-composite-score and
// no-bare-independence rules.

import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLineageElements, lineageEmptyState, originStateScope } from '../../src/graph/lineageElements.js'
import { EDGE_TYPES, LINEAGE_EDGE_TYPES, ORIGIN_STATUS_LABELS, lineagePlainLabel } from '../../src/graph/theme.js'

const EV = { corpus_scope: { articles_scanned: 752 }, checked_at: '2026-08-17T00:00:00.000Z' }

const edge = (over = {}) => ({
  assertionId: 'e1', childArticleId: 'child', parentArticleId: 'parent',
  kind: 'edge', relationshipClass: 'derivation', relationshipType: 'syndicated_from',
  originStatus: null, detectionMethod: 'exact_text_hash', confidenceBand: 'high',
  evidence: EV, ruleVersion: 'lineage-v1', ...over,
})

const annotation = (over = {}) => ({
  assertionId: 'a1', childArticleId: 'solo', parentArticleId: null,
  kind: 'origin_annotation', relationshipClass: 'origin_classification',
  relationshipType: 'origin_undetermined', originStatus: 'independent_origin_candidate',
  detectionMethod: 'corpus_scan', confidenceBand: 'low', evidence: EV,
  ruleVersion: 'lineage-v1', ...over,
})

const ARTICLES = new Map([
  ['parent', { outlet: 'Reuters', title: 'Original wire report on the ruling', url: 'https://reuters.com/x', published_at: '2026-05-01' }],
  ['child', { outlet: 'Billings Gazette', title: 'Wire copy', url: 'https://billingsgazette.com/x', published_at: '2026-05-03' }],
  ['solo', { outlet: 'BBC', title: 'Own reporting', url: 'https://bbc.co.uk/x', published_at: '2026-05-02' }],
])

// ---------------------------------------------------------------------------

test('lineage types are a SEPARATE registry — the default graph legend is untouched', () => {
  // Legend renders every EDGE_TYPES entry unconditionally, so folding lineage
  // types in would add permanent rows for relationships that only appear in
  // lineage mode.
  for (const key of Object.keys(LINEAGE_EDGE_TYPES)) {
    assert.ok(!(key in EDGE_TYPES), `${key} must not leak into the default EDGE_TYPES`)
  }
  assert.deepEqual(
    Object.keys(EDGE_TYPES),
    ['causal', 'actor', 'financial', 'conflict', 'documentary', 'sequence', 'constrained_by'],
    'existing edge vocabulary must be unchanged',
  )
})

test('every lineage type carries a distinct plain-language phrase (accent-removal bar)', () => {
  const plains = Object.values(LINEAGE_EDGE_TYPES).map((m) => m.plain)
  assert.equal(new Set(plains).size, plains.length, 'meaning must not rest on color alone')
  for (const m of Object.values(LINEAGE_EDGE_TYPES)) {
    assert.ok(m.label && m.plain && m.cssVar, 'same shape as EDGE_TYPES entries')
  }
  assert.equal(lineagePlainLabel('syndicated_from'), 'syndicated from')
  assert.equal(lineagePlainLabel('quotes'), 'quotes')
  // Unknown type degrades to the raw string rather than throwing or blanking.
  assert.equal(lineagePlainLabel('not_a_type'), 'not_a_type')
})

test('an edge becomes one canvas edge plus both article nodes', () => {
  const { nodes, edges } = buildLineageElements({ edges: [edge()], originAnnotations: [] }, ARTICLES)
  assert.equal(edges.length, 1)
  assert.equal(nodes.length, 2)
  // Arrow points the way the reporting travelled: origin -> copy.
  assert.equal(edges[0].source, 'parent')
  assert.equal(edges[0].target, 'child')
  assert.equal(edges[0].plain, 'syndicated from')
  assert.equal(edges[0].isDerivation, true)
  assert.ok(nodes.every((n) => n.type === 'article' && n.resolved))
  assert.match(nodes.find((n) => n.id === 'parent').label, /^Reuters — /)
})

test('a citation edge is marked NOT a derivation', () => {
  const { edges } = buildLineageElements(
    { edges: [edge({ relationshipClass: 'reference', relationshipType: 'quotes' })], originAnnotations: [] },
    ARTICLES,
  )
  assert.equal(edges[0].isDerivation, false)
  assert.equal(edges[0].plain, 'quotes')
})

test('a parentless assertion is a STATE on one article, never an edge', () => {
  const { nodes, edges } = buildLineageElements({ edges: [], originAnnotations: [annotation()] }, ARTICLES)
  assert.equal(edges.length, 0, 'an origin annotation must never become an edge')
  assert.equal(nodes.length, 1)
  const n = nodes[0]
  assert.equal(n.originStatus, 'independent_origin_candidate')
  assert.equal(n.originLabel, 'Independent origin candidate')
  assert.match(n.originPlain, /candidate, not confirmed/)
})

test('origin vocabulary never claims independence', () => {
  for (const [status, vocab] of Object.entries(ORIGIN_STATUS_LABELS)) {
    assert.notEqual(status, 'independent_origin')
    // No phrase may assert the article IS independently reported.
    assert.ok(!/^independently reported/i.test(vocab.plain))
    assert.ok(vocab.label && vocab.plain)
  }
  // The hedge is explicit in the candidate wording.
  assert.match(ORIGIN_STATUS_LABELS.independent_origin_candidate.plain, /candidate|not confirmed/i)
})

test('an origin state without its scope renders NO claim (guardrail 4)', () => {
  const noScope = annotation({ evidence: {} })
  const { nodes } = buildLineageElements({ edges: [], originAnnotations: [noScope] }, ARTICLES)
  // The node still exists (it is referenced), but carries no origin claim.
  assert.equal(nodes.length, 1)
  assert.equal(nodes[0].originStatus, null)
  assert.equal(nodes[0].originPlain, null)
  assert.equal(originStateScope(noScope), null)
})

test('a state that DOES have scope exposes method, corpus size and date separately', () => {
  const { nodes } = buildLineageElements({ edges: [], originAnnotations: [annotation()] }, ARTICLES)
  const n = nodes[0]
  assert.equal(n.originDetectionMethod, 'corpus_scan')
  assert.equal(n.originArticlesScanned, 752)
  assert.equal(n.originCheckedAt, '2026-08-17')
  assert.equal(n.originConfidenceBand, 'low')
})

test('an unknown origin status produces no claim rather than a guess', () => {
  const { nodes } = buildLineageElements(
    { edges: [], originAnnotations: [annotation({ originStatus: 'something_new' })] }, ARTICLES,
  )
  assert.equal(nodes[0].originStatus, null)
})

test('an article missing from metadata still renders, labelled honestly', () => {
  // Dropping it would silently delete one end of a real relationship.
  const { nodes, unresolvedArticleIds } = buildLineageElements(
    { edges: [edge({ parentArticleId: '2e4fd9b8-ac17-4324-aef2-acbb23e8949a' })], originAnnotations: [] },
    new Map([['child', ARTICLES.get('child')]]),
  )
  const missing = nodes.find((n) => n.id.startsWith('2e4fd9b8'))
  assert.equal(missing.resolved, false)
  assert.equal(missing.label, 'Article 2e4fd9b8')
  assert.deepEqual(unresolvedArticleIds, ['2e4fd9b8-ac17-4324-aef2-acbb23e8949a'])
})

test('no composite score on any lineage element', () => {
  const { nodes, edges } = buildLineageElements(
    { edges: [edge()], originAnnotations: [annotation()] }, ARTICLES,
  )
  for (const el of [...nodes, ...edges]) {
    for (const [k, v] of Object.entries(el)) {
      if (k === 'originArticlesScanned') continue // corpus size, a scope fact
      assert.notEqual(typeof v, 'number', `${k} must not be a numeric score`)
      assert.ok(!/score/i.test(k), `${k} must not be a score field`)
    }
  }
  // The dimensions remain separate and independently readable.
  assert.equal(edges[0].confidenceBand, 'high')
  assert.equal(edges[0].relationshipClass, 'derivation')
})

test('element output is deterministic across rebuilds', () => {
  const input = { edges: [edge(), edge({ assertionId: 'e0', childArticleId: 'solo' })], originAnnotations: [annotation()] }
  const a = buildLineageElements(input, ARTICLES)
  const b = buildLineageElements(input, ARTICLES)
  assert.deepEqual(a, b)
  assert.deepEqual(a.nodes.map((n) => n.id), [...a.nodes.map((n) => n.id)].sort())
})

test('empty lineage mode reads as deliberate, not broken', () => {
  const state = lineageEmptyState({ enabled: true, edges: [], originAnnotations: [] })
  assert.ok(state.title && state.body)
  // The copy must say WHY it is empty, including that unreviewed and shadow
  // rows are withheld on purpose.
  assert.match(state.body, /verified/i)
  assert.match(state.body, /shadow/i)
  // Not empty -> no empty state.
  assert.equal(lineageEmptyState({ enabled: true, edges: [edge()], originAnnotations: [] }), null)
  // Disabled -> the mode is not shown at all, so no empty state either.
  assert.equal(lineageEmptyState({ enabled: false, edges: [], originAnnotations: [] }), null)
})

// ---------------------------------------------------------------------------
// Static wiring guards — 15A precedent: assert the integration itself, not
// just the pure helpers, so a future edit cannot quietly undo the posture.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs'

test('WIRING: lineage mode is withhold-gated and swaps the element set', () => {
  const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8')

  // The toggle must not exist unless the flag enabled the projection.
  assert.match(app, /lineageAvailable\s*=\s*!!lineage\?\.enabled/)
  assert.match(app, /lineageActive\s*=\s*lineageMode\s*&&\s*lineageAvailable/)
  assert.match(app, /\{lineageAvailable\s*&&\s*\(/, 'toggle must be gated on availability')

  // Element swap, not overlay: lineage elements replace the default set.
  assert.match(app, /displayNodes\s*=\s*lineageActive\s*\?\s*lineageElements\.nodes/)
  assert.match(app, /displayEdges\s*=\s*lineageActive\s*\?\s*lineageElements\.edges/)

  // A lineage load failure must never take down the graph.
  assert.match(app, /\.catch\(\(\)\s*=>\s*setLineage\(/)
})

test('WIRING: the lineage legend section appears only in lineage mode', () => {
  const legend = readFileSync(new URL('../../src/graph/Legend.jsx', import.meta.url), 'utf8')
  assert.match(legend, /\{lineageMode\s*&&\s*\(/, 'lineage legend must be conditional')
  assert.match(legend, /LINEAGE_EDGE_TYPES/)
  assert.match(legend, /ORIGIN_STATUS_LABELS/)
  // The withhold rationale must be stated to the reader, not just enforced.
  assert.match(legend, /shadow-mode candidates, are excluded on purpose/)
  // And the default legend must still render the unchanged edge vocabulary.
  assert.match(legend, /Object\.entries\(EDGE_TYPES\)/)
})
