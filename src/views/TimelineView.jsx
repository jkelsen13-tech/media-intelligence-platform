import { useEffect, useMemo, useRef, useState } from 'react'
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
  if (score == null) return 'var(--text-muted)'
  const hue = Math.round((score / 100) * 120)
  return `hsl(${hue}, 70%, 45%)`
}

// Doc 05 pairs 1–3: TimelineView accepts cross-window callbacks and a focus
// key. focusEventKey is the 8-hex group suffix shared by an evt-/art- mirror
// pair (i.e. the article id's first 8 hex chars) — the same key the dedup
// groups on, so it always lands on the canonical card.
export default function TimelineView({ onOpenArc, onOpenArticle, focusEventKey }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [linkFilter, setLinkFilter] = useState('any')
  const [page, setPage] = useState(0)
  // Expansion is keyed by node id, so collapsed/expanded context survives
  // page changes and filtering (Tier 4 acceptance).
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [pendingFocus, setPendingFocus] = useState(null)
  const itemRefs = useRef(new Map())
  const focusGuard = useRef(false)

  useEffect(() => {
    loadTimeline().then(setData).catch((err) => setError(err.message))
  }, [])

  // New search/filter criteria always land on page 1; expansion state is kept.
  useEffect(() => {
    if (focusGuard.current) {
      focusGuard.current = false
      return
    }
    setPage(0)
  }, [query, linkFilter])

  // Focus request from another window: clear search/filter, jump to the page
  // containing the event, expand it, then scroll + highlight below.
  useEffect(() => {
    if (!focusEventKey || !data) return
    const idx = data.events.findIndex((e) => (e.slug ?? '').slice(-8) === focusEventKey)
    if (idx === -1) return
    const key = data.events[idx].id ?? data.events[idx].slug
    focusGuard.current = true
    setQuery('')
    setLinkFilter('any')
    setPage(Math.floor(idx / PAGE_SIZE))
    setCollapsed((prev) => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
    setPendingFocus(focusEventKey)
  }, [focusEventKey, data])

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

  // Complete a pending focus once the focused row is rendered on this page.
  useEffect(() => {
    if (!pendingFocus) return
    const row = rows.find((r) => (r.evt.slug ?? '').slice(-8) === pendingFocus)
    if (!row) return
    const el = itemRefs.current.get(row.key)
    if (!el) return
    focusGuard.current = false
    setPendingFocus(null)
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('timeline-focused')
    const t = setTimeout(() => el.classList.remove('timeline-focused'), 4000)
    return () => clearTimeout(t)
  }, [pendingFocus, rows])

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
          // Doc 05 pairs 1–2: cross-window chips. Honest degradation — each
          // chip renders only when its join resolved (arc_id / article_id
          // non-null) and the destination callback exists.
          const arcTitle = evt.arc_id ? data.arcTitles?.get(evt.arc_id) : null
          const showArc = Boolean(evt.arc_id && onOpenArc)
          const showArticle = Boolean(evt.article_id && onOpenArticle)
          return (
            <li
              key={key}
              className="timeline-item"
              ref={(el) => {
                if (el) itemRefs.current.set(key, el)
                else itemRefs.current.delete(key)
              }}
            >
              <div className="timeline-marker" />
              <div className="timeline-card">
                <div className="timeline-card-head">
                  <div>
                    <div className="timeline-date">{evt.occurred_at ?? 'undated'}</div>
                    <h3>{evt.label}</h3>
                    {(showArc || showArticle) && (
                      <div className="timeline-xlinks">
                        {showArc && (
                          <button
                            type="button"
                            className="timeline-xlink"
                            onClick={() => onOpenArc(evt.arc_id)}
                          >
                            Story arc{arcTitle ? `: ${arcTitle}` : ''} →
                          </button>
                        )}
                        {showArticle && (
                          <button
                            type="button"
                            className="timeline-xlink"
                            onClick={() => onOpenArticle(evt.article_id)}
                          >
                            Open in News Feed →
                          </button>
                        )}
                      </div>
                    )}
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
