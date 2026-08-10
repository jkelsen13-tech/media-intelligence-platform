// Track B Step 2 (owner-approved 2026-08-10): peripheral band for
// zero-edge (fully disconnected) graph nodes.
//
// Honest-degradation constraint: positional grouping only. No edges or
// lines are ever drawn to disconnected nodes — the band sits in clear
// whitespace below/beside the connected cluster so isolation reads as a
// deliberate signal, not as a fabricated relationship.
//
// Pure module: no DOM, no cytoscape imports — unit-testable in node:test
// (same seam pattern as src/lib/listFilters.js).

import { hashId } from '../analysis/layoutSeed.js'

/**
 * Split nodes into connected / disconnected by edge degree.
 * @param {Array<{id: any}>} nodes
 * @param {Array<{source: any, target: any}>} edges
 * @returns {{connected: Array, disconnected: Array}}
 */
export function splitByConnectivity(nodes, edges) {
  const degree = new Map()
  for (const e of edges ?? []) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1)
  }
  const connected = []
  const disconnected = []
  for (const n of nodes ?? []) {
    ;(degree.get(n.id) > 0 ? connected : disconnected).push(n)
  }
  return { connected, disconnected }
}

// Golden-angle hue per arc_id — MUST match arcFillColor in
// src/graph/styles.js so band ordering follows the same color vocabulary.
function arcHue(arcId) {
  let hash = 0
  const s = String(arcId)
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0
  }
  return (hash * 137.508) % 360
}

/**
 * Deterministic display order for band nodes: arc-members first, grouped
 * by arc hue (nodes of one arc sit together, arcs ordered around the
 * color wheel), then arc-less nodes. Ties broken by stable id hash so the
 * order never depends on fetch order.
 */
export function bandOrder(disconnected) {
  const keyed = (disconnected ?? []).map((n) => ({
    node: n,
    hasArc: n.arc_id != null && n.arc_id !== '',
    hue: n.arc_id != null && n.arc_id !== '' ? arcHue(n.arc_id) : null,
    hash: hashId(n.id),
  }))
  keyed.sort((a, b) => {
    if (a.hasArc !== b.hasArc) return a.hasArc ? -1 : 1
    if (a.hasArc && a.hue !== b.hue) return a.hue - b.hue
    return a.hash - b.hash
  })
  return keyed.map((k) => k.node)
}

/**
 * Place disconnected nodes in a regular grid band outside the connected
 * cluster's bounding box. Landscape canvases get a wide band below the
 * cluster; portrait canvases get a tall band to the right of it, so the
 * band never dominates a narrow screen.
 *
 * @param {Array<{id: any, arc_id?: any}>} disconnected
 * @param {{
 *   clusterBox: {x1:number, y1:number, x2:number, y2:number, w:number, h:number},
 *   aspect?: number,   // canvas width/height; <1 = portrait
 *   spacing?: number,  // model px between band nodes (>= node size 36)
 *   gap?: number,      // whitespace gap between cluster and band
 *   maxRows?: number,  // landscape: cap band height (fit under minZoom)
 *   maxCols?: number,  // portrait: cap band width
 * }} opts
 * @returns {Map<any, {x:number, y:number}>} id -> position
 */
export function placeDisconnectedBand(disconnected, { clusterBox, aspect = 16 / 9, spacing = 48, gap = 220, maxRows = null, maxCols = null } = {}) {
  const positions = new Map()
  const ordered = bandOrder(disconnected)
  const n = ordered.length
  if (n === 0 || !clusterBox) return positions

  const portrait = aspect < 1
  // Column count keeps the band roughly proportional to the canvas shape:
  // landscape -> wide shallow band; portrait -> narrow tall band. An
  // explicit row/col cap (derived from the viewport at minZoom) wins, so
  // the whole graph still fits when the fit-zoom is clamped.
  let cols = Math.max(1, Math.round(Math.sqrt(n * (portrait ? 0.6 : aspect * 0.9))))
  if (!portrait && Number.isFinite(maxRows) && maxRows >= 1) {
    cols = Math.max(cols, Math.ceil(n / Math.floor(maxRows)))
  }
  if (portrait && Number.isFinite(maxCols) && maxCols >= 1) {
    // Portrait band extends in x by ceil(n/cols) columns; cap its width.
    cols = Math.max(cols, Math.ceil(n / Math.floor(maxCols)))
  }

  ordered.forEach((node, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    if (portrait) {
      // Right side of the cluster, growing downward.
      positions.set(node.id, {
        x: clusterBox.x2 + gap + row * spacing,
        y: clusterBox.y1 + col * spacing,
      })
    } else {
      // Below the cluster, growing rightward, left-aligned with it.
      positions.set(node.id, {
        x: clusterBox.x1 + col * spacing,
        y: clusterBox.y2 + gap + row * spacing,
      })
    }
  })
  return positions
}
