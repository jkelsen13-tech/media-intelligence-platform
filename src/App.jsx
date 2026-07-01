import { useEffect, useState, useCallback } from 'react'
import GraphView from './graph/GraphView'
import Legend from './graph/Legend'
import { loadGraph } from './lib/supabase'

export default function App() {
  const [graph, setGraph] = useState(null)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    loadGraph().then(setGraph).catch((err) => setError(err.message))
  }, [])

  const handleSelect = useCallback((data) => setSelected(data), [])

  return (
    <div className="app">
      <header className="app-header">
        <h1>MIP</h1>
        <span className="subtitle">Media Intelligence Platform</span>
        {graph && <span className="data-source">data: {graph.source}</span>}
      </header>

      <main className="app-main">
        {error && <div className="notice error">Failed to load graph: {error}</div>}
        {!graph && !error && <div className="notice">Loading graph…</div>}
        {graph && (
          <GraphView nodes={graph.nodes} edges={graph.edges} onSelect={handleSelect} />
        )}
        <Legend />
        {selected && (
          <aside className="detail-panel">
            <h2>{selected.label}</h2>
            {selected.type && <p className="detail-type">{selected.type}</p>}
            {selected.description && <p>{selected.description}</p>}
            {selected.source && (
              <p className="detail-type">
                {selected.source} → {selected.target} ({selected.weight})
              </p>
            )}
          </aside>
        )}
      </main>
    </div>
  )
}
