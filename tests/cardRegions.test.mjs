// Track B Step 2b: unit tests for the pure card/region seam
// (src/graph/cardRegions.js). Runs in node:test — no DOM, no cytoscape.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CARD_W,
  CARD_H,
  CARD_ZOOM_MIN,
  FOCAL_RELAX_ZOOM,
  LABEL_ZOOM,
  MAX_CARDS,
  REGION_META,
  regionOf,
  cardTypeInfo,
  cardName,
  convexHull,
  regionBoundaries,
  collapsedCounts,
  relaxCards,
  separateRegions,
  cardOverlaps,
  cardRegime,
} from '../src/graph/cardRegions.js'

// position() stub matching the cytoscape node interface relaxCards uses.
function stub(id, x, y) {
  return {
    id: () => id,
    position(p) {
      if (p) { this._p = p; return this }
      return this._p ?? { x, y }
    },
  }
}

test('regionOf maps the live type vocabulary onto mockup regions', () => {
  assert.equal(regionOf({ type: 'policy' }), 'policy_courts')
  assert.equal(regionOf({ type: 'event' }), 'incidents')
  assert.equal(regionOf({ type: 'actor', metadata: { entity_type: 'person' } }), 'civil_society')
  assert.equal(regionOf({ type: 'actor', metadata: { entity_type: 'organization' } }), 'reporting')
  assert.equal(regionOf({ type: 'actor' }), 'civil_society') // no metadata -> person side
  assert.equal(regionOf({ type: 'topic' }), null)
  assert.equal(regionOf(null), null)
})

// 2026-08-18 correction (owner-ruled): institution and other actors fit none
// of the four clusters — they must render UNGROUPED, never force-fit into
// Civil society (the "Middle East as Person in Civil society" defect).
test('regionOf: institution and other actors are ungrouped', () => {
  assert.equal(regionOf({ type: 'actor', metadata: { entity_type: 'institution' } }), null)
  assert.equal(regionOf({ type: 'actor', metadata: { entity_type: 'other' } }), null)
})

test('every region has a label and a functional color (accent-removal: label always present)', () => {
  for (const key of ['policy_courts', 'incidents', 'civil_society', 'reporting']) {
    assert.ok(REGION_META[key].label.length > 0)
    assert.ok(REGION_META[key].cssVar.startsWith('--cat-'))
  }
})

test('cardTypeInfo: shape carries type independently of color', () => {
  assert.deepEqual(cardTypeInfo({ type: 'event' }), { typeLabel: 'Incident / Event', icon: 'diamond' })
  assert.deepEqual(cardTypeInfo({ type: 'policy' }), { typeLabel: 'Policy', icon: 'document' })
  assert.deepEqual(cardTypeInfo({ type: 'actor', metadata: { entity_type: 'organization' } }), { typeLabel: 'Organization', icon: 'octagon' })
  assert.deepEqual(cardTypeInfo({ type: 'actor', metadata: { entity_type: 'person' } }), { typeLabel: 'Person', icon: 'circle' })
  assert.equal(cardTypeInfo(null).typeLabel, 'Unknown')
})

// 2026-08-18 correction: the actor branch reads entity_type honestly instead
// of the binary org/person mapping that labeled every institution and every
// geographic/other entity "Person". Missing metadata keeps the Person default.
test('cardTypeInfo: institution and other actors get honest labels', () => {
  assert.deepEqual(cardTypeInfo({ type: 'actor', metadata: { entity_type: 'institution' } }), { typeLabel: 'Institution', icon: 'octagon' })
  assert.deepEqual(cardTypeInfo({ type: 'actor', metadata: { entity_type: 'other' } }), { typeLabel: 'Other', icon: 'circle' })
  assert.deepEqual(cardTypeInfo({ type: 'actor' }), { typeLabel: 'Person', icon: 'circle' })
})

test('cardName truncates at the carried-forward 40-char policy', () => {
  assert.equal(cardName('short'), 'short')
  const long = 'x'.repeat(60)
  const out = cardName(long)
  assert.ok(out.endsWith('…'))
  assert.ok(out.length <= 40)
})

test('convexHull encloses all points', () => {
  const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 5, y: 5 }]
  const hull = convexHull(pts)
  assert.equal(hull.length, 4) // interior point excluded
})

