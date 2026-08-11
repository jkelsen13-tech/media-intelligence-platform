// 04-ADD Track B Step 3 Addendum — Arc-Grouped Timeline.
// Read-path restructure only: grouping, date ranges, and status mapping are
// computed at query/render time from existing columns (nodes.arc_id,
// articles.arc_id, story_arcs.started_at / category, arc_events.occurred_at)
// and the existing deriveArcStatus(). No new schema, no backfill —
// events.arc_id stays as-is; the 26 article-derivable events resolve through
// the same live-join pattern shipped in Doc 05 (art- slug 8-hex suffix =
// article id 8-hex prefix).
//
// Owner-approved design decisions (2026-08-10):
//   - Unclassified bucket is a first-class section, pinned LAST after all arc
//     sections, never sorted into them, never silently dropped.
//   - Pagination is by ARC SECTION (5 sections/page), not by event; the
//     Unclassified section carries its own internal 25-event pager.
//   - A category filter cannot match Unclassified (no category to match) —
//     it collapses to a one-line placeholder with a toggle, never vanishes.

export const SECTION_PAGE_SIZE = 5
export const UNCLASSIFIED_PAGE_SIZE = 25

// "active" maps to "ongoing" per the addendum; labeled text, not color.
export const ARC_STATUS_LABELS = {
  active: 'Ongoing',
  dormant: 'Dormant',
  resolved: 'Resolved',
}

const dateOf = (iso) => (iso ? String(iso).slice(0, 10) : null)

// Resolve the arc for one canonical event. Order matches the feasibility
// report's definitions (2026-08-09):
//   1. direct   — nodes.arc_id on the canonical evt- node OR on its
//                 suppressed art- mirror (same event, same arc assignment;
//                 271 of 362 live),
//   2. article  — the underlying article's arc_id via the Doc 05 live-join
//                 (26 of 362 live),
//   3. null     — genuinely orphaned (65 of 362 live → Unclassified).
export function resolveEventArc(evt, directArcByKey, articleArcBySuffix) {
  const key = evt.id ?? evt.slug
  const direct = evt.arc_id ?? directArcByKey?.get(key)
  if (direct) return { arcId: direct, resolution: 'direct' }
  const derived = articleArcBySuffix?.get((evt.slug ?? '').slice(-8))
  if (derived) return { arcId: derived, resolution: 'article' }
  return { arcId: null, resolution: null }
}

// Build the canonical-key → arc_id fallback from RAW event nodes (pre-dedup):
// when the canonical evt- node lacks arc_id but its art- mirror carries one,
// the group still resolves directly.
export function buildMirrorArcMap(rawEvents, canonicalEvents) {
  const canonicalKeys = new Set(canonicalEvents.map((e) => e.id ?? e.slug))
  const groups = new Map()
  for (const n of rawEvents ?? []) {
    const suffix = (n.slug ?? '').slice(-8)
    const arr = groups.get(suffix) ?? []
    arr.push(n)
    groups.set(suffix, arr)
  }
  const map = new Map()
  for (const group of groups.values()) {
    const canonical =
      group.find((n) => canonicalKeys.has(n.id ?? n.slug)) ?? group[0]
    if (canonical.arc_id) continue
    const mirrorArc = group.find((n) => n !== canonical && n.arc_id)?.arc_id
    if (mirrorArc) map.set(canonical.id ?? canonical.slug, mirrorArc)
  }
  return map
}

// Group canonical timeline events into arc sections + the Unclassified
// bucket. arcsById: Map arcId -> { title, category, started_at, status,
// endAt } where status comes from deriveArcStatus() and endAt is the arc's
// max arc_events.occurred_at (end date is derived, not stored).
export function buildArcSections(events, arcsById, articleArcBySuffix, directArcByKey) {
  const byArc = new Map()
  const unclassified = []
  let direct = 0
  let derivable = 0

  for (const evt of events) {
    const { arcId, resolution } = resolveEventArc(evt, directArcByKey, articleArcBySuffix)
    if (!arcId || !arcsById.has(arcId)) {
      unclassified.push(evt)
      continue
    }
    if (resolution === 'direct') direct += 1
    else derivable += 1
    const arr = byArc.get(arcId) ?? []
    arr.push(evt)
    byArc.set(arcId, arr)
  }

  const byDateAsc = (a, b) =>
    (a.occurred_at ?? '9999') < (b.occurred_at ?? '9999')
      ? -1
      : (a.occurred_at ?? '9999') > (b.occurred_at ?? '9999')
        ? 1
        : 0

  const sections = [...byArc.entries()].map(([arcId, evts]) => {
    const arc = arcsById.get(arcId)
    evts.sort(byDateAsc)
    const lastEventDate = [...evts].reverse().find((e) => e.occurred_at)?.occurred_at ?? null
    return {
      arcId,
      title: arc.title ?? 'Untitled arc',
      category: arc.category ?? null,
      startedAt: dateOf(arc.started_at),
      endAt: dateOf(arc.endAt) ?? dateOf(lastEventDate),
      status: arc.status ?? null,
      statusLabel: ARC_STATUS_LABELS[arc.status] ?? null,
      lastEventDate,
      events: evts,
    }
  })

  // Most recent activity first; sections with no dated events sink to the
  // bottom of the arc list (still above Unclassified, which is pinned last).
  sections.sort((a, b) =>
    (a.lastEventDate ?? '') < (b.lastEventDate ?? '')
      ? 1
      : (a.lastEventDate ?? '') > (b.lastEventDate ?? '')
        ? -1
        : 0,
  )

  unclassified.sort(byDateAsc)

  return {
    sections,
    unclassified,
    counts: {
      total: events.length,
      direct,
      derivable,
      unclassified: unclassified.length,
      sectionCount: sections.length,
    },
  }
}

