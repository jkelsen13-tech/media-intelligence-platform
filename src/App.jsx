import { useEffect, useMemo, useState, useCallback } from 'react'
import GraphView from './graph/GraphView'
import Legend from './graph/Legend'
import ArticlePanel from './panels/ArticlePanel'
import TimelineView from './views/TimelineView'
import ArcsView from './views/ArcsView'
import NewsView from './views/NewsView'
import { loadGraph } from './lib/supabase'

const VIEWS = [
  { key: 'news', label: 'News Feed', shortLabel: 'News' },
  { key: 'graph', label: 'Knowledge Graph', shortLabel: 'Graph' },
  { key: 'timeline', label: 'Causal Timeline', shortLabel: 'Timeline' },
  { key: 'arcs', label: 'Story Arcs', shortLabel: 'Arcs' },
]

// Mobile-first graph entry: the top N hubs by degree centrality.
const HUB_LIST_SIZE = 30

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = (e) => setMatches(e.matches)
    mql.addEventListener('change', onChange)
    setMatches(mql.matches)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}

// Depth-limited neighborhood (BFS) around a hub node.
function localSubgraph(nodes, edges, hubId, depth = 2) {
  const adj = new Map()
  const addEdge = (a, b) => {
    if (!adj.has(a)) adj.set(a, [])
    adj.get(a).push(b)
  }
  edges.forEach((e) => {
    addEdge(e.source, e.target)
    addEdge(e.target, e.source)
  })
  const seen = new Set([hubId])
  let frontier = [hubId]
  for (let d = 0; d < depth; d++) {
    const next = []
    for (const id of frontier) {
      for (const nb of adj.get(id) ?? []) {
        if (!seen.has(nb)) {
          seen.add(nb)
          next.push(nb)
        }
      }
    }
    frontier = next
  }
  const subNodes = nodes.filter((n) => seen.has(n.id ?? n.slug))
  const subEdges = edges.filter((e) => seen.has(e.source) && seen.has(e.target))
  return { nodes: subNodes, edges: subEdges }
}

export default function App() {
  const [graph, setGraph] = useState(null)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null) // selected node data
  const [pinned, setPinned] = useState(false)
  const [view, setView] = useState('news')
  const [nodeQuery, setNodeQuery] = useState('')
  const [aboutOpen, setAboutOpen] = useState(false)
  // Mobile graph entry: 'hubs' (ranked list) -> 'sub' (hub subgraph) / 'all'.
  const [graphScreen, setGraphScreen] = useState('hubs')
  const [hubId, setHubId] = useState(null)
  // Cross-view focus: clicking an arc/article/node link in one view opens
  // the target in its own view.
  const [focusArc, setFocusArc] = useState(null)
  const [focusArticle, setFocusArticle] = useState(null)

  const isMobile = useMediaQuery('(max-width: 767px)')

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

  // Escape closes the article panel (§4.4 close affordance).
  useEffect(() => {
    if (!selected) return
    const onKey = (e) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, handleClose])

  // --- Cross-view navigation ---
  const openNodeInGraph = useCallback(
    (nodeKey) => {
      if (!graph) return
      const next = graph.nodes.find((n) => (n.id ?? n.slug) === nodeKey)
      setGraphScreen('all')
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

  // --- Mobile graph entry: ranked hubs by degree centrality ---
  const hubs = useMemo(() => {
    if (!graph) return []
    const degree = new Map()
    graph.edges.forEach((e) => {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1)
    })
    return graph.nodes
      .map((n) => ({ node: n, degree: degree.get(n.id ?? n.slug) ?? 0 }))
      .sort((a, b) => b.degree - a.degree)
      .slice(0, HUB_LIST_SIZE)
  }, [graph])

  const subgraph = useMemo(() => {
    if (!graph || graphScreen !== 'sub' || !hubId) return null
    return localSubgraph(graph.nodes, graph.edges, hubId, 2)
  }, [graph, graphScreen, hubId])

  const openHub = useCallback((nodeKey) => {
    setHubId(nodeKey)
    setGraphScreen('sub')
    setSelected(null)
    setPinned(false)
  }, [])

  const displayNodes = subgraph ? subgraph.nodes : graph?.nodes
  const displayEdges = subgraph ? subgraph.edges : graph?.edges
  // On desktop the graph screen is always the full canvas.
  const showHubList = isMobile && graphScreen === 'hubs'

  return (
    <div className="app">
      <header className="app-header">
        <h1>MIP</h1>
        <span className="subtitle">Media Intelligence Platform</span>
        <nav className="app-nav" aria-label="Primary">
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
        <button
          className="info-btn"
          aria-label="About this app"
          onClick={() => setAboutOpen(true)}
        >
          ⓘ
        </button>
      </header>

      {aboutOpen && (
        <div className="sheet-backdrop" onClick={() => setAboutOpen(false)}>
          <div
            className="sheet about-sheet"
            role="dialog"
            aria-label="About"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-head">
              <h2>Media Intelligence Platform</h2>
              <button className="sheet-close" aria-label="Close" onClick={() => setAboutOpen(false)}>
                ×
              </button>
            </div>
            <p className="sheet-body">
              MIP tracks news stories through their full consequence arc — knowledge graph, causal
              timeline, story arcs, and the live article feed.
            </p>
            {graph && <p className="sheet-body muted">Data source: {graph.source}</p>}
          </div>
        </div>
      )}

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
            {graph && showHubList && (
              <div className="hub-list">
                <h2>Knowledge Graph</h2>
                <p className="hub-sub">
                  Start from a hub — the most connected events and actors — or open the full graph.
                </p>
                <ol className="hub-items">
                  {hubs.map(({ node, degree }, i) => (
                    <li key={node.id ?? node.slug}>
                      <button className="hub-item" onClick={() => openHub(node.id ?? node.slug)}>
                        <span className="hub-rank">{i + 1}</span>
                        <span className="hub-label">{node.label}</span>
                        <span className="hub-meta">
                          {node.type} · <span className="num">{degree}</span> links
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
                <button className="hub-show-all" onClick={() => setGraphScreen('all')}>
                  Show full graph (<span className="num">{graph.nodes.length}</span> nodes)
                </button>
              </div>
            )}
            {graph && !showHubList && (
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
                  {isMobile && (
                    <div className="graph-mobile-bar">
                      {graphScreen === 'sub' && (
                        <button className="graph-mode-btn" onClick={() => setGraphScreen('hubs')}>
                          ← Hubs
                        </button>
                      )}
                      <button
                        className="graph-mode-btn"
                        onClick={() => setGraphScreen(graphScreen === 'all' ? 'hubs' : 'all')}
                      >
                        {graphScreen === 'all' ? 'Hub list' : 'Show all'}
                      </button>
                    </div>
                  )}
                  <GraphView
                    key={graphScreen === 'sub' ? `sub-${hubId}` : 'all'}
                    nodes={displayNodes}
                    edges={displayEdges}
                    onSelect={handleSelect}
                    panelOpen={!!selected && !isMobile}
                  />
                  <Legend />
                </div>
                {/* Mobile: scrim behind the bottom sheet (tap to close). */}
                {selected && isMobile && (
                  <div className="ap-scrim" onClick={handleClose} aria-hidden="true" />
                )}
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
                    isMobile={isMobile}
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

      <nav className="bottom-nav" aria-label="Primary">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            className={`bottom-tab${view === v.key ? ' active' : ''}`}
            onClick={() => setView(v.key)}
          >
            {v.shortLabel}
          </button>
        ))}
      </nav>
    </div>
  )
}
