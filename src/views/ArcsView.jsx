import { useEffect, useMemo, useState } from 'react'
import { loadArcs, loadArcDetail, loadArcArticles } from '../lib/supabase'

// Story Arcs (concept doc §2.5): persistent longitudinal tracking through a
// story's full consequence arc. Arc panel = status indicator, milestone
// checklist, consequence timeline, coverage gap indicator — plus the
// articles attached to the arc and a link back to its root graph node.

// A4: status dots are wired to status derived from real signals
// (arc_events recency + milestone state — see deriveArcStatus in
// src/lib/supabase.js). Three states, three distinct colors. When no real
// status can be derived, no dot is shown.
const STATUS_META = {
  active: { color: 'var(--cat-green)', label: 'Active' },
  dormant: { color: 'var(--cat-amber)', label: 'Dormant' },
  resolved: { color: 'var(--cat-blue)', label: 'Resolved' },
}

// A2: fifth category. Unclassified renders in neutral grey.
const CATEGORY_META = {
  institutional_accountability: { label: 'Institutional Accountability' },
  geopolitical_consequence: { label: 'Geopolitical Consequence' },
  economic_policy: { label: 'Economic Policy' },
  legislative_regulatory: { label: 'Legislative / Regulatory' },
  unclassified: { label: 'Unclassified', color: 'var(--cat-grey)' }, // neutral grey
}

function categoryLabel(category) {
  return CATEGORY_META[category]?.label ?? category
}

function categoryStyle(category) {
  const color = CATEGORY_META[category]?.color
  return color ? { color } : undefined
}

// Spec §2.5.4 four-state milestone taxonomy. Legacy values from
// pre-§2.5.4 data shapes map onto the new states.
const MILESTONE_META = {
  pending: { color: 'var(--cat-amber)', label: 'Pending', icon: '○' },
  confirmed: { color: 'var(--cat-green)', label: 'Confirmed', icon: '✓' },
  failed: { color: 'var(--cat-red)', label: 'Failed', icon: '✗' },
  abandoned: { color: 'var(--cat-grey)', label: 'Abandoned', icon: '–' },
}
const MILESTONE_LEGACY = {
  confirmed_complete: 'confirmed',
  confirmed_failed: 'failed',
  unresolved: 'pending',
}
function milestoneMeta(status) {
  const key = MILESTONE_META[status] ? status : MILESTONE_LEGACY[status] ?? 'pending'
  return MILESTONE_META[key]
}

const CONFIDENCE_META = {
  confirmed: { color: 'var(--cat-green)', label: 'Confirmed' },
  corroborated: { color: 'var(--cat-blue)', label: 'Corroborated' },
  inferred: { color: 'var(--cat-amber)', label: 'Inferred' },
}

function arcAgeDays(startedAt) {
  if (!startedAt) return null
  return Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 86400000))
}

// --- C6: coverage-gap bar (signature element) ------------------------------
// The arc schema has no expected-vs-actual coverage fields, so the bar uses
// a documented PROXY: the arc's lifespan (started_at → now) is split into
// equal time slices; a slice is "covered" when at least one attached article
// was published inside it, "gap" (red) otherwise. Stats show attached
// articles, distinct outlets, and days since the most recent article.
const GAP_SEGMENTS = 8
const GAP_STALE_DAYS = 30

function CoverageGapBar({ articles, startedAt }) {
  const now = Date.now()
  const times = articles
    .map((a) => new Date(a.published_at).getTime())
    .filter((t) => Number.isFinite(t))
  const start = startedAt ? new Date(startedAt).getTime() : Math.min(...times)
  if (!Number.isFinite(start) || times.length === 0) {
    return (
      <div className="gap-bar">
        <div className="gap-bar-head">
          <span className="gap-bar-title">Coverage over time</span>
          <span className="gap-bar-stats">
            <span className="num gap-flag">NO ATTACHED ARTICLES</span>
          </span>
        </div>
        <div className="gap-bar-track">
          {Array.from({ length: GAP_SEGMENTS }, (_, i) => (
            <span key={i} className="gap-seg gap" />
          ))}
        </div>
        <div className="gap-bar-foot">
          <span>proxy: attached-article timestamps</span>
          <span>no coverage signal</span>
        </div>
      </div>
    )
  }
  const span = Math.max(now - start, 86400000)
  const segments = Array.from({ length: GAP_SEGMENTS }, (_, i) => {
    const t0 = start + (span * i) / GAP_SEGMENTS
    const t1 = start + (span * (i + 1)) / GAP_SEGMENTS
    return times.some((t) => t >= t0 && t < t1)
  })
  const outlets = new Set(articles.map((a) => a.outlet).filter(Boolean)).size
  const daysSinceLatest = Math.floor((now - Math.max(...times)) / 86400000)
  const stale = daysSinceLatest > GAP_STALE_DAYS
  return (
    <div className="gap-bar">
      <div className="gap-bar-head">
        <span className="gap-bar-title">Coverage over time</span>
        <span className="gap-bar-stats">
          <span className="num">
            {articles.length} <span className="stat-full">ARTICLES</span>
            <span className="stat-short">ART</span>
          </span>
          <span className="num">
            {outlets} <span className="stat-full">OUTLETS</span>
            <span className="stat-short">OUT</span>
          </span>
          <span className={`num${stale ? ' gap-flag' : ''}`}>
            {daysSinceLatest}D<span className="stat-full"> SINCE LAST</span>
          </span>
        </span>
      </div>
      <div className="gap-bar-track">
        {segments.map((covered, i) => (
          <span
            key={i}
            className={`gap-seg ${covered ? 'covered' : 'gap'}`}
            title={covered ? 'covered' : 'coverage gap'}
          />
        ))}
      </div>
      <div className="gap-bar-foot">
        <span>{new Date(start).toISOString().slice(0, 10)}</span>
        <span>proxy: attached-article timestamps</span>
        <span>now</span>
      </div>
    </div>
  )
}

