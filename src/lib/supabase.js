import { createClient } from '@supabase/supabase-js'
import { demoNodes, demoEdges } from '../data/demoData'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = url && anonKey ? createClient(url, anonKey) : null

// Loads the graph from Supabase when configured, otherwise returns the
// bundled demo dataset. Both paths return { nodes, edges, source } in the
// shape GraphView expects.
export async function loadGraph() {
  if (!supabase) {
    return { nodes: demoNodes, edges: demoEdges, source: 'demo' }
  }

  const [nodesRes, edgesRes] = await Promise.all([
    supabase.from('nodes').select('id, label, type, description'),
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
