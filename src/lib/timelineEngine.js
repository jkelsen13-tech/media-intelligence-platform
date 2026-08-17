// Track B Step 3 item 3 — timeline connector + expanded-detail engine
// (pure seam). Shared by the Screen 5 timeline (item 4) and the Arc
// Timeline tab (item 5). No network, no flags, no DOM; unit tests pin the
// invariants in tests/timelineEngine.test.mjs.
//
// THE CONNECTOR RULE (addendum Screen 5, the screen's single most
// important element): every gap between adjacent entries is explicitly
// labeled, so temporal adjacency can never be misread as causation.
// See verifier/trackb3-v3/trackb3-step3-item3.md for the locked rule and
// the live-data facts it is built against (411 live edges, ZERO causal;
// edges.doc_strength vocabulary documented/corroborated/circumstantial).

import { AXIS_TONES } from './relationshipProvenance.js'

// --- Locked copy (verbatim; static-guarded) ---------------------------------
export const CONNECTOR_SEQUENCE_LABEL = 'Sequence only'
export const CONNECTOR_CAUSAL_LABEL = 'Source-supported causal link'
export const TIMELINE_CLOSING_FOOTNOTE =
  'Chronology is shown as sequence. Causal links appear only when source-supported.'

// Confirmed-grade documentation strength. 'circumstantial' is the weak
// tier and never earns the causal label; absent strength withholds it.
const CONFIRMED_GRADE_STRENGTH = new Set(['documented', 'corroborated'])

/**
 * The source-supported causal edge between two adjacent entries, or null.
 * Direction must match chronology: a stored causal claim only labels the
 * gap when it points from the earlier entry to the later one. A backward
 * or weakly documented causal edge does NOT earn the label (it stays
 * visible verbatim in the entry's expanded detail instead).
 */
export function findCausalLink(earlierKey, laterKey, edges) {
  if (earlierKey == null || laterKey == null || !Array.isArray(edges)) return null
  return (
    edges.find(
      (e) =>
        e &&
        e.type === 'causal' &&
        e.source === earlierKey &&
        e.target === laterKey &&
        CONFIRMED_GRADE_STRENGTH.has(e.doc_strength),
    ) ?? null
  )
}

/**
 * Connector for one gap. Always returns a connector — a gap is never left
 * implicit. kind 'causal' only when findCausalLink resolves.
 */
export function connectorBetween(earlierKey, laterKey, edges) {
  const link = findCausalLink(earlierKey, laterKey, edges)
  if (link) {
    return Object.freeze({
      kind: 'causal',
      label: CONNECTOR_CAUSAL_LABEL,
      edgeId: link.id ?? null,
    })
  }
  return Object.freeze({ kind: 'sequence', label: CONNECTOR_SEQUENCE_LABEL, edgeId: null })
}

/**
 * Connectors for a whole entry list: exactly entries.length − 1 for
 * n ≥ 1 entries (one per gap, never dropped, never abbreviated). Entries
 * carry their edge-join key as `key` (falling back to id/slug).
 */
export function buildConnectors(entries, edges) {
  const list = Array.isArray(entries) ? entries : []
  const out = []
  for (let i = 0; i + 1 < list.length; i++) {
    const earlier = list[i]?.key ?? list[i]?.id ?? list[i]?.slug ?? null
    const later = list[i + 1]?.key ?? list[i + 1]?.id ?? list[i + 1]?.slug ?? null
    out.push(connectorBetween(earlier, later, edges))
  }
  return out
}

// --- Expanded entry detail card (v16 three-tone honest states) ----------------
// Every section carries visible, intentional content: real data (value) or
// an explicit empty state (unavailable) — never a blank, never a
// fabrication. Tones come from the shared AXIS_TONES vocabulary.

export const DETAIL_EMPTY = Object.freeze({
  whatChanged: 'No description recorded for this entry.',
  sourceExcerpt: 'No source excerpt recorded for this entry.',
  authentication: 'Not archived — authentication not yet available for this entry.',
  remainingUncertainty: 'No remaining-uncertainty note recorded for this entry.',
})

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/**
 * View model for the expanded timeline entry detail card.
 * @param {object} args.entry - timeline entry (description/summary).
 * @param {object|null} args.article - joined article row (summary, outlet,
 *   published_at) when the entry's article join resolves, else null.
 */
export function entryDetailView({ entry, article = null } = {}) {
  if (!AXIS_TONES.includes('value')) {
    // Defensive: the shared vocabulary is the contract; if it ever changes
    // the seam fails loudly here rather than rendering off-vocabulary tones.
    throw new Error('AXIS_TONES vocabulary changed — update timelineEngine')
  }

  const description = text(entry?.description) ?? text(entry?.summary)
  const excerpt = text(article?.summary)
  const outlet = text(article?.outlet)
  const date = article?.published_at ? String(article.published_at).slice(0, 10) : null

  return Object.freeze({
    whatChanged: description
      ? Object.freeze({ tone: 'value', text: description })
      : Object.freeze({ tone: 'unavailable', text: DETAIL_EMPTY.whatChanged }),
    // The excerpt is quoted ONLY with its attribution legs intact — a quote
    // without outlet and date would be unattributed material.
    sourceExcerpt:
      excerpt && outlet && date
        ? Object.freeze({
            tone: 'value',
            text: excerpt,
            attribution: `— ${outlet}, ${date}`,
          })
        : Object.freeze({ tone: 'unavailable', text: DETAIL_EMPTY.sourceExcerpt }),
    // No per-event authentication record exists in the schema
    // (sky_verified lives on edges, not nodes) — explicit unavailable.
    authentication: Object.freeze({ tone: 'unavailable', text: DETAIL_EMPTY.authentication }),
    remainingUncertainty: Object.freeze({
      tone: 'unavailable',
      text: DETAIL_EMPTY.remainingUncertainty,
    }),
  })
}
