import { NODE_TYPES, EDGE_TYPES, EDGE_WEIGHTS, cssToken, typeColor } from './theme'

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

function edgeColor(ele) {
  const meta = EDGE_TYPES[ele.data('type')]
  return meta ? typeColor(meta) : FALLBACK_EDGE_COLOR
}

function edgeWidth(ele) {
  return EDGE_WEIGHTS[ele.data('weight')] ?? EDGE_WEIGHTS.medium
}

export const graphStylesheet = [
  {
    selector: 'node',
    style: {
      shape: 'octagon',
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
      label: 'data(label)',
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
