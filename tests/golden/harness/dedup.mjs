// G1 harness — duplicate detection: mirrors of the production rules.
// The evt-/art- mirror rule is imported DIRECTLY from the app source
// (src/lib/timelineDedup.js) — no port, no drift. The actor-duplicate
// detector mirrors the live duplicate_actor_label_monitor view (Tier 6).
// The fuzzy-resolution type-agreement guard mirrors the Phase 0
// entity-hygiene fix in ingest-rss.

export { canonicalizeTimelineEvents, remapTimelineEdges } from '../../../src/lib/timelineDedup.js'

// Mirror of live view public.duplicate_actor_label_monitor:
// group actors by lower(trim(label)); groups with >1 node are flagged.
export function findDuplicateActors(nodes) {
  const groups = new Map()
  for (const n of nodes ?? []) {
    if (n.type !== 'actor') continue
    const key = (n.label ?? '').trim().toLowerCase()
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(n)
  }
  return [...groups.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([label, members]) => ({ label, count: members.length, ids: members.map((m) => m.id) }))
}

// Mirror of the entity-resolution type-agreement guard: a fuzzy
// (token-subset) candidate only resolves when its type AGREES with the
// stored entity type. variant 'no-type-guard' reintroduces the cross-type
// fuzzy junk bug.
export function fuzzyResolves(candidateSurface, candidateType, storedType, { variant = 'repaired' } = {}) {
  if (variant === 'no-type-guard') return true
  return candidateType === storedType
}
