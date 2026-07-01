// Shared visual vocabulary for the knowledge graph.
// Node types and edge relationship types map to fixed colors so the graph
// reads consistently everywhere (canvas, legend, future detail panels).

export const NODE_TYPES = {
  event: { color: '#3b82f6', label: 'Event' }, // blue
  actor: { color: '#9ca3af', label: 'Actor' }, // grey
  institution: { color: '#f59e0b', label: 'Institution' }, // amber
  document: { color: '#22c55e', label: 'Document' }, // green
  anomaly: { color: '#ef4444', label: 'Anomaly' }, // red
}

export const EDGE_TYPES = {
  causal: { color: '#3b82f6', label: 'Causal' }, // blue
  actor: { color: '#9ca3af', label: 'Actor' }, // grey
  financial: { color: '#f59e0b', label: 'Financial' }, // amber
  conflict: { color: '#ef4444', label: 'Conflict' }, // red
  documentary: { color: '#22c55e', label: 'Documentary' }, // green
}

// Edge weight → line thickness in px.
export const EDGE_WEIGHTS = {
  heavy: 5,
  medium: 3,
  light: 1.5,
}