export default function ArcsView({ focusArcId, onOpenArticle, onOpenNode }) {
  const [arcs, setArcs] = useState(null)
  const [error, setError] = useState(null)
  const [selectedSlug, setSelectedSlug] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailError, setDetailError] = useState(null)
  const [arcArticles, setArcArticles] = useState([])
  // Mobile (<1024px): the list is full-width and selecting an arc pushes a
  // full-screen detail view. Desktop keeps the split-pane and ignores this.
  const [pushed, setPushed] = useState(false)

  useEffect(() => {
    loadArcs()
      .then((rows) => {
        setArcs(rows)
        if (rows.length > 0) setSelectedSlug(rows[0].slug)
      })
      .catch((err) => setError(err.message))
  }, [])

  // Cross-view entry: a news article's arc badge asked us to open this arc.
  useEffect(() => {
    if (!focusArcId || !arcs) return
    const match = arcs.find((a) => a.id === focusArcId || a.slug === focusArcId)
    if (match) {
      setSelectedSlug(match.slug)
      setPushed(true)
    }
  }, [focusArcId, arcs])

  const selected = useMemo(
    () => arcs?.find((a) => a.slug === selectedSlug) ?? null,
    [arcs, selectedSlug],
  )

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    setDetail(null)
    setDetailError(null)
    const key = selected.id ?? selected.slug
    loadArcDetail(key)
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch((err) => {
        if (!cancelled) setDetailError(err.message)
      })
    loadArcArticles(selected.id)
      .then((rows) => {
        if (!cancelled) setArcArticles(rows)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [selected])

  if (error) return <div className="notice error">Failed to load story arcs: {error}</div>
  if (!arcs) return <div className="notice">Loading story arcs…</div>
  if (arcs.length === 0) return <div className="notice">No story arcs tracked yet.</div>

  const ageDays = selected ? arcAgeDays(selected.started_at) : null
  // Derived status is the real signal; fall back to the stored column only
  // for data shapes that predate derivation (demo data without it).
  const statusKey = selected
    ? selected.derived_status !== undefined
      ? selected.derived_status
      : selected.status
    : null
  const statusMeta = statusKey ? STATUS_META[statusKey] : null

  return (
    <div className={`arcs-view${pushed ? ' detail-open' : ''}`}>
      <aside className="arcs-list">
        <h2>Story Arcs</h2>
        <p className="arcs-sub">
          Longitudinal tracking — stories followed through their full consequence arc, not their
          coverage arc.
        </p>
        {arcs.map((arc) => {
          // Derived status is the real signal; fall back to the stored
          // column only for data shapes that predate derivation (demo data
          // without it). No derivable status => no dot.
          const statusKey = arc.derived_status !== undefined ? arc.derived_status : arc.status
          const meta = statusKey ? STATUS_META[statusKey] : null
          return (
            <button
              key={arc.slug}
              className={`arc-list-item${arc.slug === selectedSlug ? ' selected' : ''}`}
              onClick={() => {
                setSelectedSlug(arc.slug)
                setPushed(true)
              }}
            >
              {meta && <span className="arc-status-dot" style={{ background: meta.color }} />}
              <span className="arc-list-title">{arc.title}</span>
              <span className="arc-list-meta" style={categoryStyle(arc.category)}>
                {categoryLabel(arc.category)}
              </span>
            </button>
          )
        })}
      </aside>

      {selected && (
        <section className="arc-panel">
          <header className="arc-panel-header">
            <button className="arc-back-btn" onClick={() => setPushed(false)}>
              ← All story arcs
            </button>
            <div className="arc-panel-title-row">
              <h2>{selected.title}</h2>
              {(() => {
                const statusKey =
                  selected.derived_status !== undefined ? selected.derived_status : selected.status
                const meta = statusKey ? STATUS_META[statusKey] : null
                if (!meta) return null
                return (
                  <span
                    className="arc-status-badge"
                    style={{ borderColor: meta.color, color: meta.color }}
                  >
                    {meta.label}
                  </span>
                )
              })()}
            </div>
            <span className="arc-category" style={categoryStyle(selected.category)}>
              {categoryLabel(selected.category)}
            </span>
            {selected.category === 'unclassified' && selected.category_evidence == null && (
              <span className="arc-list-meta">
                Classifier declined — below confidence floor.
              </span>
            )}
            {selected.summary && <p className="arc-summary">{selected.summary}</p>}

            {selected.root_node_id && onOpenNode && (
              <button
                className="news-chip graph-link arc-graph-btn"
                onClick={() => onOpenNode(selected.root_node_id)}
              >
                ◈ Open root event in knowledge graph
              </button>
            )}

            <div className="arc-age-row">
              <span className="ap-label">Arc age</span>
              <div className="arc-age-bar">
                <div
                  className="arc-age-fill"
                  style={{ width: `${Math.min(100, ((ageDays ?? 0) / 365) * 100)}%` }}
                />
              </div>
              <span className="arc-age-label">
                <span className="num">{ageDays ?? '—'}</span> days
              </span>
            </div>

          </header>

          {/* Spec §2.5.4 — Arc Status interface: one coherent status panel
              composing (1) derived status, (2) coverage-gap indicator,
              (3) milestone checklist, (4) consequence timeline. */}
          <section className="arc-status-panel">
            <div className="arc-status-head">
              <span className="ap-label">Arc status</span>
              {statusMeta && (
                <span className="arc-status-value" style={{ color: statusMeta.color }}>
                  <span className="arc-status-dot" style={{ background: statusMeta.color }} />
                  <span className="num">{statusMeta.label}</span>
                </span>
              )}
            </div>

            <CoverageGapBar articles={arcArticles} startedAt={selected.started_at} />

            {selected.coverage_gap && (
              <div className="arc-coverage-gap">
                ⚠ Coverage gap — real-world developments are outpacing media coverage. The story
                is still unfolding; the media has moved on.
              </div>
            )}

            {detailError && (
              <div className="notice error">Failed to load arc detail: {detailError}</div>
            )}
            {!detail && !detailError && <div className="notice">Loading arc detail…</div>}

            {detail && (
              <>
                <div className="arc-status-subsection">
                  <span className="ap-label">
                    Milestone checklist — did anything actually happen?
                  </span>
                  {detail.milestones.length === 0 ? (
                    <p className="arc-empty">
                      No milestones tracked yet — expected outcomes have not been recorded for
                      this arc.
                    </p>
                  ) : (
                    <ul className="arc-milestones">
                      {detail.milestones.map((m) => {
                        const meta = milestoneMeta(m.status)
                        return (
                          <li key={m.id} className="arc-milestone">
                            <span className="arc-milestone-status" style={{ color: meta.color }}>
                              {meta.icon}
                            </span>
                            <div className="arc-milestone-body">
                              <span className="arc-milestone-title">{m.title}</span>
                              <span className="arc-milestone-meta" style={{ color: meta.color }}>
                                {meta.label}
                                {m.updated_at && ` · updated ${String(m.updated_at).slice(0, 10)}`}
                              </span>
                              {m.notes && <span className="arc-milestone-notes">{m.notes}</span>}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>

                {/* Consequence timeline branching from the triggering event.
                    Simplification: arc_events carries no branch/type column,
                    so events render as a single chronological spine anchored
                    on the earliest (triggering) event. */}
                <div className="arc-status-subsection">
                  <span className="ap-label">Consequence timeline</span>
                  {detail.events.length === 0 ? (
                    <p className="arc-empty">No consequence events recorded yet.</p>
                  ) : (
                    <ol className="arc-events">
                      {detail.events.map((e, i) => {
                        const conf = CONFIDENCE_META[e.confidence] ?? CONFIDENCE_META.confirmed
                        return (
                          <li key={e.id} className="arc-event">
                            <div className="timeline-marker" />
                            <div className="arc-event-body">
                              <span className="arc-event-date">{e.occurred_at ?? 'undated'}</span>
                              <span className="arc-event-title">{e.title}</span>
                              <span className="arc-event-meta">
                                {i === 0 && (
                                  <span className="arc-event-trigger">Triggering event</span>
                                )}
                                <span className="arc-event-category">{e.category}</span>
                                <span style={{ color: conf.color }}>{conf.label}</span>
                              </span>
                              {e.description && <p className="arc-event-desc">{e.description}</p>}
                            </div>
                          </li>
                        )
                      })}
                    </ol>
                  )}
                </div>
              </>
            )}
          </section>

          {arcArticles.length > 0 && (
            <section className="ap-section">
              <span className="ap-label">
                Attached articles (<span className="num">{arcArticles.length}</span>)
              </span>
              <ul className="ap-sources">
                {arcArticles.map((a) => (
                  <li key={a.id} className="ap-source">
                    <span className="ap-source-outlet">{a.outlet}</span>
                    <button
                      className="ap-source-headline ap-article-link"
                      title="Open in News Feed"
                      onClick={() => onOpenArticle?.(a.id)}
                    >
                      {a.title}
                    </button>
                    {a.published_at && (
                      <span className="ap-source-date">{String(a.published_at).slice(0, 10)}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>
      )}
    </div>
  )
}
