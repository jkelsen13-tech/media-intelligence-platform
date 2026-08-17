import { useEffect, useMemo, useState, useCallback } from 'react'
import GraphView from './graph/GraphView'
import Legend from './graph/Legend'
import EdgeControls from './graph/EdgeControls'
import RelationshipPanel from './panels/RelationshipPanel'
import EdgeList from './graph/EdgeList'
import ReviewStatusPanel from './panels/ReviewStatusPanel'
import TopicBrowser from './graph/TopicBrowser'
import ArticlePanel from './panels/ArticlePanel'
import PolicyPanel from './panels/PolicyPanel'
import TimelineView from './views/TimelineView'
import GroupedTimelineView from './views/GroupedTimelineView'
import { loadTimelineGroupedBetaFlag } from './lib/arcGroupedTimeline'
import ArcsView from './views/ArcsView'
import NewsView from './views/NewsView'
import Phase3View from './views/Phase3View'
import SourceComparisonView from './views/SourceComparisonView'
import { loadPhase3BetaFlag } from './lib/phase3ReadPath'
import { loadSourceComparisonBetaFlag } from './lib/sourceComparisonReadPath'
import { buildNavViews, buildMoreEntries, isMoreViewKey } from './lib/navViews'
import { loadGraph, loadTopics } from './lib/supabase'
import { computeHubs } from './lib/hubs'
import { resolveFocal } from './lib/desktopFocus'
import { loadLineageGraph, hydrateLineageArticles } from './lib/lineageGraphReadPath'
import { buildLineageElements, lineageEmptyState } from './graph/lineageElements'
import AccountPanel from './panels/AccountPanel'
import { loadAccountUiFlag } from './lib/auth'

