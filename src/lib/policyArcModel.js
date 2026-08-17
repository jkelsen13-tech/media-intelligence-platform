// Track B Step 3 item 2 — Policy Arc screen (addendum Screen 4) model.
// Pure seam: no network, no flags, no DOM. ArcsView renders from these
// derivations; tests/policyArcModel.test.mjs pins the invariants.
//
// Live-data facts this module is built against (read-only verification
// 2026-08-18, see verifier/trackb3-v2/trackb3-step3-item2.md):
//   - story_arcs.category vocabulary includes legislative_regulatory and
//     economic_policy among five values;
//   - arc_events.confidence ∈ {confirmed, corroborated} (zero inferred,
//     zero dispute signal of any kind in the schema);
//   - arc_milestones.status ∈ {pending, confirmed} — 34 of 35 pending, so
//     the guardrail-4 missing-scope path is exercised by real data.

import { validateEvidenceCounts } from './epistemicModel.js'

// --- Eyebrow -----------------------------------------------------------------
// The "POLICY ARC" eyebrow is a content-type claim. It applies only to arcs
// whose category is actually policy; every other arc is a "STORY ARC".
const POLICY_CATEGORIES = new Set(['legislative_regulatory', 'economic_policy'])

export function policyArcEyebrow(category) {
  return POLICY_CATEGORIES.has(category) ? 'POLICY ARC' : 'STORY ARC'
}

// --- Evidence-state derivation -------------------------------------------------
// supporting  = arc_events whose stored confidence is confirmed-grade
//               ('confirmed' or 'corroborated' — the same mapping item 1's
//               CONFIDENCE_TO_BADGE applies to badges).
// contested   = 0, ALWAYS. The arc schema has no dispute signal; a
//               contested count must never be inferred or fabricated. This
//               zero is a documented constant, not a derivation. When a
//               real dispute signal lands in the schema, this module is
//               where it gets wired — and this comment gets updated.
// missing     = pending milestones (expected outcomes not yet reported).
// Three separate counts via the item-1 validation gate; never summed.
export const CONTESTED_DISPUTE_SIGNAL = null // no dispute column exists in the arc schema

export function deriveEvidenceStates(events, milestones) {
  const eventList = Array.isArray(events) ? events : []
  const milestoneList = Array.isArray(milestones) ? milestones : []
  const supporting = eventList.filter(
    (e) => e && (e.confidence === 'confirmed' || e.confidence === 'corroborated'),
  ).length
  const missing = milestoneList.filter((m) => m && m.status === 'pending').length
  return validateEvidenceCounts({ supporting, contested: 0, missing })
}

// --- Guardrail-4 scope copy for the Missing count ------------------------------
// The missing count is an absence finding and carries its own scope:
// what was monitored (expected outcomes tracked for this arc), over what
// period (arc start → last check), against what (the monitored corpus).
// Returns null when any leg is unavailable — the renderer then falls back
// to MISSING_SCOPE_FALLBACK rather than staying silent.
export function missingScopeCopy({ pendingCount, startedAt, lastCheck } = {}) {
  if (!Number.isInteger(pendingCount) || pendingCount <= 0) return null
  if (!startedAt || !lastCheck) return null
  const start = String(startedAt).slice(0, 10)
  const end = String(lastCheck).slice(0, 10)
  if (!start || !end || start.length < 10 || end.length < 10) return null
  return (
    `Scope: ${pendingCount} expected outcome${pendingCount === 1 ? '' : 's'} tracked for ` +
    `this arc, checked against the monitored corpus from ${start} through ${end}.`
  )
}

/**
 * Last-check date for the missing-scope copy: the most recent milestone
 * update, or null when no milestone carries one. This is the freshest
 * recorded touch of the expected-outcomes set — the honest "checked
 * through" date available in the schema.
 */
export function lastMilestoneCheck(milestones) {
  const list = Array.isArray(milestones) ? milestones : []
  const stamps = list
    .map((m) => m && m.updated_at)
    .filter(Boolean)
    .map((t) => new Date(t).getTime())
    .filter((t) => Number.isFinite(t))
  if (stamps.length === 0) return null
  return new Date(Math.max(...stamps)).toISOString().slice(0, 10)
}

// --- Remaining uncertainty -----------------------------------------------------
// The Screen 4 uncertainty block states what is genuinely unresolved.
// Pending milestones ARE the recorded unresolved expectations, so the
// block derives from their titles. Null when nothing is pending (=> the
// block is omitted, not emptied).
export function pendingUncertainty(milestones) {
  const list = Array.isArray(milestones) ? milestones : []
  const titles = list
    .filter((m) => m && m.status === 'pending' && typeof m.title === 'string' && m.title.trim())
    .map((m) => m.title.trim())
  if (titles.length === 0) return null
  return titles
}

// --- Sources line ----------------------------------------------------------------
// arc_events carries no source columns (verified 2026-08-18), so an arc's
// source attribution can only come from attached articles. Returns the
// distinct outlet names in first-seen order; empty array => the sources
// line is omitted entirely.
export function distinctOutlets(articles) {
  const list = Array.isArray(articles) ? articles : []
  const seen = []
  for (const a of list) {
    const outlet = a && typeof a.outlet === 'string' ? a.outlet.trim() : ''
    if (outlet && !seen.includes(outlet)) seen.push(outlet)
  }
  return seen
}
