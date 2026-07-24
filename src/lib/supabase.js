import { createClient } from '@supabase/supabase-js'
import {
  demoNodes,
  demoEdges,
  demoSources,
  demoArcs,
  demoMilestones,
  demoArcEvents,
} from '../data/demoData'

// Env vars are used when present (local dev). The hardcoded fallbacks let the
// static GitHub Pages build reach the live project — the anon key is a
// publishable key and all tables are protected by read-only RLS policies.
const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://niejaejtbxgakyrsntxm.supabase.co'
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_rlHzgeDjVuw9kO3cqcVa-g_ZavxEY7V'

export const supabase = url && anonKey ? createClient(url, anonKey) : null

// PostgREST .or() filters break on commas/parens/quotes in user input.
function sanitizeSearch(q) {
  return (q ?? '').replace(/[(),"\\%_]/g, ' ').trim()
}

// Loads the graph from Supabase when configured, otherwise returns the
// bundled demo dataset. Both paths return { nodes, edges, source } in the
// shape GraphView expects.
export async function loadGraph() {
  if (!supabase) {
    return { nodes: demoNodes, edges: demoEdges, source: 'demo' }
  }

  const [nodesRes, edgesRes] = await Promise.all([
    supabase
      .from('nodes')
      .select('id, slug, label, type, description, confidence, summary, occurred_at, arc_id'),
    supabase.from('edges').select('id, source_id, target_id, type, weight, label, similarity'),
  ])

  if (nodesRes.error) throw nodesRes.error
  if (edgesRes.error) throw edgesRes.error

  if (nodesRes.data.length === 0) {
    return { nodes: demoNodes, edges: demoEdges, source: 'demo (Supabase empty)' }
  }

  return {
    nodes: nodesRes.data,
    edges: edgesRes.data.map((e) => ({
      id: e.id,
      source: e.source_id,
      target: e.target_id,
      type: e.type,
      weight: e.weight,
      label: e.label,
      similarity: e.similarity,
    })),
    source: 'supabase',
  }
}

// Sources backing a single node (article panel source list).
// nodeKey is the node uuid (supabase) or slug (demo data).
export async function loadSources(nodeKey) {
  if (!supabase) {
    return demoSources.filter((s) => s.node_slug === nodeKey)
  }
  const { data, error } = await supabase
    .from('sources')
    .select('id, outlet, headline, url, published_at')
    .eq('node_id', nodeKey)
    .order('published_at', { ascending: false, nullsFirst: false })
  if (error) throw error
  return data
}

// All story arcs, newest activity first.
export async function loadArcs() {
  if (!supabase) {
    return demoArcs
  }
  const { data, error } = await supabase
    .from('story_arcs')
    .select('id, slug, title, category, status, root_node_id, coverage_gap, summary, started_at, last_update_at')
    .order('last_update_at', { ascending: false })
  if (error) throw error
  return data
}

// Milestones + consequence events for one arc.
export async function loadArcDetail(arcKey) {
  if (!supabase) {
    return {
      milestones: demoMilestones.filter((m) => m.arc_slug === arcKey),
      events: demoArcEvents.filter((e) => e.arc_slug === arcKey),
    }
  }
  const [milestonesRes, eventsRes] = await Promise.all([
    supabase
      .from('arc_milestones')
      .select('id, title, status, notes, updated_at')
      .eq('arc_id', arcKey)
      .order('updated_at', { ascending: true }),
    supabase
      .from('arc_events')
      .select('id, title, category, confidence, occurred_at, description')
      .eq('arc_id', arcKey)
      .order('occurred_at', { ascending: true, nullsFirst: false }),
  ])
  if (milestonesRes.error) throw milestonesRes.error
  if (eventsRes.error) throw eventsRes.error
  return { milestones: milestonesRes.data, events: eventsRes.data }
}

// Causal timeline: event nodes with dates plus causal edges between them.
// `labels` covers ALL node types so edges that point at non-event nodes
// (institutions, anomalies, documents) resolve to a label, not a raw uuid.
export async function loadTimeline() {
  if (!supabase) {
    return {
      events: demoNodes.filter((n) => n.type === 'event'),
      causalEdges: demoEdges.filter((e) => e.type === 'causal'),
      labels: demoNodes.map((n) => ({ id: n.id ?? n.slug, slug: n.slug, label: n.label })),
    }
  }
  const [nodesRes, edgesRes, labelsRes] = await Promise.all([
    supabase
      .from('nodes')
      .select('id, slug, label, description, confidence, summary, occurred_at')
      .eq('type', 'event')
      .order('occurred_at', { ascending: true, nullsFirst: false }),
    supabase.from('edges').select('id, source_id, target_id, weight, label').eq('type', 'causal'),
    supabase.from('nodes').select('id, slug, label'),
  ])
  if (nodesRes.error) throw nodesRes.error
  if (edgesRes.error) throw edgesRes.error
  if (labelsRes.error) throw labelsRes.error
  return {
    events: nodesRes.data,
    causalEdges: edgesRes.data.map((e) => ({
      id: e.id,
      source: e.source_id,
      target: e.target_id,
      weight: e.weight,
      label: e.label,
    })),
    labels: labelsRes.data,
  }
}

// ---------- News Feed ----------

// Distinct outlet names present in the article stream (for filter chips).
export async function loadOutlets() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('articles')
    .select('outlet')
    .not('outlet', 'is', null)
  if (error) throw error
  const names = [...new Set(data.map((r) => r.outlet))]
  names.sort()
  return names
}

// Paged, searchable article stream across all outlets.
export async function loadArticles({ q, outlet, status, limit = 30, offset = 0 } = {}) {
  if (!supabase) return { articles: [], total: 0 }
  let query = supabase
    .from('articles')
    .select(
      'id, title, url, summary, published_at, outlet, monoculture, unattributed, arc_id, authors(name), story_arcs(title)',
      { count: 'exact' },
    )
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('fetched_at', { ascending: false })
    .range(offset, offset + limit - 1)

  const term = sanitizeSearch(q)
  if (term) {
    query = query.or(
      `title.ilike.%${term}%,summary.ilike.%${term}%,body_text.ilike.%${term}%`,
    )
  }
  if (outlet) query = query.eq('outlet', outlet)
  if (status === 'arc') query = query.not('arc_id', 'is', null)
  if (status === 'unattributed') query = query.eq('unattributed', true)
  if (status === 'monoculture') query = query.eq('monoculture', true)

  const { data, error, count } = await query
  if (error) throw error
  return {
    articles: data.map((a) => ({
      ...a,
      author_name: a.authors?.name ?? null,
      arc_title: a.story_arcs?.title ?? null,
      authors: undefined,
      story_arcs: undefined,
    })),
    total: count ?? data.length,
  }
}

// Full detail for one article: claims + provenance citations.
export async function loadArticleDetail(id) {
  if (!supabase) return null
  const [artRes, citRes] = await Promise.all([
    supabase
      .from('articles')
      .select('id, title, url, summary, published_at, outlet, claims, monoculture, unattributed, authors(name), story_arcs(title)')
      .eq('id', id)
      .single(),
    supabase
      .from('citations')
      .select('cited_entity, cited_type, documentation_strength')
      .eq('article_id', id)
      .order('documentation_strength', { ascending: false, nullsFirst: false }),
  ])
  if (artRes.error) throw artRes.error
  if (citRes.error) throw citRes.error
  return {
    ...artRes.data,
    author_name: artRes.data.authors?.name ?? null,
    arc_title: artRes.data.story_arcs?.title ?? null,
    citations: citRes.data,
  }
}

// ---------- Cross-view graph integration ----------

// Graph nodes an article is connected to via its resolved citations.
export async function loadArticleGraphLinks(articleId) {
  if (!supabase) return []
  const { data: cits, error } = await supabase
    .from('citations')
    .select('cited_entity, cited_type, resolved_node_id')
    .eq('article_id', articleId)
    .not('resolved_node_id', 'is', null)
  if (error) throw error
  if (!cits.length) return []
  const ids = [...new Set(cits.map((c) => c.resolved_node_id))]
  const { data: nodes, error: nErr } = await supabase
    .from('nodes')
    .select('id, label, type')
    .in('id', ids)
  if (nErr) throw nErr
  const byId = new Map((nodes ?? []).map((n) => [n.id, n]))
  return cits.map((c) => ({
    nodeId: c.resolved_node_id,
    label: byId.get(c.resolved_node_id)?.label ?? c.cited_entity,
    type: byId.get(c.resolved_node_id)?.type ?? null,
    citedEntity: c.cited_entity,
    citedType: c.cited_type,
  }))
}

// Articles backing a graph node: citations resolved to it, plus articles
// attached to any arc rooted at this node.
export async function loadNodeArticles(nodeId) {
  if (!supabase || !nodeId) return []
  const [citRes, arcRes] = await Promise.all([
    supabase
      .from('citations')
      .select('article_id')
      .eq('resolved_node_id', nodeId),
    supabase.from('story_arcs').select('id').eq('root_node_id', nodeId),
  ])
  if (citRes.error) throw citRes.error
  if (arcRes.error) throw arcRes.error

  const ids = new Set((citRes.data ?? []).map((r) => r.article_id))
  const arcIds = (arcRes.data ?? []).map((r) => r.id)
  if (arcIds.length > 0) {
    const { data: arcArts, error: aErr } = await supabase
      .from('articles')
      .select('id')
      .in('arc_id', arcIds)
    if (aErr) throw aErr
    for (const a of arcArts ?? []) ids.add(a.id)
  }
  if (ids.size === 0) return []

  const { data, error } = await supabase
    .from('articles')
    .select('id, title, outlet, published_at, url')
    .in('id', [...ids])
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(30)
  if (error) throw error
  return data
}

// Articles attached to a story arc.
export async function loadArcArticles(arcId) {
  if (!supabase || !arcId) return []
  const { data, error } = await supabase
    .from('articles')
    .select('id, title, outlet, published_at, url')
    .eq('arc_id', arcId)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(50)
  if (error) throw error
  return data
}
