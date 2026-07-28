// Tier 4 deterministic duplicate rule (Phase 0 Item 4, 2026-07-28).
//
// Event nodes are grouped by the 8-char slug suffix (article identity). When
// a group holds both an `evt-` node and an `art-` node, the `art-` node is an
// article mirror of the SAME event (verified live: 37/37 pairs share identical
// label and occurred_at; scores 65 vs 70 were the reported "duplicate events
// with different scores"). Only the `evt-` node renders — it is canonical
// because it carries the summary. Unpaired nodes always render.
//
// Pure functions, no imports — unit-tested outside the Vite bundle.

export function canonicalizeTimelineEvents(events) {
  const groups = new Map() // slug id8 -> [nodes]
  for (const n of events ?? []) {
    const key = (n.slug ?? '').slice(-8)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(n)
  }
  const canonicalOf = new Map() // every node id -> canonical node id
  const kept = []
  let suppressed = 0
  for (const group of groups.values()) {
    const evtNode = group.find((n) => (n.slug ?? '').startsWith('evt-'))
    const canonical = evtNode ?? group[0]
    for (const n of group) {
      canonicalOf.set(n.id ?? n.slug, canonical.id ?? canonical.slug)
      if (n !== canonical) suppressed++
    }
    kept.push(canonical)
  }
  return { events: kept, canonicalOf, suppressed }
}

// Remap edge endpoints through the canonical map so links attached to a
// suppressed mirror node render against the canonical card instead of
// disappearing. (Preflight 2026-07-28: zero such edges — purely defensive.)
export function remapTimelineEdges(edges, canonicalOf) {
  return (edges ?? []).map((e) => ({
    ...e,
    source: canonicalOf.get(e.source) ?? e.source,
    target: canonicalOf.get(e.target) ?? e.target,
  }))
}
