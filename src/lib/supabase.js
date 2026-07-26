import { createClient } from '@supabase/supabase-js'
import {
  demoNodes,
  demoEdges,
  demoSources,
  demoArcs,
  demoArcEvents,
  demoMilestones,
  demoActors,
} from './data/demoData'

// Frontend reads go through the PUBLISHABLE key + RLS (Spec §2.6: writes
// service-role only in edge functions, never the browser). Legacy
// VITE_SUPABASE_ANON_KEY still works as a fallback for older env files.
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase = url && key ? createClient(url, key) : null

// ---------- Search input ----------

// PostgREST .or() filters are comma-delimited: an unescaped comma in user
// input silently splits the filter. Escape %, _, and commas for ilike.
export function sanitizeSearch(q) {
  return String(q ?? '')
    .trim()
    .slice(0, 200)
    .replace(/[%,_]/g, (ch) => `\\${ch}`)
}

// ---------- Concept-graph queries ----------

export async function loadGraph() {
  if (!supabase) return { nodes: demoNodes, edges: demoEdges }
  const [nodesRes, edgesRes] = await Promise.all([
    supabase.from('nodes').select('id, slug, label, type, summary, confidence, occurred_at, arc_id'),
    supabase.from('edges').select('id, source_id, target_id, type, weight, label, similarity, reliability, counterfactual_test, claimed_by'),
  ])
  if (nodesRes.error) throw nodesRes.error
  if (edgesRes.error) throw edgesRes.error
  return {
    nodes: nodesRes.data.map((n) => ({
      id: n.id,
      slug: n.slug,
      label: n.label,
      type: n.type,
      summary: n.summary,
      confidence: n.confidence,
      occurred_at: n.occurred_at,
      arc_id: n.arc_id ?? null,
    })),
    edges: edgesRes.data.map((e) => ({
      id: e.id,
      source: e.source_id,
      target: e.target_id,
      type: e.type,
      weight: e.weight,
      label: e.label,
      similarity: e.similarity ?? null,
      reliability: e.reliability ?? null,
      counterfactual_test: e.counterfactual_test ?? null,
      claimed_by: e.claimed_by ?? null,
    })),
  }
}

export async function loadNodeDetail(nodeId) {
  if (!supabase) {
    const node = demoNodes.find((n) => n.id === nodeId)
    return {
      node,
      sources: demoSources.filter((s) => s.node_id === nodeId),
      anomalies: [],
    }
  }
  const [nodeRes, sourcesRes, anomaliesRes] = await Promise.all([
    supabase.from('nodes').select('*').eq('id', nodeId).single(),
    supabase.from('sources').select('*').eq('node_id', nodeId),
    supabase.from('anomalies').select('*').eq('node_id', nodeId),
  ])
  if (nodeRes.error) throw nodeRes.error
  return {
    node: nodeRes.data,
    sources: sourcesRes.data ?? [],
    anomalies: anomaliesRes.data ?? [],
  }
}

export async function loadSourceDetail(sourceId) {
  if (!supabase) return null
  const [sourceRes, citationRes, claimRes] = await Promise.all([
    supabase.from('sources').select('*').eq('id', sourceId).single(),
    supabase.from('citations').select('*').eq('source_id', sourceId),
    supabase.from('claims').select('*').eq('source_id', sourceId),
  ])
  if (sourceRes.error) throw sourceRes.error
  return {
    source: sourceRes.data,
    citations: citationRes.data ?? [],
    claims: claimRes.data ?? [],
  }
}

// ---------- Entity derivation (Step 2/3: who / what-for) ----------

// Entities linked to a node, joined with canonical name + type.
export async function loadNodeEntities(nodeId) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('node_entities')
    .select('role, confidence, entities (id, canonical_name, entity_type)')
    .eq('node_id', nodeId)
  if (error) throw error
  return (data ?? []).map((row) => ({
    role: row.role,
    confidence: row.confidence,
    id: row.entities?.id,
    canonical_name: row.entities?.canonical_name ?? null,
    entity_type: row.entities?.entity_type ?? null,
  }))
}

// Every entity, for the "who" browser.
export async function loadEntities() {
  if (!supabase) return demoActors
  const { data, error } = await supabase
    .from('entities')
    .select('id, canonical_name, entity_type, mention_count, last_seen')
    .order('mention_count', { ascending: false })
  if (error) throw error
  return data
}

// Derivation chain for one entity: entity -> node_entities -> nodes.
export async function loadEntityDetail(entityId) {
  if (!supabase) return null
  const [entRes, neRes] = await Promise.all([
    supabase.from('entities').select('*').eq('id', entityId).single(),
    supabase
      .from('node_entities')
      .select('role, confidence, nodes (id, slug, label, type, summary)')
      .eq('entity_id', entityId),
  ])
  if (entRes.error) throw entRes.error
  return {
    entity: entRes.data,
    mentions: (neRes.data ?? []).map((row) => ({
      role: row.role,
      confidence: row.confidence,
      node: row.nodes,
    })),
  }
}

