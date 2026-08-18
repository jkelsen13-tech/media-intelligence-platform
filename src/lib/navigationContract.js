// Package 1 item 2 (22_NOTE) — explicit cross-view navigation contract.
//
// Every News ↔ Timeline ↔ Arc ↔ Graph jump is expressed as a target with
// NAMED identifiers — arcId / eventKey / nodeId / relationshipId /
// articleId — never as a positional or implicit "whatever is focused".
// Known-target resolution lives here, in one place, so a jump either lands
// on its named target or degrades honestly (no jump / declared fallback),
// never on an unrelated default screen.
//
// THE RETURN-TO-ORIGIN RULE (Three-Screen Review named finding): a
// News → Timeline jump for an article that belongs to an arc MUST land on
// that arc's timeline — the originating context — never on the global
// corpus. Global scope is the declared fallback for an article with no
// arc, and only then.

export const NAV_VIEWS = Object.freeze(['news', 'timeline', 'arcs', 'graph', 'compare'])

export const NAV_TARGET_KEYS = Object.freeze([
  'articleId',
  'arcId',
  'eventKey',
  'nodeId',
  'relationshipId',
])

/**
 * Normalize a jump target. Unknown view → null (the caller renders no
 * link rather than navigating to a fabricated destination). Identifier
 * fields default to null; unknown keys are dropped.
 */
export function navTarget({ view, articleId = null, arcId = null, eventKey = null, nodeId = null, relationshipId = null } = {}) {
  if (!NAV_VIEWS.includes(view)) return null
  return Object.freeze({ view, articleId, arcId, eventKey, nodeId, relationshipId })
}

/**
 * Coerce a timeline jump argument into the contract shape. Legacy callers
 * passed a bare eventKey string; both forms resolve identically.
 */
export function coerceTimelineTarget(arg) {
  if (arg == null) return null
  if (typeof arg === 'string') return navTarget({ view: 'timeline', eventKey: arg })
  return navTarget({ view: 'timeline', arcId: arg.arcId ?? null, eventKey: arg.eventKey ?? null })
}

/**
 * Known-target resolution for timeline jumps — the return-to-origin rule.
 *
 *   arcId known  → { scope: 'arc',    arcId, eventKey }  land on the ORIGINATING arc
 *   arcId absent → { scope: 'global', arcId: null, eventKey }  declared fallback
 *   neither      → null  (no known target: no jump)
 */
export function resolveTimelineJump(arg) {
  const t = coerceTimelineTarget(arg)
  if (!t || (!t.eventKey && !t.arcId)) return null
  if (t.arcId) return { scope: 'arc', arcId: t.arcId, eventKey: t.eventKey }
  return { scope: 'global', arcId: null, eventKey: t.eventKey }
}
