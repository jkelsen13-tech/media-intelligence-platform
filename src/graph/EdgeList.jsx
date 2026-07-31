import { useMemo, useState } from 'react'
import { EDGE_TYPES, INFERRED_CLAIMED_BY } from './theme'
import './edge-list.css'

// 02B Phase 2 final acceptance — accessibility alternative.
// The cytoscape canvas is inherently visual and pointer-driven; this
// component exposes the same relationships as a keyboard-navigable,
// screen-reader-readable table. It mirrors the canvas filters
// (reliability threshold + hypothesis toggle) so the list always matches
// what the canvas shows, and activating a row opens the SAME EdgeEvidence
// dialog used by canvas edge taps — non-pointer users receive identical
// information, per 02B Phase 2A acceptance.
export default function EdgeList({
  nodes,
  edges,
  minReliability = 1,
  showInferred = false,
  onSelectEdge,
  onClose,
}) {
  const [query, setQuery] = useState('')

  const labelById = useMemo(() => {
    const m = new Map()
    nodes.forEach((n) => m.set(n.id ?? n.slug, n.label ?? (n.id ?? n.slug)))
    return m
  }, [nodes])

  const visibleEdges = useMemo(() => {
    const term = query.trim().toLowerCase()
    return edges.filter((e) => {
      // Same visibility rules as the canvas filter effect in GraphView:
      // edges with no reliability value always pass; hypotheses only when
      // the toggle is on.
      const rel = Number(e.reliability)
      if (Number.isFinite(rel) && rel < minReliability) return false
      if (e.claimed_by === INFERRED_CLAIMED_BY && !showInferred) return false
      if (!term) return true
      const s = (labelById.get(e.source) ?? '').toLowerCase()
      const t = (labelById.get(e.target) ?? '').toLowerCase()
      const lbl = (e.label ?? '').toLowerCase()
      return s.includes(term) || t.includes(term) || lbl.includes(term)
    })
  }, [edges, minReliability, showInferred, query, labelById])

  return (
    <div className="edge-list" role="region" aria-label="Relationship list">
      <div className="edge-list-head">
        <h2>Relationships</h2>
        <button className="ap-icon-btn" aria-label="Close relationship list" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="edge-list-sub">
        Text equivalent of the graph canvas — {visibleEdges.length} of {edges.length}{' '}
        relationships shown. Activating a row opens the same evidence dialog as tapping an
        edge on the canvas.
      </p>
      <input
        className="edge-list-filter"
        type="search"
        placeholder="Filter by node or relation…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Filter relationships"
      />
      <div className="edge-list-scroll">
        <table className="edge-list-table">
          <caption className="sr-only">Graph relationships, source to target</caption>
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Relationship</th>
              <th scope="col">Target</th>
              <th scope="col">Reliability</th>
              <th scope="col">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {visibleEdges.map((e) => {
              const rel = Number(e.reliability)
              const inferred = e.claimed_by === INFERRED_CLAIMED_BY
              const sLabel = labelById.get(e.source) ?? e.source
              const tLabel = labelById.get(e.target) ?? e.target
              const relLabel = e.label ?? EDGE_TYPES[e.type]?.label ?? e.type
              return (
                <tr key={e.id ?? `${e.source}->${e.target}:${e.type}`}>
                  <td>{sLabel}</td>
                  <td>
                    {relLabel}
                    {inferred ? ' (hypothesis)' : ''}
                  </td>
                  <td>{tLabel}</td>
                  <td>{Number.isFinite(rel) ? `${rel} of 4` : '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="edge-list-evidence-btn"
                      onClick={() => onSelectEdge(e)}
                      aria-label={`Evidence for ${sLabel} ${relLabel} ${tLabel}`}
                    >
                      Evidence
                    </button>
                  </td>
                </tr>
              )
            })}
            {visibleEdges.length === 0 && (
              <tr>
                <td colSpan={5} className="edge-list-empty">
                  No relationships match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
