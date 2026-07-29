// D4/D5 read-path eligibility golden suite (owner-authorized 2026-07-29).
// Verifies the independent read-time exclusion layer against the D4 layer 2
// design and D5 propagation semantics in docs/PHASE_2_D4_D5_DECISIONS.md.
// Coverage: eligible publication, missing provenance, insufficient evidence,
// awaiting review, corrected sources, withdrawn sources, negative controls,
// and no-auto-republish behavior.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FAILURE_STATES,
  presentationFailureState,
  isPresentationEligible,
  partitionByEligibility,
} from '../../src/lib/explanationEligibility.js'

// A fully populated, presentation-eligible explanation row.
function eligibleRow(overrides = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    assertion_id: 'edge:fixture-eligible-1',
    assertion_type: 'edge',
    version: 1,
    is_current: true,
    source_ids: ['00000000-0000-0000-0000-0000000000aa'],
    archived_sources: [{ source_id: '00000000-0000-0000-0000-0000000000aa', status: 'archived' }],
    supporting_passage: 'Houthi forces announced restrictions on Red Sea transit.',
    relationship_type: 'causal',
    rule_version: 'test-fixture-r1',
    provenance_class: 'human_reviewed',
    review_status: 'published',
    falsification_condition: 'Retraction by both primary sources',
    correction_history: [],
    remaining_uncertainty: 'Single-theater reporting only',
    state: 'ok',
    ...overrides,
  }
}

test('eligible publication: well-formed published row is presentation-eligible', () => {
  const row = eligibleRow()
  assert.equal(isPresentationEligible(row), true)
  assert.equal(presentationFailureState(row), null)
})

test('missing provenance: published-flagged rows with explicit missing states are excluded', () => {
  // missing supporting passage (D4 layer 1 mirror)
  assert.equal(presentationFailureState(eligibleRow({ supporting_passage: null })), 'insufficient_evidence')
  assert.equal(presentationFailureState(eligibleRow({ supporting_passage: '   ' })), 'insufficient_evidence')
  // explicit missing falsification condition
  assert.equal(
    presentationFailureState(eligibleRow({ falsification_condition: 'missing: not recorded at generation time' })),
    'insufficient_evidence',
  )
  assert.equal(
    presentationFailureState(eligibleRow({ falsification_condition: 'MISSING: uppercase variant' })),
    'insufficient_evidence',
  )
  assert.equal(
    presentationFailureState(eligibleRow({ falsification_condition: null })),
    'insufficient_evidence',
  )
  // required archived source carries explicit missing state
  assert.equal(
    presentationFailureState(
      eligibleRow({ archived_sources: [{ source_id: 'x', status: 'missing' }] }),
    ),
    'source_unavailable',
  )
  assert.equal(isPresentationEligible(eligibleRow({ supporting_passage: null })), false)
})

test('insufficient evidence: state=insufficient_evidence is excluded, even if flagged published', () => {
  const row = eligibleRow({ state: 'insufficient_evidence' })
  assert.equal(isPresentationEligible(row), false)
  assert.equal(presentationFailureState(row), 'insufficient_evidence')
  // live-corpus shape: awaiting_review + insufficient_evidence (543 rows at checkpoint)
  const liveShape = eligibleRow({ review_status: 'awaiting_review', state: 'insufficient_evidence' })
  assert.equal(isPresentationEligible(liveShape), false)
})

test('awaiting review: non-published review statuses are excluded as under review', () => {
  assert.equal(presentationFailureState(eligibleRow({ review_status: 'awaiting_review' })), 'under_review')
  assert.equal(presentationFailureState(eligibleRow({ review_status: 'draft' })), 'under_review')
  assert.equal(presentationFailureState(eligibleRow({ review_status: 'reviewed' })), 'under_review')
  assert.equal(presentationFailureState(eligibleRow({ review_status: 'disputed' })), 'under_review')
  assert.equal(isPresentationEligible(eligibleRow({ review_status: 'awaiting_review' })), false)
})

