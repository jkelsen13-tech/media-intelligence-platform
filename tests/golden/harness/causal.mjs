// G1 harness — JS port of the causal/sequence semantics, transcribed from
// ingest-rss/index.ts @ 445503ee (TEMPORAL_RE, CAUSAL_RE, causalEvidence
// with the shared-entity proximity window, the three-way attachToArc
// branch) plus the live edges_causal_evidence_guard CHECK semantics in both
// the r4 (buggy) and r5 (repaired) forms.
//
// 2026-08-10 repair (incident session, owner-authorized): TEMPORAL_LEAD
// resynced WORD-FOR-WORD to the deployed constraint text (migration
// 20260802_tier3_causal_edge_guard.sql r4 / 20260803_tier3_causal_edge_guard_r5_amid_fix.sql
// r5, live-verified via pg_get_constraintdef 2026-08-10). The previous
// mirror carried a parallel alternation that was never deployed — missing
// 'on the back of' / 'in the aftermath of', extra 'in the (days|weeks|months)
// ...' / 'weeks after' / 'months after', plural-only 'hours after|days after'.
// The r4 variant's DELIBERATE bug ('amidst?' missing bare 'amid') is kept;
// only its phrase list was corrected (transcription fix, not a variant edit).

export const TEMPORAL_RE =
  /\b(after|following|amid|in the wake of|on the back of|days? after|hours? after)\b/i

// Shipped: attribution ('citing') and association ('linked to') are NOT
// causal triggers.
export const CAUSAL_RE =
  /\b(as a result of|in response to|because of|due to|owing to|sparked by|triggered by|prompted by|in retaliation for|in protest (of|at|against)|caused by|led to|resulting from)\b/i

export function temporalEvidence(text) {
  return text.match(TEMPORAL_RE)?.[0] ?? null
}

// Shipped causalEvidence: a causal phrase only counts when a shared entity
// (or the arc root title) appears within ±150 chars of it.
export function causalEvidence(text, sharedEntities, rootTitle) {
  const m = text.match(CAUSAL_RE)
  if (!m) return null
  const phrase = m[0]
  const refs = [...sharedEntities, rootTitle].filter((s) => (s ?? '').trim().length >= 3)
  if (refs.length > 0) {
    const idx = text.toLowerCase().indexOf(phrase.toLowerCase())
    const window = text.slice(Math.max(0, idx - 150), idx + phrase.length + 150).toLowerCase()
    if (!refs.some((e) => window.includes(e.toLowerCase()))) return null
  }
  return phrase
}

// The shipped three-way branch in attachToArc.
export function decideEdge({ causal, temporal, hasCitation = false, citationPrimary = false }) {
  if (causal) {
    return { type: 'causal', label: `causal: ${causal}`, weight: 'heavy', signal_source: 'causal_language', evidence: causal }
  }
  if (temporal) {
    return { type: 'sequence', label: `sequence: ${temporal}`, weight: 'medium', signal_source: 'temporal', evidence: temporal }
  }
  if (hasCitation) {
    if (citationPrimary) {
      return { type: 'causal', label: 'cited development in arc', weight: 'heavy', signal_source: 'citation', evidence: 'explicit citation in article' }
    }
    return { type: 'sequence', label: 'sequence: cited development in arc', weight: 'light', signal_source: 'citation', evidence: 'citation mentioned only in passing' }
  }
  return null
}

// --- edges_causal_evidence_guard semantics ---
// The live CHECK constrains ONLY type='causal' rows, three ways:
//   signal_source IN ('causal_language','citation')
//   normalized evidence must NOT lead with a temporal pattern
//   normalized label (after stripping leading 'causal:') likewise
// Normalization (deployed, both arms): regexp_replace '[^a-zA-Z0-9]+' off
// both ends, then lower(); label arm first strips /^\s*causal:\s*/i.
// Match is anchored with terminator (\s|$) — PG ARE treats '\b' as
// backspace, never use it here.
// Deployed temporal alternation (identical in r4 and r5 EXCEPT the amid
// branch — r4's 'amidst?' binds '?' to the final 't', missing bare 'amid';
// r5's 'amid(st)?' closes it, the gate-round-3 fix):
//   after(wards?)? | following | amid(st)?/amidst? | in\s+the\s+wake\s+of
//   | on\s+the\s+back\s+of | in\s+the\s+aftermath\s+of | later
//   | subsequently | days?\s+after | hours?\s+after
// Exported as strings so the drift guard can compare the harness against
// the checked-in fixture across the FULL phrase space, not one marker.
export const R5_TEMPORAL_ALTERNATION =
  'after(wards?)?|following|amid(st)?|in\\s+the\\s+wake\\s+of|on\\s+the\\s+back\\s+of|in\\s+the\\s+aftermath\\s+of|later|subsequently|days?\\s+after|hours?\\s+after'
export const R4_TEMPORAL_ALTERNATION =
  'after(wards?)?|following|amidst?|in\\s+the\\s+wake\\s+of|on\\s+the\\s+back\\s+of|in\\s+the\\s+aftermath\\s+of|later|subsequently|days?\\s+after|hours?\\s+after'

const TEMPORAL_LEAD = {
  r4: new RegExp(`^(${R4_TEMPORAL_ALTERNATION})(\\s|$)`),
  r5: new RegExp(`^(${R5_TEMPORAL_ALTERNATION})(\\s|$)`),
}

export function guardAllows(edge, guardVersion = 'r5') {
  if (edge.type !== 'causal') return true
  if (!['causal_language', 'citation'].includes(edge.signal_source ?? '')) return false
  const re = TEMPORAL_LEAD[guardVersion]
  // Deployed normalization: trim non-alphanumerics off both ends, lowercase.
  const normEvidence = (edge.evidence ?? '')
    .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '')
    .toLowerCase()
  const normLabel = (edge.label ?? '')
    .replace(/^\s*causal:\s*/i, '')
    .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '')
    .toLowerCase()
  if (re.test(normEvidence)) return false
  if (re.test(normLabel)) return false
  return true
}
