import { useEffect, useMemo, useState } from 'react'
import { loadSources } from '../lib/supabase'
import { NODE_TYPES, EDGE_TYPES } from '../graph/theme'

// Full article panel (concept doc §4.4): title + category tag, confidence
// score, synthesis summary, source list, and connected-node navigation.
// Slides in alongside the graph (the canvas flex-shrinks; nothing overlays).
// One panel at a time unless pinned.

function confidenceColor(score) {
  if (score == null) return '#6b7280'
  // red (0) -> amber (50) -> green (100)
  const hue = Math.round((score / 100) * 120)
  return `hsl(${hue}, 70%, 45%)`
}

export default function ArticlePanel({
  node,
  nodes,
  edges,
  pinned,
  onTogglePin,
  onNavigate,
  onClose,
}) {
  const [sources, setSources] = useState(null)
  const [sourcesError, setSourcesError] = useState(null)

  const nodeKey = node.id ?? node.slug

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
          rel: e.label,
          direction: e.source === nodeKey ? 'out' : 'in',
        }
      })
  }, [nodeKey, nodes, edges])

  const typeMeta = NODE_TYPES[node.type]
  const summary = node.summary ?? node.description

  return (
    <aside className={`article-panel${pinned ? ' pinned' : ''}`}>
      <header className="ap-header">
        <div className="ap-title-row">
          <h2>{node.label}</h2>
          <div className="ap-actions">
            <button
              className={`ap-icon-btn${pinned ? ' active' : ''}`}
              title={pinned ? 'Unpin panel' : 'Pin panel'}
              onClick={onTogglePin}
            >
              {pinned ? '◉' : '◎'}
            </button>
            <button className="ap-icon-btn" title="Close panel" onClick={onClose}>
              ×
            </button>
          </div>
        </div>
        {typeMeta && (
          <span className="ap-tag" style={{ borderColor: typeMeta.color, color: typeMeta.color }}>
            {typeMeta.label}
          </span>
        )}
      </header>

      {node.confidence != null && (
        <section className="ap-section">
          <div className="ap-confidence-row">
            <span className="ap-label">Confidence</span>
            <span className="ap-confidence-value" style={{ color: confidenceColor(node.confidence) }}>
              {node.confidence}%
            </span>
          </div>
          <div className="ap-confidence-bar">
            <div
              className="ap-confidence-fill"
              style={{
                width: `${node.confidence}%`,
                background: confidenceColor(node.confidence),
              }}
            />
          </div>
        </section>
      )}

      {summary && (
        <section className="ap-section">
          <span className="ap-label">Summary</span>
          <p className="ap-summary">{summary}</p>
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
                  <a href={s.url} target="_blank" rel="noreferrer" className="ap-source-headline">
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
        <span className="ap-label">Connected nodes ({connections.length})</span>
        <ul className="ap-connections">
          {connections.map((c) => {
            const edgeMeta = EDGE_TYPES[c.edgeType]
            return (
              <li key={c.edgeId}>
                <button className="ap-connection" onClick={() => onNavigate(c.otherKey)}>
                  <span
                    className="ap-conn-dot"
                    style={{ background: NODE_TYPES[c.otherType]?.color ?? '#6b7280' }}
                  />
                  <span className="ap-conn-label">{c.label}</span>
                  <span className="ap-conn-meta" style={{ color: edgeMeta?.color ?? '#9ca3af' }}>
                    {c.direction === 'out' ? '→' : '←'} {c.rel ?? edgeMeta?.label} · {c.weight}
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
