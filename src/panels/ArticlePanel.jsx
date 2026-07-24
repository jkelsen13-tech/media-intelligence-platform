import { useEffect, useMemo, useRef, useState } from 'react'
import { loadSources, loadNodeArticles, loadNodeCategory } from '../lib/supabase'
import { NODE_TYPES, EDGE_TYPES, CATEGORY_TYPES } from '../graph/theme'

// Article panel (spec §4.4): title + category tag, confidence score on a
// red→green gradient, 3–5 sentence synthesis, source list with outbound
// links, and the connected-node list with type + strength. Desktop: a side
// panel the graph flex-shrinks beside (never covered). Mobile (<768px): a
// bottom sheet at 60vh with a drag handle — drag up for full height, drag
// down past the dismiss threshold to close. Pinnable; Escape/scrim close.
//
// Note on §4.4 item 4 (inline images): the articles table has no image/
// media column (id, feed, outlet, title, url, summary, published_at,
// fetched_at, outlet_id, author_id, body_text, embedding, claims, arc_id,
// unattributed, monoculture), so there is nothing to render — the section
// is omitted rather than fabricated.

function confidenceColor(score) {
  if (score == null) return '#6b7280'
  // red (0) -> amber (50) -> green (100)
  const hue = Math.round((score / 100) * 120)
  return `hsl(${hue}, 70%, 45%)`
}