// Nav structure lives in ./lib/navViews (Track B 6->5 restructure,
// 2026-08-16): four core tabs + "More"; the flag-gated Legal & Policy and
// Source Comparison surfaces moved into the More sheet. View keys and
// render blocks below are unchanged.

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
  // Track B nav restructure: the "More" tab opens a bottom sheet listing
  // the flag-gated surfaces instead of switching views itself.
  const [moreOpen, setMoreOpen] = useState(false)
  // Mobile graph entry: 'hubs' (ranked list) -> 'sub' (hub subgraph) / 'all'.
  const [graphScreen, setGraphScreen] = useState('hubs')
  // Track B Step 2 item 3: desktop defaults to the top hub's focused
  // subgraph; the full graph is an explicit opt-in (this flag). Mobile is
  // out of scope — it already enters through the hub list.
  const [desktopShowAll, setDesktopShowAll] = useState(false)
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
  // 20_IDEA capability 1: Graph lineage mode. Withhold posture — the toggle
  // does not exist unless pipeline_config.lineage_graph_mode is exactly true.
  const [lineageMode, setLineageMode] = useState(false)
  const [lineage, setLineage] = useState(null)
  const [lineageArticles, setLineageArticles] = useState(new Map())
  const [reviewStatusOpen, setReviewStatusOpen] = useState(false)
  // Step 10 (§7.4): policy consequence view — set when a policy node is
  // tapped (replaces the article panel for policy nodes).
  const [policyNode, setPolicyNode] = useState(null)
  // Step 8 (§5): topics. null = tables absent/unreachable → hide the
  // affordance entirely.
  const [topicsData, setTopicsData] = useState(null)
  const [topicsOpen, setTopicsOpen] = useState(false)
  // 02C Phase 3: beta flag. False until pipeline_config.phase3_beta === true;
  // unreadable flag also resolves false (withhold posture).
  const [phase3Beta, setPhase3Beta] = useState(false)
  // 03_BACKLOG Item 1: source comparison beta flag. Same withhold posture:
  // false until pipeline_config.source_comparison_beta === true.
  const [sourceComparisonBeta, setSourceComparisonBeta] = useState(false)
  // 04-ADD Step 3: arc-grouped timeline beta flag. Same withhold posture:
  // false until pipeline_config.timeline_grouped_beta === true. The flat
  // timeline stays the default; the toggle below only exists while the flag
  // is true, and the flat view's code path is unchanged either way.
  const [timelineGroupedBeta, setTimelineGroupedBeta] = useState(false)
  const [timelineMode, setTimelineMode] = useState('flat')
  // 16_ACCOUNT_PIPELINE: account UI flag. Same withhold posture: false
  // until pipeline_config.account_ui === true; rollback = flip flag false,
  // the entry point disappears without touching accounts or data.
  const [accountUi, setAccountUi] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  // Cross-view focus: clicking an arc/article/node link in one view opens
  // the target in its own view.
  const [focusArc, setFocusArc] = useState(null)
  const [focusArticle, setFocusArticle] = useState(null)
  // Doc 05: timeline focus key (8-hex group suffix) and comparison event id.
  const [focusTimelineEvent, setFocusTimelineEvent] = useState(null)
  const [focusComparisonEvent, setFocusComparisonEvent] = useState(null)

  const isMobile = useMediaQuery('(max-width: 767px)')

  useEffect(() => {
    loadGraph().then(setGraph).catch((err) => setError(err.message))
    loadLineageGraph()
      .then(async (projection) => {
        setLineage(projection)
        if (projection.enabled) setLineageArticles(await hydrateLineageArticles(projection))
      })
      // Lineage is additive: a failure here must never take down the graph.
      .catch(() => setLineage({ enabled: false, edges: [], originAnnotations: [] }))
    loadTopics()
      .then((data) => {
        // Only expose the affordance when the tables exist AND carry data.
        if (data && data.topics.length > 0) setTopicsData(data)
      })
      .catch(() => {})
    loadPhase3BetaFlag()
      .then((on) => setPhase3Beta(on === true))
      .catch(() => setPhase3Beta(false))
    loadSourceComparisonBetaFlag()
      .then((on) => setSourceComparisonBeta(on === true))
      .catch(() => setSourceComparisonBeta(false))
    loadTimelineGroupedBetaFlag()
      .then((on) => setTimelineGroupedBeta(on === true))
      .catch(() => setTimelineGroupedBeta(false))
    loadAccountUiFlag()
      .then((on) => setAccountUi(on === true))
      .catch(() => setAccountUi(false))
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
  // "Show full graph" is the explicit full-graph opt-in on desktop: it
  // clears any focus AND suppresses the desktop default focus until the
  // user explicitly returns via the toolbar's "Focused view" control.
  const clearFocus = useCallback(() => {
    setFocusStack([])
    setDesktopShowAll(true)
  }, [])

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

  // Escape closes the article / policy / relationship panel (§4.4 close
  // affordance; item 5 extends it to the docked relationship panel).
  useEffect(() => {
    if (!selected && !policyNode && !edgeEvidence) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        handleClose()
        closePolicyPanel()
        setEdgeEvidence(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, policyNode, edgeEvidence, handleClose, closePolicyPanel])

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

  // Doc 05 pair 3/6 destination: focus an event card in the Causal Timeline
  // by its 8-hex group suffix.
  const openEventInTimeline = useCallback((eventKey) => {
    setFocusTimelineEvent(eventKey)
    setView('timeline')
  }, [])

  // Doc 05 pair 5 destination: focus an event in Source Comparison.
  const openComparisonEvent = useCallback((eventId) => {
    setFocusComparisonEvent(eventId)
    setView('compare')
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
  const hubs = useMemo(() => (graph ? computeHubs(graph.nodes, graph.edges, HUB_LIST_SIZE) : []), [graph])

  // Step 9 + item 3: the active focal crumb drives the rendered subgraph.
  // On desktop with no explicit focus and no full-graph opt-in, the focal
  // is the synthetic top-hub default (see lib/desktopFocus.js).
  const topHub = hubs.length > 0 ? hubs[0].node : null
  const focal = useMemo(
    () => resolveFocal({ isMobile, desktopShowAll, focusStack, topHub }),
    [isMobile, desktopShowAll, focusStack, topHub],
  )
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

  const lineageElements = useMemo(
    () => (lineage?.enabled ? buildLineageElements(lineage, lineageArticles) : null),
    [lineage, lineageArticles],
  )
  const lineageAvailable = !!lineage?.enabled
  const lineageActive = lineageMode && lineageAvailable
  const lineageEmpty = lineageActive ? lineageEmptyState(lineage) : null

  // Lineage mode SWAPS the element set rather than overlaying: the live node
  // population is event/actor/policy only, so article-to-article lineage has
  // nothing on the default canvas to attach to.
  const displayNodes = lineageActive ? lineageElements.nodes : (subgraph ? subgraph.nodes : graph?.nodes)
  const displayEdges = lineageActive ? lineageElements.edges : (subgraph ? subgraph.edges : graph?.edges)
  // On desktop the graph screen is always the full canvas.
  const showHubList = isMobile && graphScreen === 'hubs' && focusStack.length === 0

  const inferredCount = useMemo(
    () => (graph ? graph.edges.filter((e) => e.claimed_by === 'MIP_inferred').length : 0),
    [graph],
  )

  // Nav entries — 4 core tabs + "More" while at least one gated surface is
  // authorized. Withhold posture: an unreadable flag resolves false above,
  // and with both flags false the More tab hides entirely (not grayed out).
  const navViews = buildNavViews({ phase3Beta, sourceComparisonBeta })
  const moreEntries = buildMoreEntries({ phase3Beta, sourceComparisonBeta })
  // The More tab shows active while one of its member views is on screen.
  const moreActive = isMoreViewKey(view)

  const openFromMore = (key) => {
    setView(key)
    setMoreOpen(false)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>MIP</h1>
        <span className="subtitle">Media Intelligence Platform</span>
        <nav className="app-nav" aria-label="Primary">
          {navViews.map((v) => (
            <button
              key={v.key}
              className={`nav-tab${(v.key === 'more' ? moreActive : view === v.key) ? ' active' : ''}`}
              onClick={() => (v.key === 'more' ? setMoreOpen(true) : setView(v.key))}
            >
              {v.label}
            </button>
          ))}
        </nav>
        {graph && <span className="data-source">data: {graph.source}</span>}
        {accountUi && (
          <button
            className="account-btn"
            aria-label="Account"
            onClick={() => setAccountOpen(true)}
          >
            Sign in
          </button>
        )}
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

      {moreOpen && moreEntries.length > 0 && (
        <div className="sheet-backdrop" onClick={() => setMoreOpen(false)}>
          <div
            className="sheet more-sheet"
            role="dialog"
            aria-label="More"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-head">
              <h2>More</h2>
              <button className="sheet-close" aria-label="Close" onClick={() => setMoreOpen(false)}>
                ×
              </button>
            </div>
            <div className="more-list">
              {moreEntries.map((entry) => (
                <button
                  key={entry.key}
                  className="more-item"
                  onClick={() => openFromMore(entry.key)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {accountOpen && accountUi && <AccountPanel onClose={() => setAccountOpen(false)} />}

      <main className="app-main">
        {error && <div className="notice error">Failed to load graph: {error}</div>}

        {view === 'news' && (
          <NewsView
            onOpenArc={openArcInView}
            onOpenNode={openNodeInGraph}
            focusArticleId={focusArticle}
            onOpenTimeline={openEventInTimeline}
            // Pair 5 degrades honestly when the destination tab is gated off.
            onOpenComparison={sourceComparisonBeta ? openComparisonEvent : undefined}
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
                {/* Track B Step 2 item 1: graph chrome in normal flow —
                    toolbar on top, controls rail beside the canvas stage.
                    Nothing floats over the canvas. */}
                <div className="graph-area">
                  <div className="graph-toolbar">
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
                    <button
                      type="button"
                      className="graph-toolbar-btn"
                      aria-expanded={edgeListOpen}
                      onClick={() => setEdgeListOpen((v) => !v)}
                    >
                      Relationship list
                    </button>
                    <button
                      type="button"
                      className="graph-toolbar-btn"
                      aria-expanded={reviewStatusOpen}
                      onClick={() => setReviewStatusOpen((v) => !v)}
                    >
                      Review status
                    </button>
                    {!isMobile && desktopShowAll && focusStack.length === 0 && topHub && (
                      <button
                        type="button"
                        className="graph-toolbar-btn graph-toolbar-focus-btn"
                        title={`Return to the default focused subgraph (${topHub.label})`}
                        onClick={() => setDesktopShowAll(false)}
                      >
                        Focused view: {topHub.label}
                      </button>
                    )}
                  </div>
                  {focal && (
                    <nav className="focus-trail" aria-label="Focus path">
                      {focusStack.length > 0 && (
                        <button
                          type="button"
                          className="focus-back"
                          onClick={focusBack}
                          aria-label="Back to previous focus"
                        >
                          ←
                        </button>
                      )}
                      <ol className="focus-crumbs">
                        {focusStack.length === 0 && focal.synthetic && (
                          <li className="focus-crumb">
                            <span className="focus-crumb-static">
                              Default focus: {focal.label}
                            </span>
                          </li>
                        )}
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
                        Show full graph (<span className="num">{graph.nodes.length}</span> nodes)
                      </button>
                    </nav>
                  )}
                  <div className="graph-body">
                    <div className="graph-rail">
                      <Legend lineageMode={lineageActive} />
                      <EdgeControls
                        minReliability={minReliability}
                        onMinReliabilityChange={setMinReliability}
                        showInferred={showInferred}
                        onShowInferredChange={setShowInferred}
                        inferredCount={inferredCount}
                        topicsAvailable={!!topicsData}
                        onOpenTopics={() => setTopicsOpen((v) => !v)}
                      />
                      {topicsOpen && topicsData && (
                        <TopicBrowser
                          topicsData={topicsData}
                          onSelectTopic={handleSelectTopic}
                          onClose={() => setTopicsOpen(false)}
                        />
                      )}
                    </div>
                    <div className="graph-stage">
                      {isMobile && (
                        <div className="graph-mobile-bar">
                          {focusStack.length === 0 && (
                            <button
                              type="button"
                              className="graph-mode-btn"
                              onClick={() => setGraphScreen(graphScreen === 'all' ? 'hubs' : 'all')}
                            >
                              {graphScreen === 'all' ? 'Hub list' : 'Show all'}
                            </button>
                          )}
                        </div>
                      )}
                      {lineageAvailable && (
                        <button
                          type="button"
                          className="graph-toolbar-btn lineage-mode-btn"
                          aria-pressed={lineageActive}
                          onClick={() => setLineageMode((v) => !v)}
                        >
                          {lineageActive ? 'Exit lineage mode' : 'Lineage mode'}
                        </button>
                      )}
                      {lineageEmpty && (
                        <div className="lineage-empty" role="status">
                          <h3>{lineageEmpty.title}</h3>
                          <p>{lineageEmpty.body}</p>
                        </div>
                      )}
                      <GraphView
                        key={lineageActive ? 'lineage' : (focal ? `focus-${focal.kind}-${focal.id}` : 'all')}
                        nodes={displayNodes}
                        edges={displayEdges}
                        onSelect={handleSelect}
                        panelOpen={!!(selected || policyNode || edgeEvidence) && !isMobile}
                        controlsDimmed={isMobile && !!(selected || policyNode)}
                        minReliability={minReliability}
                        showInferred={showInferred}
                        onEdgeSelect={setEdgeEvidence}
                      />
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
                      {reviewStatusOpen && (
                        <ReviewStatusPanel onClose={() => setReviewStatusOpen(false)} />
                      )}
                    </div>
                    {/* Item 5: docked relationship panel — flex sibling of the
                        stage on desktop (canvas shrinks beside it, never
                        covered); bottom sheet on mobile with a scrim. */}
                    {edgeEvidence && isMobile && (
                      <div className="ap-scrim" onClick={() => setEdgeEvidence(null)} aria-hidden="true" />
                    )}
                    {edgeEvidence && (
                      <RelationshipPanel
                        edge={edgeEvidence.edge}
                        sourceLabel={
                          graph.nodes.find((n) => (n.id ?? n.slug) === edgeEvidence.edge.source)?.label
                        }
                        targetLabel={
                          graph.nodes.find((n) => (n.id ?? n.slug) === edgeEvidence.edge.target)?.label
                        }
                        isMobile={isMobile}
                        onClose={() => setEdgeEvidence(null)}
                      />
                    )}
                  </div>
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

        {view === 'timeline' && timelineGroupedBeta && (
          <div className="timeline-mode-toggle" role="group" aria-label="Timeline layout">
            <button
              type="button"
              className={`timeline-chip${timelineMode === 'flat' ? ' active' : ''}`}
              aria-pressed={timelineMode === 'flat'}
              onClick={() => setTimelineMode('flat')}
            >
              Flat
            </button>
            <button
              type="button"
              className={`timeline-chip${timelineMode === 'grouped' ? ' active' : ''}`}
              aria-pressed={timelineMode === 'grouped'}
              onClick={() => setTimelineMode('grouped')}
            >
              Grouped by arc (Beta)
            </button>
          </div>
        )}
        {view === 'timeline' && timelineMode === 'grouped' && timelineGroupedBeta ? (
          <GroupedTimelineView
            onOpenArc={openArcInView}
            onOpenArticle={openArticleInNews}
            focusEventKey={focusTimelineEvent}
          />
        ) : view === 'timeline' && (
          <TimelineView
            onOpenArc={openArcInView}
            onOpenArticle={openArticleInNews}
            focusEventKey={focusTimelineEvent}
          />
        )}
        {view === 'arcs' && (
          <ArcsView
            focusArcId={focusArc}
            onOpenArticle={openArticleInNews}
            onOpenNode={openNodeInGraph}
          />
        )}
        {view === 'phase3' && phase3Beta && <Phase3View />}
        {view === 'compare' && sourceComparisonBeta && (
          <SourceComparisonView
            onOpenArticle={openArticleInNews}
            onOpenArc={openArcInView}
            onOpenTimeline={openEventInTimeline}
            focusEventId={focusComparisonEvent}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="Primary">
        {navViews.map((v) => (
          <button
            key={v.key}
            className={`bottom-tab${(v.key === 'more' ? moreActive : view === v.key) ? ' active' : ''}`}
            onClick={() => (v.key === 'more' ? setMoreOpen(true) : setView(v.key))}
          >
            {v.shortLabel}
          </button>
        ))}
      </nav>
    </div>
  )
}
