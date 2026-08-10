import { createClient } from '@supabase/supabase-js'
import {
  demoNodes,
  demoEdges,
  demoSources,
  demoArcs,
  demoMilestones,
  demoArcEvents,
} from '../data/demoData.js'
import { canonicalizeTimelineEvents, remapTimelineEdges } from './timelineDedup.js'

// Env vars are used when present (local dev). The hardcoded fallbacks let the
// static GitHub Pages build reach the live project — the anon key is a
// publishable key and all tables are protected by read-only RLS policies.
const url = import.meta.env?.VITE_SUPABASE_URL ?? 'https://niejaejtbxgakyrsntxm.supabase.co'
const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_rlHzgeDjVuw9kO3cqcVa-g_ZavxEY7V'

// Client construction can fail outside the browser (e.g. Node test runs
// without a WebSocket implementation); fall back to the demo-data path.
function makeClient() {
  if (!url || !anonKey) return null
  try {
    return createClient(url, anonKey)
  } catch {
    return null
  }
}

export const supabase = makeClient()

// Doc 13: PostgREST silently truncates any unpaginated select at 1000 rows.
// Keyset-paginate a table by its unique `id` column until a short page
// returns. Keyset (cursor) is preferred over offset because ingest writes
// concurrently — offsets can skip/duplicate rows as inserts shift pages.
async function keysetAll(client, table, cols, { filter = (q) => q, pageSize = 1000 } = {}) {
  const out = []
  let last = null
  for (;;) {
    let q = filter(client.from(table).select(cols)).order('id', { ascending: true })
    if (last !== null) q = q.gt('id', last)
    const { data, error } = await q.limit(pageSize)
    if (error) return { data: null, error }
    out.push(...(data ?? []))
    if (!data || data.length < pageSize) return { data: out, error: null }
    last = data[data.length - 1].id
  }
}

// PostgREST .or() filters break on commas/parens/quotes in user input.
function sanitizeSearch(q) {
  return (q ?? '').replace(/[(),"\\%_]/g, ' ').trim()
}

// Loads the graph from Supabase when configured, otherwise returns the
// bundled demo dataset. Both paths return { nodes, edges, source } in the
// shape GraphView expects.
export async function loadGraph({ supabaseClient } = {}) {
  const client = supabaseClient ?? supabase
  if (!client) {
    return { nodes: demoNodes, edges: demoEdges, source: 'demo' }
  }

  const EDGE_BASE = 'id, source_id, target_id, type, weight, label, similarity'
  // Evidence columns land with the Steps 6–9 backend migration. Try the
  // extended select first; if the columns don't exist yet (PostgREST 400),
  // fall back to the base select so the graph keeps working pre-migration.
  const EDGE_EVIDENCE =
    ', signal_source, doc_strength, claimed_by, stance, disputed_by, alternative_causes, counterfactual_test, reliability, metadata'

  // Doc 13 site 2: both reads keyset-paginate past the 1000-row ceiling.
  let [nodesRes, edgesRes] = await Promise.all([
    keysetAll(client, 'nodes', 'id, slug, label, type, description, confidence, summary, occurred_at, arc_id'),
    keysetAll(client, 'edges', EDGE_BASE + EDGE_EVIDENCE),
  ])
  if (edgesRes.error) {
    edgesRes = await keysetAll(client, 'edges', EDGE_BASE)
  }

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
      // Optional evidence fields — present only once the backend migration
      // lands; every consumer treats them as possibly undefined.
      signal_source: e.signal_source,
      doc_strength: e.doc_strength,
      claimed_by: e.claimed_by,
      stance: e.stance,
      disputed_by: e.disputed_by,
      alternative_causes: e.alternative_causes,
      counterfactual_test: e.counterfactual_test,
      reliability: e.reliability,
      metadata: e.metadata,
    })),
    source: 'supabase',
  }
}