// Hard-count invariant: every canonical event appears exactly once.
export function verifyExactlyOnce({ sections, unclassified }, totalEvents) {
  const seen = new Set()
  let rendered = 0
  const dupes = []
  const visit = (evt) => {
    const key = evt.id ?? evt.slug
    if (seen.has(key)) dupes.push(key)
    seen.add(key)
    rendered += 1
  }
  for (const s of sections) s.events.forEach(visit)
  unclassified.forEach(visit)
  return {
    ok: dupes.length === 0 && rendered === totalEvents,
    rendered,
    expected: totalEvents,
    duplicates: dupes,
  }
}

// Event-level match shared by all filters. Date filters exclude undated
// events (they cannot match a range); the count line reports the remainder.
export function eventMatches(evt, { term, dateFrom, dateTo }) {
  if (term) {
    const haystack = [evt.label, evt.summary, evt.description]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    if (!haystack.includes(term)) return false
  }
  if (dateFrom || dateTo) {
    const d = dateOf(evt.occurred_at)
    if (!d) return false
    if (dateFrom && d < dateFrom) return false
    if (dateTo && d > dateTo) return false
  }
  return true
}

// Layer filters on top of the grouped structure. linksByKey: Map eventKey ->
// { outbound, inbound } for the link-type filter (same semantics as the flat
// view). Category filters drop non-matching arc sections entirely and reduce
// Unclassified to a placeholder (it has no category to match).
export function filterGrouped(grouped, criteria, linksByKey) {
  const { term, linkFilter = 'any', dateFrom, dateTo, category } = criteria
  const linkOk = (key) => {
    const links = linksByKey?.get(key)
    const all = links ? [...links.outbound, ...links.inbound] : []
    switch (linkFilter) {
      case 'linked':
        return all.length > 0
      case 'causal':
        return all.some((e) => e.type === 'causal')
      case 'sequence':
        return all.some((e) => e.type === 'sequence')
      case 'none':
        return all.length === 0
      default:
        return true
    }
  }
  const matchEvt = (evt) =>
    eventMatches(evt, { term, dateFrom, dateTo }) && linkOk(evt.id ?? evt.slug)

  const sections = grouped.sections
    .filter((s) => !category || s.category === category)
    .map((s) => ({ ...s, events: s.events.filter(matchEvt) }))
    .filter((s) => s.events.length > 0)

  const unclassifiedEvents = grouped.unclassified.filter(matchEvt)
  const unclassifiedTotal = grouped.unclassified.length

  return {
    sections,
    unclassifiedEvents,
    // True when a category filter is active: the bucket cannot match (no
    // category), so the view renders it as a placeholder unless the owner
    // toggles "show anyway". It is never silently dropped.
    unclassifiedPlaceholder: Boolean(category) && unclassifiedTotal > 0,
    unclassifiedTotal,
    shownEvents:
      sections.reduce((n, s) => n + s.events.length, 0) +
      (category ? 0 : unclassifiedEvents.length),
  }
}

// Paginate arc sections (5/page). Unclassified is appended on the LAST page
// only — pinned last overall, never interleaved into the arc sort.
export function paginateSections(sections, page) {
  const pageCount = Math.max(1, Math.ceil(sections.length / SECTION_PAGE_SIZE))
  const safePage = Math.min(Math.max(0, page), pageCount - 1)
  const pageSections = sections.slice(
    safePage * SECTION_PAGE_SIZE,
    safePage * SECTION_PAGE_SIZE + SECTION_PAGE_SIZE,
  )
  return { pageSections, pageCount, safePage, isLastPage: safePage === pageCount - 1 }
}

// ---------- data loading (read-path only) ----------

async function getClient() {
  const mod = await import('./supabase.js')
  return mod
}

// 04-ADD feature flag. Withhold posture, same as phase3_beta and
// source_comparison_beta: unreadable/absent resolves false.
export async function loadTimelineGroupedBetaFlag() {
  const { supabase } = await getClient()
  if (!supabase) return false
  const { data, error } = await supabase
    .from('pipeline_config')
    .select('value')
    .eq('key', 'timeline_grouped_beta')
    .maybeSingle()
  if (error) return false
  return data?.value === true
}

