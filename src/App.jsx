import { useEffect, useMemo, useState, useCallback } from 'react'
import GraphView from './graph/GraphView'
import Legend from './graph/Legend'
import EdgeControls from './graph/EdgeControls'
import EdgeEvidence from './graph/EdgeEvidence'
import EdgeList from './graph/EdgeList'
import TopicBrowser from './graph/TopicBrowser'
import ArticlePanel from './panels/ArticlePanel'
import PolicyPanel from './panels/PolicyPanel'
import TimelineView from './views/TimelineView'
import ArcsView from './views/ArcsView'
import NewsView from './views/NewsView'
import { loadGraph, loadTopics } from './lib/supabase'

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

// Step 8 (§5): topic focus — nodes tagged with the topic plus their
// immediate neighbors (depth 1 around the whole member set).
function topicSubgraph(nodes, edges, memberIds) {
  const seeds = new Set(memberIds)
  const keep = new Set(memberIds)
  edges.forEach((e) => {
    if (seeds.has(e.source)) keep.add(e.target)
    if (seeds.has(e.target)) keep.add(e.source)
  })
  return {
    nodes: nodes.filter((n) => keep.has(n.id ?? n.slug)),
    edges: edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
  }
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
  // Step 9 (§8): focus stack. Each crumb is
  // { kind: 'node', id, label } or { kind: 'topic', id, label, memberIds }.
  // Non-empty stack = the graph renders the focal node's depth-2
  // neighborhood (or the topic's members + neighbors).
  const [focusStack, setFocusStack] = useState([])
  // Step 7 (§6): edge filters — reliability threshold (1 = show all) and
  // the MIP hypothesis (inferred) toggle, default OFF.
  const [minReliability, setMinReliability] = useState(1)
  const [showInferred, setShowInferred] = useState(false)
  // Step 7: tapped-edge evidence popover payload { edge, position }.
  const [edgeEvidence, setEdgeEvidence] = useState(null)
  // 02B final acceptance: nonvisual (screen-reader/keyboard) relationship list.
  const [edgeListOpen, setEdgeListOpen] = useState(false)
  // Step 10 (§7.4): policy consequence view — set when a policy node is
  // tapped (replaces the article panel for policy nodes).
  const [policyNode, setPolicyNode] = useState(null)
  // Step 8 (§5): topics. null = tables absent/unreachable → hide the
  // affordance entirely.
  const [topicsData, setTopicsData] = useState(null)
  const [topicsOpen, setTopicsOpen] = useState(false)
  // Cross-view focus: clicking an arc/article/node link in one view opens
  // the target in its own view.
  const [focusArc, setFocusArc] = useState(null)
  const [focusArticle, setFocusArticle] = useState(null)

  const isMobile = useMediaQuery('(max-width: 767px)')

  useEffect(() => {
    loadGraph().then(setGraph).catch((err) => setError(err.message))
    loadTopics()
      .then((data) => {
        // Only expose the affordance when the tables exist AND carry data.
        if (data && data.topics.length > 0) setTopicsData(data)
      })
      .catch(() => {})
  }, [])

  // Step 9 (§8): tapping a node makes it focal — its depth-2 neighborhood
  // re-renders and the node is pushed onto the breadcrumb stack. Tapping
  // the current focal node again is a no-op (panel still opens).
  const pushFocus = useCallback((node) => {
    const key = node.id ?? node.slug
    setFocusStack((stack) => {
      const top = stack[stack.length - 1]
      if (top && top.kind === 'node' && top.id === key) return stack
      return [...stack, { kind: 'node', id: key, label: node.label ?? key }]
    })
  }, [])

  const focusBack = useCallback(() => setFocusStack((s) => s.slice(0, -1)), [])
  const focusTo = useCallback((index) => setFocusStack((s) => s.slice(0, index + 1)), [])
  const clearFocus = useCallback(() => setFocusStack([]), [])

  const handleSelect = useCallback(
    (data) => {
      // Edge taps and canvas taps clear the panel unless it is pinned.
      if (!data || data.source) {
        if (!pinned) setSelected(null)
        return
      }
      // Step 10: policy nodes open the Consequence view instead of the
      // article panel; everything else keeps the existing behavior.
      if (data.type === 'policy') {
        setSelected(null)
        setPinned(false)
        setPolicyNode(data)
      } else {
        setSelected(data)
      }
      pushFocus(data)
    },
    [pinned, pushFocus],
  )

  const openConsequenceView = useCallback((node) => {
    setSelected(null)
    setPinned(false)
    setPolicyNode(node)
  }, [])

  const closePolicyPanel = useCallback(() => setPolicyNode(null), [])

  const handleNavigate = useCallback(
    (nodeKey) => {
      if (!graph) return
      const next = graph.nodes.find((n) => (n.id ?? n.slug) === nodeKey)
      if (next) {
        if (next.type === 'policy') {
          setSelected(null)
          setPolicyNode(next)
        } else {
          setSelected(next)
          setPolicyNode(null)
        }
        pushFocus(next)
      }
    },
    [graph, pushFocus],
  )

  // Step 9: "Focus" affordance in the article panel — make the viewed
  // node focal without closing the panel.
  const handleFocusNode = useCallback(
    (node) => {
      pushFocus(node)
      setGraphScreen((s) => (s === 'hubs' ? 'all' : s))
    },
    [pushFocus],
  )

  // Step 8: topic drill-down focuses the graph on the topic's members.
  const handleSelectTopic = useCallback(
    ({ id, name, memberIds }) => {
      setTopicsOpen(false)
      setGraphScreen('all')
      setFocusStack([{ kind: 'topic', id, label: name, memberIds }])
    },
    [],
  )

  const handleClose = useCallback(() => {
    setSelected(null)
    setPinned(false)
  }, [])

  // Escape closes the article / policy panel (§4.4 close affordance).
  useEffect(() => {
    if (!selected && !policyNode) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        handleClose()
        closePolicyPanel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, policyNode, handleClose, closePolicyPanel])

  // --- Cross-view navigation ---
  const openNodeInGraph = useCallback(
    (nodeKey) => {
      if (!graph) return
      const next = graph.nodes.find((n) => (n.id ?? n.slug) === nodeKey)
      setGraphScreen('all')
      setView('graph')
      if (next) {
        setSelected(next)
        pushFocus(next)
      }
    },
    [graph, pushFocus],
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
    pushFocus(node)
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

  // Step 9: the active focal crumb drives the rendered subgraph.
  const focal = focusStack.length > 0 ? focusStack[focusStack.length - 1] : null
  const subgraph = useMemo(() => {
    if (!graph || !focal) return null
    if (focal.kind === 'topic') return topicSubgraph(graph.nodes, graph.edges, focal.memberIds)
    return localSubgraph(graph.nodes, graph.edges, focal.id, 2)
  }, [graph, focal])

  const openHub = useCallback((node) => {
    setFocusStack([{ kind: 'node', id: node.id ?? node.slug, label: node.label }])
    setGraphScreen('all')
    setSelected(null)
    setPinned(false)
  }, [])

  const displayNodes = subgraph ? subgraph.nodes : graph?.nodes
  const displayEdges = subgraph ? subgraph.edges : graph?.edges
  // On desktop the graph screen is always the full canvas.
  const showHubList = isMobile && graphScreen === 'hubs' && focusStack.length === 0

  const inferredCount = useMemo(
    () => (graph ? graph.edges.filter((e) => e.claimed_by === 'MIP_inferred').length : 0),
    [graph],
  )

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

      {topicsOpen && topicsData && (
        <TopicBrowser
          topicsData={topicsData}
          onSelectTopic={handleSelectTopic}
          onClose={() => setTopicsOpen(false)}
        />
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
                      <button className="hub-item" onClick={() => openHub(node)}>
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
                  {focusStack.length > 0 && (
                    <nav className="focus-trail" aria-label="Focus path">
                      <button
                        type="button"
                        className="focus-back"
                        onClick={focusBack}
                        aria-label="Back to previous focus"
                      >
                        ←
                      </button>
                      <ol className="focus-crumbs">
                        {focusStack.map((crumb, i) => (
                          <li key={`${crumb.kind}-${crumb.id}-${i}`} className="focus-crumb">
                            {i > 0 && <span className="focus-sep" aria-hidden="true">›</span>}
                            <button
                              type="button"
                              className={`focus-crumb-btn${i === focusStack.length - 1 ? ' current' : ''}`}
                              onClick={() => focusTo(i)}
                              aria-current={i === focusStack.length - 1 ? 'page' : undefined}
                            >
                              {crumb.label}
                            </button>
                          </li>
                        ))}
                      </ol>
                      <button type="button" className="focus-show-all" onClick={clearFocus}>
                        Show all
                      </button>
                    </nav>
                  )}
                  {isMobile && (
                    <div className="graph-mobile-bar">
                      {focusStack.length === 0 && (
                        <button
                          className="graph-mode-btn"
                          onClick={() => setGraphScreen(graphScreen === 'all' ? 'hubs' : 'all')}
                        >
                          {graphScreen === 'all' ? 'Hub list' : 'Show all'}
                        </button>
                      )}
                    </div>
                  )}
                  <GraphView
                    key={focal ? `focus-${focal.kind}-${focal.id}` : 'all'}
                    nodes={displayNodes}
                    edges={displayEdges}
                    onSelect={handleSelect}
                    panelOpen={!!(selected || policyNode) && !isMobile}
                    joystickDimmed={isMobile && !!(selected || policyNode)}
                    minReliability={minReliability}
                    showInferred={showInferred}
                    onEdgeSelect={setEdgeEvidence}
                  />
                  <Legend />
                  <EdgeControls
                    minReliability={minReliability}
                    onMinReliabilityChange={setMinReliability}
                    showInferred={showInferred}
                    onShowInferredChange={setShowInferred}
                    inferredCount={inferredCount}
                    topicsAvailable={!!topicsData}
                    onOpenTopics={() => setTopicsOpen(true)}
                  />
                  <button
                    type="button"
                    className="edge-list-toggle"
                    aria-expanded={edgeListOpen}
                    onClick={() => setEdgeListOpen((v) => !v)}
                  >
                    Relationship list
                  </button>
                  {edgeListOpen && (
                    <EdgeList
                      nodes={graph.nodes}
                      edges={displayEdges ?? []}
                      minReliability={minReliability}
                      showInferred={showInferred}
                      onSelectEdge={(edge) => setEdgeEvidence({ edge, position: null })}
                      onClose={() => setEdgeListOpen(false)}
                    />
                  )}
                  {edgeEvidence && (
                    <EdgeEvidence
                      edge={edgeEvidence.edge}
                      position={edgeEvidence.position}
                      sourceLabel={
                        graph.nodes.find((n) => (n.id ?? n.slug) === edgeEvidence.edge.source)?.label
                      }
                      targetLabel={
                        graph.nodes.find((n) => (n.id ?? n.slug) === edgeEvidence.edge.target)?.label
                      }
                      onClose={() => setEdgeEvidence(null)}
                    />
                  )}
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
                    onFocusNode={handleFocusNode}
                    onOpenConsequence={openConsequenceView}
                    onShowEdgeEvidence={(edge) => setEdgeEvidence({ edge, position: null })}
                    onOpenArticle={openArticleInNews}
                    onClose={handleClose}
                    isMobile={isMobile}
                  />
                )}
                {/* Step 10 (§7.4): policy consequence view. */}
                {policyNode && isMobile && (
                  <div className="ap-scrim" onClick={closePolicyPanel} aria-hidden="true" />
                )}
                {policyNode && (
                  <PolicyPanel
                    node={policyNode}
                    nodes={graph.nodes}
                    edges={graph.edges}
                    onNavigate={handleNavigate}
                    onClose={closePolicyPanel}
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
