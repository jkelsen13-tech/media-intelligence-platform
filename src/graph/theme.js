// Shared visual vocabulary for the knowledge graph.
// Node types and edge relationship types map to fixed colors so the graph
// reads consistently everywhere (canvas, legend, future detail panels).
//
// Pass C (§3 C1): the CSS custom properties in src/styles/tokens.css are the
// single source of truth. Cytoscape can't resolve var() inside canvas, so JS
// reads the computed value at draw time via cssToken(); the FALLBACK hexes
// below mirror tokens.css for pre-CSS / test environments. DOM inline styles
// use the `cssVar` reference directly (Legend, ArticlePanel, ArcsView).

export function cssToken(name, fallback) {
  if (typeof window === 'undefined' || !window.getComputedStyle) return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

export const NODE_TYPES = {
  event: { color: '#4d9aff', cssVar: '--cat-blue', label: 'Event' }, // blue
  actor: { color: '#9ca3af', cssVar: '--cat-grey', label: 'Actor' }, // grey
  institution: { color: '#ffb01f', cssVar: '--cat-amber', label: 'Institution' }, // amber
  document: { color: '#2fdc6f', cssVar: '--cat-green', label: 'Document' }, // green
  anomaly: { color: '#ff5252', cssVar: '--cat-red', label: 'Anomaly' }, // red
}

export const EDGE_TYPES = {
  causal: { color: '#4d9aff', cssVar: '--cat-blue', label: 'Causal' }, // blue
  actor: { color: '#9ca3af', cssVar: '--cat-grey', label: 'Actor' }, // grey
  financial: { color: '#ffb01f', cssVar: '--cat-amber', label: 'Financial' }, // amber
  conflict: { color: '#ff5252', cssVar: '--cat-red', label: 'Conflict' }, // red
  documentary: { color: '#2fdc6f', cssVar: '--cat-green', label: 'Documentary' }, // green
}

// Story-arc categories (§4.4 category tag). Colors come from the same token
// palette as the graph vocabulary; Unclassified stays neutral grey (Pass A).
export const CATEGORY_TYPES = {
  institutional_accountability: {
    cssVar: '--cat-blue',
    color: '#4d9aff',
    label: 'Institutional Accountability',
  },
  geopolitical_consequence: {
    cssVar: '--cat-amber',
    color: '#ffb01f',
    label: 'Geopolitical Consequence',
  },
  economic_policy: { cssVar: '--cat-green', color: '#2fdc6f', label: 'Economic Policy' },
  legislative_regulatory: {
    cssVar: '--cat-red',
    color: '#ff5252',
    label: 'Legislative / Regulatory',
  },
  unclassified: { cssVar: '--cat-grey', color: '#9ca3af', label: 'Unclassified' },
}

// Resolved canvas color for a NODE_TYPES/EDGE_TYPES entry.
export function typeColor(meta) {
  return cssToken(meta.cssVar, meta.color)
}

// Edge weight → line thickness in px.
export const EDGE_WEIGHTS = {
  heavy: 5,
  medium: 3,
  light: 1.5,
}