test('regionBoundaries: one boundary per meaningful cluster, never per node', () => {
  const members = [
    { id: 'a', x: 0, y: 0, region: 'incidents' },
    { id: 'b', x: 200, y: 0, region: 'incidents' },
    { id: 'c', x: 0, y: 200, region: 'incidents' },
    { id: 'solo', x: 900, y: 900, region: 'reporting' }, // single member: no boundary
  ]
  const out = regionBoundaries(members)
  assert.equal(out.length, 1)
  assert.equal(out[0].region, 'incidents')
  assert.equal(out[0].memberCount, 3)
  // Hull pads the card boxes, not just the center points.
  const minX = Math.min(...out[0].points.map((p) => p.x))
  assert.ok(minX <= -CARD_W / 2 - 40 + 1)
})

test('collapsedCounts: +N badge counts full-graph members not shown', () => {
  const all = [
    { id: '1', type: 'event' }, { id: '2', type: 'event' }, { id: '3', type: 'event' },
    { id: '4', type: 'policy' }, { id: '5', type: 'policy' },
  ]
  const counts = collapsedCounts(all, new Set(['1', '4']))
  assert.equal(counts.get('incidents'), 2)
  assert.equal(counts.get('policy_courts'), 1)
  assert.ok(!counts.has('reporting'))
})

test('relaxCards separates an overlapping pair to zero overlaps', () => {
  const nodes = [stub('a', 0, 0), stub('b', 50, 20)]
  assert.equal(cardOverlaps(nodes), 1)
  const r = relaxCards(nodes)
  assert.equal(r.converged, true)
  assert.equal(cardOverlaps(nodes), 0)
})

test('relaxCards converges on a dense cluster and is deterministic', () => {
  const mk = () => {
    const arr = []
    for (let i = 0; i < 20; i++) arr.push(stub('n' + i, (i % 5) * 60, Math.floor(i / 5) * 30))
    return arr
  }
  const a = mk()
  const b = mk()
  const ra = relaxCards(a)
  const rb = relaxCards(b)
  assert.equal(ra.converged, true)
  assert.equal(cardOverlaps(a), 0)
  assert.deepEqual(a.map((n) => n.position()), b.map((n) => n.position()))
  assert.deepEqual(ra, rb)
})

test('cardRegime: compact below card zoom, cards at reading zoom, focal scope at max zoom', () => {
  assert.equal(LABEL_ZOOM, 0.6) // shipped label policy, pinned
  assert.deepEqual(cardRegime(0.4), { regime: 'compact', relaxScope: 'none' })
  assert.deepEqual(cardRegime(0.8), { regime: 'compact', relaxScope: 'none' })
  assert.deepEqual(cardRegime(CARD_ZOOM_MIN), { regime: 'cards', relaxScope: 'visible' })
  assert.deepEqual(cardRegime(FOCAL_RELAX_ZOOM), { regime: 'cards', relaxScope: 'focal' })
  assert.ok(MAX_CARDS >= 100)
})

test('separateRegions drives interleaved region groups to hull purity', () => {
  // Two regions tightly interleaved (worst case from the live depth-2
  // default: 18 incidents with 2 civil-society nodes sitting inside).
  const nodes = []
  for (let i = 0; i < 9; i++) nodes.push({ id: 'e' + i, _p: { x: (i % 3) * 200, y: Math.floor(i / 3) * 140 }, type: 'event' })
  nodes.push({ id: 'p1', _p: { x: 250, y: 130 }, type: 'actor', metadata: { entity_type: 'person' } })
  nodes.push({ id: 'p2', _p: { x: 350, y: 150 }, type: 'actor', metadata: { entity_type: 'person' } })
  const arr = nodes.map((n) => ({
    data: () => n,
    position(p) { if (p) { n._p = p; return this } return n._p },
  }))
  const r = separateRegions(arr)
  assert.equal(r.converged, true)
  // After separation, no region's padded bbox contains a foreign center.
  const byReg = new Map()
  arr.forEach((n) => {
    const reg = regionOf(n.data())
    if (!byReg.has(reg)) byReg.set(reg, [])
    byReg.get(reg).push(n.position())
  })
  for (const [ri, ps] of byReg) {
    const box = {
      x1: Math.min(...ps.map((p) => p.x)) - CARD_W / 2 - 40,
      x2: Math.max(...ps.map((p) => p.x)) + CARD_W / 2 + 40,
      y1: Math.min(...ps.map((p) => p.y)) - CARD_H / 2 - 40,
      y2: Math.max(...ps.map((p) => p.y)) + CARD_H / 2 + 40,
    }
    for (const [rj, qs] of byReg) {
      if (ri === rj) continue
      for (const q of qs) {
        assert.ok(!(q.x > box.x1 && q.x < box.x2 && q.y > box.y1 && q.y < box.y2), `${rj} node inside ${ri} region`)
      }
    }
  }
})
