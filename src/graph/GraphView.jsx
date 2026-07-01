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
        nodes: nodes.map((n) => ({ data: n })),
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

    cyRef.current = cy
    return () => cy.destroy()
  }, [nodes, edges, onSelect])

  return <div ref={containerRef} className="graph-canvas" />
}
