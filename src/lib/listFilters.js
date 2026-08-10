// Client-side list filters for read-path UI (Doc 05 follow-up, 2026-08-10).
// Pure seam: no data access, no mutation — callers pass loaded rows and a
// query string. Semantics mirror the News Feed search bar: trimmed,
// case-insensitive substring match; empty query matches everything.
//
// Used by ArcsView (sidebar search over arc title + category) and
// SourceComparisonView (event title search). Filtering never reorders,
// drops from the source array, or duplicates rows — it returns a subset.

export function normalizeQuery(q) {
  return String(q ?? '').trim().toLowerCase()
}

export function matchesQuery(fields, q) {
  const nq = normalizeQuery(q)
  if (!nq) return true
  return fields.some((f) => f != null && String(f).toLowerCase().includes(nq))
}

/**
 * Arc sidebar filter. Matches arc title, the raw category key
 * (e.g. "economic_policy"), and its display label (e.g. "Economic Policy")
 * so either form finds the arc. categoryLabel is the view's own mapper.
 */
export function filterArcs(arcs, q, categoryLabel = (c) => c) {
  return arcs.filter((arc) =>
    matchesQuery([arc.title, arc.category, categoryLabel(arc.category)], q),
  )
}

/** Source Comparison filter. Matches event canonical title only. */
export function filterEventsByTitle(events, q) {
  return events.filter((event) => matchesQuery([event.title], q))
}
