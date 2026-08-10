// Unit tests for src/lib/listFilters.js — the pure filter seam behind the
// Arc sidebar search and Source Comparison title search (2026-08-10).
// Acceptance anchors: no rows dropped or duplicated by filtering, empty
// query is a no-op, case-insensitive substring, category label match,
// and an empty (not null/undefined) result for no matches.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeQuery,
  matchesQuery,
  filterArcs,
  filterEventsByTitle,
} from '../src/lib/listFilters.js'

const CATEGORY_LABELS = {
  institutional_accountability: 'Institutional Accountability',
  economic_policy: 'Economic Policy',
}
const label = (c) => CATEGORY_LABELS[c] ?? c

const ARCS = [
  { slug: 'a1', title: 'Fed rate path', category: 'economic_policy' },
  { slug: 'a2', title: 'Harbor contract probe', category: 'institutional_accountability' },
  { slug: 'a3', title: 'Unnamed story', category: 'unclassified' },
]

test('normalizeQuery trims and lowercases; nullish -> empty', () => {
  assert.equal(normalizeQuery('  Fed  '), 'fed')
  assert.equal(normalizeQuery(null), '')
  assert.equal(normalizeQuery(undefined), '')
})

test('matchesQuery: empty query matches everything', () => {
  assert.equal(matchesQuery(['anything'], ''), true)
  assert.equal(matchesQuery([null], ''), true)
})

test('filterArcs: empty/blank query returns every arc, same order, no dupes', () => {
  for (const q of ['', '   ', null]) {
    const out = filterArcs(ARCS, q, label)
    assert.deepEqual(out.map((a) => a.slug), ['a1', 'a2', 'a3'])
  }
})

test('filterArcs: title substring, case-insensitive, no drops/dupes', () => {
  const out = filterArcs(ARCS, 'FED', label)
  assert.deepEqual(out.map((a) => a.slug), ['a1'])
  // union of single-arc queries covers all arcs exactly once
  const union = new Set(['fed', 'harbor', 'unnamed'].flatMap((q) => filterArcs(ARCS, q, label).map((a) => a.slug)))
  assert.equal(union.size, ARCS.length)
})

test('filterArcs: matches category display label and raw key', () => {
  assert.deepEqual(filterArcs(ARCS, 'economic policy', label).map((a) => a.slug), ['a1'])
  assert.deepEqual(filterArcs(ARCS, 'institutional', label).map((a) => a.slug), ['a2'])
  assert.deepEqual(filterArcs(ARCS, 'unclassified', label).map((a) => a.slug), ['a3'])
})

test('filterArcs: no match -> empty array (drives the no-matches notice)', () => {
  const out = filterArcs(ARCS, 'zzz-no-such-arc', label)
  assert.ok(Array.isArray(out))
  assert.equal(out.length, 0)
})

test('filterArcs: arcs without category still filter by title', () => {
  const arcs = [{ slug: 'x', title: 'Solo arc', category: null }]
  assert.deepEqual(filterArcs(arcs, 'solo', label).map((a) => a.slug), ['x'])
  assert.equal(filterArcs(arcs, 'economic', label).length, 0)
})

const EVENTS = [
  { id: 'e1', title: 'Port authority votes on harbor contract' },
  { id: 'e2', title: 'Central bank holds rates steady' },
]

test('filterEventsByTitle: empty query is a no-op, preserves order', () => {
  assert.deepEqual(filterEventsByTitle(EVENTS, '').map((e) => e.id), ['e1', 'e2'])
  assert.deepEqual(filterEventsByTitle(EVENTS, '  ').map((e) => e.id), ['e1', 'e2'])
})

test('filterEventsByTitle: case-insensitive substring on canonical title', () => {
  assert.deepEqual(filterEventsByTitle(EVENTS, 'HARBOR').map((e) => e.id), ['e1'])
  assert.deepEqual(filterEventsByTitle(EVENTS, 'rates').map((e) => e.id), ['e2'])
  assert.deepEqual(filterEventsByTitle(EVENTS, 'o').length, 2) // both contain "o"
})

test('filterEventsByTitle: no match -> empty array', () => {
  const out = filterEventsByTitle(EVENTS, 'zzz-no-such-event')
  assert.ok(Array.isArray(out))
  assert.equal(out.length, 0)
})
