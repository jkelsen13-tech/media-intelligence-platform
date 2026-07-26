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

// Step 6 (§4): node type also determines the silhouette. Events KEEP the
// octagon. Actors read as people/orgs → round-rectangle. Topics get a tag/
// barrel silhouette and policies a diamond, prepared for when those node
// types land in the data. `shape` is the cytoscape shape name; the legend
// renders the matching CSS icon via `legendShapeClass` in Legend.jsx.
export const NODE_TYPES = {
  event: { color: '#4d9aff', cssVar: '--cat-blue', label: 'Event', shape: 'octagon' }, // blue
  actor: { color: '#9ca3af', cssVar: '--cat-grey', label: 'Actor', shape: 'round-rectangle' }, // grey
  institution: { color: '#ffb01f', cssVar: '--cat-amber', label: 'Institution', shape: 'octagon' }, // amber
  document: { color: '#2fdc6f', cssVar: '--cat-green', label: 'Document', shape: 'octagon' }, // green
  anomaly: { color: '#ff5252', cssVar: '--cat-red', label: 'Anomaly', shape: 'octagon' }, // red
  // Prepared for upcoming node types (no CSS token yet — hex fallback only).
  topic: { color: '#2dd4bf', cssVar: null, label: 'Topic', shape: 'barrel' }, // teal
  policy: { color: '#a78bfa', cssVar: null, label: 'Policy', shape: 'diamond' }, // violet
}

export const DEFAULT_NODE_SHAPE = 'octagon'

// Step 7 (§6): edge provenance. `claimed_by === 'MIP_inferred'` marks a
// machine-inferred hypothesis edge (dashed, no arrow, toggleable, default
// off). Sourced values are source_document | analysis | reporting (solid).
export const INFERRED_CLAIMED_BY = 'MIP_inferred'

// Reliability is a 1–4 integer where 1 = highest reliability. The graph
// filter shows edges with reliability >= threshold; edges with no
// reliability value always pass the filter.
export const RELIABILITY_MIN = 1
export const RELIABILITY_MAX = 4

export const EDGE_TYPES = {
  causal: { color: '#4d9aff', cssVar: '--cat-blue', label: 'Causal' }, // blue
  // Phase 0 Part 2 Tier 3: temporal adjacency, NOT proven causation.
  sequence: { color: '#9ca3af', cssVar: '--cat-grey', label: 'Sequence' }, // grey
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
  if (!meta?.cssVar) return meta?.color ?? '#6b7280'
  return cssToken(meta.cssVar, meta.color)
}

// Edge weight → line thickness in px.
export const EDGE_WEIGHTS = {
  heavy: 5,
  medium: 3,
  light: 1.5,
}
