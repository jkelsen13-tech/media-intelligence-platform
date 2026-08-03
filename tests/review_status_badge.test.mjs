// 02B-ADD Part A (2026-08-03): auto_verified status handling.
// Pins the two acceptance invariants:
//   1. auto_verified rows are NEVER presentation-eligible (same exclusion as the
//      human-review queue; only review_status = 'published' presents).
//   2. The auto_verified badge is visually and textually distinct from the
//      human 'reviewed' badge — the statuses can never be conflated.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  presentationFailureState,
  isPresentationEligible,
  reviewStatusBadge,
  REVIEW_STATUS_BADGES,
} from '../src/lib/explanationEligibility.js'

function baseRow(overrides = {}) {
  return {
    id: '00000000-0000-0000-0000-0000000000b1',
    assertion_id: 'classification:fixture-auto-1',
    assertion_type: 'classification',
    version: 1,
    is_current: true,
    source_ids: ['00000000-0000-0000-0000-0000000000aa'],
    archived_sources: [{ source_id: '00000000-0000-0000-0000-0000000000aa', status: 'archived' }],
    supporting_passage: 'Arc classified as geopolitical consequence.',
    relationship_type: 'n/a',
    rule_version: 'test-fixture-r1',
    provenance_class: 'machine',
    review_status: 'auto_verified',
    falsification_condition: 'Arc reclassified by owner decision',
    correction_history: [],
    remaining_uncertainty: null,
    state: 'ok',
    ...overrides,
  }
}

test('auto_verified row is excluded from presentation (under_review failure state)', () => {
  const row = baseRow()
  assert.equal(presentationFailureState(row), 'under_review')
  assert.equal(isPresentationEligible(row), false)
})

test('auto_verified never reaches presentation even with complete provenance', () => {
  // Everything the D4 layer-2 predicate wants EXCEPT published status.
  const row = baseRow({ provenance_class: 'human_reviewed' })
  assert.equal(isPresentationEligible(row), false)
})

test('auto_verified badge is distinct from reviewed badge (label and tone)', () => {
  const auto = reviewStatusBadge('auto_verified')
  const human = reviewStatusBadge('reviewed')
  assert.notEqual(auto.label, human.label)
  assert.notEqual(auto.tone, human.tone)
  assert.equal(auto.tone, 'system')
  assert.equal(human.tone, 'human')
  assert.match(auto.label, /not human-reviewed/)
  assert.match(human.label, /human confirmed/)
})

test('badge map covers the full live review_status vocabulary', () => {
  for (const status of [
    'draft',
    'awaiting_review',
    'auto_verified',
    'reviewed',
    'published',
    'disputed',
    'corrected',
    'withdrawn',
  ]) {
    assert.ok(REVIEW_STATUS_BADGES[status], `missing badge for ${status}`)
  }
  assert.equal(reviewStatusBadge('not-a-status').tone, 'muted')
})
