// G2 — vocabulary harness: pure functions implementing the locked precedence
// rules (P1–P5) and deterministic legacy mappings, so the drift guards can test
// behavior against the machine-checkable fixture. Mirrors the G1 harness-port
// pattern: this file is the canonical test-side encoding; if the locked
// vocabulary changes, this file and the fixture change together under
// golden-set-class review.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
export const repoRoot = join(here, '..', '..', '..')

export function loadVocabulary() {
  return JSON.parse(readFileSync(join(repoRoot, 'tests/golden/fixtures/uncertainty_vocabulary.json'), 'utf8'))
}

const E_RANK = { E1: 4, E2: 3, E3: 2, E4: 1 }
const A_RANK = { A1: 4, A2: 3, A3: 2, A4: 1 }
const R_RANK = { R1: 4, R2: 3, R3: 2, R4: 1 }

// --- deterministic legacy mappings (docs/UNCERTAINTY_LEGACY_MAPPING.md) ---
export function mapConfidence(v) {
  // nodes.confidence live values are exactly 70 (art- mirror) and 65 (evt-)
  if (v === 70) return 'E3'
  if (v === 65) return 'E4'
  return null // undefined input: mapping is total over live data only
}
export function mapReliability(n) {
  return R_RANK['R' + n] ? 'R' + n : null
}
export function mapDocStrength(d) {
  return { documented: 'E1', corroborated: 'E2', circumstantial: 'E3' }[d] ?? null
}
export function mapSignalSource(signal_source, doc_strength) {
  if (signal_source === 'citation') return doc_strength === 'documented' ? 'E1' : 'E2'
  if (signal_source === 'shared_entity') return doc_strength === 'corroborated' ? 'E2' : 'E3'
  if (signal_source === 'causal_language') return 'E3' // RT-causal candidate, r4 guard
  if (signal_source === 'temporal') return 'E3' // RT-sequence cap
  return null
}
export function mapEdgeType(t) {
  return { causal: 'RT-causal', sequence: 'RT-sequence', actor: 'RT-actor', constrained_by: 'RT-constrained_by' }[t] ?? null
}
export function mapCitationStrength(x) {
  if (x >= 0.8) return 'E1'
  if (x >= 0.5) return 'E2'
  return 'E3'
}
export function mapCategoryConfidence(x) {
  if (x == null) return { level: 'E4', uncertainty: 'U1' }
  if (x >= 0.8) return { level: 'E2', uncertainty: 'U0' }
  if (x >= 0.45) return { level: 'E3', uncertainty: 'U0' }
  return { level: 'E4', uncertainty: 'U1' }
}
export function mapArticleFlags({ unattributed = false, monoculture = false, is_digest = false } = {}) {
  return {
    authentication: unattributed || monoculture ? 'A3' : null,
    uncertainty: unattributed || monoculture ? 'U1' : null,
    source_cap: is_digest ? 'R4' : null,
  }
}
export function mapEdgeWeight() {
  return 'RETIRED' // deterministic shadow of edges.type; carries no information
}
export function mapSkyVerified(v) {
  return v === false ? 'V0' : null // true is not defined as verified; review history required
}

// --- precedence rules P1–P5 ---
// resolvePresentation never merges axes into a score (P1, D-01). It returns the
// weakest-link standing (P2), the licensed labels (P3), whether remaining
// uncertainty must render (P4), and a reliable-source note that can never raise
// the standing (P2).
export function resolvePresentation(axes) {
  const { authentication, evidence_strength, source_reliability, review_status, remaining_uncertainty } = axes
  const aRank = A_RANK[authentication] ?? null
  const eRank = E_RANK[evidence_strength] ?? null
  let standing = null
  let governing = null
  if (aRank != null && eRank != null) {
    if (aRank <= eRank) { standing = authentication; governing = 'authentication' } else { standing = evidence_strength; governing = 'evidence_strength' }
  } else {
    standing = authentication ?? evidence_strength ?? null
    governing = authentication ? 'authentication' : (evidence_strength ? 'evidence_strength' : null)
  }
  const labels = []
  if (review_status === 'V2') labels.push('reviewed')
  if (review_status === 'V3') labels.push('adjudicated')
  const u = remaining_uncertainty ?? 'U0'
  const uncertaintyShown = u !== 'U0' // P4: U1+ always rendered
  const settledBlocked = u === 'U3' // P4: U3 blocks settled presentation
  const reliableSourceNote = R_RANK[source_reliability] >= 3 // R1/R2 note; never raises standing (P2)
  const alleged = aRank != null && aRank <= A_RANK.A2 // unreviewed/flagged provenance => alleged, not established
  return { standing, governing, labels, uncertaintyShown, settledBlocked, reliableSourceNote, alleged }
}
