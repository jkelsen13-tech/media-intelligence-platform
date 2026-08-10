import { useEffect, useMemo, useState, useCallback } from 'react'
import GraphView from './graph/GraphView'
import Legend from './graph/Legend'
import EdgeControls from './graph/EdgeControls'
import EdgeEvidence from './graph/EdgeEvidence'
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
import { loadGraph, loadTopics } from './lib/supabase'

const VIEWS = [
  { key: 'news', label: 'News Feed', shortLabel: 'News' },
  { key: 'graph', label: 'Knowledge Graph', shortLabel: 'Graph' },
  { key: 'timeline', label: 'Causal Timeline', shortLabel: 'Timeline' },
  { key: 'arcs', label: 'Story Arcs', shortLabel: 'Arcs' },
]

// 02C Phase 3 internal closed beta — nav entry exists ONLY while
// pipeline_config.phase3_beta is true. Public release stays blocked per the
// 02C gate; this flag is beta-internal and never implies public exposure.
const PHASE3_VIEW = { key: 'phase3', label: 'Legal & Policy (Beta)', shortLabel: 'Beta' }

// 03_BACKLOG Item 1 Source Comparison — internal beta. Nav entry exists
// ONLY while pipeline_config.source_comparison_beta is true, and the route
// itself is gated a second time below (mirroring phase3_beta's double
// gate). source_comparison_public stays false — no public exposure.
const SOURCE_COMPARISON_VIEW = { key: 'compare', label: 'Source Comparison (Beta)', shortLabel: 'Compare' }

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
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}
