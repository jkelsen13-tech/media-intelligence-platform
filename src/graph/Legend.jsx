import { useState } from 'react'
import { NODE_TYPES, EDGE_TYPES, EDGE_WEIGHTS } from './theme'

// Collapse toggle: mobile viewports start collapsed so the legend doesn't
// cover the graph on load; tapping the chip expands it back.
function startsCollapsed() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(max-width: 768px)').matches
}

export default function Legend() {
  const [collapsed, setCollapsed] = useState(startsCollapsed)

  if (collapsed) {
    return (
      <button
        type="button"
        className="legend legend-collapsed"
        onClick={() => setCollapsed(false)}
        aria-expanded={false}
        aria-label="Expand legend"
      >
        <span className="legend-octagon" style={{ borderColor: 'var(--border-strong)' }} />
        Legend
      </button>
    )
  }

  return (
    <aside className="legend">
      <div className="legend-header">
        <button
          type="button"
          className="legend-toggle"
          onClick={() => setCollapsed(true)}
          aria-expanded={true}
          aria-label="Collapse legend"
        >
          Legend ▾
        </button>
      </div>
      <section>
        <h3>Nodes</h3>
        {Object.entries(NODE_TYPES).map(([key, { cssVar, label }]) => (
          <div key={key} className="legend-row">
            <span className="legend-octagon" style={{ borderColor: `var(${cssVar})` }} />
            {label}
          </div>
        ))}
      </section>
      <section>
        <h3>Edges</h3>
        {Object.entries(EDGE_TYPES).map(([key, { cssVar, label }]) => (
          <div key={key} className="legend-row">
            <span className="legend-line" style={{ background: `var(${cssVar})` }} />
            {label}
          </div>
        ))}
      </section>
      <section>
        <h3>Weight</h3>
        {Object.entries(EDGE_WEIGHTS).map(([key, px]) => (
          <div key={key} className="legend-row">
            <span className="legend-line" style={{ background: 'var(--cat-grey)', height: px }} />
            {key}
          </div>
        ))}
      </section>
      <section>
        <p className="legend-note">Node fill color = story arc; border &amp; shape = node type.</p>
      </section>
    </aside>
  )
}
