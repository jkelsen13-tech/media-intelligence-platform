import { useEffect, useRef } from 'react'
import cytoscape from 'cytoscape'
import fcose from 'cytoscape-fcose'
import { graphStylesheet } from './styles'

cytoscape.use(fcose)

// --- Arc-weighted force helpers (fcose supports function values) ----------

// True when both endpoints carry an arc_id and they match.
function sameArc(edge) {
  const a = edge.source().data('arc_id')
  return a && a === edge.target().data('arc_id')
}

const WEIGHT_SIMILARITY = { heavy: 0.9, medium: 0.6, light: 0.3 }

// Read the existing edge similarity (0..1); fall back to the weight bucket.
function edgeSim(edge) {
  const s = Number(edge.data('similarity'))
  if (Number.isFinite(s)) return Math.min(Math.max(s, 0), 1)
  return WEIGHT_SIMILARITY[edge.data('weight')] ?? WEIGHT_SIMILARITY.medium
}

// Same-arc edges are pulled short (shorter for higher similarity);
// cross-arc edges are held long so arcs separate into clusters.
function idealEdgeLength(edge) {
  const sim = edgeSim(edge)
  return sameArc(edge) ? 70 + (1 - sim) * 40 : 260
}

// Strong springs inside an arc, weak springs across arcs. Cross-arc
// separation comes from nodeRepulsion acting on distant endpoints.
function edgeElasticity(edge) {
  const sim = edgeSim(edge)
  return sameArc(edge) ? 0.45 * (0.5 + sim) : 0.05
}

// Shared fcose options. `firstRun` randomizes positions and runs the full
// iteration budget; reheat runs (post-drag) keep current positions and fit.
function fcoseOptions({ firstRun }) {
  return {
    name: 'fcose',
    quality: 'default',
    randomize: firstRun,
    animate: true,
    animationDuration: firstRun ? 800 : 600,
    nodeRepulsion: () => 8000,
    idealEdgeLength,
    edgeElasticity,
    gravity: 0.25,
    numIter: firstRun ? 2500 : 1200,
    packComponents: true,
    fit: firstRun,
    padding: 60,
  }
}

export default function GraphView({ nodes, edges, onSelect }) {
  const containerRef = useRef(null)
  const cyRef = useRef(null)

  useEffect(() => {
    const cy = cytoscape({
      container: containerRef.current,
      style: graphStylesheet,
      elements: {
        nodes: nodes.map((n) => ({ data: { ...n, id: n.id ?? n.slug } })),
        edges: edges.map((e) => ({ data: e })),
      },
      layout: fcoseOptions({ firstRun: true }),
      minZoom: 0.2,
      maxZoom: 3,
      wheelSensitivity: 0.3,
    })

    if (onSelect) {
      cy.on('tap', 'node, edge', (evt) => onSelect(evt.target.data()))
      cy.on('tap', (evt) => {
        if (evt.target === cy) onSelect(null)
      })
    }

    // Hover focus (concept doc §4.2): hovering a node brings its edges to
    // full opacity and fades everything else.
    cy.on('mouseover', 'node', (evt) => {
      const neighborhood = evt.target.closedNeighborhood()
      cy.elements().not(neighborhood).addClass('dimmed')
      neighborhood.connectedEdges().addClass('highlighted')
    })
    cy.on('mouseout', 'node', () => {
      cy.elements().removeClass('dimmed highlighted')
    })

    // Drag perturbs, never pins: when a node is released, reheat the
    // simulation from current positions so the graph settles again.
    // Nodes are never locked (no node.lock(), no autolock).
    cy.on('dragfree', 'node', () => {
      cy.layout(fcoseOptions({ firstRun: false })).run()
    })

    cyRef.current = cy
    return () => cy.destroy()
  }, [nodes, edges, onSelect])

  return <div ref={containerRef} className="graph-canvas" />
}
