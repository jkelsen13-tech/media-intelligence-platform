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
      .select('id, slug, label, type, description, confidence, summary, occurred_at'),
    supabase.from('edges').select('id, source_id, target_id, type, weight, label'),
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
export async function loadTimeline() {
  if (!supabase) {
    return {
      events: demoNodes.filter((n) => n.type === 'event'),
      causalEdges: demoEdges.filter((e) => e.type === 'causal'),
    }
  }
  const [nodesRes, edgesRes] = await Promise.all([
    supabase
      .from('nodes')
      .select('id, slug, label, description, confidence, summary, occurred_at')
      .eq('type', 'event')
      .order('occurred_at', { ascending: true, nullsFirst: false }),
    supabase.from('edges').select('id, source_id, target_id, weight, label').eq('type', 'causal'),
  ])
  if (nodesRes.error) throw nodesRes.error
  if (edgesRes.error) throw edgesRes.error
  return {
    events: nodesRes.data,
    causalEdges: edgesRes.data.map((e) => ({
      id: e.id,
      source: e.source_id,
      target: e.target_id,
      weight: e.weight,
      label: e.label,
    })),
  }
}
