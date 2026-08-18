// Package 1 scope addition (owner-directed 2026-08-18, mid-package):
// grouped mode extends to ARC scope. Arc-scope Timeline landings
// (return-to-origin) render the grouped view — event cards with per-event
// outlet counts — instead of the flat list. Flat remains available.
// Pure-seam pins + static guards on the two touched views.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildEventOutletIndex,
  attachEventOutlets,
} from '../src/lib/arcGroupedTimeline.js'

// ---------- buildEventOutletIndex ----------

test('outlet index: multi-article event counts DISTINCT outlets, sorted', () => {
  const idx = buildEventOutletIndex(
    [
      { event_id: 'e1', article_id: 'a1' },
      { event_id: 'e1', article_id: 'a2' },
      { event_id: 'e1', article_id: 'a3' },
    ],
    new Map([
      ['a1', 'BBC'],
      ['a2', 'NPR'],
      ['a3', 'BBC'], // duplicate outlet collapses
    ]),
  )
    assert.deepEqual(idx.get('e1'), { outlets: ['BBC', 'NPR'], count: 2 })
})

test('outlet index: single-article event counts 1 honestly', () => {
  const idx = buildEventOutletIndex(
    [{ event_id: 'e2', article_id: 'a9' }],
    new Map([['a9', 'Reuters']]),
  )
  assert.deepEqual(idx.get('e2'), { outlets: ['Reuters'], count: 1 })
})

test('outlet index: unknown outlets are not invented; rows without ids skipped', () => {
  const idx = buildEventOutletIndex(
    [
      { event_id: 'e3', article_id: 'ax' }, // no outlet known
      { event_id: null, article_id: 'a1' },
      { event_id: 'e4', article_id: null },
    ],
    new Map([['a1', 'BBC']]),
  )
  assert.equal(idx.has('e3'), false) // zero known outlets -> no entry, card withholds
  assert.equal(idx.has('e4'), false)
  assert.equal(idx.size, 0)
})

test('outlet index: independent events never share outlet sets', () => {
  const idx = buildEventOutletIndex(
    [
      { event_id: 'e1', article_id: 'a1' },
      { event_id: 'e2', article_id: 'a2' },
    ],
    new Map([
      ['a1', 'BBC'],
      ['a2', 'NPR'],
    ]),
  )
  assert.equal(idx.get('e1').count, 1)
  assert.equal(idx.get('e2').count, 1)
})

// ---------- attachEventOutlets ----------

test('attach: event with resolved article join gets event outlets', () => {
  const out = attachEventOutlets(
    [{ slug: 'evt-x-12345678', article_id: 'a1' }],
    new Map([['a1', 'e1']]),
    new Map([['e1', { outlets: ['BBC', 'NPR'], count: 2 }]]),
  )
  assert.equal(out[0].eventId, 'e1')
  assert.equal(out[0].outletCount, 2)
  assert.deepEqual(out[0].outlets, ['BBC', 'NPR'])
})

test('attach: no article join or no event membership -> nulls, never fabricated', () => {
  const out = attachEventOutlets(
    [
      { slug: 'evt-y-aaaaaaaa', article_id: null },
      { slug: 'evt-z-bbbbbbbb', article_id: 'a9' }, // not a member of any event
    ],
    new Map(),
    new Map(),
  )
  assert.equal(out[0].eventId, null)
  assert.equal(out[0].outletCount, null)
  assert.equal(out[1].eventId, null)
  assert.equal(out[1].outletCount, null)
})

// ---------- static guards on the views ----------

const timelineViewSrc = readFileSync(new URL('../src/views/TimelineView.jsx', import.meta.url), 'utf8')
const groupedViewSrc = readFileSync(new URL('../src/views/GroupedTimelineView.jsx', import.meta.url), 'utf8')

test('guard: grouped render is NOT gated on global scope anymore', () => {
  // The pre-addition condition required scopeIsGlobal; it must be gone.
  assert.ok(
    !timelineViewSrc.includes("scopeIsGlobal && timelineMode === 'grouped'"),
    'grouped mode must render at arc scope too',
  )
  assert.ok(timelineViewSrc.includes("timelineMode === 'grouped' && groupedBeta"))
})

test('guard: arc landing defaults to grouped mode when the flag is on', () => {
  const effect = timelineViewSrc.match(/if \(!focusArcKey \|\| !arcs\) return[\s\S]*?\n  \}, \[focusArcKey/)
  assert.ok(effect, 'return-to-origin effect found')
  assert.ok(effect[0].includes("setTimelineMode('grouped')"))
})

test('guard: GroupedTimelineView receives the landing arc id at arc scope', () => {
  assert.ok(timelineViewSrc.includes('arcId={scopeIsGlobal ? null : selected.id}'))
  assert.ok(groupedViewSrc.includes('arcId = null'))
  assert.ok(groupedViewSrc.includes('s.arcId === arcId'))
})

test('guard: grouped event cards render the outlet-count line, withheld when null', () => {
  assert.ok(groupedViewSrc.includes('evt.outletCount > 0'))
  assert.ok(/outlet\{evt\.outletCount === 1 \? '' : 's'\} reporting/.test(groupedViewSrc))
})

test('guard: Flat chip still renders at both scopes (additive, not replacement)', () => {
  const chips = timelineViewSrc.match(/aria-label="Timeline layout"[\s\S]*?<\/div>/)
  assert.ok(chips, 'layout chip group present')
  assert.ok(chips[0].includes('Flat'))
  assert.ok(chips[0].includes('Grouped by arc (Beta)'))
  // The chip group must sit OUTSIDE the global-only controls block: the
  // controls block closes before the layout chips open.
  const controlsIdx = timelineViewSrc.indexOf('timeline-controls')
  const chipsIdx = timelineViewSrc.indexOf('aria-label="Timeline layout"')
  const controlsClose = timelineViewSrc.indexOf(')}', controlsIdx)
  assert.ok(chipsIdx > controlsIdx)
  assert.ok(chipsIdx > controlsClose, 'layout chips must not be inside the global-only block')
})