// Trim a synthesis to at most `max` sentences (spec calls for 3–5).
function trimSentences(text, max = 5) {
  if (!text) return text
  const parts = text.match(/[^.!?]+[.!?]+["')\]]*\s*/g)
  if (!parts || parts.length <= max) return text
  return parts.slice(0, max).join('').trim()
}

// Edge strength label: similarity (0..1) when present, otherwise the
// heavy/medium/light weight bucket stored on the edge.
function strengthLabel(edge) {
  if (edge.similarity != null && Number.isFinite(Number(edge.similarity))) {
    return `${Math.round(Number(edge.similarity) * 100)}%`
  }
  return edge.weight ?? '—'
}

// Mobile sheet snap points, as fractions of viewport height.
const SHEET_DEFAULT = 0.6
const SHEET_FULL = 1
const SHEET_DISMISS = 0.42

export default function ArticlePanel({
  node,
  nodes,
  edges,
  pinned,
  onTogglePin,
  onNavigate,
  onOpenArticle,
  onClose,
  isMobile,
}) {
  const [sources, setSources] = useState(null)
  const [sourcesError, setSourcesError] = useState(null)
  const [backing, setBacking] = useState(null)
  const [category, setCategory] = useState(null)

  // Bottom-sheet geometry (mobile only). sheetFrac is the committed snap
  // point; dragFrac tracks an in-progress drag and overrides it.
  const [sheetFrac, setSheetFrac] = useState(SHEET_DEFAULT)
  const [dragFrac, setDragFrac] = useState(null)
  const dragRef = useRef(null)

  const nodeKey = node.id ?? node.slug
  const isUuid = typeof node.id === 'string' && node.id.includes('-')

  useEffect(() => {
    let cancelled = false
    setSources(null)
    setSourcesError(null)
    loadSources(nodeKey)
      .then((rows) => {
        if (!cancelled) setSources(rows)
      })
      .catch((err) => {
        if (!cancelled) setSourcesError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [nodeKey])

  // Articles backing this node (citation-resolved + arc-attached).
  useEffect(() => {
    let cancelled = false
    setBacking(null)
    if (!isUuid) {
      setBacking([])
      return
    }
    loadNodeArticles(node.id)
      .then((rows) => {
        if (!cancelled) setBacking(rows)
      })
      .catch(() => {
        if (!cancelled) setBacking([])
      })
    return () => {
      cancelled = true
    }
  }, [node.id, isUuid])

  // Category tag: nodes have no category column; it comes from the arc.
  useEffect(() => {
    let cancelled = false
    setCategory(null)
    loadNodeCategory(node)
      .then((cat) => {
        if (!cancelled) setCategory(cat)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeKey])

  const connections = useMemo(() => {
    const nodeById = new Map(nodes.map((n) => [n.id ?? n.slug, n]))
    return edges
      .filter((e) => e.source === nodeKey || e.target === nodeKey)
      .map((e) => {
        const otherKey = e.source === nodeKey ? e.target : e.source
        const other = nodeById.get(otherKey)
        return {
          edgeId: e.id,
          otherKey,
          label: other?.label ?? otherKey,
          otherType: other?.type,
          edgeType: e.type,
          weight: e.weight,
          similarity: e.similarity,
          rel: e.label,
          direction: e.source === nodeKey ? 'out' : 'in',
        }
      })
  }, [nodeKey, nodes, edges])

  // --- Mobile bottom-sheet drag (pointer events on the handle) ----------
  const onHandlePointerDown = (e) => {
    if (!isMobile) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startY: e.clientY, baseFrac: dragFrac ?? sheetFrac }
  }
  const onHandlePointerMove = (e) => {
    const drag = dragRef.current
    if (!drag) return
    const delta = (drag.startY - e.clientY) / window.innerHeight
    const next = Math.min(SHEET_FULL, Math.max(0.2, drag.baseFrac + delta))
    setDragFrac(next)
  }
  const onHandlePointerUp = () => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    const frac = dragFrac ?? sheetFrac
    setDragFrac(null)
    if (frac < SHEET_DISMISS) {
      onClose()
      return
    }
    setSheetFrac(frac > (SHEET_DEFAULT + SHEET_FULL) / 2 ? SHEET_FULL : SHEET_DEFAULT)
  }

  const typeMeta = NODE_TYPES[node.type]
  const catMeta = CATEGORY_TYPES[category] ?? CATEGORY_TYPES.unclassified
  const summary = trimSentences(node.summary ?? node.description)
  const activeFrac = dragFrac ?? sheetFrac
  const confidence = node.confidence

  const panelStyle = isMobile
    ? { height: `${Math.round(activeFrac * 100)}vh`, transition: dragFrac == null ? undefined : 'none' }
    : undefined

  return (
    <aside
      className={`article-panel${pinned ? ' pinned' : ''}${isMobile ? ' sheet-mode' : ''}`}
      style={panelStyle}
      role="dialog"
      aria-label={`Article panel: ${node.label}`}
    >
      {isMobile && (
        <div
          className="ap-sheet-handle"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Drag to resize panel"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
        >
          <span className="ap-sheet-grip" />
        </div>
      )}
      <header className="ap-header">
        <div className="ap-title-row">
          <h2>{node.label}</h2>
          <div className="ap-actions">
            <button
              className={`ap-icon-btn${pinned ? ' active' : ''}`}
              title={pinned ? 'Unpin panel' : 'Pin panel — keep open while exploring the graph'}
              aria-pressed={pinned}
              onClick={onTogglePin}
            >
              {pinned ? '◉' : '◎'}
            </button>
            <button className="ap-icon-btn" title="Close panel (Esc)" aria-label="Close panel" onClick={onClose}>
              ×
            </button>
          </div>
        </div>
        <div className="ap-tags">
          <span
            className="ap-tag"
            style={{ borderColor: `var(${catMeta.cssVar})`, color: `var(${catMeta.cssVar})` }}
          >
            {catMeta.label}
          </span>
          {typeMeta && (
            <span
              className="ap-tag ap-tag-type"
              style={{ borderColor: `var(${typeMeta.cssVar})`, color: `var(${typeMeta.cssVar})` }}
            >
              {typeMeta.label}
            </span>
          )}
        </div>
      </header>

      {confidence != null && (
        <section className="ap-section">
          <div className="ap-confidence-row">
            <span className="ap-label">Confidence</span>
            <span className="ap-confidence-value num" style={{ color: confidenceColor(confidence) }}>
              {confidence}%
            </span>
          </div>
          <div className="ap-confidence-bar">
            {/* Red→green gradient spans the FULL track; the fill clips it to
                the score by sizing the gradient relative to the fill width. */}
            <div
              className="ap-confidence-fill"
              style={{
                width: `${confidence}%`,
                background: 'linear-gradient(90deg, hsl(0, 70%, 45%), hsl(45, 80%, 45%), hsl(120, 60%, 42%))',
                backgroundSize: `${confidence > 0 ? 10000 / confidence : 100}% 100%`,
              }}
            />
          </div>
        </section>
      )}

      {summary && (
        <section className="ap-section">
          <span className="ap-label">Synthesis</span>
          <p className="ap-summary">{summary}</p>
        </section>
      )}

      {backing && backing.length > 0 && (
        <section className="ap-section">
          <span className="ap-label">
            Backing articles (<span className="num">{backing.length}</span>)
          </span>
          <ul className="ap-sources">
            {backing.map((a) => (
              <li key={a.id} className="ap-source">
                <span className="ap-source-outlet">{a.outlet}</span>
                {a.url ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ap-source-headline"
                  >
                    {a.title}
                  </a>
                ) : (
                  <span className="ap-source-headline">{a.title}</span>
                )}
                <span className="ap-source-meta">
                  {a.published_at && (
                    <span className="ap-source-date">{String(a.published_at).slice(0, 10)}</span>
                  )}
                  <button
                    className="ap-feed-link"
                    title="Open in News Feed"
                    onClick={() => onOpenArticle?.(a.id)}
                  >
                    Feed →
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="ap-section">
        <span className="ap-label">Sources</span>
        {sourcesError && <p className="ap-sources-error">Failed to load sources: {sourcesError}</p>}
        {!sources && !sourcesError && <p className="ap-muted">Loading sources…</p>}
        {sources && sources.length === 0 && (
          <p className="ap-muted">No sources documented yet.</p>
        )}
        {sources && sources.length > 0 && (
          <ul className="ap-sources">
            {sources.map((s) => (
              <li key={s.id} className="ap-source">
                <span className="ap-source-outlet">{s.outlet}</span>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="ap-source-headline">
                    {s.headline}
                  </a>
                ) : (
                  <span className="ap-source-headline">{s.headline}</span>
                )}
                {s.published_at && <span className="ap-source-date">{s.published_at}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ap-section">
        <span className="ap-label">
          Connected nodes (<span className="num">{connections.length}</span>)
        </span>
        <ul className="ap-connections">
          {connections.map((c) => {
            const edgeMeta = EDGE_TYPES[c.edgeType]
            return (
              <li key={c.edgeId}>
                <button className="ap-connection" onClick={() => onNavigate(c.otherKey)}>
                  <span
                    className="ap-conn-dot"
                    style={{
                      background: NODE_TYPES[c.otherType]?.cssVar
                        ? `var(${NODE_TYPES[c.otherType].cssVar})`
                        : 'var(--text-muted)',
                    }}
                  />
                  <span className="ap-conn-label">{c.label}</span>
                  <span className="ap-conn-meta" style={{ color: edgeMeta?.color ?? '#9ca3af' }}>
                    {c.direction === 'out' ? '→' : '←'} {c.rel ?? edgeMeta?.label}
                  </span>
                  <span className="ap-conn-strength num" title="Connection strength">
                    {edgeMeta?.label ?? c.edgeType} · {strengthLabel(c)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </aside>
  )
}
