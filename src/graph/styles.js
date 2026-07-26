import {
  NODE_TYPES,
  EDGE_TYPES,
  EDGE_WEIGHTS,
  DEFAULT_NODE_SHAPE,
  cssToken,
  typeColor,
} from './theme'

// Encoding: node FILL color = story arc (distinct muted hue per arc_id),
// node BORDER color + octagon shape = node type. Edges keep type/weight
// encoding (color = edge type, width = edge weight). Colors resolve from the
// CSS tokens at draw time (Pass C C1) with theme.js hexes as fallback.
const FALLBACK_NODE_COLOR = '#6b7280'
const FALLBACK_EDGE_COLOR = '#6b7280'

// Node size scales with connection count: 36px base + 8px per connected
// edge, capped so hubs don't swallow the canvas.
function nodeSize(ele) {
  return Math.min(36 + ele.degree(false) * 8, 110)
}

// Golden-angle hue per arc_id: hash the string, spread hashes around the
// color wheel by 137.508° so distinct arcs land on distinct hues. Muted
// saturation/lightness keeps the project's dark, low-key tone.
function arcFillColor(ele) {
  const arcId = ele.data('arc_id')
  if (!arcId) return cssToken('--bg-elevated', '#1d2230')
  let hash = 0
  const s = String(arcId)
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0
  }
  const hue = (hash * 137.508) % 360
  return `hsl(${hue}, 55%, 50%)`
}

function nodeColor(ele) {
  const meta = NODE_TYPES[ele.data('type')]
  return meta ? typeColor(meta) : FALLBACK_NODE_COLOR
}

// Step 6 (§4): silhouette keyed off node type — events stay octagons,
// actors round-rectangles, topics barrels, policies diamonds.
function nodeShape(ele) {
  return NODE_TYPES[ele.data('type')]?.shape ?? DEFAULT_NODE_SHAPE
}

function edgeColor(ele) {
  const meta = EDGE_TYPES[ele.data('type')]
  return meta ? typeColor(meta) : FALLBACK_EDGE_COLOR
}

function edgeWidth(ele) {
  return EDGE_WEIGHTS[ele.data('weight')] ?? EDGE_WEIGHTS.medium
}

// §2.7: cap node labels at 40 chars with an ellipsis — full headlines
// never fit on the canvas. The untruncated label stays on the node data
// and is shown in full in the Article Panel.
const LABEL_MAX_CHARS = 40

function nodeLabel(ele) {
  const label = String(ele.data('label') ?? '')
  return label.length > LABEL_MAX_CHARS
    ? `${label.slice(0, LABEL_MAX_CHARS).trimEnd()}…`
    : label
}

export const graphStylesheet = [
  {
    selector: 'node',
    style: {
      shape: nodeShape,
      width: nodeSize,
      height: nodeSize,
      'background-color': arcFillColor,
      // C2: octagon borders are the graph's primary visual vocabulary —
      // thicker so they read before zooming in.
      'border-width': 4,
      'border-color': nodeColor,
      'border-opacity': 1,
      // Labels are gated by zoom level (GraphView toggles the .lbl class):
      // none below 0.6x, top-N hubs 0.6-1.2x, everything above 1.2x.
      label: '',
      // C4: Inter at label weight, with a dark halo for legibility over edges.
      color: cssToken('--text-primary', '#e8eaf0'),
      'font-family': 'Inter, "IBM Plex Sans", system-ui, sans-serif',
      'font-weight': 600,
      'font-size': 11,
      'text-outline-color': cssToken('--bg-page', '#0b0b0a'),
      'text-outline-width': 2,
      'text-outline-opacity': 0.9,
      'text-valign': 'bottom',
      'text-halign': 'center',
      'text-margin-y': 6,
      'text-wrap': 'wrap',
      'text-max-width': 120,
    },
  },
  {
    selector: 'node.lbl',
    style: {
      label: nodeLabel,
    },
  },
  {
    selector: 'edge.lbl',
    style: {
      label: 'data(label)',
    },
  },
  {
    selector: 'node:selected',
    style: {
      'background-color': cssToken('--bg-selected', '#2d3550'),
      'border-width': 6,
    },
  },
  {
    selector: 'edge',
    style: {
      width: edgeWidth,
      'line-color': edgeColor,
      'target-arrow-color': edgeColor,
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      'arrow-scale': 0.9,
      opacity: 0.75,
      label: '',
      'font-size': 8,
      'font-family': 'Inter, "IBM Plex Sans", system-ui, sans-serif',
      color: cssToken('--text-secondary', '#9ca3af'),
      'text-rotation': 'autorotate',
      'text-background-color': cssToken('--bg-page', '#0b0b0a'),
      'text-background-opacity': 0.7,
      'text-background-padding': 2,
    },
  },
  {
    selector: 'edge:selected',
    style: {
      opacity: 1,
      'z-index': 10,
    },
  },
  // Step 7 (§3.2/§3.3): MIP_inferred edges are hypotheses — dashed, no
  // arrowhead (documented edges keep the triangle), and labeled
  // "hypothesis" when edge labels are visible. GraphView flags them with
  // the `inferred` data field; they default to hidden via .edge-hidden.
  {
    selector: 'edge[?inferred]',
    style: {
      'line-style': 'dashed',
      'target-arrow-shape': 'none',
      opacity: 0.6,
    },
  },
  // Phase 0 Part 2 Tier 3: sequence edges mark temporal adjacency, not
  // proven causation — dashed, no arrowhead, grey (like hypotheses, but
  // they ARE sourced, so they are not hidden by the inferred toggle).
  {
    selector: "edge[type='sequence']",
    style: {
      'line-style': 'dashed',
      'target-arrow-shape': 'none',
      'line-color': cssToken('--cat-grey', '#9ca3af'),
      opacity: 0.6,
    },
  },
  {
    selector: 'edge[?inferred].lbl',
    style: {
      label: 'hypothesis',
    },
  },
  // Step 7 (§6): reliability / hypothesis filters hide edges without a
  // re-layout; nodes left isolated by the filter stay but dim.
  {
    selector: '.edge-hidden',
    style: {
      display: 'none',
    },
  },
  {
    selector: 'node.isolated-dim',
    style: {
      opacity: 0.25,
    },
  },
  // Hover focus states (§4.2): connected edges full opacity, the rest fades.
  {
    selector: '.dimmed',
    style: {
      opacity: 0.15,
    },
  },
  {
    selector: 'edge.highlighted',
    style: {
      opacity: 1,
      'z-index': 10,
    },
  },
]
