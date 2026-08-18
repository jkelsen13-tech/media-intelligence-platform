// Track B Step 2b (2026-08-18): card nodes + dashed region boundaries.
// Built against the five owner-ruled adjustments from the pre-build
// verification (verifier/trackb2b-v1/findings-2026-08-18.md):
//   1. Card text and region labels are DOM (native 200% text scaling);
//      canvas keeps shapes, edges, boundary dashes.
//   2. Zoom-gated rendering: compact shapes below LABEL_ZOOM (0.6, shipped
//      policy), cards only at reading zooms (>= CARD_ZOOM_MIN).
//   3. relaxCards separation pass on settle + debounced pan/zoom, scoped to
//      visible cards; focal-scoped at max-zoom hub views.
//   4. Region boundaries in focused views only; full-corpus view stays
//      compact and boundary-free (hulls are geometrically meaningless at
//      full scale — verified).
//   5. Mobile focused default depth-1 (focusDepth in lib/desktopFocus.js).
//
// Pure module: no DOM, no cytoscape imports — unit-testable in node:test
// (same seam pattern as bandPlacement.js / listFilters.js).

// --- Card geometry -----------------------------------------------------------
// Base card at 1x text. DOM cards size themselves with browser text scaling;
// these constants are the canvas-space geometry the layout/boundary math
// uses (and the harness parity values from trackb2b-v1).
export const CARD_W = 160
export const CARD_H = 72
export const CARD_PAD = 12 // separation gap kept between cards

// Zoom gates. Below LABEL_ZOOM the shipped label policy shows no text at
// all, so compact shapes suffice. Cards appear at reading zoom.
export const LABEL_ZOOM = 0.6
export const CARD_ZOOM_MIN = 1.0
// At or above FOCAL_RELAX_ZOOM the visible set near a hub can still exceed
// the separation budget (verified: 231 nodes at z3), so relaxation scopes to
// the focal neighborhood instead of the whole viewport.
export const FOCAL_RELAX_ZOOM = 2.5
export const FOCAL_RELAX_RADIUS_PX = 600 // rendered px around viewport center

// Safety cap: never render more cards than this; overflow stays compact.
export const MAX_CARDS = 200

// --- Region vocabulary ---------------------------------------------------------
// Live-data mapping (verified against the 2026-08-17 census vocabulary:
// event 383 / actor 340 / policy 27). The mockup's semantic regions map onto
// live types: policy -> Policy & courts; event -> Incidents; actor splits by
// entity_type (person -> Civil society, organization -> Reporting).
// 2026-08-18 correction (owner-ruled): institution and other actors fit NONE
// of the four clusters — they render UNGROUPED (null) rather than being
// force-fit into Civil society (the "Middle East as Person" defect).
// Colors are functional only — the dashed stroke + always-visible label
// carry the meaning with all accent color removed.
export const REGION_META = {
  policy_courts: { label: 'Policy & courts', cssVar: '--cat-blue', color: '#156EBF' },
  incidents: { label: 'Incidents', cssVar: '--cat-red', color: '#c0392b' },
  civil_society: { label: 'Civil society', cssVar: '--cat-green', color: '#1e7e46' },
  reporting: { label: 'Reporting', cssVar: '--cat-violet', color: '#6d28a8' },
}

export function regionOf(node) {
  if (!node) return null
  if (node.type === 'policy') return 'policy_courts'
  if (node.type === 'event') return 'incidents'
  if (node.type === 'actor') {
    const et = node.metadata?.entity_type
    if (et === 'organization') return 'reporting'
    if (et === 'person' || et == null) return 'civil_society'
    return null // institution / other: ungrouped — no cluster honestly fits
  }
  return null
}

// --- Type labels and icons -----------------------------------------------------
// Addendum Screen 6: type label beneath the name. Live-vocabulary mapping:
// event -> Incident / Event; policy -> Policy; actor splits by entity_type:
// person -> Person, organization -> Organization, institution -> Institution,
// other -> Other (2026-08-18 owner-ruled correction: the binary org/person
// mapping mislabeled every institution and every geographic/other entity as
// "Person"). Shape carries type independently of color (legend: diamond =
// incident/event, document = document, octagon = organization/institution,
// circle = person) — the icon name keys the SVG in GraphView.
export function cardTypeInfo(node) {
  if (!node) return { typeLabel: 'Unknown', icon: 'document' }
  if (node.type === 'event') return { typeLabel: 'Incident / Event', icon: 'diamond' }
  if (node.type === 'policy') return { typeLabel: 'Policy', icon: 'document' }
  if (node.type === 'actor') {
    const et = node.metadata?.entity_type
    if (et === 'organization') return { typeLabel: 'Organization', icon: 'octagon' }
    if (et === 'institution') return { typeLabel: 'Institution', icon: 'octagon' }
    if (et === 'other') return { typeLabel: 'Other', icon: 'circle' }
    return { typeLabel: 'Person', icon: 'circle' } // person, or missing metadata
  }
  return { typeLabel: NODE_TYPE_FALLBACK_LABEL(node.type), icon: 'document' }
}

