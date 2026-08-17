// Track B Step 3 item 3 — timeline connector + expanded-detail engine tests.
// The connector rule is the addendum's single most important Screen 5
// element; these tests pin it against fixtures because the live corpus has
// ZERO causal edges (verified 2026-08-18) — the causal branch must be
// proven here, exactly as Step 2 item 4 pinned "led to".

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  CONNECTOR_SEQUENCE_LABEL,
  CONNECTOR_CAUSAL_LABEL,
  TIMELINE_CLOSING_FOOTNOTE,
  findCausalLink,
  connectorBetween,
  buildConnectors,
  entryDetailView,
  DETAIL_EMPTY,
} from '../src/lib/timelineEngine.js'
import { AXIS_TONES } from '../src/lib/relationshipProvenance.js'

const here = dirname(fileURLToPath(import.meta.url))
const src = (p) => readFileSync(join(here, '..', p), 'utf8')

// --- Locked copy (A3.1) -------------------------------------------------------

test('connector labels and closing footnote are the verbatim locked copy', () => {
  assert.equal(CONNECTOR_SEQUENCE_LABEL, 'Sequence only')
  assert.equal(CONNECTOR_CAUSAL_LABEL, 'Source-supported causal link')
  assert.equal(
    TIMELINE_CLOSING_FOOTNOTE,
    'Chronology is shown as sequence. Causal links appear only when source-supported.',
  )
})

// --- One connector per gap, never dropped (A3.2) --------------------------------

test('buildConnectors returns exactly n-1 connectors for n entries', () => {
  for (const n of [0, 1, 2, 5, 25]) {
    const entries = Array.from({ length: n }, (_, i) => ({ key: `k${i}` }))
    const connectors = buildConnectors(entries, [])
    assert.equal(connectors.length, Math.max(0, n - 1))
    for (const c of connectors) assert.equal(c.kind, 'sequence')
  }
  assert.deepEqual(buildConnectors(null, []), [])
})

// --- Default and negative branches (A3.3, A3.5) ----------------------------------

test('no edge, non-causal edges, unknown types, missing strength all yield Sequence only', () => {
  const cases = [
    [], // no edges at all
    [{ type: 'sequence', source: 'a', target: 'b', doc_strength: 'documented' }],
    [{ type: 'actor', source: 'a', target: 'b', doc_strength: 'corroborated' }],
    [{ type: 'constrained_by', source: 'a', target: 'b', doc_strength: 'documented' }],
    [{ type: 'mystery_future_type', source: 'a', target: 'b', doc_strength: 'documented' }],
    [{ type: 'causal', source: 'a', target: 'b' }], // doc_strength absent (older read shape)
    [{ type: 'causal', source: 'a', target: 'b', doc_strength: null }],
    [{ type: 'causal', source: 'a', target: 'b', doc_strength: 'circumstantial' }],
    [{ type: 'causal', source: 'a', target: 'b', doc_strength: 'garbage' }],
  ]
  for (const edges of cases) {
    const c = connectorBetween('a', 'b', edges)
    assert.equal(c.kind, 'sequence', JSON.stringify(edges))
    assert.equal(c.label, CONNECTOR_SEQUENCE_LABEL)
    assert.equal(c.edgeId, null)
  }
})

// --- Causal branch, unit-test-pinned (A3.4) ---------------------------------------

test('confirmed-grade causal edge earlier→later yields the causal connector', () => {
  for (const strength of ['documented', 'corroborated']) {
    const edges = [{ id: 'e1', type: 'causal', source: 'a', target: 'b', doc_strength: strength }]
    const c = connectorBetween('a', 'b', edges)
    assert.equal(c.kind, 'causal')
    assert.equal(c.label, CONNECTOR_CAUSAL_LABEL)
    assert.equal(c.edgeId, 'e1')
  }
})

test('direction must match chronology: backward causal never labels the gap', () => {
  const edges = [{ type: 'causal', source: 'b', target: 'a', doc_strength: 'documented' }]
  assert.equal(connectorBetween('a', 'b', edges).kind, 'sequence')
  // ...but the same edge DOES label the b→a gap when b is earlier.
  assert.equal(connectorBetween('b', 'a', edges).kind, 'causal')
})

test('findCausalLink ignores edges between other pairs and null keys', () => {
  const edges = [{ type: 'causal', source: 'x', target: 'y', doc_strength: 'documented' }]
  assert.equal(findCausalLink('a', 'b', edges), null)
  assert.equal(findCausalLink(null, 'b', edges), null)
  assert.equal(findCausalLink('a', 'b', null), null)
})

