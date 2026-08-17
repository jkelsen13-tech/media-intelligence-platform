import { useEffect, useMemo, useRef, useState } from 'react'
import { loadArcs, loadArcDetail, loadArcArticles } from '../lib/supabase'
import { filterArcs } from '../lib/listFilters'
import EpistemicBanner from '../components/EpistemicBanner'
import EvidenceStateBar from '../components/EvidenceStateBar'
import LifecycleStrip from '../components/LifecycleStrip'
import RemainingUncertaintyBlock from '../components/RemainingUncertaintyBlock'
import TrustFooter from '../components/TrustFooter'
import TypeIcon from '../components/TypeIcon'
import TypePill from '../components/TypePill'
import {
  policyArcEyebrow,
  deriveEvidenceStates,
  missingScopeCopy,
  lastMilestoneCheck,
  pendingUncertainty,
  distinctOutlets,
} from '../lib/policyArcModel'

// Story Arcs (concept doc §2.5): persistent longitudinal tracking through a
// story's full consequence arc. Track B Step 3 item 2 rebuilt the detail
// panel to the addendum's Screen 4 (Policy Arc) structure: eyebrow, report
// title, status line, standing explanation, tabs (Overview / Evidence —
// the Timeline tab arrives with the item-3/4 engine), Explore-connections
// CTA, lifecycle strip, key developments, chronology banner, evidence-state
// bar, remaining uncertainty, sources line, trust footer. The pre-existing
// elements (milestone checklist, coverage-gap bar, arc-age bar, attached
// articles) are folded into the Evidence tab, not retired (owner delegation
// 2026-08-18). Sidebar, search, and cross-view entry are unchanged.

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
  // Screen 4 tabs. The addendum's third tab (Timeline) is added when the
  // item-3/4 engine ships — a tab whose content does not exist is not
  // rendered.
  const [activeTab, setActiveTab] = useState('overview')
  // Mobile (<1024px): the list is full-width and selecting an arc pushes a
  // full-screen detail view. Desktop keeps the split-pane and ignores this.
  const [pushed, setPushed] = useState(false)
  // Sidebar search (2026-08-10): same pattern as the News Feed search bar —
  // 350ms debounce, trimmed query, client-side substring filter over the
  // already-loaded arc rows (title + category). No data refetch.
  const [arcQuery, setArcQuery] = useState('')
  const [debouncedArcQuery, setDebouncedArcQuery] = useState('')
  const arcDebounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(arcDebounceRef.current)
    arcDebounceRef.current = setTimeout(() => setDebouncedArcQuery(arcQuery.trim()), 350)
    return () => clearTimeout(arcDebounceRef.current)
  }, [arcQuery])

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

  // Selecting a different arc returns to the Overview tab.
  useEffect(() => {
    setActiveTab('overview')
  }, [selectedSlug])

  // Filter affects only which rows the sidebar renders — selection and the
  // detail panel keep working against the full arc list, so a selected arc
  // is never unmounted by narrowing the search.
  const visibleArcs = useMemo(
    () => (arcs ? filterArcs(arcs, debouncedArcQuery, categoryLabel) : []),
    [arcs, debouncedArcQuery],
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

  // Screen 4 derivations (pure seam: src/lib/policyArcModel.js). All are
  // null-safe; null means the corresponding block is omitted, never
  // fabricated.
  const counts = detail ? deriveEvidenceStates(detail.events, detail.milestones) : null
  const missingScope = counts
    ? missingScopeCopy({
        pendingCount: counts.missing,
        startedAt: selected?.started_at,
        lastCheck: lastMilestoneCheck(detail.milestones),
      })
    : null
  const uncertainty = detail ? pendingUncertainty(detail.milestones) : null
  const outlets = distinctOutlets(arcArticles)

  return (
    <div className={`arcs-view${pushed ? ' detail-open' : ''}`}>
      <aside className="arcs-list">
        <h2>Story Arcs</h2>
        <p className="arcs-sub">
          Longitudinal tracking — stories followed through their full consequence arc, not their
          coverage arc.
        </p>
        <input
          className="news-search"
          type="search"
          placeholder="Search arcs by title or category…"
          value={arcQuery}
          onChange={(e) => setArcQuery(e.target.value)}
          aria-label="Search story arcs"
        />
        {visibleArcs.length === 0 && (
          <p className="arcs-sub">No arcs match “{debouncedArcQuery}”.</p>
        )}
        {visibleArcs.map((arc) => {
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
            <p className="ep-eyebrow">{policyArcEyebrow(selected.category)}</p>
            <h2 className="ep-report-title">{selected.title}</h2>
            {statusMeta && (
              <div className="ep-statusline">
                <span className="ep-statusline-dot" style={{ background: statusMeta.color }} />
                <span className="ep-statusline-label" style={{ color: statusMeta.color }}>
                  {statusMeta.label}
                </span>
                {selected.last_update_at && (
                  <span>· updated {String(selected.last_update_at).slice(0, 10)}</span>
                )}
              </div>
            )}
            <span className="arc-category" style={categoryStyle(selected.category)}>
              {categoryLabel(selected.category)}
            </span>
            {selected.category === 'unclassified' && selected.category_evidence == null && (
              <span className="arc-list-meta">
                Classifier declined — below confidence floor.
              </span>
            )}
            <p className="arc-summary">
              A story arc follows one policy or event through its full consequence — not its
              coverage arc. This view shows what changed, what followed, and what is still
              unreported.
            </p>
            {selected.summary && <p className="arc-summary">{selected.summary}</p>}

            {selected.root_node_id && onOpenNode && (
              <button className="ep-cta" onClick={() => onOpenNode(selected.root_node_id)}>
                <svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true" focusable="false">
                  <circle cx="3" cy="11" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
                  <circle cx="11" cy="3" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
                  <circle cx="11" cy="11" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M4.4 9.6 9.6 4.4M4.7 11h4.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                Explore connections
              </button>
            )}

            <div className="ep-tabs" role="tablist" aria-label="Arc sections">
              <button
                role="tab"
                aria-selected={activeTab === 'overview'}
                className={`ep-tab${activeTab === 'overview' ? ' ep-tab-active' : ''}`}
                onClick={() => setActiveTab('overview')}
              >
                Overview
              </button>
              <button
                role="tab"
                aria-selected={activeTab === 'evidence'}
                className={`ep-tab${activeTab === 'evidence' ? ' ep-tab-active' : ''}`}
                onClick={() => setActiveTab('evidence')}
              >
                Evidence
              </button>
            </div>
          </header>

          {detailError && (
            <div className="notice error">Failed to load arc detail: {detailError}</div>
          )}
          {!detail && !detailError && <div className="notice">Loading arc detail…</div>}

          {activeTab === 'overview' && detail && (
            <>
              <section className="ap-section">
                <span className="ep-section-label">Policy lifecycle</span>
                <LifecycleStrip />
              </section>

              <section className="ap-section">
                <span className="ep-section-label">Key developments</span>
                {detail.events.length === 0 ? (
                  <p className="arc-empty">No consequence events recorded yet.</p>
                ) : (
                  <ol className="ep-keydevs">
                    {detail.events.map((e, i) => (
                      <li key={e.id} className="ep-keydev">
                        <TypeIcon type={e.category} />
                        <div className="ep-keydev-body">
                          <div className="ep-keydev-toprow">
                            <span className="ep-keydev-date">{e.occurred_at ?? 'undated'}</span>
                            <TypePill type={e.category} />
                            {i === 0 && (
                              <span className="arc-event-trigger">Triggering event</span>
                            )}
                          </div>
                          <span className="ep-keydev-title">{e.title}</span>
                          {e.description && (
                            <p className="ep-keydev-desc" title={e.description}>
                              {e.description}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <EpistemicBanner>
                Chronology shows sequence. Causal links appear only when supported by evidence.
              </EpistemicBanner>

              <section className="ap-section">
                <span className="ep-section-label">Evidence state</span>
                <EvidenceStateBar
                  supporting={counts.supporting}
                  contested={counts.contested}
                  missing={counts.missing}
                  missingScope={missingScope}
                />
              </section>

              {uncertainty && (
                <RemainingUncertaintyBlock>
                  Still unresolved: {uncertainty.join('; ')}.
                </RemainingUncertaintyBlock>
              )}

              {outlets.length > 0 && (
                <p className="ep-sources-line">
                  <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true" focusable="false">
                    <path d="M6 8a2.5 2.5 0 0 0 3.5.4l1.6-1.6a2.5 2.5 0 0 0-3.5-3.5l-.9.9" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    <path d="M8 6a2.5 2.5 0 0 0-3.5-.4L2.9 7.2a2.5 2.5 0 0 0 3.5 3.5l.9-.9" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                  Sources: {outlets.join(', ')}
                </p>
              )}
            </>
          )}

          {activeTab === 'evidence' && detail && (
            <>
              {/* Pre-existing §2.5.4 elements folded into the Evidence tab
                  (owner delegation 2026-08-18): arc-age bar, coverage-gap
                  indicator, coverage-gap warning, milestone checklist,
                  attached articles. None retired. */}
              <section className="arc-status-panel">
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

                <CoverageGapBar articles={arcArticles} startedAt={selected.started_at} />

                {selected.coverage_gap && (
                  <div className="arc-coverage-gap">
                    ⚠ Coverage gap — real-world developments are outpacing media coverage. The
                    story is still unfolding; the media has moved on.
                  </div>
                )}

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
                          <span className="ap-source-date">
                            {String(a.published_at).slice(0, 10)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          {/* Trust footer (addendum: bottom of every screen). reviewedAt is
              null — story_arcs.last_update_at is a machine update timestamp,
              not a human review date, and a review date is never fabricated;
              the Reviewed line appears when a real one exists. */}
          <TrustFooter left={null} reviewedAt={null} />
        </section>
      )}
    </div>
  )
}
