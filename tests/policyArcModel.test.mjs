// Track B Step 3 item 2 — Policy Arc screen (addendum Screen 4) tests.
// Pure-seam invariants for src/lib/policyArcModel.js plus the item-1 model
// extension (eventTypeIcon), and static drift guards for the load-bearing
// copy (lifecycle caption, chronology banner) in the shipped files.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { eventTypeIcon } from '../src/lib/epistemicModel.js'
import {
  policyArcEyebrow,
  deriveEvidenceStates,
  missingScopeCopy,
  lastMilestoneCheck,
  pendingUncertainty,
  distinctOutlets,
  CONTESTED_DISPUTE_SIGNAL,
} from '../src/lib/policyArcModel.js'

const here = dirname(fileURLToPath(import.meta.url))
const src = (p) => readFileSync(join(here, '..', p), 'utf8')

// --- Eyebrow (A2.1) -----------------------------------------------------------

test('eyebrow is POLICY ARC only for policy categories', () => {
  assert.equal(policyArcEyebrow('legislative_regulatory'), 'POLICY ARC')
  assert.equal(policyArcEyebrow('economic_policy'), 'POLICY ARC')
})

test('eyebrow is STORY ARC for every non-policy or unknown category', () => {
  // Full live vocabulary (verified 2026-08-18) plus unknowns.
  for (const c of [
    'institutional_accountability',
    'geopolitical_consequence',
    'unclassified',
    'unknown_future_category',
    '',
    null,
    undefined,
  ]) {
    assert.equal(policyArcEyebrow(c), 'STORY ARC')
  }
})

// --- Evidence-state derivation (A2.8) ------------------------------------------

test('supporting counts confirmed and corroborated events only', () => {
  const events = [
    { confidence: 'confirmed' },
    { confidence: 'corroborated' },
    { confidence: 'corroborated' },
    { confidence: 'inferred' }, // not confirmed-grade
    { confidence: 'garbage' },
    { confidence: null },
    {},
  ]
  const { supporting } = deriveEvidenceStates(events, [])
  assert.equal(supporting, 3)
})

test('missing counts pending milestones only', () => {
  const milestones = [
    { status: 'pending' },
    { status: 'pending' },
    { status: 'confirmed' },
    { status: 'failed' },
    { status: 'unresolved' }, // legacy value is NOT pending in the new taxonomy
    {},
  ]
  const { missing } = deriveEvidenceStates([], milestones)
  assert.equal(missing, 2)
})

test('contested is a documented zero across a probe sweep — never fabricated', () => {
  // The arc schema has no dispute signal (CONTESTED_DISPUTE_SIGNAL === null).
  assert.equal(CONTESTED_DISPUTE_SIGNAL, null)
  const vocab = ['confirmed', 'corroborated', 'inferred', 'contested', 'disputed', '', null]
  for (const c of vocab) {
    const { contested } = deriveEvidenceStates([{ confidence: c }], [{ status: 'pending' }])
    assert.equal(contested, 0)
  }
})

test('derivation returns exactly three frozen counts, tolerates non-arrays', () => {
  const counts = deriveEvidenceStates(null, undefined)
  assert.deepEqual(counts, { supporting: 0, contested: 0, missing: 0 })
  assert.ok(Object.isFrozen(counts))
  assert.deepEqual(Object.keys(counts).sort(), ['contested', 'missing', 'supporting'])
})

// --- Guardrail-4 missing-scope copy (A2.8) --------------------------------------

test('missing scope copy carries count, period, and corpus basis', () => {
  const copy = missingScopeCopy({
    pendingCount: 3,
    startedAt: '2026-05-02',
    lastCheck: '2026-08-17T04:11:00Z',
  })
  assert.ok(copy.includes('3 expected outcomes'))
  assert.ok(copy.includes('2026-05-02'))
  assert.ok(copy.includes('2026-08-17'))
  assert.ok(copy.includes('monitored corpus'))
})

test('missing scope copy singularizes and returns null when a leg is missing', () => {
  assert.ok(
    missingScopeCopy({ pendingCount: 1, startedAt: '2026-05-02', lastCheck: '2026-08-17' })
      .includes('1 expected outcome '),
  )
  assert.equal(missingScopeCopy({ pendingCount: 0, startedAt: '2026-05-02', lastCheck: '2026-08-17' }), null)
  assert.equal(missingScopeCopy({ pendingCount: 2, startedAt: null, lastCheck: '2026-08-17' }), null)
  assert.equal(missingScopeCopy({ pendingCount: 2, startedAt: '2026-05-02', lastCheck: null }), null)
  assert.equal(missingScopeCopy(), null)
})

