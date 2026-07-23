import { NODE_TYPES, EDGE_TYPES, EDGE_WEIGHTS } from './theme'

const FALLBACK_NODE_COLOR = '#6b7280'
const FALLBACK_EDGE_COLOR = '#6b7280'

// Node size scales with connection count: 36px base + 8px per connected
// edge, capped so hubs don't swallow the canvas.
function nodeSize(ele) {
  return Math.min(36 + ele.degree(false) * 8, 110)
}

function nodeColor(ele) {
  return NODE_TYPES[ele.data('type')]?.color ?? FALLBACK_NODE_COLOR
}

function edgeColor(ele) {
  return EDGE_TYPES[ele.data('type')]?.color ?? FALLBACK_EDGE_COLOR
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
      'background-color': '#1f2430',
      'border-width': 3,
      'border-color': nodeColor,
      label: 'data(label)',
      color: '#e5e7eb',
      'font-size': 11,
      'text-valign': 'bottom',
      'text-halign': 'center',
      'text-margin-y': 6,
      'text-wrap': 'wrap',
      'text-max-width': 120,
    },
  },
  {
    selector: 'node:selected',
    style: {
      'background-color': '#2d3548',
      'border-width': 5,
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
      opacity: 0.6,
      label: 'data(label)',
      'font-size': 8,
      color: '#9ca3af',
      'text-rotation': 'autorotate',
      'text-background-color': '#12141a',
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