// ---------- Authors ----------

// Author directory, most prolific first.
export async function loadAuthors() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('authors')
    .select('id, name, article_count, confidence, framing_profile, last_seen, last_computed')
    .order('article_count', { ascending: false, nullsFirst: false })
  if (error) throw error
  return data ?? []
}

// One author + their recent articles (outlet included for the timeline).
export async function loadAuthorDetail(authorId) {
  if (!supabase) return null
  const [authorRes, articlesRes] = await Promise.all([
    supabase.from('authors').select('*').eq('id', authorId).single(),
    supabase
      .from('articles')
      .select('id, title, url, outlet, published_at, summary, monoculture, unattributed')
      .eq('author_id', authorId)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(20),
  ])
  if (authorRes.error) throw authorRes.error
  return { author: authorRes.data, articles: articlesRes.data ?? [] }
}

// ---------- Actor nodes (Step 6) ----------

// Actor nodes + their article counts for the Actors browser.
export async function loadActorNodes() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('nodes')
    .select('id, slug, label, metadata')
    .eq('type', 'actor')
  if (error) throw error
  return data ?? []
}

// Articles mentioning one actor, via the entity backlink on the actor node.
export async function loadActorArticles(entityId) {
  if (!supabase || !entityId) return []
  const { data: ae, error } = await supabase
    .from('article_entities')
    .select('confidence, role, articles (id, title, outlet, published_at, url)')
    .eq('entity_id', entityId)
    .order('confidence', { ascending: false })
    .limit(30)
  if (error) throw error
  return (ae ?? []).map((r) => ({ ...(r.articles ?? {}), confidence: r.confidence, role: r.role }))
}

// All actor-derivation edges for one event node: ENTITY -> EVENT ('involves')
// edges where the source is an actor node. Returns them paired with the
// actor entity_id so the UI can jump to the Actors view.
export async function loadActorDerivation(nodeId) {
  if (!supabase || !nodeId) return []
  const { data, error } = await supabase
    .from('edges')
    .select('id, source_id, metadata, nodes!edges_source_id_fkey (id, label)')
    .eq('target_id', nodeId)
    .eq('type', 'actor')
  if (error) throw error
  return (data ?? []).map((e) => ({
    id: e.id,
    entity_id: e.metadata?.entity_id ?? null,
    label: e.nodes?.label ?? null,
  }))
}

export async function loadSources(nodeId) {
  if (!supabase) return demoSources.filter((s) => s.node_id === nodeId)
  const { data, error } = await supabase.from('sources').select('*').eq('node_id', nodeId)
  if (error) throw error
  return data
}


// A4 — Arc status derivation. The stored story_arcs.status column is a weak
// signal; the UI dot is wired to status derived from real signals instead:
//   - resolved: the arc has milestones and every milestone is in a
//     terminal state (confirmed or failed — §2.5.4 four-state taxonomy;
//     legacy confirmed_complete / confirmed_failed also count),
//   - dormant:  newest arc_event is older than `dormantDays`,
//   - active:   recent arc_events with unresolved milestones,
//   - null:     no real signal (no events, no milestones) — show no dot.
export function deriveArcStatus(events, milestones, dormantDays = 14) {
  const ms = milestones ?? []
  const resolvedStates = new Set(['confirmed', 'failed', 'confirmed_complete', 'confirmed_failed'])
  if (ms.length > 0 && ms.every((m) => resolvedStates.has(m.status))) return 'resolved'
  const dates = (events ?? [])
    .map((e) => e.occurred_at)
    .filter(Boolean)
    .sort()
  const lastEvent = dates.length ? dates[dates.length - 1] : null
  if (!lastEvent) {
    if (ms.length === 0) return null
    // Milestones open but no dated events at all — nothing recent to track.
    return 'dormant'
  }
  const ageDays = (Date.now() - new Date(lastEvent).getTime()) / 86400000
  return ageDays > dormantDays ? 'dormant' : 'active'
}