test('lastMilestoneCheck takes the freshest milestone update or null', () => {
  assert.equal(
    lastMilestoneCheck([
      { updated_at: '2026-06-01T00:00:00Z' },
      { updated_at: '2026-08-15T12:00:00Z' },
      { updated_at: null },
      {},
    ]),
    '2026-08-15',
  )
  assert.equal(lastMilestoneCheck([{ updated_at: null }, {}]), null)
  assert.equal(lastMilestoneCheck(null), null)
})

// --- Remaining uncertainty (A2.9) ------------------------------------------------

test('pending uncertainty lists pending milestone titles, else null', () => {
  assert.deepEqual(
    pendingUncertainty([
      { status: 'pending', title: ' Enforcement rule issued ' },
      { status: 'confirmed', title: 'Bill passed' },
      { status: 'pending', title: 'Court appeal decided' },
      { status: 'pending', title: '  ' },
    ]),
    ['Enforcement rule issued', 'Court appeal decided'],
  )
  assert.equal(pendingUncertainty([{ status: 'confirmed', title: 'Bill passed' }]), null)
  assert.equal(pendingUncertainty(null), null)
})

// --- Sources line (A2.10) ---------------------------------------------------------

test('distinct outlets in first-seen order, blanks dropped', () => {
  assert.deepEqual(
    distinctOutlets([
      { outlet: 'AP' },
      { outlet: 'Reuters' },
      { outlet: 'AP' },
      { outlet: '  ' },
      { outlet: null },
      {},
      { outlet: 'BBC' },
    ]),
    ['AP', 'Reuters', 'BBC'],
  )
  assert.deepEqual(distinctOutlets(null), [])
})

// --- Event type icons (A2.6, shared with Screen 5) --------------------------------

test('eventTypeIcon maps the locked vocabulary and the live legislative category', () => {
  assert.equal(eventTypeIcon('legislation'), 'scales')
  assert.equal(eventTypeIcon('legislative'), 'scales')
  assert.equal(eventTypeIcon('ruling'), 'gavel')
  assert.equal(eventTypeIcon('incident'), 'shield')
  assert.equal(eventTypeIcon('coverage'), 'mic')
  assert.equal(eventTypeIcon(' Coverage '), 'mic') // trim + case
})

test('eventTypeIcon returns null for live categories with no honest icon mapping', () => {
  // Live arc_events.category vocabulary (verified 2026-08-18). These render
  // the neutral marker — never an icon that asserts a type the record lacks.
  for (const c of ['accountability', 'geopolitical', 'economic', 'garbage', '', null, 7]) {
    assert.equal(eventTypeIcon(c), null)
  }
})

// --- Static drift guards -----------------------------------------------------------
// Locked copy and structural constraints pinned against the shipped files.

test('lifecycle caption is hardcoded verbatim in LifecycleStrip.jsx and is not a prop', () => {
  const file = src('src/components/LifecycleStrip.jsx')
  assert.ok(file.includes('Orientation only. Not a score.'))
  assert.ok(!/caption\s*[,}]/.test(file), 'caption must not be destructured as a prop')
  // No stage is ever filled or marked complete (static strip).
  assert.ok(!/progress|complete|done|filled/i.test(stripComments(file)))
})

test('chronology banner copy is verbatim in ArcsView.jsx', () => {
  const file = src('src/views/ArcsView.jsx')
  assert.ok(
    file.includes('Chronology shows sequence. Causal links appear only when supported by evidence.'),
  )
})

test('ArcsView renders the trust footer without a fabricated review date', () => {
  const file = src('src/views/ArcsView.jsx')
  assert.ok(/<TrustFooter\s/.test(file))
  assert.ok(file.includes('reviewedAt={null}'))
})

test('new kit files carry no hardcoded hex colors', () => {
  for (const p of [
    'src/components/LifecycleStrip.jsx',
    'src/components/TypeIcon.jsx',
    'src/components/epistemic.css',
    'src/lib/policyArcModel.js',
    'src/lib/epistemicModel.js',
  ]) {
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(src(p)), `${p} must use var() tokens only`)
  }
})

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')
}
