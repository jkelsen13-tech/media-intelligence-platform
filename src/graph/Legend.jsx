import { NODE_TYPES, EDGE_TYPES, EDGE_WEIGHTS } from './theme'

export default function Legend() {
  return (
    <aside className="legend">
      <section>
        <h3>Nodes</h3>
        {Object.entries(NODE_TYPES).map(([key, { color, label }]) => (
          <div key={key} className="legend-row">
            <span className="legend-octagon" style={{ borderColor: color }} />
            {label}
          </div>
        ))}
      </section>
      <section>
        <h3>Edges</h3>
        {Object.entries(EDGE_TYPES).map(([key, { color, label }]) => (
          <div key={key} className="legend-row">
            <span className="legend-line" style={{ background: color }} />
            {label}
          </div>
        ))}
      </section>
      <section>
        <h3>Weight</h3>
        {Object.entries(EDGE_WEIGHTS).map(([key, px]) => (
          <div key={key} className="legend-row">
            <span className="legend-line" style={{ background: '#9ca3af', height: px }} />
            {key}
          </div>
        ))}
      </section>
    </aside>
  )
}
