import { useEffect, useMemo, useState, useCallback } from 'react'
import GraphView from './graph/GraphView'
import Legend from './graph/Legend'
import ArticlePanel from './panels/ArticlePanel'
import TimelineView from './views/TimelineView'
import ArcsView from './views/ArcsView'
import NewsView from './views/NewsView'
import { loadGraph } from './lib/supabase'

const VIEWS = [
  { key: 'news', label: 'News Feed' },
  { key: 'graph', label: 'Knowledge Graph' },
  { key: 'timeline', label: 'Causal Timeline' },
  { key: 'arcs', label: 'Story Arcs' },
]

export default function App() {
  const [graph, setGraph] = useState(null)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null) // selected node data
  const [pinned, setPinned] = useState(false)
  const [view, setView] = useState('news')
  const [nodeQuery, setNodeQuery] = useState('')
  // Cross-view focus: clicking an arc/article/node link in one view opens
  // the target in its own view.
  const [focusArc, setFocusArc] = useState(null)
  const [focusArticle, setFocusArticle] = useState(null)

  useEffect(() => {
    loadGraph().then(setGraph).catch((err) => setError(err.message))
  }, [])

  const handleSelect = useCallback(
    (data) => {
      // Edge taps and canvas taps clear the panel unless it is pinned.
      if (!data || data.source) {
        if (!pinned) setSelected(null)
        return
      }
      setSelected(data)
    },
    [pinned],
  )

  const handleNavigate = useCallback(
    (nodeKey) => {
      if (!graph) return
      const next = graph.nodes.find((n) => (n.id ?? n.slug) === nodeKey)
      if (next) setSelected(next)
    },
    [graph],
  )

  const handleClose = useCallback(() => {
    setSelected(null)
    setPinned(false)
  }, [])

  // --- Cross-view navigation ---
  const openNodeInGraph = useCallback(
    (nodeKey) => {
      if (!graph) return
      const next = graph.nodes.find((n) => (n.id ?? n.slug) === nodeKey)
      setView('graph')
      if (next) setSelected(next)
    },
    [graph],
  )

  const openArcInView = useCallback((arcKey) => {
    setFocusArc(arcKey)
    setView('arcs')
  }, [])

  const openArticleInNews = useCallback((articleId) => {
    setFocusArticle(articleId)
    setView('news')
  }, [])

  // Graph node search: label substring match, top 8 suggestions.
  const nodeMatches = useMemo(() => {
    if (!graph || !nodeQuery.trim()) return []
    const term = nodeQuery.trim().toLowerCase()
    return graph.nodes
      .filter((n) => (n.label ?? '').toLowerCase().includes(term))
      .slice(0, 8)
  }, [graph, nodeQuery])

  const pickNode = (node) => {
    setSelected(node)
    setNodeQuery('')
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>MIP</h1>
        <span className="subtitle">Media Intelligence Platform</span>
        <nav className="app-nav">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              className={`nav-tab${view === v.key ? ' active' : ''}`}
              onClick={() => setView(v.key)}
            >
              {v.label}
            </button>
          ))}
        </nav>
        {graph && <span className="data-source">data: {graph.source}</span>}
      </header>

      <main className="app-main">
        {error && <div className="notice error">Failed to load graph: {error}</div>}

        {view === 'news' && (
          <NewsView
            onOpenArc={openArcInView}
            onOpenNode={openNodeInGraph}
            focusArticleId={focusArticle}
          />
        )}

        {view === 'graph' && (
          <>
            {!graph && !error && <div className="notice">Loading graph…</div>}
            {graph && (
              <div className="graph-layout">
                <div className="graph-area">
                  <div className="graph-search">
                    <input
                      type="search"
                      placeholder="Search nodes…"
                      value={nodeQuery}
                      onChange={(e) => setNodeQuery(e.target.value)}
                    />
                    {nodeMatches.length > 0 && (
                      <ul className="graph-search-results">
                        {nodeMatches.map((n) => (
                          <li key={n.id ?? n.slug}>
                            <button onClick={() => pickNode(n)}>
                              <span className="graph-search-label">{n.label}</span>
                              <span className="graph-search-type">{n.type}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <GraphView nodes={graph.nodes} edges={graph.edges} onSelect={handleSelect} />
                  <Legend />
                </div>
                {selected && (
                  <ArticlePanel
                    node={selected}
                    nodes={graph.nodes}
                    edges={graph.edges}
                    pinned={pinned}
                    onTogglePin={() => setPinned((p) => !p)}
                    onNavigate={handleNavigate}
                    onOpenArticle={openArticleInNews}
                    onClose={handleClose}
                  />
                )}
              </div>
            )}
          </>
        )}

        {view === 'timeline' && <TimelineView />}
        {view === 'arcs' && (
          <ArcsView
            focusArcId={focusArc}
            onOpenArticle={openArticleInNews}
            onOpenNode={openNodeInGraph}
          />
        )}
      </main>
    </div>
  )
}