// All story arcs, newest activity first, with derived status attached.
export async function loadArcs() {
  if (!supabase) {
    return demoArcs.map((a) => ({
      ...a,
      derived_status: deriveArcStatus(
        demoArcEvents.filter((e) => e.arc_slug === a.slug),
        demoMilestones.filter((m) => m.arc_slug === a.slug),
      ),
    }))
  }
  const [arcsRes, eventsRes, milestonesRes, cfgRes] = await Promise.all([
    supabase
      .from('story_arcs')
      .select('id, slug, title, category, category_confidence, category_evidence, status, root_node_id, coverage_gap, summary, started_at, last_update_at')
      .order('last_update_at', { ascending: false }),
    supabase.from('arc_events').select('arc_id, occurred_at'),
    supabase.from('arc_milestones').select('arc_id, status'),
    supabase.from('pipeline_config').select('value').eq('key', 'status_dormant_days').maybeSingle(),
  ])
  if (arcsRes.error) throw arcsRes.error
  if (eventsRes.error) throw eventsRes.error
  if (milestonesRes.error) throw milestonesRes.error
  const dormantDays = Number(cfgRes.data?.value ?? 14) || 14
  const eventsByArc = new Map()
  for (const e of eventsRes.data) {
    const arr = eventsByArc.get(e.arc_id) ?? []
    arr.push(e)
    eventsByArc.set(e.arc_id, arr)
  }
  const milestonesByArc = new Map()
  for (const m of milestonesRes.data) {
    const arr = milestonesByArc.get(m.arc_id) ?? []
    arr.push(m)
    milestonesByArc.set(m.arc_id, arr)
  }
  return arcsRes.data.map((a) => ({
    ...a,
    derived_status: deriveArcStatus(eventsByArc.get(a.id), milestonesByArc.get(a.id), dormantDays),
  }))
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
// Phase 0 Part 2 Tier 3: the timeline loads BOTH 'causal' edges (stated in
// reporting) and 'sequence' edges (temporal adjacency — NOT causation); the
// edge `type` is passed through so TimelineView can render them differently.
export async function loadTimeline() {
  if (!supabase) {
    return {
      events: demoNodes.filter((n) => n.type === 'event'),
      causalEdges: demoEdges.filter((e) => ['causal', 'sequence'].includes(e.type)),
      labels: demoNodes.map((n) => ({ id: n.id ?? n.slug, slug: n.slug, label: n.label })),
    }
  }
  const [nodesRes, edgesRes, labelsRes] = await Promise.all([
    supabase
      .from('nodes')
      .select('id, slug, label, description, confidence, summary, occurred_at')
      .eq('type', 'event')
      .order('occurred_at', { ascending: true, nullsFirst: false }),
    supabase.from('edges').select('id, source_id, target_id, type, weight, label').in('type', ['causal', 'sequence']),
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
      type: e.type,
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
      'id, title, url, summary, published_at, outlet, monoculture, unattributed, arc_id, authors(name), story_arcs!articles_arc_id_fkey(title)',
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
      .select('id, title, url, summary, published_at, outlet, claims, monoculture, unattributed, authors(name), story_arcs!articles_arc_id_fkey(title)')
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

// ---------- Sky verification (companion-app feature) ----------

const SKY_COLUMNS =
  'id, article_id, arc_id, observed_azimuth_deg, observed_altitude_deg, captured_at, centroid_lat, centroid_lng, confidence_radius_km, sensor_quality, angular_error_deg, image_hash, method'

// Latest sky_verifications row for one article. The table may be absent
// (or simply have no rows — it's a native-companion feature): any error
// feature-detects to null and the UI renders nothing.
export async function loadSkyVerification(articleId) {
  if (!supabase || !articleId) return null
  try {
    const { data, error } = await supabase
      .from('sky_verifications')
      .select(SKY_COLUMNS)
      .eq('article_id', articleId)
      .order('captured_at', { ascending: false, nullsFirst: false })
      .limit(1)
    if (error) return null
    return data?.[0] ?? null
  } catch {
    return null
  }
}

// Latest sky verification across the articles backing a graph node
// (citation-resolved + arc-attached), so the node panel can surface the
// same badge and credibility boost.
export async function loadSkyVerificationForNode(nodeId) {
  if (!supabase || !nodeId) return null
  try {
    const [citRes, arcRes] = await Promise.all([
      supabase.from('citations').select('article_id').eq('resolved_node_id', nodeId),
      supabase.from('story_arcs').select('id').eq('root_node_id', nodeId),
    ])
    if (citRes.error) return null
    const ids = new Set((citRes.data ?? []).map((r) => r.article_id))
    if (!arcRes.error) {
      const arcIds = (arcRes.data ?? []).map((r) => r.id)
      if (arcIds.length > 0) {
        const { data: arcArts, error } = await supabase
          .from('articles')
          .select('id')
          .in('arc_id', arcIds)
        if (!error) for (const a of arcArts ?? []) ids.add(a.id)
      }
    }
    if (ids.size === 0) return null
    const { data, error } = await supabase
      .from('sky_verifications')
      .select(SKY_COLUMNS)
      .in('article_id', [...ids])
      .order('captured_at', { ascending: false, nullsFirst: false })
      .limit(1)
    if (error) return null
    return data?.[0] ?? null
  } catch {
    return null
  }
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
