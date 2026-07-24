import { useEffect, useMemo, useRef, useState } from 'react'
import { loadArticles, loadOutlets, loadArticleDetail, loadArticleGraphLinks } from '../lib/supabase'

// News Feed: the live ingested article stream across all outlets — search,
// outlet filter, and arc-assignment status. Integrated with the knowledge
// graph: arc badges jump to Story Arcs, citation links jump to graph nodes.

const PAGE_SIZE = 30

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'arc', label: 'Attached to arc' },
  { key: 'unattributed', label: 'Unattributed' },
  { key: 'monoculture', label: 'Monoculture flagged' },
]

function fmtDate(iso) {
  if (!iso) return 'undated'
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function strengthBadge(strength) {
  if (strength == null) return null
  const pct = Math.round(strength * 100)
  const color =
    strength >= 0.75
      ? 'var(--green-bright)'
      : strength >= 0.5
        ? 'var(--flag-yellow)'
        : 'var(--cat-grey)'
  return (
    <span className="news-cit-strength num" style={{ color }}>
      {pct}% doc
    </span>
  )
}

export default function NewsView({ onOpenArc, onOpenNode, focusArticleId }) {
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [outlet, setOutlet] = useState(null)
  const [status, setStatus] = useState('all')
  const [outlets, setOutlets] = useState([])
  const [articles, setArticles] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(null) // article id
  const [detail, setDetail] = useState(null)
  const [graphLinks, setGraphLinks] = useState([])
  const [detailError, setDetailError] = useState(null)
  // Mobile: filters collapse into a bottom sheet behind a single button.
  const [filtersOpen, setFiltersOpen] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    loadOutlets().then(setOutlets).catch(() => {})
  }, [])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQ(q.trim()), 350)
    return () => clearTimeout(debounceRef.current)
  }, [q])

  useEffect(() => {
    setLoading(true)
    setError(null)
    loadArticles({ q: debouncedQ, outlet, status, limit: PAGE_SIZE, offset: 0 })
      .then(({ articles, total }) => {
        setArticles(articles)
        setTotal(total)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [debouncedQ, outlet, status])

  const expandArticle = (id) => {
    setExpanded(id)
    setDetail(null)
    setGraphLinks([])
    setDetailError(null)
    loadArticleDetail(id)
      .then(setDetail)
      .catch((err) => setDetailError(err.message))
    loadArticleGraphLinks(id)
      .then(setGraphLinks)
      .catch(() => {})
  }

  // Cross-view entry: another view asked us to open a specific article.
  useEffect(() => {
    if (!focusArticleId) return
    setQ('')
    setOutlet(null)
    setStatus('all')
    expandArticle(focusArticleId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusArticleId])

  const loadMore = () => {
    loadArticles({ q: debouncedQ, outlet, status, limit: PAGE_SIZE, offset: articles.length })
      .then(({ articles: more }) => setArticles((prev) => [...prev, ...more]))
      .catch((err) => setError(err.message))
  }

  const toggleExpand = (id) => {
    if (expanded === id) {
      setExpanded(null)
      setDetail(null)
      return
    }
    expandArticle(id)
  }

  const claims = useMemo(() => {
    if (!detail?.claims) return { substantive: [], framing: [] }
    const list = Array.isArray(detail.claims) ? detail.claims : []
    return {
      substantive: list.filter((c) => c.kind === 'substantive'),
      framing: list.filter((c) => c.kind === 'framing'),
    }
  }, [detail])

  // If a focused article isn't in the current page, still render its detail.
  const focusedMissing =
    expanded && !articles.some((a) => a.id === expanded) ? expanded : null

  return (
    <div className="news-view">
      <div className="news-controls">
        <div className="news-result-row">
          <span className="news-count">
            {loading ? (
              'loading…'
            ) : (
              <>
                <span className="num">{total}</span> article{total === 1 ? '' : 's'}
              </>
            )}
          </span>
          <button className="news-filters-btn" onClick={() => setFiltersOpen(true)}>
            Filters
          </button>
        </div>
        {(outlet !== null || status !== 'all') && (
          <div className="news-filter-row news-active-filters">
            {outlet !== null && (
              <button
                className="news-chip active"
                title="Clear outlet filter"
                onClick={() => setOutlet(null)}
              >
                {outlet} ×
              </button>
            )}
            {status !== 'all' && (
              <button
                className="news-chip active"
                title="Clear status filter"
                onClick={() => setStatus('all')}
              >
                {STATUS_FILTERS.find((f) => f.key === status)?.label} ×
              </button>
            )}
          </div>
        )}
        <input
          className="news-search"
          type="search"
          placeholder="Search headlines, summaries, article text…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="news-desktop-filters">
          <div className="news-filter-row">
            <button
              className={`news-chip${outlet === null ? ' active' : ''}`}
              onClick={() => setOutlet(null)}
            >
              All outlets
            </button>
            {outlets.map((o) => (
              <button
                key={o}
                className={`news-chip${outlet === o ? ' active' : ''}`}
                onClick={() => setOutlet(o)}
              >
                {o}
              </button>
            ))}
          </div>
          <div className="news-filter-row">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                className={`news-chip${status === f.key ? ' active' : ''}`}
                onClick={() => setStatus(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtersOpen && (
        <div className="sheet-backdrop" onClick={() => setFiltersOpen(false)}>
          <div
            className="sheet filter-sheet"
            role="dialog"
            aria-label="Article filters"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-head">
              <h2>Filters</h2>
              <button
                className="sheet-close"
                aria-label="Close filters"
                onClick={() => setFiltersOpen(false)}
              >
                ×
              </button>
            </div>
            <span className="ap-label">Outlet</span>
            <div className="news-filter-row">
              <button
                className={`news-chip${outlet === null ? ' active' : ''}`}
                onClick={() => setOutlet(null)}
              >
                All outlets
              </button>
              {outlets.map((o) => (
                <button
                  key={o}
                  className={`news-chip${outlet === o ? ' active' : ''}`}
                  onClick={() => setOutlet(o)}
                >
                  {o}
                </button>
              ))}
            </div>
            <span className="ap-label">Status</span>
            <div className="news-filter-row">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.key}
                  className={`news-chip${status === f.key ? ' active' : ''}`}
                  onClick={() => setStatus(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button className="sheet-done" onClick={() => setFiltersOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}

      {error && <div className="notice error">Failed to load articles: {error}</div>}
      {!loading && !error && articles.length === 0 && !focusedMissing && (
        <div className="notice">No articles match. The ingestion pipeline runs every 24h.</div>
      )}

      <ol className="news-list">
        {articles.map((a) => (
          <li key={a.id} className="news-item">
            <button className="news-card" onClick={() => toggleExpand(a.id)}>
              <div className="news-card-top">
                <span className="news-outlet">{a.outlet ?? 'unknown outlet'}</span>
                <span className="news-date">{fmtDate(a.published_at)}</span>
              </div>
              <h3>{a.title}</h3>
              {a.summary && <p>{a.summary}</p>}
              <div className="news-badges">
                {a.author_name && <span className="news-badge">by {a.author_name}</span>}
                {a.arc_title && (
                  <span
                    className="news-badge arc clickable"
                    role="link"
                    title="Open this story arc"
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenArc?.(a.arc_id)
                    }}
                  >
                    arc: {a.arc_title} →
                  </span>
                )}
                {a.unattributed && <span className="news-badge muted">unattributed</span>}
                {a.monoculture && <span className="news-badge mono">monoculture</span>}
              </div>
            </button>

            {expanded === a.id && (
              <div className="news-detail">
                {detailError && <div className="notice error">{detailError}</div>}
                {!detail && !detailError && <div className="news-detail-loading">Loading detail…</div>}
                {detail && (
                  <>
                    {graphLinks.length > 0 && (
                      <div className="news-graph-links">
                        <span className="ap-label">Knowledge graph connections</span>
                        <div className="news-filter-row">
                          {graphLinks.map((g, i) => (
                            <button
                              key={i}
                              className="news-chip graph-link"
                              title={`Open “${g.label}” in the knowledge graph`}
                              onClick={() => onOpenNode?.(g.nodeId)}
                            >
                              ◈ {g.label}
                              {g.type ? ` · ${g.type}` : ''}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="news-detail-grid">
                      <div>
                        <span className="ap-label">Substantive claims</span>
                        {claims.substantive.length === 0 && (
                          <span className="ap-muted">None extracted.</span>
                        )}
                        <ul className="news-claims">
                          {claims.substantive.map((c, i) => (
                            <li key={i}>{c.text}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <span className="ap-label">Framing markers</span>
                        {claims.framing.length === 0 && <span className="ap-muted">None detected.</span>}
                        <ul className="news-claims framing">
                          {claims.framing.map((c, i) => (
                            <li key={i}>{c.text}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <span className="ap-label">Citations</span>
                    {detail.citations.length === 0 && (
                      <span className="ap-muted">No citations extracted.</span>
                    )}
                    <ul className="news-citations">
                      {detail.citations.map((c, i) => (
                        <li key={i}>
                          <span className="news-cit-entity">{c.cited_entity}</span>
                          <span className="news-cit-type">{c.cited_type}</span>
                          {strengthBadge(c.documentation_strength)}
                        </li>
                      ))}
                    </ul>
                    {detail.url && (
                      <a className="news-read-link" href={detail.url} target="_blank" rel="noreferrer">
                        Read original at {detail.outlet ?? 'source'} →
                      </a>
                    )}
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>

      {focusedMissing && (
        <div className="news-detail">
          {detailError && <div className="notice error">{detailError}</div>}
          {!detail && !detailError && <div className="news-detail-loading">Loading detail…</div>}
          {detail && (
            <>
              <h3 className="news-focus-title">{detail.title}</h3>
              {graphLinks.length > 0 && (
                <div className="news-graph-links">
                  <span className="ap-label">Knowledge graph connections</span>
                  <div className="news-filter-row">
                    {graphLinks.map((g, i) => (
                      <button
                        key={i}
                        className="news-chip graph-link"
                        onClick={() => onOpenNode?.(g.nodeId)}
                      >
                        ◈ {g.label}
                        {g.type ? ` · ${g.type}` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {detail.url && (
                <a className="news-read-link" href={detail.url} target="_blank" rel="noreferrer">
                  Read original at {detail.outlet ?? 'source'} →
                </a>
              )}
            </>
          )}
        </div>
      )}

      {articles.length < total && !loading && (
        <button className="news-load-more" onClick={loadMore}>
          Load more (<span className="num">{total - articles.length}</span> remaining)
        </button>
      )}
    </div>
  )
}
