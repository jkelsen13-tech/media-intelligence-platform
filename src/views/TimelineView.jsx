import { useEffect, useMemo, useState } from 'react'
import { loadTimeline } from '../lib/supabase'
import { EDGE_WEIGHTS } from '../graph/theme'
import '../styles/timeline.css'

// Causal timeline (concept doc §2.4): events ordered by date, with causal AND
// sequential links rendered between them — the connective tissue the news
// cycle severs. Phase 0 Item 4 (2026-07-28): deterministic evt-/art- dedup
// (see canonicalizeTimelineEvents in lib/supabase.js), search, filters,
// collapse/expand, and pagination.

const PAGE_SIZE = 25

const LINK_FILTERS = [
  { id: 'any', label: 'All events' },
  { id: 'linked', label: 'With links' },
  { id: 'causal', label: 'Causal links' },
  { id: 'sequence', label: 'Sequence links' },
  { id: 'none', label: 'No links' },
]

function confidenceColor(score) {
  if (score == null) return '#6b7280'
  const hue = Math.round((score / 100) * 120)
  return `hsl(${hue}, 70%, 45%)`
}

export default function TimelineView() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [linkFilter, setLinkFilter] = useState('any')
  const [page, setPage] = useState(0)
  // Expansion is keyed by node id, so collapsed/expanded context survives
  // page changes and filtering (Tier 4 acceptance).
  const [collapsed, setCollapsed] = useState(() => new Set())

  useEffect(() => {
    loadTimeline().then(setData).catch((err) => setError(err.message))
  }, [])

  // New search/filter criteria always land on page 1; expansion state is kept.
  useEffect(() => {
    setPage(0)
  }, [query, linkFilter])

  const { rows, total, suppressed } = useMemo(() => {
    if (!data) return { rows: [], total: 0, suppressed: 0 }
    // Label lookup covers every node type (data.labels), so edges ending at
    // institutions/anomalies resolve to names, not raw uuids.
    const labelById = new Map(
      (data.labels ?? data.events).map((n) => [n.id ?? n.slug, n.label]),
    )
    const edges = data.relationEdges ?? []
    const term = query.trim().toLowerCase()

    const allRows = data.events.map((evt) => {
      const key = evt.id ?? evt.slug
      const outbound = edges
        .filter((e) => e.source === key)
        .map((e) => ({ ...e, targetLabel: labelById.get(e.target) ?? e.target }))
      const inbound = edges
        .filter((e) => e.target === key)
        .map((e) => ({ ...e, sourceLabel: labelById.get(e.source) ?? e.source }))
      return { evt, key, outbound, inbound }
    })

    const filtered = allRows.filter(({ evt, outbound, inbound }) => {
      if (term) {
        const haystack = [evt.label, evt.summary, evt.description]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(term)) return false
      }
      const links = [...outbound, ...inbound]
      switch (linkFilter) {
        case 'linked':
          return links.length > 0
        case 'causal':
          return links.some((e) => e.type === 'causal')
        case 'sequence':
          return links.some((e) => e.type === 'sequence')
        case 'none':
          return links.length === 0
        default:
          return true
      }
    })
    return { rows: filtered, total: allRows.length, suppressed: data.suppressed ?? 0 }
  }, [data, query, linkFilter])

  if (error) return <div className="notice error">Failed to load timeline: {error}</div>
  if (!data) return <div className="notice">Loading timeline…</div>

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
  const first = rows.length === 0 ? 0 : safePage * PAGE_SIZE + 1
  const last = Math.min(rows.length, safePage * PAGE_SIZE + PAGE_SIZE)

  const toggleCard = (key) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const setAllCollapsed = (collapse) => {
    setCollapsed(collapse ? new Set(rows.map((r) => r.key)) : new Set())
  }

  return (
    <div className="timeline-view">
      <div className="timeline-intro">
        <h2>Causal Timeline</h2>
        <p>
          Events mapped causally, not just chronologically. Institutional memory that survives the
          news cycle.
        </p>
      </div>

      <div className="timeline-controls">
        <input
          type="search"
          className="timeline-search"
          placeholder="Search events…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search timeline events"
        />
        <div className="timeline-filter-chips" role="group" aria-label="Filter by link type">
          {LINK_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`timeline-chip${linkFilter === f.id ? ' active' : ''}`}
              aria-pressed={linkFilter === f.id}
              onClick={() => setLinkFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="timeline-bulk">
          <button type="button" onClick={() => setAllCollapsed(false)}>Expand all</button>
          <button type="button" onClick={() => setAllCollapsed(true)}>Collapse all</button>
        </div>
      </div>

      <p className="timeline-count" aria-live="polite">
        Showing {first}–{last} of {rows.length} events
        {rows.length !== total && ` (filtered from ${total})`}
        {suppressed > 0 &&
          ` · ${suppressed} duplicate article mirrors suppressed (same article, same event: the evt- node is canonical)`}
      </p>

      <ol className="timeline">
        {pageRows.map(({ evt, key, outbound, inbound }) => {
          const isCollapsed = collapsed.has(key)
          return (
            <li key={key} className="timeline-item">
              <div className="timeline-marker" />
              <div className="timeline-card">
                <div className="timeline-card-head">
                  <div>
                    <div className="timeline-date">{evt.occurred_at ?? 'undated'}</div>
                    <h3>{evt.label}</h3>
                  </div>
                  <button
                    type="button"
                    className="timeline-toggle"
                    aria-expanded={!isCollapsed}
                    aria-label={isCollapsed ? `Expand ${evt.label}` : `Collapse ${evt.label}`}
                    onClick={() => toggleCard(key)}
                  >
                    {isCollapsed ? '+' : '−'}
                  </button>
                </div>
                {!isCollapsed && (
                  <>
                    {evt.confidence != null && (
                      <span
                        className="timeline-confidence"
                        style={{ color: confidenceColor(evt.confidence) }}
                      >
                        {evt.confidence}% documented
                      </span>
                    )}
                    {(evt.summary ?? evt.description) && <p>{evt.summary ?? evt.description}</p>}
                    {inbound.length > 0 && (
                      <div className="timeline-links">
                        {inbound.map((e) => (
                          <span key={e.id} className="timeline-link inbound">
                            ← {e.sourceLabel} <em>({e.label ?? 'caused'})</em>
                            <b className={`timeline-badge ${e.type}`}>{e.type}</b>
                            <i style={{ borderTopWidth: EDGE_WEIGHTS[e.weight] ?? 3 }} />
                          </span>
                        ))}
                      </div>
                    )}
                    {outbound.length > 0 && (
                      <div className="timeline-links">
                        {outbound.map((e) => (
                          <span key={e.id} className="timeline-link outbound">
                            → {e.targetLabel} <em>({e.label ?? 'led to'})</em>
                            <b className={`timeline-badge ${e.type}`}>{e.type}</b>
                            <i style={{ borderTopWidth: EDGE_WEIGHTS[e.weight] ?? 3 }} />
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {pageCount > 1 && (
        <nav className="timeline-pager" aria-label="Timeline pages">
          <button
            type="button"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            ← Previous
          </button>
          <span>
            Page {safePage + 1} of {pageCount}
          </span>
          <button
            type="button"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
          >
            Next →
          </button>
        </nav>
      )}
    </div>
  )
}
