import { useEffect, useRef } from 'react'
import cytoscape from 'cytoscape'
import fcose from 'cytoscape-fcose'
import { graphStylesheet } from './styles'
import PanJoystick from './PanJoystick'
import { seedPositions } from '../analysis/layoutSeed'

cytoscape.use(fcose)

// G-ALG-1: opt-in deterministic layout. `?layout=deterministic` seeds every
// node with its stable phyllotaxis position (FNV-1a id hash) and runs fCoSE
// with randomize:false, so the same graph renders the same geometry on every
// visit and every machine. Default (flag absent) is byte-for-byte unchanged.
function deterministicLayoutRequested() {
  return (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('layout') === 'deterministic'
  )
}

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
// `positions` (G-ALG-1, only ever passed under ?layout=deterministic) pins
// the seed geometry and forces randomize:false.
function fcoseOptions({ firstRun, positions }) {
  return {
    name: 'fcose',
    quality: 'default',
    randomize: positions ? false : firstRun,
    ...(positions ? { positions } : {}),
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

// --- Pass C C3: background grid -------------------------------------------
// Thin graph-paper lines fixed to the CANVAS coordinate space: drawn on a
// synced <canvas> under the cytoscape layers, redrawn from pan/zoom so the
// grid pans and zooms with the graph rather than the viewport.
const GRID_SPACING = 48 // model px between lines
const GRID_OPACITY = 0.07

function drawGrid(canvas, cy) {
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr
    canvas.height = h * dpr
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  const zoom = cy.zoom()
  const pan = cy.pan()
  const step = GRID_SPACING * zoom
  if (step < 8) return // too dense to read; fade out at far zoom
  ctx.strokeStyle = `rgba(255, 255, 255, ${GRID_OPACITY})`
  ctx.lineWidth = 1
  ctx.beginPath()
  // First grid line at/left-of the viewport's left edge, in screen space.
  const x0 = ((pan.x % step) + step) % step
  for (let x = x0; x <= w; x += step) {
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h)
  }
  const y0 = ((pan.y % step) + step) % step
  for (let y = y0; y <= h; y += step) {
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
  }
  ctx.stroke()
}

// --- Pass C C4: radial label declutter ------------------------------------
// Additive local perturbation on top of fcose — NOT a re-layout. When the
// user zooms/pans toward a focal node (labeled node nearest the viewport
// center), labeled neighbors whose label boxes collide with the focal label
// are pushed radially outward just enough to clear the collision; strength
// scales with proximity. Everything eases (260ms) and eases back on
// zoom-out/pan-away. Honors prefers-reduced-motion.
const DECLUTTER_RADIUS_PX = 320 // rendered-px search radius around focus
const DECLUTTER_DURATION = 260

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function labelBox(node) {
  // Rendered bounding box of just the label text.
  return node.renderedBoundingBox({ includeLabels: true, includeNodes: false })
}

function boxesOverlap(a, b, pad = 4) {
  return !(
    a.x2 + pad < b.x1 ||
    b.x2 + pad < a.x1 ||
    a.y2 + pad < b.y1 ||
    b.y2 + pad < a.y1
  )
}

export default function GraphView({
  nodes,
  edges,
  onSelect,
  panelOpen,
  // Step 7: reliability threshold (1–4, 1 = show all) + hypothesis toggle.
  minReliability = 1,
  showInferred = false,
  // Step 7: edge tap → evidence popover.
  onEdgeSelect,
  // Fade the pan/zoom joystick while a mobile bottom sheet is open.
  joystickDimmed = false,
}) {
  const containerRef = useRef(null)
  const gridRef = useRef(null)
  const cyRef = useRef(null)

  useEffect(() => {
    const cy = cytoscape({
      container: containerRef.current,
      style: graphStylesheet,
      elements: {
        nodes: nodes.map((n) => ({ data: { ...n, id: n.id ?? n.slug } })),
        // `inferred` flags MIP_inferred hypothesis edges for the stylesheet
        // (dashed, no arrow, "hypothesis" label).
        edges: edges.map((e) => ({
          data: { ...e, inferred: e.claimed_by === 'MIP_inferred' },
        })),
      },
      layout: fcoseOptions({
        firstRun: true,
        positions: deterministicLayoutRequested()
          ? seedPositions(nodes.map((n) => String(n.id ?? n.slug)))
          : undefined,
      }),
      minZoom: 0.2,
      maxZoom: 3,
      // Tier 5: cytoscape never sees wheel events (they are intercepted in
      // capture phase below and normalized per input device), so the single
      // wheelSensitivity knob is no longer what governs wheel zoom.
      wheelSensitivity: 1,
    })

    // --- Tier 5: device-normalized wheel zoom ---
    // A single sensitivity cannot serve all three wheel sources: a standard
    // mouse emits large discrete notches, a trackpad two-finger scroll emits
    // a stream of tiny pixel deltas, and a trackpad pinch emits ctrl+wheel.
    // Treating them identically is jumpy on trackpads and sluggish on mice.
    // The capture-phase handler below stops the event before cytoscape's own
    // wheel listener and applies a device-appropriate, cursor-centered step.
    // Touch pinch is unaffected — touch gestures produce no wheel events.
    const graphContainer = containerRef.current
    const onWheelZoom = (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (cy.destroyed()) return
      const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY // lines -> px
      let factor
      if (e.ctrlKey) {
        // Trackpad pinch: rapid small ctrl+wheel stream.
        factor = Math.exp(-delta * 0.008)
      } else if (Math.abs(delta) >= 50) {
        // Standard mouse notch: one fixed, predictable step per notch.
        factor = delta < 0 ? 1.2 : 1 / 1.2
      } else {
        // Trackpad two-finger scroll: proportional, damped.
        factor = Math.exp(-delta * 0.0028)
      }
      const rect = graphContainer.getBoundingClientRect()
      cy.zoom({
        level: Math.min(cy.maxZoom(), Math.max(cy.minZoom(), cy.zoom() * factor)),
        renderedPosition: { x: e.clientX - rect.left, y: e.clientY - rect.top },
      })
    }
    graphContainer.addEventListener('wheel', onWheelZoom, { passive: false, capture: true })

    // --- C3: grid layer, synced to viewport changes ---
    const gridCanvas = gridRef.current
    const redrawGrid = () => {
      if (gridCanvas) drawGrid(gridCanvas, cy)
    }
    cy.on('zoom pan resize', redrawGrid)
    cy.on('layoutstop', redrawGrid)

    // --- Label policy by zoom level ---
    // < 0.6x: no labels. 0.6-1.2x: top-N nodes by degree centrality only.
    // > 1.2x: all nodes and edges. A tapped node keeps its label at any zoom.
    const LABEL_HUB_COUNT = 20
    const topHubs = cy
      .nodes()
      .sort((a, b) => b.degree(false) - a.degree(false))
      .slice(0, LABEL_HUB_COUNT)
    const manualLabels = new Set()

    const applyLabels = () => {
      const z = cy.zoom()
      cy.elements().removeClass('lbl')
      if (z >= 1.2) {
        cy.elements().addClass('lbl')
      } else if (z >= 0.6) {
        topHubs.forEach((n) => n.addClass('lbl'))
      }
      manualLabels.forEach((id) => {
        const n = cy.getElementById(id)
        if (n.nonempty()) n.addClass('lbl')
      })
    }
    cy.one('layoutstop', applyLabels)
    cy.on('zoom', applyLabels)
    cy.on('tap', 'node', (evt) => {
      manualLabels.add(evt.target.id())
      applyLabels()
    })

    // --- C4: radial label declutter ---
    // Rest positions are the fcose output (captured after every layout
    // settle); displacement targets are offsets from those positions.
    const restPositions = new Map() // id -> {x, y}
    const displaced = new Set() // ids currently pushed out
    const captureRest = () => {
      restPositions.clear()
      cy.nodes().forEach((n) => {
        restPositions.set(n.id(), { ...n.position() })
      })
    }
    cy.on('layoutstop', captureRest)

    const restoreNode = (node) => {
      const rest = restPositions.get(node.id())
      if (!rest) return
      displaced.delete(node.id())
      if (prefersReducedMotion()) {
        node.position(rest)
      } else {
        node.animate({ position: rest }, { duration: DECLUTTER_DURATION, easing: 'ease-out' })
      }
    }

    const declutter = () => {
      const labeled = cy.nodes('.lbl')
      if (labeled.length === 0) return
      // Focal node: labeled node nearest the viewport center.
      const cw = cy.width()
      const ch = cy.height()
      const cx = cw / 2
      const cyC = ch / 2
      let focal = null
      let focalDist = Infinity
      labeled.forEach((n) => {
        const rp = n.renderedPosition()
        const d = Math.hypot(rp.x - cx, rp.y - cyC)
        if (d < focalDist) {
          focalDist = d
          focal = n
        }
      })
      if (!focal || focalDist > DECLUTTER_RADIUS_PX) {
        // Panned/zoomed away from any labeled node: everyone eases home.
        displaced.forEach((id) => {
          const n = cy.getElementById(id)
          if (n.nonempty()) restoreNode(n)
        })
        return
      }
      const focalBox = labelBox(focal)
      const focalRest = restPositions.get(focal.id()) ?? focal.position()
      const zoom = cy.zoom()
      const keep = new Set([focal.id()])
      labeled.forEach((n) => {
        if (n.id() === focal.id()) return
        const rp = n.renderedPosition()
        const frp = focal.renderedPosition()
        const dist = Math.hypot(rp.x - frp.x, rp.y - frp.y)
        if (dist > DECLUTTER_RADIUS_PX) return // outside the radius: untouched
        if (!boxesOverlap(focalBox, labelBox(n))) return
        // Overlapping neighbor: push radially away from the focal node's
        // REST position; closer nodes move more.
        const rest = restPositions.get(n.id()) ?? n.position()
        let dx = rest.x - focalRest.x
        let dy = rest.y - focalRest.y
        const len = Math.hypot(dx, dy)
        if (len < 1e-3) {
          dx = 1
          dy = 0
        } else {
          dx /= len
          dy /= len
        }
        const proximity = 1 - dist / DECLUTTER_RADIUS_PX // 0..1, closer = more
        // §2.7: stronger repulsion so labels don't pile up at high zoom —
        // roughly 2.4x the previous push, still distance-scaled.
        const push = (120 + 260 * proximity) / zoom // model px
        const target = { x: rest.x + dx * push, y: rest.y + dy * push }
        keep.add(n.id())
        displaced.add(n.id())
        if (prefersReducedMotion()) {
          n.position(target)
        } else {
          n.animate({ position: target }, { duration: DECLUTTER_DURATION, easing: 'ease-out' })
        }
      })
      // Anything displaced last pass that no longer collides eases back.
      ;[...displaced].forEach((id) => {
        if (keep.has(id)) return
        const n = cy.getElementById(id)
        if (n.nonempty()) restoreNode(n)
      })
    }

    let declutterTimer = null
    const scheduleDeclutter = () => {
      clearTimeout(declutterTimer)
      declutterTimer = setTimeout(declutter, 140)
    }
    cy.on('zoom pan', scheduleDeclutter)
    cy.on('layoutstop', scheduleDeclutter)

    if (onSelect) {
      // Node taps select the node; edge taps are routed to the evidence
      // popover (Step 7) instead of the article panel.
      cy.on('tap', 'node', (evt) => {
        if (onEdgeSelect) onEdgeSelect(null)
        onSelect(evt.target.data())
      })
      cy.on('tap', 'edge', (evt) => {
        if (onEdgeSelect) {
          const e = evt.target
          const mid = e.midpoint()
          const pan = cy.pan()
          const zoom = cy.zoom()
          onEdgeSelect({
            edge: e.data(),
            position: {
              x: mid.x * zoom + pan.x,
              y: mid.y * zoom + pan.y,
            },
          })
        }
      })
      cy.on('tap', (evt) => {
        if (evt.target === cy) {
          if (onEdgeSelect) onEdgeSelect(null)
          onSelect(null)
        }
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

    // §4.4: the article panel shrinks the canvas container (flex), so the
    // cytoscape instance must be told its size changed — otherwise it keeps
    // rendering at the stale extent and the graph looks covered/shifted.
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            cy.resize()
            redrawGrid()
          })
        : null
    resizeObserver?.observe(containerRef.current)

    redrawGrid()
    cyRef.current = cy
    return () => {
      graphContainer.removeEventListener('wheel', onWheelZoom, { capture: true })
      clearTimeout(declutterTimer)
      resizeObserver?.disconnect()
      cy.destroy()
    }
  }, [nodes, edges, onSelect])

  // Step 7 (§6): reliability + hypothesis filtering. Toggling classes on
  // the existing instance avoids a full re-layout; edges with no
  // reliability value always pass. Nodes left fully isolated by the
  // filter stay on the canvas but dim (keeps context visible).
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || cy.destroyed()) return
    cy.edges().forEach((e) => {
      const rel = Number(e.data('reliability'))
      const below = Number.isFinite(rel) && rel < minReliability
      const inferredOff = e.data('inferred') && !showInferred
      e.toggleClass('edge-hidden', below || inferredOff)
    })
    cy.nodes().forEach((n) => {
      const total = n.degree(false)
      if (total === 0) {
        n.removeClass('isolated-dim')
        return
      }
      const visible = n
        .connectedEdges()
        .filter((e) => !e.hasClass('edge-hidden')).length
      n.toggleClass('isolated-dim', visible === 0)
    })
  }, [minReliability, showInferred, nodes, edges])

  // Panel open/close: after the container settles at its new width, refit
  // the graph into the remaining viewport so nothing sits under the panel.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || cy.destroyed()) return
    const timer = setTimeout(() => {
      cy.resize()
      cy.animate(
        { fit: { eles: cy.elements(), padding: 60 } },
        { duration: prefersReducedMotion() ? 0 : 300, easing: 'ease-out' },
      )
    }, 60)
    return () => clearTimeout(timer)
  }, [panelOpen])

  // Tier 5: keyboard zoom. The canvas is tab-focusable; +/− zoom around the
  // viewport center and 0 fits the graph (the PanJoystick +/− buttons remain
  // the on-screen keyboard-operable equivalents).
  const onGraphKeyDown = (e) => {
    const cy = cyRef.current
    if (!cy || cy.destroyed()) return
    const { width, height } = cy.container().getBoundingClientRect()
    const center = { x: width / 2, y: height / 2 }
    if (e.key === '+' || e.key === '=') {
      e.preventDefault()
      cy.zoom({ level: Math.min(cy.maxZoom(), cy.zoom() * 1.2), renderedPosition: center })
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault()
      cy.zoom({ level: Math.max(cy.minZoom(), cy.zoom() / 1.2), renderedPosition: center })
    } else if (e.key === '0') {
      e.preventDefault()
      cy.fit(undefined, 60)
    }
  }

  return (
    <div className="graph-canvas-wrap">
      <canvas ref={gridRef} className="graph-grid" aria-hidden="true" />
      <div
        ref={containerRef}
        className="graph-canvas"
        tabIndex={0}
        role="application"
        aria-label="Knowledge graph canvas. Plus and minus keys zoom, zero fits the graph."
        onKeyDown={onGraphKeyDown}
      />
      <PanJoystick cyRef={cyRef} dimmed={joystickDimmed} />
    </div>
  )
}
