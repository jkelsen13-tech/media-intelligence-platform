// D4/D5 read-path integration golden suite (owner-authorized 2026-07-29).
// Verifies the integration seam (buildExplanationReadView) that wires the
// eligibility predicate into the application's explanation read path:
// flag gating, consistent predicate application, and every exclusion class
// flowing through with its 02B failure state. Pure: no network, no database.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildExplanationReadView } from '../../src/lib/explanationReadPath.js'

function row(assertionId, overrides = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    assertion_id: assertionId,
    assertion_type: 'edge',
    version: 1,
    is_current: true,
    source_ids: ['00000000-0000-0000-0000-0000000000aa'],
    archived_sources: [{ source_id: '00000000-0000-0000-0000-0000000000aa', status: 'archived' }],
    supporting_passage: 'Houthi forces announced restrictions on Red Sea transit.',
    relationship_type: 'causal',
    rule_version: 'd2-3a-full-backfill',
    provenance_class: 'human_reviewed',
    review_status: 'published',
    falsification_condition: 'Retraction by both primary sources',
    correction_history: [],
    remaining_uncertainty: 'Single-theater reporting only',
    state: 'ok',
    ...overrides,
  }
}

// One row per class the owner requires the integration to handle.
function corpus() {
  return [
    row('edge:eligible-1'), // eligible published
    row('edge:missing-passage', { supporting_passage: null }), // missing provenance
    row('edge:missing-falsification', { falsification_condition: 'missing: not recorded' }),
    row('edge:insufficient', { state: 'insufficient_evidence', review_status: 'awaiting_review' }),
    row('edge:awaiting', { review_status: 'awaiting_review' }), // awaiting review
    row('edge:src-corrected', { state: 'source_corrected', review_status: 'awaiting_review' }),
    row('edge:src-withdrawn', { state: 'source_withdrawn', review_status: 'awaiting_review' }),
    row('edge:archived-missing', { archived_sources: [{ source_id: 'x', status: 'missing' }] }),
    row('edge:corrupt-flag-corrected', { state: 'source_corrected', review_status: 'published' }),
    row('edge:corrupt-flag-insufficient', { state: 'insufficient_evidence', review_status: 'published' }),
  ]
}

test('flag disabled: read path withholds everything, even eligible rows', () => {
  const view = buildExplanationReadView(corpus(), { enabled: false })
  assert.equal(view.enabled, false)
  assert.deepEqual(view.eligible, [])
  assert.deepEqual(view.excluded, [])
  // default (no option) is also disabled
  assert.deepEqual(buildExplanationReadView(corpus()).eligible, [])
})

test('flag enabled: eligible published explanations pass through intact', () => {
  const view = buildExplanationReadView(corpus(), { enabled: true })
  assert.equal(view.enabled, true)
  assert.deepEqual(view.eligible.map((e) => e.assertion_id), ['edge:eligible-1'])
  assert.equal(view.eligible[0].supporting_passage, 'Houthi forces announced restrictions on Red Sea transit.')
})

test('missing provenance is excluded with the correct failure states', () => {
  const view = buildExplanationReadView(corpus(), { enabled: true })
  const byId = Object.fromEntries(view.excluded.map((x) => [x.explanation.assertion_id, x.failureState]))
  assert.equal(byId['edge:missing-passage'], 'insufficient_evidence')
  assert.equal(byId['edge:missing-falsification'], 'insufficient_evidence')
  assert.equal(byId['edge:archived-missing'], 'source_unavailable')
})

test('insufficient evidence and awaiting review are excluded', () => {
  const view = buildExplanationReadView(corpus(), { enabled: true })
  const byId = Object.fromEntries(view.excluded.map((x) => [x.explanation.assertion_id, x.failureState]))
  assert.equal(byId['edge:insufficient'], 'insufficient_evidence')
  assert.equal(byId['edge:awaiting'], 'under_review')
})

test('corrected and withdrawn sources stay excluded until renewed review', () => {
  const view = buildExplanationReadView(corpus(), { enabled: true })
  const byId = Object.fromEntries(view.excluded.map((x) => [x.explanation.assertion_id, x.failureState]))
  assert.equal(byId['edge:src-corrected'], 'source_corrected')
  assert.equal(byId['edge:src-withdrawn'], 'source_withdrawn')
})

test('corrupted published flags cannot leak ineligible assertions', () => {
  const view = buildExplanationReadView(corpus(), { enabled: true })
  const eligibleIds = view.eligible.map((e) => e.assertion_id)
  assert.ok(!eligibleIds.includes('edge:corrupt-flag-corrected'))
  assert.ok(!eligibleIds.includes('edge:corrupt-flag-insufficient'))
  const byId = Object.fromEntries(view.excluded.map((x) => [x.explanation.assertion_id, x.failureState]))
  assert.equal(byId['edge:corrupt-flag-corrected'], 'source_corrected')
  assert.equal(byId['edge:corrupt-flag-insufficient'], 'insufficient_evidence')
})

test('integration applies the predicate consistently: every ineligible row carries a failure state', () => {
  const rows = corpus()
  const view = buildExplanationReadView(rows, { enabled: true })
  // full accounting: every input row appears exactly once, in one of the two lists
  assert.equal(view.eligible.length + view.excluded.length, rows.length)
  for (const { explanation, failureState } of view.excluded) {
    assert.equal(typeof failureState, 'string')
    assert.ok(failureState.length > 0, `${explanation.assertion_id}: missing failure state`)
  }
  // rows are never mutated by the read path
  const original = corpus()
  buildExplanationReadView(original, { enabled: true })
  assert.deepEqual(original, corpus())
})