// Load everything the grouped view needs. Composes the same queries the flat
// timeline and Arcs view already run; the flat view's loader is untouched.
export async function loadArcGroupedTimeline({ supabaseClient } = {}) {
  const mod = await getClient()
  const supabase = supabaseClient ?? mod.supabase
  const { deriveArcStatus, keysetAll, resortRows } = mod
  const { canonicalizeTimelineEvents, remapTimelineEdges } = await import('./timelineDedup.js')

  if (!supabase) {
    const { demoNodes, demoEdges } = await import('../data/demoData.js')
    const demoEvents = demoNodes.filter((n) => n.type === 'event')
    const { events, canonicalOf, suppressed } = canonicalizeTimelineEvents(demoEvents)
    const grouped = buildArcSections(events, new Map(), new Map())
    return {
      grouped,
      suppressed,
      relationEdges: remapTimelineEdges(
        demoEdges
          .filter((e) => e.type === 'causal' || e.type === 'sequence')
          .map((e) => ({ id: e.id, source: e.source, target: e.target, type: e.type, weight: e.weight, label: e.label })),
        canonicalOf,
      ),
      labels: demoNodes.map((n) => ({ id: n.id ?? n.slug, slug: n.slug, label: n.label })),
    }
  }

  // Doc 13 site 4: identical read set to the flat timeline loader — both
  // keyset-paginate past the 1000-row ceiling so the two views can never
  // disagree on node/edge counts; display order re-applied client-side.
  const [nodesRes, edgesRes, labelsRes, articlesRes, arcsRes, arcEventsRes, milestonesRes, cfgRes] =
    await Promise.all([
      keysetAll(supabase, 'nodes', 'id, slug, label, description, confidence, summary, occurred_at, arc_id', {
        filter: (q) => q.eq('type', 'event'),
      }).then((r) => (r.data ? { ...r, data: resortRows(r.data, 'occurred_at', { ascending: true, nullsFirst: false }) } : r)),
      keysetAll(supabase, 'edges', 'id, source_id, target_id, type, weight, label', {
        filter: (q) => q.in('type', ['causal', 'sequence']),
      }),
      keysetAll(supabase, 'nodes', 'id, slug, label'),
      // id + arc_id: article derivation (26 events) and News Feed chip join.
      keysetAll(supabase, 'articles', 'id, arc_id'),
      keysetAll(supabase, 'story_arcs', 'id, title, category, started_at'),
      // End date + status derive from real signals (loadArcs() pattern).
      // id included: the keyset cursor reads it back off the returned rows.
      keysetAll(supabase, 'arc_events', 'id, arc_id, occurred_at'),
      keysetAll(supabase, 'arc_milestones', 'id, arc_id, status'),
      supabase.from('pipeline_config').select('value').eq('key', 'status_dormant_days').maybeSingle(),
    ])
  for (const r of [nodesRes, edgesRes, labelsRes, articlesRes, arcsRes, arcEventsRes, milestonesRes]) {
    if (r.error) throw r.error
  }
  const dormantDays = Number(cfgRes.data?.value ?? 14) || 14

  const { events, canonicalOf, suppressed } = canonicalizeTimelineEvents(nodesRes.data)

  const articleIdBySuffix = new Map()
  const articleArcBySuffix = new Map()
  for (const a of articlesRes.data) {
    const suffix = String(a.id).slice(0, 8)
    articleIdBySuffix.set(suffix, a.id)
    if (a.arc_id) articleArcBySuffix.set(suffix, a.arc_id)
  }

  const eventsByArc = new Map()
  const endByArc = new Map()
  for (const e of arcEventsRes.data) {
    const arr = eventsByArc.get(e.arc_id) ?? []
    arr.push(e)
    eventsByArc.set(e.arc_id, arr)
    if (e.occurred_at && (!endByArc.get(e.arc_id) || e.occurred_at > endByArc.get(e.arc_id))) {
      endByArc.set(e.arc_id, e.occurred_at)
    }
  }
  const milestonesByArc = new Map()
  for (const m of milestonesRes.data) {
    const arr = milestonesByArc.get(m.arc_id) ?? []
    arr.push(m)
    milestonesByArc.set(m.arc_id, arr)
  }

  const arcsById = new Map(
    arcsRes.data.map((a) => [
      a.id,
      {
        title: a.title,
        category: a.category,
        started_at: a.started_at,
        endAt: endByArc.get(a.id) ?? null,
        status: deriveArcStatus(eventsByArc.get(a.id), milestonesByArc.get(a.id), dormantDays),
      },
    ]),
  )

  const grouped = buildArcSections(
    events.map((evt) => ({
      ...evt,
      article_id: articleIdBySuffix.get((evt.slug ?? '').slice(-8)) ?? null,
    })),
    arcsById,
    articleArcBySuffix,
    buildMirrorArcMap(nodesRes.data, events),
  )

  return {
    grouped,
    suppressed,
    relationEdges: remapTimelineEdges(
      edgesRes.data.map((e) => ({
        id: e.id,
        source: e.source_id,
        target: e.target_id,
        type: e.type,
        weight: e.weight,
        label: e.label,
      })),
      canonicalOf,
    ),
    labels: labelsRes.data,
  }
}
