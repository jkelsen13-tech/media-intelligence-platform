import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildArcSections,
  buildMirrorArcMap,
  verifyExactlyOnce,
  filterGrouped,
  paginateSections,
  resolveEventArc,
  eventMatches,
  SECTION_PAGE_SIZE,
  UNCLASSIFIED_PAGE_SIZE,
  ARC_STATUS_LABELS,
} from '../src/lib/arcGroupedTimeline.js'

// Fixture mirroring the live shape verified 2026-08-10: 362 canonical
// events = 271 direct + 26 article-derivable + 65 orphaned.
function makeFixture({ direct = 271, derivable = 26, orphaned = 65, arcCount = 37 } = {}) {
  const arcs = new Map()
  for (let i = 0; i < arcCount; i++) {
    arcs.set(`arc-${i}`, {
      title: `Arc ${i}`,
      category: i % 2 === 0 ? 'Politics' : 'Conflict',
      started_at: '2026-01-01',
      endAt: '2026-06-01',
      status: i % 3 === 0 ? 'active' : i % 3 === 1 ? 'dormant' : 'resolved',
    })
  }
  const events = []
  const push = (count, mk) => {
    for (let i = 0; i < count; i++) events.push(mk(i))
  }
  // Direct: spread across arcs, ~7-8 each.
  push(direct, (i) => ({
    id: `evt-d-${i}`,
    slug: `evt-aaaa${String(i).padStart(4, '0')}`,
    label: `Direct event ${i}`,
    occurred_at: `2026-02-${String((i % 28) + 1).padStart(2, '0')}`,
    arc_id: `arc-${i % arcCount}`,
  }))
  // Derivable: no node arc_id; suffix maps to an article with arc_id.
  const articleArcBySuffix = new Map()
  push(derivable, (i) => {
    const suffix = `bbbb${String(i).padStart(4, '0')}`.slice(-8)
    articleArcBySuffix.set(suffix, `arc-${i % arcCount}`)
    return {
      id: `evt-a-${i}`,
      slug: `evt-xxxx${suffix}`,
      label: `Derivable event ${i}`,
      occurred_at: `2026-03-${String((i % 28) + 1).padStart(2, '0')}`,
      arc_id: null,
    }
  })
  // Orphaned: neither direct nor derivable.
  push(orphaned, (i) => ({
    id: `evt-o-${i}`,
    slug: `evt-cccc${String(i).padStart(4, '0')}`,
    label: `Orphan event ${i}`,
    occurred_at: i === 0 ? null : `2026-04-${String((i % 28) + 1).padStart(2, '0')}`,
    arc_id: null,
  }))
  return { events, arcs, articleArcBySuffix }
}

test('resolveEventArc: direct (own or mirror) wins, then article derivation, else null', () => {
  const articles = new Map([['deadbeef', 'arc-x']])
  const mirrors = new Map([['evt-key-2', 'arc-m']])
  assert.deepEqual(resolveEventArc({ arc_id: 'arc-y', slug: 'evt-deadbeef' }, new Map(), articles), {
    arcId: 'arc-y',
    resolution: 'direct',
  })
  // suppressed art- mirror carries the arc_id → still 'direct'
  assert.deepEqual(
    resolveEventArc({ id: 'evt-key-2', arc_id: null, slug: 'evt-0000beef' }, mirrors, articles),
    { arcId: 'arc-m', resolution: 'direct' },
  )
  assert.deepEqual(resolveEventArc({ arc_id: null, slug: 'evt-deadbeef' }, new Map(), articles), {
    arcId: 'arc-x',
    resolution: 'article',
  })
  assert.deepEqual(resolveEventArc({ arc_id: null, slug: 'evt-00000000' }, new Map(), articles), {
    arcId: null,
    resolution: null,
  })
})

test('buildMirrorArcMap: art- mirror arc_id rescues arc-less canonical evt node', () => {
  const raw = [
    { id: 'e1', slug: 'evt-aaaa0001', arc_id: null },
    { id: 'a1', slug: 'art-aaaa0001', arc_id: 'arc-9' },
    { id: 'e2', slug: 'evt-bbbb0002', arc_id: 'arc-8' },
  ]
  const canonical = [
    { id: 'e1', slug: 'evt-aaaa0001', arc_id: null },
    { id: 'e2', slug: 'evt-bbbb0002', arc_id: 'arc-8' },
  ]
  const map = buildMirrorArcMap(raw, canonical)
  assert.equal(map.get('e1'), 'arc-9')
  assert.equal(map.has('e2'), false) // canonical already direct — no entry needed
})

test('buildArcSections: 271 + 26 + 65 = 362, every event exactly once', () => {
  const { events, arcs, articleArcBySuffix } = makeFixture()
  const grouped = buildArcSections(events, arcs, articleArcBySuffix)
  assert.equal(grouped.counts.total, 362)
  assert.equal(grouped.counts.direct, 271)
  assert.equal(grouped.counts.derivable, 26)
  assert.equal(grouped.counts.unclassified, 65)
  assert.equal(
    grouped.sections.reduce((n, s) => n + s.events.length, 0) + grouped.unclassified.length,
    362,
  )
  const check = verifyExactlyOnce(grouped, 362)
  assert.equal(check.ok, true, `duplicates: ${check.duplicates}`)
})

