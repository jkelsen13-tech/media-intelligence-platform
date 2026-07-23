import { useEffect, useRef } from 'react'
import cytoscape from 'cytoscape'
import { graphStylesheet } from './styles'

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
      layout: {
        name: 'cose',
        animate: false,
        padding: 60,
        nodeRepulsion: 40000,
        idealEdgeLength: 120,
      },
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

    cyRef.current = cy
    return () => cy.destroy()
  }, [nodes, edges, onSelect])

  return <div ref={containerRef} className="graph-canvas" />
}
