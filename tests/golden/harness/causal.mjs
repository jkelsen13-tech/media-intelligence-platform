// G1 harness — JS port of the causal/sequence semantics, transcribed from
// ingest-rss/index.ts @ 445503ee (TEMPORAL_RE, CAUSAL_RE, causalEvidence
// with the shared-entity proximity window, the three-way attachToArc
// branch) plus the live edges_causal_evidence_guard CHECK semantics in
// the r4 (buggy), r5, and r6 (live) forms.
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

// Shipped causalEvidence (index.ts:676, verbatim port 2026-08-10): a causal
// phrase only counts when a shared entity (or the arc root title) appears
// within ±150 chars of it. With NO qualifying refs the function returns NULL
// — the pre-repair port's `refs.length > 0` conditional wrongly returned the
// phrase in exactly that case (the E2 gate-round-3 control).
export function causalEvidence(text, sharedEntities = [], rootTitle = null) {
  const m = text.match(CAUSAL_RE)
  if (!m || m.index === undefined) return null
  const lo = Math.max(0, m.index - 150)
  const hi = Math.min(text.length, m.index + m[0].length + 150)
  const window = text.slice(lo, hi).toLowerCase()
  const refs = [...sharedEntities, ...(rootTitle ? [rootTitle] : [])]
  for (const ref of refs) {
    const norm = String(ref).toLowerCase().replace(/\s+/g, ' ').trim()
    if (norm.length >= 3 && window.includes(norm)) return m[0]
  }
  return null
}

// The shipped three-way branch in attachToArc (index.ts:1254-1310, resynced
// 2026-08-10): causal_language => weight 'medium' (reliability 3), primary
// citation => 'heavy' (reliability 1), sequence => 'light' with column
// signal_source 'shared_entity' (metadata mirror carries the legacy
// 'shared_entity+sequence' / '+causal_language' / '+citation' strings).
export function decideEdge({ causal, temporal, hasCitation = false, citationPrimary = false }) {
  if (causal) {
    return { type: 'causal', label: `causal: ${causal}`, weight: 'medium', signal_source: 'causal_language', evidence: causal, reliability: 3, doc_strength: 'corroborated', claimed_by: 'reporting' }
  }
  if (temporal) {
    return { type: 'sequence', label: `sequence: ${temporal}`, weight: 'light', signal_source: 'shared_entity', evidence: temporal, reliability: 4, doc_strength: 'circumstantial', claimed_by: 'reporting', counterfactual_test: 'sequence_only' }
  }
  if (hasCitation) {
    if (citationPrimary) {
      return { type: 'causal', label: 'cited development in arc', weight: 'heavy', signal_source: 'citation', evidence: 'explicit citation in article', reliability: 1, doc_strength: 'documented', claimed_by: 'source_document' }
    }
    return { type: 'sequence', label: 'sequence: cited development in arc', weight: 'light', signal_source: 'shared_entity', evidence: 'citation mentioned only in passing', reliability: 4, doc_strength: 'circumstantial', claimed_by: 'reporting', counterfactual_test: 'sequence_only' }
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
// r6 (live since 2026-08-10, owner-authorized): identical to r5 PLUS two
// trailing branches 'weeks?\s+after|months?\s+after' — closes the
// weeks/months-after lead gap found by gate-round-3 probes 22/23.
// Exported as strings so the drift guard can compare the harness against
// the checked-in fixture across the FULL phrase space, not one marker.
export const R5_TEMPORAL_ALTERNATION =
  'after(wards?)?|following|amid(st)?|in\\s+the\\s+wake\\s+of|on\\s+the\\s+back\\s+of|in\\s+the\\s+aftermath\\s+of|later|subsequently|days?\\s+after|hours?\\s+after'
export const R4_TEMPORAL_ALTERNATION =
  'after(wards?)?|following|amidst?|in\\s+the\\s+wake\\s+of|on\\s+the\\s+back\\s+of|in\\s+the\\s+aftermath\\s+of|later|subsequently|days?\\s+after|hours?\\s+after'
export const R6_TEMPORAL_ALTERNATION =
  'after(wards?)?|following|amid(st)?|in\\s+the\\s+wake\\s+of|on\\s+the\\s+back\\s+of|in\\s+the\\s+aftermath\\s+of|later|subsequently|days?\\s+after|hours?\\s+after|weeks?\\s+after|months?\\s+after'

const TEMPORAL_LEAD = {
  r4: new RegExp(`^(${R4_TEMPORAL_ALTERNATION})(\\s|$)`),
  r5: new RegExp(`^(${R5_TEMPORAL_ALTERNATION})(\\s|$)`),
  r6: new RegExp(`^(${R6_TEMPORAL_ALTERNATION})(\\s|$)`),
}

export function guardAllows(edge, guardVersion = 'r6') {
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