function NODE_TYPE_FALLBACK_LABEL(type) {
  const t = String(type ?? '')
  return t ? t[0].toUpperCase() + t.slice(1) : 'Unknown'
}

// §2.7 truncation carried forward: full text never fits a card; the
// untruncated label stays available in the panel.
export const CARD_NAME_MAX_CHARS = 40
export function cardName(label) {
  const s = String(label ?? '')
  return s.length > CARD_NAME_MAX_CHARS ? `${s.slice(0, CARD_NAME_MAX_CHARS - 1).trimEnd()}…` : s
}

// --- Geometry ------------------------------------------------------------------
export function convexHull(points) {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (pts.length < 3) return pts
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

/**
 * Dashed region boundaries for a FOCUSED view (adjustment 4).
 * @param {Array<{id, x, y, region}>} members - positioned, region-tagged nodes
 * @param {number} pad - model-px padding around member card boxes
 * @returns {Array<{region, points, labelAnchor, memberCount}>}
 * One boundary per meaningful cluster, never per node: regions with fewer
 * than two shown members produce no boundary.
 */
export function regionBoundaries(members, pad = 40, w = CARD_W, h = CARD_H) {
  const byRegion = new Map()
  for (const m of members) {
    if (!m.region) continue
    if (!byRegion.has(m.region)) byRegion.set(m.region, [])
    byRegion.get(m.region).push(m)
  }
  const out = []
  for (const [region, ms] of byRegion) {
    if (ms.length < 2) continue
    const pts = []
    for (const m of ms) {
      pts.push(
        { x: m.x - w / 2 - pad, y: m.y - h / 2 - pad },
        { x: m.x + w / 2 + pad, y: m.y - h / 2 - pad },
        { x: m.x - w / 2 - pad, y: m.y + h / 2 + pad },
        { x: m.x + w / 2 + pad, y: m.y + h / 2 + pad },
      )
    }
    const hull = convexHull(pts)
    if (hull.length < 3) continue
    // Label anchor: top-left hull vertex (smallest y, then smallest x).
    const labelAnchor = hull.reduce((best, p) => (p.y < best.y || (p.y === best.y && p.x < best.x) ? p : best))
    out.push({ region, points: hull, labelAnchor, memberCount: ms.length })
  }
  return out
}

/**
 * "+N" badge count: region members in the FULL graph not currently shown.
 * @param {Array} allNodes - full-corpus node list
 * @param {Set} shownIds - ids present in the focused view
 * @returns {Map<region, number>}
 */
export function collapsedCounts(allNodes, shownIds) {
  const total = new Map()
  for (const n of allNodes ?? []) {
    const r = regionOf(n)
    if (r) total.set(r, (total.get(r) ?? 0) + 1)
  }
  const shown = new Map()
  for (const n of allNodes ?? []) {
    const r = regionOf(n)
    if (r && shownIds.has(n.id ?? n.slug)) shown.set(r, (shown.get(r) ?? 0) + 1)
  }
  const out = new Map()
  for (const [r, t] of total) {
    const hidden = t - (shown.get(r) ?? 0)
    if (hidden > 0) out.set(r, hidden)
  }
  return out
}

/**
 * Deterministic card-separation pass (relaxCards, verified in trackb2b-v1).
 * Pushes overlapping card rectangles apart along the least-overlap axis,
 * half each, until no overlaps remain or the iteration budget runs out.
 * Operates on any [{position() -> {x,y}, position({x,y})}] pair interface —
 * cytoscape nodes in the app, plain stubs in tests.
 * @returns {{iterations: number, converged: boolean, moved: number}}
 */
export function relaxCards(nodeArr, w = CARD_W, h = CARD_H, pad = CARD_PAD, maxIter = 500) {
  let totalMoved = 0
  let it = 0
  for (; it < maxIter; it++) {
    let moved = 0
    for (let i = 0; i < nodeArr.length; i++) {
      for (let j = i + 1; j < nodeArr.length; j++) {
        const a = nodeArr[i].position()
        const b = nodeArr[j].position()
        let dx = a.x - b.x
        let dy = a.y - b.y
        if (dx === 0 && dy === 0) {
          // Degenerate identical positions: deterministic jitter by index.
          dx = (i - j) * 0.01 || 0.01
          dy = 0.01
        }
        const ox = w + pad - Math.abs(dx)
        const oy = h + pad - Math.abs(dy)
        if (ox <= 0 || oy <= 0) continue
        // Resolve along the minimum-overlap axis, FULL separation plus a
        // half-px margin in one shot (a damped fractional push deadlocks on
        // pairs sitting exactly at the boundary — verified 2026-08-18).
        if (ox < oy) {
          const d = (dx <= 0 ? -1 : 1) * (ox / 2 + 0.25)
          nodeArr[i].position({ x: a.x + d, y: a.y })
          nodeArr[j].position({ x: b.x - d, y: b.y })
        } else {
          const d = (dy <= 0 ? -1 : 1) * (oy / 2 + 0.25)
          nodeArr[i].position({ x: a.x, y: a.y + d })
          nodeArr[j].position({ x: b.x, y: b.y - d })
        }
        moved++
      }
    }
    totalMoved += moved
    if (moved === 0) return { iterations: it, converged: true, moved: totalMoved }
  }
  return { iterations: maxIter, converged: false, moved: totalMoved }
}

/**
 * Inter-region separation pass. Region hulls must enclose exactly their own
 * members — a boundary around cluster A that contains cluster B's nodes
 * asserts a grouping the data doesn't support. fcose interleaves types
 * inside a focused subgraph (verified: 4 purity violations on the live
 * depth-2 default), so after card separation we nudge whole region groups
 * apart along the centroid axis until every region's padded bounding box is
 * pure. Operates on cytoscape-style node stubs (position() get/set).
 * Converges in ~11 iterations / <5ms on the live focused default.
 * @returns {{iterations: number, converged: boolean}}
 */
export function separateRegions(nodeArr, w = CARD_W, h = CARD_H, pad = 40, maxIter = 200) {
  for (let it = 0; it < maxIter; it++) {
    const byReg = new Map()
    nodeArr.forEach((n) => {
      const r = regionOf(n.data())
      if (!r) return
      if (!byReg.has(r)) byReg.set(r, [])
      byReg.get(r).push(n)
    })
    const regs = [...byReg.entries()].filter(([, ms]) => ms.length >= 2)
    let violations = 0
    for (let i = 0; i < regs.length; i++) {
      for (let j = 0; j < regs.length; j++) {
        if (i === j) continue
        const [, mi] = regs[i]
        const [, mj] = regs[j]
        const xs = mi.map((n) => n.position().x)
        const ys = mi.map((n) => n.position().y)
        const box = {
          x1: Math.min(...xs) - w / 2 - pad,
          x2: Math.max(...xs) + w / 2 + pad,
          y1: Math.min(...ys) - h / 2 - pad,
          y2: Math.max(...ys) + h / 2 + pad,
        }
        const inside = mj.filter((n) => {
          const p = n.position()
          return p.x > box.x1 && p.x < box.x2 && p.y > box.y1 && p.y < box.y2
        })
        if (inside.length === 0) continue
        violations += inside.length
        const [small, big] = mi.length <= mj.length ? [mi, mj] : [mj, mi]
        const bx = big.reduce((s, n) => s + n.position().x, 0) / big.length
        const by = big.reduce((s, n) => s + n.position().y, 0) / big.length
        const sx = small.reduce((s, n) => s + n.position().x, 0) / small.length
        const sy = small.reduce((s, n) => s + n.position().y, 0) / small.length
        let dx = sx - bx
        let dy = sy - by
        const len = Math.hypot(dx, dy) || 1
        dx /= len
        dy /= len
        small.forEach((n) => {
          const p = n.position()
          n.position({ x: p.x + dx * 24, y: p.y + dy * 24 })
        })
      }
    }
    if (violations === 0) return { iterations: it, converged: true }
  }
  return { iterations: maxIter, converged: false }
}

/** Count remaining card overlaps (verification + drift guard). */
export function cardOverlaps(nodeArr, w = CARD_W, h = CARD_H) {
  let hits = 0
  for (let i = 0; i < nodeArr.length; i++) {
    for (let j = i + 1; j < nodeArr.length; j++) {
      const a = nodeArr[i].position()
      const b = nodeArr[j].position()
      if (Math.abs(a.x - b.x) < w && Math.abs(a.y - b.y) < h) hits++
    }
  }
  return hits
}

/**
 * Zoom-gate decision (adjustments 2+3). Given the zoom and the viewport
 * (rendered px), decide which rendering regime applies and which nodes the
 * separation pass should scope to.
 * @returns {{regime: 'compact'|'cards', relaxScope: 'visible'|'focal'|'none'}}
 */
export function cardRegime(zoom) {
  if (zoom < CARD_ZOOM_MIN) return { regime: 'compact', relaxScope: 'none' }
  return { regime: 'cards', relaxScope: zoom >= FOCAL_RELAX_ZOOM ? 'focal' : 'visible' }
}