// Step 10 (§7.4): policy detail for the Consequence view. The `policies`
// table (and policy_actors / policy_topics) may not exist yet — every
// query is feature-detected and failures degrade to empty values so the
// panel can still render from graph edges alone. The consequence edges
// themselves come from the already-loaded graph (they carry the evidence
// columns selected in loadGraph).
export async function loadPolicyDetail(policyNodeId) {
  const out = { policy: null, actors: [], topics: [] }
  if (!supabase || !policyNodeId) return out
  try {
    const { data, error } = await supabase
      .from('policies')
      .select(
        'id, name, jurisdiction, instrument_type, enacted_date, effective_date, status, source_url, full_text_url, external_id, metadata',
      )
      .eq('id', policyNodeId)
      .maybeSingle()
    if (error) return out // table likely absent — policy nodes just lack detail
    out.policy = data
  } catch {
    return out
  }
  try {
    const { data, error } = await supabase
      .from('policy_actors')
      .select('actor_id, role')
      .eq('policy_id', policyNodeId)
    if (!error) out.actors = data ?? []
  } catch {}
  try {
    const { data, error } = await supabase
      .from('policy_topics')
      .select('topic_id')
      .eq('policy_id', policyNodeId)
    if (!error) out.topics = data ?? []
  } catch {}
  return out
}

// Step 8 (§5): topic taxonomy. The `topics` / `node_topics` tables may not
// exist yet — feature-detect them and return null so the UI can hide the
// Topics affordance instead of breaking.
export async function loadTopics() {
  if (!supabase) return null
  try {
    const [topicsRes, nodeTopicsRes] = await Promise.all([
      supabase.from('topics').select('id, slug, name, parent_id'),
      supabase.from('node_topics').select('node_id, topic_id, confidence'),
    ])
    if (topicsRes.error || nodeTopicsRes.error) return null
    return { topics: topicsRes.data ?? [], nodeTopics: nodeTopicsRes.data ?? [] }
  } catch {
    return null
  }
}

// Category tag for the article panel (§4.4): nodes carry no category column,
// so the tag comes from the story arc the node belongs to (nodes.arc_id,
// falling back to an arc rooted at this node). Returns null when the node
// is in no arc — the panel then shows the neutral Unclassified tag.
export async function loadNodeCategory(node) {
  if (!node) return null
  if (!supabase) {
    const arc = demoArcs.find((a) => a.id === node.arc_id || a.slug === node.arc_id)
    return arc?.category ?? null
  }
  if (node.arc_id) {
    const { data, error } = await supabase
      .from('story_arcs')
      .select('category')
      .eq('id', node.arc_id)
      .maybeSingle()
    if (error) throw error
    if (data?.category) return data.category
  }
  if (node.id) {
    const { data, error } = await supabase
      .from('story_arcs')
      .select('category')
      .eq('root_node_id', node.id)
      .limit(1)
    if (error) throw error
    return data?.[0]?.category ?? null
  }
  return null
}

