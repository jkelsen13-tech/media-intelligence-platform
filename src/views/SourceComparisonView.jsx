import { useEffect, useState } from 'react'
import { loadSourceComparisonView, R_LEVEL_NAMES, E_LEVEL_NAMES, OUTLET_RELIABILITY } from '../lib/sourceComparisonReadPath.js'
import './sourcecomparison.css'

// Source Comparison (03_BACKLOG Item 1) — beta view behind
// pipeline_config.source_comparison_beta (route-gated again in App.jsx).
// Read-only against the Item 1 tables and the Phase 2 explanations store.
//
// Rendered rules:
//   - no composite score anywhere — eight dimensions stay separate;
//   - omission ("not present in this outlet's extracted coverage") and
//     coverage_unknown ("nothing extracted to compare") are different cards,
//     different copy, different styling;
//   - thin-extraction claims are labeled as title/summary-grain;
//   - syndicated copies render as "single original source, syndicated N
//     times", never as N independent sources;
//   - thin/empty outlet columns are shown, not hidden;
//   - every surface claim opens its Phase 2 explanation object.

function ReliabilityChip({ outlet }) {
  const level = OUTLET_RELIABILITY[outlet]
  if (!level) return <span className="sc-chip sc-chip-muted">not yet tiered</span>
  return <span className={`sc-chip sc-chip-${level.toLowerCase()}`}>{R_LEVEL_NAMES[level]}</span>
}

function StrengthChip({ level }) {
  return <span className={`sc-chip sc-chip-${level.toLowerCase()}`}>{E_LEVEL_NAMES[level]}</span>
}

function ExplanationDetails({ explanation }) {
  if (!explanation) {
    return <p className="sc-meta">No explanation object found for this grouping — treated as unverified.</p>
  }
  return (
    <div className="sc-explanation">
      <p className="sc-ev-passage">{explanation.supporting_passage}</p>
      <p className="sc-meta">Rule: {explanation.rule_version}</p>
      <p className="sc-meta">Provenance: {explanation.provenance_class} · Review: {explanation.review_status} · State: {explanation.state}</p>
      {explanation.remaining_uncertainty && (
        <p className="sc-meta">Remaining uncertainty: {explanation.remaining_uncertainty}</p>
      )}
    </div>
  )
}

function SurfaceRow({ surface }) {
  return (
    <li className="sc-surface">
      <header className="sc-surface-head">
        <span className="sc-outlet">{surface.outlet}</span>
        {surface.publishedAt && (
          <span className="sc-meta">{new Date(surface.publishedAt).toLocaleString()}</span>
        )}
        {surface.url && (
          <a className="sc-src" href={surface.url} target="_blank" rel="noreferrer">Article ↗</a>
        )}
      </header>
      <p className="sc-surface-text">{surface.surfaceText}</p>
      {surface.loadedLanguage.length > 0 && (
        <p className="sc-loaded">
          Loaded language:{' '}
          {surface.loadedLanguage.map((h, i) => (
            <span key={i} className="sc-chip sc-chip-loaded" title={h.category}>
              {h.term} <span className="sc-loaded-cat">({h.category.replace(/_/g, ' ')})</span>
            </span>
          ))}
        </p>
      )}
      <details className="sc-details">
        <summary>Provenance / explanation</summary>
        <ExplanationDetails explanation={surface.explanation} />
      </details>
    </li>
  )
}

