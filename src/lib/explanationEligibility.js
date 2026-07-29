// D4/D5 read-path eligibility layer (owner-authorized 2026-07-29).
//
// Independent read-time exclusion per docs/PHASE_2_D4_D5_DECISIONS.md (D4 layer 2):
// an assertion is exposed as established fact ONLY when it is presentation-eligible.
// Everything else is classified into an explicit 02B failure state — never an empty
// panel or a confident default.
//
// This module is pure and flag-agnostic: it does not read pipeline_config, does not
// touch the network, and performs no writes. Enabling the read path in the UI
// (provenance_ui = true) is a separate owner authorization and is NOT done here.

// 02B failure states, aligned 1:1 with the live explanations.state CHECK vocabulary.
export const FAILURE_STATES = Object.freeze([
  'explanation_pending',
  'insufficient_evidence',
  'source_unavailable',
  'source_corrected',
  'source_withdrawn',
  'recomputation_required',
  'under_review',
  'partial_backend_failure',
  'method_version_unavailable',
])

const FAILURE_STATE_SET = new Set(FAILURE_STATES)

// Review statuses from the live review_status CHECK vocabulary that are NOT
// presentation-eligible. Anything here maps to the 02B "connection under review"
// failure state when the row is otherwise well-formed.
const NON_PUBLISHED_REVIEW_STATUSES = new Set([
  'draft',
  'awaiting_review',
  'reviewed',
  'disputed',
  'corrected',
  'withdrawn',
])

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

// A required provenance field carries an explicit missing state when the archived
// source record says so (02B: explicit missing states, never silent fabrication).
function hasMissingArchivedSource(archivedSources) {
  if (!Array.isArray(archivedSources)) return false
  return archivedSources.some(
    (entry) => entry && typeof entry === 'object' && entry.status === 'missing',
  )
}

/**
 * Classify one explanation row for the read path.
 *
 * Returns null when the row is presentation-eligible; otherwise returns the 02B
 * failure state string the renderer must show instead of the assertion.
 *
 * Eligibility (D4 layer 2 design, owner-approved):
 *   review_status = 'published'
 *   AND state = 'ok'
 *   AND a non-blank supporting_passage
 *   AND a falsification_condition that is present and not an explicit missing state
 *   AND no required archived_sources entry with status 'missing'
 *   AND the row is current (is_current !== false)
 *
 * D5 integration: source_corrected / source_withdrawn rows are excluded no matter
 * how complete their provenance fields are, and stay excluded until renewed human
 * review returns them to review_status = 'published' with state = 'ok'. Nothing in
 * this module republishes anything automatically.
 */
export function presentationFailureState(explanation) {
  if (!explanation || typeof explanation !== 'object') return 'explanation_pending'

  // History rows are never presented; the read path serves current rows only.
  if (explanation.is_current === false) return 'explanation_pending'

  // Explicit failure states (including D5 propagated source states) always win —
  // defense in depth: even a published-flagged row with a failure state is excluded.
  if (FAILURE_STATE_SET.has(explanation.state)) return explanation.state

  // Non-published review statuses are never presented as fact.
  if (explanation.review_status !== 'published') {
    if (NON_PUBLISHED_REVIEW_STATUSES.has(explanation.review_status)) return 'under_review'
    return 'explanation_pending'
  }

  // review_status = 'published': provenance must be complete (mirrors D4 layer 1).
  if (explanation.state !== 'ok') return 'explanation_pending'
  if (hasMissingArchivedSource(explanation.archived_sources)) return 'source_unavailable'
  if (!hasText(explanation.supporting_passage)) return 'insufficient_evidence'
  const falsification = explanation.falsification_condition
  if (!hasText(falsification) || falsification.trim().toLowerCase().startsWith('missing:')) {
    return 'insufficient_evidence'
  }

  return null
}

/** True exactly when presentationFailureState finds no failure state. */
export function isPresentationEligible(explanation) {
  return presentationFailureState(explanation) === null
}

/**
 * Partition a list of explanation rows for rendering.
 * Returns { eligible, excluded } where excluded entries are
 * { explanation, failureState } pairs. Input order is preserved in both lists;
 * rows are never mutated.
 */
export function partitionByEligibility(explanations) {
  const eligible = []
  const excluded = []
  for (const explanation of explanations ?? []) {
    const failureState = presentationFailureState(explanation)
    if (failureState === null) eligible.push(explanation)
    else excluded.push({ explanation, failureState })
  }
  return { eligible, excluded }
}
