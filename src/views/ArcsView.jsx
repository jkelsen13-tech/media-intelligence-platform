import { useEffect, useMemo, useState } from 'react'
import { loadArcs, loadArcDetail } from '../lib/supabase'

// Story Arcs (concept doc §2.5): persistent longitudinal tracking through a
// story's full consequence arc. Arc panel = status indicator, milestone
// checklist, consequence timeline, coverage gap indicator.

const STATUS_META = {
  active: { color: '#22c55e', label: 'Active' },
  dormant: { color: '#f59e0b', label: 'Dormant' },
  resolved: { color: '#3b82f6', label: 'Resolved' },
  cold: { color: '#6b7280', label: 'Cold' },
}

const CATEGORY_LABELS = {
  institutional_accountability: 'Institutional Accountability',
  geopolitical_consequence: 'Geopolitical Consequence',
  economic_policy: 'Economic Policy',
  legislative_regulatory: 'Legislative / Regulatory',
}

const MILESTONE_META = {
  pending: { color: '#f59e0b', label: 'Pending' },
  confirmed_complete: { color: '#22c55e', label: 'Confirmed Complete' },
  confirmed_failed: { color: '#ef4444', label: 'Confirmed Failed' },
  unresolved: { color: '#9ca3af', label: 'Unresolved' },
}

const CONFIDENCE_META = {
  confirmed: { color: '#22c55e', label: 'Confirmed' },
  corroborated: { color: '#3b82f6', label: 'Corroborated' },
  inferred: { color: '#f59e0b', label: 'Inferred' },
}

function arcAgeDays(startedAt) {
  if (!startedAt) return null
  return Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 86400000))
}

export default function ArcsView() {
  const [arcs, setArcs] = useState(null)
  const [error, setError] = useState(null)
  const [selectedSlug, setSelectedSlug] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailError, setDetailError] = useState(null)

  useEffect(() => {
    loadArcs()
      .then((rows) => {
        setArcs(rows)
        if (rows.length > 0) setSelectedSlug(rows[0].slug)
      })
      .catch((err) => setError(err.message))
  }, [])

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
    return () => {
      cancelled = true
    }
  }, [selected])

  if (error) return <div className="notice error">Failed to load story arcs: {error}</div>
  if (!arcs) return <div className="notice">Loading story arcs…</div>
  if (arcs.length === 0) return <div className="notice">No story arcs tracked yet.</div>

  const ageDays = selected ? arcAgeDays(selected.started_at) : null

  return (
    <div className="arcs-view">
      <aside className="arcs-list">
        <h2>Story Arcs</h2>
        <p className="arcs-sub">
          Longitudinal tracking — stories followed through their full consequence arc, not their
          coverage arc.
        </p>
        {arcs.map((arc) => {
          const meta = STATUS_META[arc.status] ?? STATUS_META.active
          return (
            <button
              key={arc.slug}
              className={`arc-list-item${arc.slug === selectedSlug ? ' selected' : ''}`}
              onClick={() => setSelectedSlug(arc.slug)}
            >
              <span className="arc-status-dot" style={{ background: meta.color }} />
              <span className="arc-list-title">{arc.title}</span>
              <span className="arc-list-meta">{CATEGORY_LABELS[arc.category] ?? arc.category}</span>
            </button>
          )
        })}
      </aside>

      {selected && (
        <section className="arc-panel">
          <header className="arc-panel-header">
            <div className="arc-panel-title-row">
              <h2>{selected.title}</h2>
              <span
                className="arc-status-badge"
                style={{
                  borderColor: (STATUS_META[selected.status] ?? STATUS_META.active).color,
                  color: (STATUS_META[selected.status] ?? STATUS_META.active).color,
                }}
              >
                {(STATUS_META[selected.status] ?? STATUS_META.active).label}
              </span>
            </div>
            <span className="arc-category">{CATEGORY_LABELS[selected.category] ?? selected.category}</span>
            {selected.summary && <p className="arc-summary">{selected.summary}</p>}

            <div className="arc-age-row">
              <span className="ap-label">Arc age</span>
              <div className="arc-age-bar">
                <div
                  className="arc-age-fill"
                  style={{ width: `${Math.min(100, ((ageDays ?? 0) / 365) * 100)}%` }}
                />
              </div>
              <span className="arc-age-label">{ageDays ?? '—'} days</span>
            </div>

            {selected.coverage_gap && (
              <div className="arc-coverage-gap">
                ⚠ Coverage gap — real-world developments are outpacing media coverage. The story
                is still unfolding; the media has moved on.
              </div>
            )}
          </header>

          {detailError && (
            <div className="notice error">Failed to load arc detail: {detailError}</div>
          )}
          {!detail && !detailError && <div className="notice">Loading arc detail…</div>}

          {detail && (
            <div className="arc-body">
              <section className="ap-section">
                <span className="ap-label">Milestone checklist — did anything actually happen?</span>
                <ul className="arc-milestones">
                  {detail.milestones.map((m) => {
                    const meta = MILESTONE_META[m.status] ?? MILESTONE_META.pending
                    return (
                      <li key={m.id} className="arc-milestone">
                        <span className="arc-milestone-status" style={{ color: meta.color }}>
                          {m.status === 'confirmed_complete' ? '✓' : m.status === 'confirmed_failed' ? '✗' : '○'}
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
              </section>

              <section className="ap-section">
                <span className="ap-label">Consequence timeline</span>
                <ol className="arc-events">
                  {detail.events.map((e) => {
                    const conf = CONFIDENCE_META[e.confidence] ?? CONFIDENCE_META.confirmed
                    return (
                      <li key={e.id} className="arc-event">
                        <div className="timeline-marker" />
                        <div className="arc-event-body">
                          <span className="arc-event-date">{e.occurred_at ?? 'undated'}</span>
                          <span className="arc-event-title">{e.title}</span>
                          <span className="arc-event-meta">
                            <span className="arc-event-category">{e.category}</span>
                            <span style={{ color: conf.color }}>{conf.label}</span>
                          </span>
                          {e.description && <p className="arc-event-desc">{e.description}</p>}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </section>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