function ClaimCard({ claim }) {
  return (
    <article className={`sc-claim${claim.thinExtraction ? ' sc-claim-thin' : ''}`}>
      <header className="sc-claim-head">
        <span className={`sc-chip ${claim.classification === 'shared' ? 'sc-chip-shared' : 'sc-chip-unique'}`}>
          {claim.classification === 'shared' ? 'Shared fact' : 'Unique claim'}
        </span>
        <StrengthChip level={claim.evidenceStrength} />
        {claim.thinExtraction && (
          <span className="sc-chip sc-chip-thin">Thin extraction — title/summary only</span>
        )}
      </header>
      <p className="sc-claim-text">{claim.canonicalText}</p>

      <p className="sc-meta">
        Reported independently by: {claim.independentOutlets.join(', ') || 'none'}
        {claim.syndicatedExtra > 0 && (
          <span className="sc-syndicated">
            {' '}· single original source, syndicated {claim.syndicatedExtra + 1} times
          </span>
        )}
      </p>

      {claim.omittedBy.length > 0 && (
        <p className="sc-omission">
          Not present in extracted coverage: {claim.omittedBy.join(', ')} — a statement about
          ingested, extracted coverage only, not about the outlet's total real-world coverage.
        </p>
      )}
      {claim.coverageUnknown.length > 0 && (
        <p className="sc-unknown">
          Coverage unknown (nothing extracted to compare): {claim.coverageUnknown.join(', ')} —
          distinct from omission; extraction has not run or produced no claims for these articles.
        </p>
      )}

      {claim.evidenceLinks.length > 0 && (
        <p className="sc-meta">
          Primary evidence:{' '}
          {claim.evidenceLinks.map((l) => (
            <a key={l.id} className="sc-src" href={l.evidence_url} target="_blank" rel="noreferrer">
              {l.evidence_type.replace(/_/g, ' ')} ↗
            </a>
          ))}
        </p>
      )}
      {claim.corrections.length > 0 && (
        <p className="sc-correction">
          Correction on record: {claim.corrections.map((c) => c.correction_text || 'correction detected').join('; ')}
        </p>
      )}

      <ul className="sc-surface-list">
        {claim.surfaces.map((s) => <SurfaceRow key={s.id} surface={s} />)}
      </ul>
    </article>
  )
}

function EventCard({ event }) {
  return (
    <section className="sc-event">
      <header className="sc-event-head">
        <h3>{event.title}</h3>
        <span className="sc-meta">
          {event.occurredAtStart}
          {event.occurredAtEnd && event.occurredAtEnd !== event.occurredAtStart ? ` → ${event.occurredAtEnd}` : ''}
        </span>
      </header>

      {event.singleSource ? (
        <p className="sc-single-source">
          Only one outlet's coverage ingested for this event — comparison unavailable.
        </p>
      ) : (
        <>
          <p className="sc-meta">
            Outlets in this event: {event.outlets.map((o) => (
              <span key={o} className="sc-outlet-inline">{o} <ReliabilityChip outlet={o} /></span>
            ))}
          </p>
          <p className="sc-meta">
            Publication timing: first reported by {event.firstOutlet ?? 'unknown'}
            {event.timing.filter((t) => t.outlet !== event.firstOutlet).map((t) => (
              <span key={t.outlet} className="sc-timing">
                {' '}· {t.outlet} {t.lagHours === null ? '(time unknown)' : t.lagHours === 0 ? '(same hour)' : `(+${t.lagHours}h)`}
              </span>
            ))}
          </p>
        </>
      )}

      {event.claims.length === 0 ? (
        <p className="sc-empty">No claims extracted for this event yet.</p>
      ) : (
        event.claims.map((claim) => <ClaimCard key={claim.id} claim={claim} />)
      )}
    </section>
  )
}

export default function SourceComparisonView() {
  const [view, setView] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    loadSourceComparisonView()
      .then((v) => { if (!cancelled) setView(v) })
      .catch((e) => { if (!cancelled) setError(e) })
    return () => { cancelled = true }
  }, [])

  if (error) return <div className="notice error">Source comparison view failed to load.</div>
  if (view === null) return <div className="notice">Loading…</div>
  if (!view.enabled) {
    return (
      <div className="notice">
        Source Comparison is a beta surface. This view is disabled (source_comparison_beta flag off).
      </div>
    )
  }

  return (
    <div className="sc-view">
      <section className="sc-banner">
        <h2>Source Comparison — beta</h2>
        <p>
          Coverage of the same event compared claim by claim. Shared facts, unique claims,
          omissions, loaded language, primary evidence, corrections, timing, and source quality
          are shown as separate dimensions — no composite score is computed. Omissions describe
          extracted coverage only; missing evidence is never contradicting evidence.
        </p>
      </section>

      {view.loadError && (
        <div className="notice error">Comparison tables unreachable: {view.loadError}</div>
      )}

      {view.events.length === 0 ? (
        <p className="sc-empty">
          No comparison events yet — the sc-v1 pipeline has not been run against the corpus.
          Events appear here after the source-comparison-run function is invoked.
        </p>
      ) : (
        view.events.map((event) => <EventCard key={event.id} event={event} />)
      )}
    </div>
  )
}
