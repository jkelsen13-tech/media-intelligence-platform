// Track B Step 3 item 4 — shared arc evidence panel. Extracted verbatim
// from ArcsView's Evidence tab (the pre-existing §2.5.4 elements: arc-age
// bar, coverage-gap indicator, coverage-gap warning, milestone checklist,
// attached articles) so Screen 5's Evidence tab REUSES it instead of
// rebuilding (addendum system conventions: shared components are reused,
// not rebuilt per screen). ArcsView consumes this same component.

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

export function arcAgeDays(startedAt) {
  if (!startedAt) return null
  return Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 86400000))
}

export default function ArcEvidencePanel({ arc, detail, arcArticles, onOpenArticle }) {
  const ageDays = arcAgeDays(arc?.started_at)
  return (
    <>
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

        <CoverageGapBar articles={arcArticles} startedAt={arc?.started_at} />

        {arc?.coverage_gap && (
          <div className="arc-coverage-gap">
            ⚠ Coverage gap — real-world developments are outpacing media coverage. The story is
            still unfolding; the media has moved on.
          </div>
        )}

        <div className="arc-status-subsection">
          <span className="ap-label">Milestone checklist — did anything actually happen?</span>
          {detail.milestones.length === 0 ? (
            <p className="arc-empty">
              No milestones tracked yet — expected outcomes have not been recorded for this arc.
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
                  <span className="ap-source-date">{String(a.published_at).slice(0, 10)}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