test('mixed corpus: causal labels only where the full rule holds', () => {
  const entries = [{ key: 'a' }, { key: 'b' }, { key: 'c' }, { key: 'd' }]
  const edges = [
    { type: 'causal', source: 'a', target: 'b', doc_strength: 'corroborated' },
    { type: 'causal', source: 'b', target: 'c', doc_strength: 'circumstantial' },
    { type: 'sequence', source: 'c', target: 'd' },
  ]
  const connectors = buildConnectors(entries, edges)
  assert.deepEqual(
    connectors.map((c) => c.kind),
    ['causal', 'sequence', 'sequence'],
  )
})

// --- Expanded detail card (A3.7) ---------------------------------------------------

test('detail view tones stay inside the shared AXIS_TONES vocabulary', () => {
  const view = entryDetailView({ entry: { description: 'x' } })
  for (const section of Object.values(view)) {
    assert.ok(AXIS_TONES.includes(section.tone), section.tone)
  }
})

test('What changed: description value, else explicit unavailable', () => {
  assert.deepEqual(entryDetailView({ entry: { description: '  Court raised the bar ' } }).whatChanged, {
    tone: 'value',
    text: 'Court raised the bar',
  })
  // summary is the fallback leg
  assert.equal(entryDetailView({ entry: { summary: 's' } }).whatChanged.tone, 'value')
  assert.deepEqual(entryDetailView({ entry: {} }).whatChanged, {
    tone: 'unavailable',
    text: DETAIL_EMPTY.whatChanged,
  })
  assert.equal(entryDetailView({}).whatChanged.tone, 'unavailable')
})

test('Source excerpt: quoted only with attribution legs intact', () => {
  const full = entryDetailView({
    entry: {},
    article: { summary: ' The order takes effect Monday. ', outlet: 'AP', published_at: '2026-08-01T05:00:00Z' },
  })
  assert.equal(full.sourceExcerpt.tone, 'value')
  assert.equal(full.sourceExcerpt.text, 'The order takes effect Monday.')
  assert.equal(full.sourceExcerpt.attribution, '— AP, 2026-08-01')

  // Each missing leg withholds the excerpt — a quote is never unattributed.
  for (const article of [
    { summary: 's', outlet: 'AP' }, // no date
    { summary: 's', published_at: '2026-08-01' }, // no outlet
    { outlet: 'AP', published_at: '2026-08-01' }, // no excerpt text
    { summary: '  ', outlet: 'AP', published_at: '2026-08-01' },
  ]) {
    const v = entryDetailView({ entry: {}, article })
    assert.equal(v.sourceExcerpt.tone, 'unavailable', JSON.stringify(article))
    assert.equal(v.sourceExcerpt.text, DETAIL_EMPTY.sourceExcerpt)
    assert.equal(v.sourceExcerpt.attribution, undefined)
  }
  assert.equal(entryDetailView({ entry: {}, article: null }).sourceExcerpt.tone, 'unavailable')
})

test('Authentication and remaining uncertainty are explicit unavailable states', () => {
  const view = entryDetailView({ entry: { description: 'x' } })
  assert.deepEqual(view.authentication, {
    tone: 'unavailable',
    text: 'Not archived — authentication not yet available for this entry.',
  })
  assert.deepEqual(view.remainingUncertainty, {
    tone: 'unavailable',
    text: 'No remaining-uncertainty note recorded for this entry.',
  })
})

// --- Static drift guards (A3.6, A3.8) ----------------------------------------------

test('connector component carries both verbatim labels and distinct line classes', () => {
  const file = src('src/components/TimelineConnector.jsx')
  assert.ok(file.includes("'Sequence only'") === false) // labels come from the model, not re-typed
  const model = src('src/lib/timelineEngine.js')
  assert.ok(model.includes("'Sequence only'"))
  assert.ok(model.includes("'Source-supported causal link'"))
  assert.ok(
    model.includes('Chronology is shown as sequence. Causal links appear only when source-supported.'),
  )
  assert.ok(file.includes('ep-connector-causal'))
  assert.ok(file.includes('ep-connector-sequence'))
  // Link icon is causal-only.
  assert.ok(/causal && \([\s\S]*?ep-connector-linkicon/.test(file))
})

test('connector line treatments are dashed-sequence / solid-arrow-causal in CSS and SVG', () => {
  const css = src('src/components/epistemic.css')
  assert.match(css, /\.ep-connector-sequence/)
  assert.match(css, /\.ep-connector-causal/)
  const jsx = src('src/components/TimelineConnector.jsx')
  assert.ok(jsx.includes('strokeDasharray'), 'sequence line must be dashed')
  assert.ok(/ep-connector-label[\s\S]*?border:\s*var\(--border-width\) dashed/.test(css))
})

test('no hardcoded hex in item-3 files', () => {
  for (const p of [
    'src/lib/timelineEngine.js',
    'src/components/TimelineConnector.jsx',
    'src/components/TimelineEntryDetail.jsx',
    'src/components/epistemic.css',
  ]) {
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(src(p)), `${p} must use var() tokens only`)
  }
})