test('corrected source: D5-propagated rows are excluded as source_corrected', () => {
  // D5 propagation shape: review_status forced to awaiting_review, state source_corrected,
  // provenance fields still populated, correction_history appended.
  const propagated = eligibleRow({
    review_status: 'awaiting_review',
    state: 'source_corrected',
    correction_history: [
      { changed_by: 'system', reason: 'source corrected; renewed human review required per D5' },
    ],
  })
  assert.equal(presentationFailureState(propagated), 'source_corrected')
  assert.equal(isPresentationEligible(propagated), false)
  // defense in depth: even a corrupted published flag cannot leak through
  const corruptFlag = eligibleRow({ review_status: 'published', state: 'source_corrected' })
  assert.equal(isPresentationEligible(corruptFlag), false)
  assert.equal(presentationFailureState(corruptFlag), 'source_corrected')
})

test('withdrawn source: D5-propagated rows are excluded as source_withdrawn', () => {
  const propagated = eligibleRow({ review_status: 'awaiting_review', state: 'source_withdrawn' })
  assert.equal(presentationFailureState(propagated), 'source_withdrawn')
  assert.equal(isPresentationEligible(propagated), false)
  const corruptFlag = eligibleRow({ review_status: 'published', state: 'source_withdrawn' })
  assert.equal(isPresentationEligible(corruptFlag), false)
  assert.equal(presentationFailureState(corruptFlag), 'source_withdrawn')
})

test('negative controls: unrelated rows untouched; history rows and non-object input excluded', () => {
  const good = eligibleRow({ assertion_id: 'edge:unrelated-1' })
  const bad = eligibleRow({ assertion_id: 'edge:propagated-1', review_status: 'awaiting_review', state: 'source_withdrawn' })
  const { eligible, excluded } = partitionByEligibility([good, bad])
  assert.deepEqual(eligible, [good]) // unrelated assertion unaffected by its neighbor
  assert.equal(excluded.length, 1)
  assert.equal(excluded[0].explanation.assertion_id, 'edge:propagated-1')
  assert.equal(excluded[0].failureState, 'source_withdrawn')
  // prior-version history rows are never presented
  assert.equal(isPresentationEligible(eligibleRow({ is_current: false })), false)
  // malformed input degrades to an explicit state, never a confident default
  assert.equal(presentationFailureState(null), 'explanation_pending')
  assert.equal(presentationFailureState(undefined), 'explanation_pending')
  assert.equal(presentationFailureState({}), 'explanation_pending')
  // partition handles empty/null input
  assert.deepEqual(partitionByEligibility(null), { eligible: [], excluded: [] })
})

test('no auto-republish: propagated rows return only via explicit renewed human review', () => {
  // After D5 propagation the row keeps full provenance but is ineligible.
  const propagated = eligibleRow({ review_status: 'awaiting_review', state: 'source_corrected' })
  assert.equal(isPresentationEligible(propagated), false)

  // Intermediate human-review steps do not publish it either.
  assert.equal(isPresentationEligible({ ...propagated, review_status: 'reviewed' }), false)
  assert.equal(isPresentationEligible({ ...propagated, state: 'ok' }), false)

  // Only the complete explicit transition (published AND ok) restores eligibility.
  const republished = { ...propagated, review_status: 'published', state: 'ok' }
  assert.equal(isPresentationEligible(republished), true)

  // Nothing the module does mutates the row: no automatic republication path exists.
  const frozen = Object.freeze(propagated)
  presentationFailureState(frozen)
  partitionByEligibility([frozen])
  assert.equal(frozen.review_status, 'awaiting_review')
  assert.equal(frozen.state, 'source_corrected')
})

test('failure-state vocabulary matches the live explanations.state enum exactly', () => {
  assert.deepEqual([...FAILURE_STATES].sort(), [
    'explanation_pending',
    'insufficient_evidence',
    'method_version_unavailable',
    'partial_backend_failure',
    'recomputation_required',
    'source_corrected',
    'source_unavailable',
    'source_withdrawn',
    'under_review',
  ])
  // every non-ok live enum state is classified to itself
  for (const state of FAILURE_STATES) {
    assert.equal(presentationFailureState(eligibleRow({ state })), state)
  }
})