test('buildArcSections: sections carry dates, category, status label', () => {
  const { events, arcs, articleArcBySuffix } = makeFixture({ direct: 3, derivable: 0, orphaned: 0, arcCount: 1 })
  const grouped = buildArcSections(events, arcs, articleArcBySuffix)
  assert.equal(grouped.sections.length, 1)
  const s = grouped.sections[0]
  assert.equal(s.startedAt, '2026-01-01')
  assert.equal(s.endAt, '2026-06-01')
  assert.equal(s.category, 'Politics')
  assert.equal(s.statusLabel, 'Ongoing') // active → ongoing per addendum
  // events chronological ascending inside the section
  const dates = s.events.map((e) => e.occurred_at)
  assert.deepEqual(dates, [...dates].sort())
})

test('status mapping: active → Ongoing, dormant → Dormant, resolved → Resolved', () => {
  assert.equal(ARC_STATUS_LABELS.active, 'Ongoing')
  assert.equal(ARC_STATUS_LABELS.dormant, 'Dormant')
  assert.equal(ARC_STATUS_LABELS.resolved, 'Resolved')
})

test('section sort: most recent activity first', () => {
  const arcs = new Map([
    ['arc-old', { title: 'Old', category: 'A', started_at: '2026-01-01', status: 'dormant' }],
    ['arc-new', { title: 'New', category: 'B', started_at: '2026-01-01', status: 'active' }],
  ])
  const events = [
    { id: 'e1', slug: 'evt-00000001', label: 'old', occurred_at: '2026-01-05', arc_id: 'arc-old' },
    { id: 'e2', slug: 'evt-00000002', label: 'new', occurred_at: '2026-07-05', arc_id: 'arc-new' },
  ]
  const grouped = buildArcSections(events, arcs, new Map())
  assert.equal(grouped.sections[0].arcId, 'arc-new')
  assert.equal(grouped.sections[1].arcId, 'arc-old')
})

test('filters: category drops non-matching sections, Unclassified → placeholder', () => {
  const { events, arcs, articleArcBySuffix } = makeFixture()
  const grouped = buildArcSections(events, arcs, articleArcBySuffix)
  const out = filterGrouped(grouped, { term: '', linkFilter: 'any', category: 'Politics' }, new Map())
  assert.ok(out.sections.every((s) => s.category === 'Politics'))
  assert.equal(out.unclassifiedPlaceholder, true)
  assert.equal(out.unclassifiedTotal, 65)
  // events still computed for "show anyway"
  assert.equal(out.unclassifiedEvents.length, 65)
  // shownEvents excludes the placeholder-hidden bucket
  assert.equal(
    out.shownEvents,
    out.sections.reduce((n, s) => n + s.events.length, 0),
  )
})

test('filters: date range applies within sections and to Unclassified; undated excluded', () => {
  const { events, arcs, articleArcBySuffix } = makeFixture()
  const grouped = buildArcSections(events, arcs, articleArcBySuffix)
  const out = filterGrouped(
    grouped,
    { term: '', linkFilter: 'any', dateFrom: '2026-04-01', dateTo: '2026-04-30' },
    new Map(),
  )
  // only April orphans; the undated one excluded
  assert.ok(out.unclassifiedEvents.every((e) => e.occurred_at >= '2026-04-01' && e.occurred_at <= '2026-04-30'))
  assert.ok(!out.unclassifiedEvents.some((e) => e.occurred_at == null))
})

test('filters: link filter semantics match flat view', () => {
  const grouped = buildArcSections(
    [
      { id: 'e1', slug: 'evt-00000001', label: 'x', occurred_at: '2026-01-01', arc_id: 'a' },
      { id: 'e2', slug: 'evt-00000002', label: 'y', occurred_at: '2026-01-02', arc_id: 'a' },
    ],
    new Map([['a', { title: 'A', category: 'C', started_at: '2026-01-01', status: 'active' }]]),
    new Map(),
  )
  const links = new Map([
    ['e1', { outbound: [{ type: 'causal' }], inbound: [] }],
    ['e2', { outbound: [], inbound: [] }],
  ])
  const linked = filterGrouped(grouped, { term: '', linkFilter: 'linked' }, links)
  assert.equal(linked.sections[0].events.length, 1)
  const none = filterGrouped(grouped, { term: '', linkFilter: 'none' }, links)
  assert.equal(none.sections[0].events.length, 1)
  assert.equal(none.sections[0].events[0].id, 'e2')
})

test('pagination: 5 sections per page, Unclassified not a section', () => {
  const { events, arcs, articleArcBySuffix } = makeFixture({ direct: 74, derivable: 0, orphaned: 3, arcCount: 37 })
  const grouped = buildArcSections(events, arcs, articleArcBySuffix)
  const p0 = paginateSections(grouped.sections, 0)
  assert.equal(p0.pageSections.length, SECTION_PAGE_SIZE)
  assert.equal(p0.pageCount, Math.ceil(37 / SECTION_PAGE_SIZE))
  assert.equal(p0.isLastPage, false)
  const last = paginateSections(grouped.sections, 999)
  assert.equal(last.isLastPage, true)
  assert.equal(last.safePage, last.pageCount - 1)
  assert.equal(last.pageSections.length, 37 % SECTION_PAGE_SIZE || SECTION_PAGE_SIZE)
})

test('eventMatches: term and date bounds', () => {
  assert.equal(eventMatches({ label: 'Callais ruling' }, { term: 'callais' }), true)
  assert.equal(eventMatches({ label: 'Callais ruling' }, { term: 'other' }), false)
  assert.equal(eventMatches({ occurred_at: '2026-05-01' }, { dateFrom: '2026-04-01', dateTo: '2026-06-01' }), true)
  assert.equal(eventMatches({ occurred_at: null }, { dateFrom: '2026-04-01' }), false)
  assert.equal(eventMatches({ occurred_at: null }, {}), true)
})

test('unclassified page size constant stays 25 (owner-approved)', () => {
  assert.equal(UNCLASSIFIED_PAGE_SIZE, 25)
})