// Actor-panel derivation (targeted patch): actor/institution nodes carry no
// category column and often have no rows in `sources` (sources attach to the
// event nodes). When the panel's direct lookups come up empty, derive the
// display category and source list from the node's connected EVENT nodes.
export async function loadActorDerivation(eventNodeIds) {
  const out = { category: null, sources: [] }
  if (!supabase) return out
  const ids = [...new Set((eventNodeIds ?? []).filter(Boolean))]
  if (ids.length === 0) return out
  try {
    const { data: evNodes, error: evErr } = await supabase
      .from('nodes')
      .select('id, arc_id')
      .in('id', ids)
    if (evErr) return out
    const arcIds = [...new Set((evNodes ?? []).map((n) => n.arc_id).filter(Boolean))]
    if (arcIds.length > 0) {
      const { data: arcs } = await supabase
        .from('story_arcs')
        .select('category')
        .in('id', arcIds)
      // Most common category wins; a real category always beats unclassified.
      const counts = new Map()
      for (const a of arcs ?? []) counts.set(a.category, (counts.get(a.category) ?? 0) + 1)
      out.category =
        [...counts.entries()].sort((x, y) => {
          const ux = x[0] === 'unclassified' ? 0 : 1
          const uy = y[0] === 'unclassified' ? 0 : 1
          return uy - ux || y[1] - x[1]
        })[0]?.[0] ?? null
    }
    const { data: srcs } = await supabase
      .from('sources')
      .select('id, outlet, headline, url, published_at')
      .in('node_id', ids)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(15)
    out.sources = srcs ?? []
  } catch {
    // derivation is best-effort — panel degrades to its original empty state
  }
  return out
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

// Doc 05 pairs 1–3 support: build the suffix → article-id map (8-hex art-
// slug suffix = article id prefix; the same suffix groups evt-/art- mirrors,
// so it also resolves canonical evt- cards to their article) and an
// arc-id → arc-title map. Both return Maps; empty when joins resolve to
// nothing — honest degradation, never a fabricated destination.
export function buildTimelineCrossLinks(allEventNodes, canonicalOf, articleRows, arcRows) {
  const articleIdBySuffix = new Map()
  const idByPrefix = new Map()
  for (const a of articleRows ?? []) idByPrefix.set(String(a.id).slice(0, 8), a.id)
  // Map by GROUP suffix (shared by evt-/art- mirrors): any art- node in a
  // group gives the whole group its article. Walk art- nodes, resolve their
  // canonical card's suffix.
  for (const n of allEventNodes ?? []) {
    const slug = n.slug ?? ''
    if (!slug.startsWith('art-')) continue
    const articleId = idByPrefix.get(slug.slice(-8))
    if (!articleId) continue
    const canonicalId = canonicalOf?.get(n.id ?? n.slug) ?? (n.id ?? n.slug)
    const canonical = (allEventNodes ?? []).find((x) => (x.id ?? x.slug) === canonicalId)
    if (canonical) articleIdBySuffix.set((canonical.slug ?? '').slice(-8), articleId)
  }
  const arcTitleById = new Map((arcRows ?? []).map((a) => [a.id, a.title]))
  return { articleIdBySuffix, arcTitleById }
}

// Doc 05 pair 3 (News → Timeline): the timeline focus key for an article is
// its id's 8-hex prefix, IF an event node exists with a slug ending in that
// suffix (art- node or its evt- twin — same dedup group key). Returns null
// when no timeline event covers this article — the link then does not render.
export async function loadArticleTimelineKey(articleId) {
  if (!supabase || !articleId) return null
  const prefix = String(articleId).slice(0, 8)
  try {
    const { data, error } = await supabase
      .from('nodes')
      .select('id, slug')
      .eq('type', 'event')
      .like('slug', `%${prefix}`)
      .limit(1)
    if (error) return null
    return data && data.length > 0 ? prefix : null
  } catch {
    return null
  }
}

// Doc 05 pair 5 (News → Source Comparison): comparison events covering an
// article, via event_articles and via article_claims → claims. Returns
// [{ eventId, title }] (deduped); empty when the article is in no comparison
// event — the link then does not render.
export async function loadArticleComparisonEvents(articleId) {
  if (!supabase || !articleId) return []
  try {
    const [memberRes, claimRes] = await Promise.all([
      supabase.from('event_articles').select('event_id').eq('article_id', articleId),
      supabase.from('article_claims').select('claim_id').eq('article_id', articleId).eq('is_current', true),
    ])
    if (memberRes.error) return []
    const eventIds = new Set((memberRes.data ?? []).map((r) => r.event_id))
    if (!claimRes.error && (claimRes.data ?? []).length > 0) {
      const claimIds = [...new Set(claimRes.data.map((r) => r.claim_id))]
      const { data: claimRows, error: cErr } = await supabase
        .from('claims')
        .select('event_id')
        .in('id', claimIds)
      if (!cErr) for (const c of claimRows ?? []) eventIds.add(c.event_id)
    }
    if (eventIds.size === 0) return []
    const { data: evRows, error: eErr } = await supabase
      .from('events')
      .select('id, canonical_title')
      .in('id', [...eventIds])
    if (eErr) return []
    return (evRows ?? []).map((e) => ({ eventId: e.id, title: e.canonical_title }))
  } catch {
    return []
  }
}

// Causal timeline: event nodes with dates plus causal/sequence edges between
// them. `labels` covers ALL node types so edges that point at non-event nodes
// (institutions, anomalies, documents) resolve to a label, not a raw uuid.
// Dedup: Tier 4 deterministic evt-/art- mirror rule — see lib/timelineDedup.js.
export async function loadTimeline() {
  if (!supabase) {
    const demoEvents = demoNodes.filter((n) => n.type === 'event')
    const { events, canonicalOf, suppressed } = canonicalizeTimelineEvents(demoEvents)
    return {
      events,
      suppressed,
      relationEdges: remapTimelineEdges(
        demoEdges
          .filter((e) => e.type === 'causal' || e.type === 'sequence')
          .map((e) => ({ id: e.id, source: e.source, target: e.target, type: e.type, weight: e.weight, label: e.label })),
        canonicalOf,
      ),
      labels: demoNodes.map((n) => ({ id: n.id ?? n.slug, slug: n.slug, label: n.label })),
    }
  }
  const [nodesRes, edgesRes, labelsRes, articlesRes, arcsRes] = await Promise.all([
    supabase
      .from('nodes')
      .select('id, slug, label, description, confidence, summary, occurred_at, arc_id')
      .eq('type', 'event')
      .order('occurred_at', { ascending: true, nullsFirst: false }),
    // Causal AND sequential relations — the UI must preserve the distinction
    // (Tier 4 acceptance: "preserve causal versus sequential labels").
    supabase.from('edges').select('id, source_id, target_id, type, weight, label').in('type', ['causal', 'sequence']),
    supabase.from('nodes').select('id, slug, label'),
    // Doc 05 pairs 2/3: art- slug 8-hex suffix = article id 8-hex prefix
    // (verified 361/361 live). Ids only — the map is built in JS below.
    supabase.from('articles').select('id'),
    // Doc 05 pair 1: arc titles for event nodes that carry arc_id.
    supabase.from('story_arcs').select('id, title'),
  ])
  if (nodesRes.error) throw nodesRes.error
  if (edgesRes.error) throw edgesRes.error
  if (labelsRes.error) throw labelsRes.error
  if (articlesRes.error) throw articlesRes.error
  if (arcsRes.error) throw arcsRes.error
  const { events, canonicalOf, suppressed } = canonicalizeTimelineEvents(nodesRes.data)
  const { articleIdBySuffix, arcTitleById } = buildTimelineCrossLinks(
    nodesRes.data,
    canonicalOf,
    articlesRes.data,
    arcsRes.data,
  )
  return {
    // Cross-link fields are additive and optional: article_id only when the
    // art- suffix join resolves, arc_id straight from the node row.
    events: events.map((evt) => ({
      ...evt,
      article_id: articleIdBySuffix.get((evt.slug ?? '').slice(-8)) ?? null,
    })),
    suppressed,
    arcTitles: arcTitleById,
    relationEdges: remapTimelineEdges(
      edgesRes.data.map((e) => ({
        id: e.id,
        source: e.source_id,
        target: e.target_id,
        type: e.type,
        weight: e.weight,
        label: e.label,
      })),
      canonicalOf,
    ),
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

// ---------- Location corroboration (companion-app feature) ----------
// Formerly "Sky verification" — renamed per 02A Amendment B; identifiers and
// the `sky_verifications` table keep the deprecated legacy name until a
// separate migration plan renames them (see docs/LOCATION_CORROBORATION.md).

const SKY_COLUMNS =
  'id, article_id, arc_id, observed_azimuth_deg, observed_altitude_deg, captured_at, centroid_lat, centroid_lng, confidence_radius_km, sensor_quality, angular_error_deg, image_hash, method'

// Latest sky_verifications row (legacy table name) for one article. The table may be absent
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

// Latest location corroboration across the articles backing a graph node
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
