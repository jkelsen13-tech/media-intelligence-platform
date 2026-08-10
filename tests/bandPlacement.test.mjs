import test from 'node:test'
import assert from 'node:assert/strict'
import {
  splitByConnectivity,
  bandOrder,
  placeDisconnectedBand,
} from '../src/graph/bandPlacement.js'

const N = (id, arc_id = null) => ({ id, arc_id })

test('splitByConnectivity: zero-degree nodes are disconnected', () => {
  const nodes = [N('a'), N('b'), N('c'), N('d')]
  const edges = [{ source: 'a', target: 'b' }]
  const { connected, disconnected } = splitByConnectivity(nodes, edges)
  assert.deepEqual(connected.map((n) => n.id).sort(), ['a', 'b'])
  assert.deepEqual(disconnected.map((n) => n.id).sort(), ['c', 'd'])
})

test('splitByConnectivity: self-loop counts as connected; empty edges = all disconnected', () => {
  const { connected, disconnected } = splitByConnectivity([N('a'), N('b')], [])
  assert.equal(connected.length, 0)
  assert.equal(disconnected.length, 2)
})

test('bandOrder: arc-members come before arc-less nodes', () => {
  const ordered = bandOrder([N('x'), N('y', 'arc1'), N('z', 'arc2'), N('w')])
  const ids = ordered.map((n) => n.id)
  assert.ok(ids.indexOf('y') < 2 && ids.indexOf('z') < 2, 'arc members first')
  assert.ok(ids.indexOf('x') >= 2 && ids.indexOf('w') >= 2, 'arc-less last')
})

test('bandOrder: same-arc nodes are adjacent (hue grouping)', () => {
  const nodes = [N('p', 'arcA'), N('q', 'arcB'), N('r', 'arcA'), N('s', 'arcB')]
  const ordered = bandOrder(nodes)
  const arcs = ordered.map((n) => n.arc_id)
  // each arc's members must form a contiguous run
  for (const arc of ['arcA', 'arcB']) {
    const idxs = arcs.flatMap((a, i) => (a === arc ? [i] : []))
    assert.equal(Math.max(...idxs) - Math.min(...idxs), idxs.length - 1, arc + ' contiguous')
  }
})

test('bandOrder: deterministic regardless of input order', () => {
  const nodes = [N('a', 'x'), N('b'), N('c', 'y'), N('d'), N('e', 'x')]
  const shuffled = [N('e', 'x'), N('d'), N('c', 'y'), N('b'), N('a', 'x')]
  assert.deepEqual(
    bandOrder(nodes).map((n) => n.id),
    bandOrder(shuffled).map((n) => n.id),
  )
})

const BOX = { x1: 0, y1: 0, x2: 1000, y2: 600, w: 1000, h: 600 }

test('placeDisconnectedBand: landscape places band below the cluster with a whitespace gap', () => {
  const nodes = Array.from({ length: 30 }, (_, i) => N('n' + i))
  const pos = placeDisconnectedBand(nodes, { clusterBox: BOX, aspect: 16 / 9 })
  assert.equal(pos.size, 30)
  for (const [, p] of pos) {
    assert.ok(p.y >= BOX.y2 + 220, 'below cluster + gap')
  }
})

test('placeDisconnectedBand: portrait places band to the right of the cluster', () => {
  const nodes = Array.from({ length: 30 }, (_, i) => N('n' + i))
  const pos = placeDisconnectedBand(nodes, { clusterBox: BOX, aspect: 0.5 })
  for (const [, p] of pos) {
    assert.ok(p.x >= BOX.x2 + 220, 'right of cluster + gap')
  }
})

test('placeDisconnectedBand: grid spacing respected (no two nodes closer than spacing)', () => {
  const nodes = Array.from({ length: 50 }, (_, i) => N('n' + i))
  const spacing = 48
  const pos = [...placeDisconnectedBand(nodes, { clusterBox: BOX, aspect: 16 / 9, spacing }).values()]
  for (let i = 0; i < pos.length; i++) {
    for (let j = i + 1; j < pos.length; j++) {
      const d = Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y)
      assert.ok(d >= spacing - 1e-9, `nodes ${i},${j} too close: ${d}`)
    }
  }
})

test('placeDisconnectedBand: deterministic output for identical input', () => {
  const nodes = Array.from({ length: 20 }, (_, i) => N('n' + i, i % 3 === 0 ? 'arc' + (i % 2) : null))
  const a = placeDisconnectedBand(nodes, { clusterBox: BOX, aspect: 16 / 9 })
  const b = placeDisconnectedBand([...nodes].reverse(), { clusterBox: BOX, aspect: 16 / 9 })
  assert.deepEqual([...a.entries()], [...b.entries()])
})

test('placeDisconnectedBand: empty input or missing box returns empty map', () => {
  assert.equal(placeDisconnectedBand([], { clusterBox: BOX }).size, 0)
  assert.equal(placeDisconnectedBand([N('a')], {}).size, 0)
})

test('placeDisconnectedBand: maxRows caps landscape band height', () => {
  const nodes = Array.from({ length: 252 }, (_, i) => N('n' + i))
  const pos = [...placeDisconnectedBand(nodes, { clusterBox: BOX, aspect: 16 / 9, maxRows: 4 }).values()]
  const minY = Math.min(...pos.map((p) => p.y))
  const maxY = Math.max(...pos.map((p) => p.y))
  assert.ok(maxY - minY <= 3 * 48, `band taller than 4 rows: ${maxY - minY}`)
})

test('placeDisconnectedBand: maxCols caps portrait band width', () => {
  const nodes = Array.from({ length: 252 }, (_, i) => N('n' + i))
  const pos = [...placeDisconnectedBand(nodes, { clusterBox: BOX, aspect: 0.5, maxCols: 5 }).values()]
  const minX = Math.min(...pos.map((p) => p.x))
  const maxX = Math.max(...pos.map((p) => p.x))
  assert.ok(maxX - minX <= 4 * 48, `band wider than 5 cols: ${maxX - minX}`)
})
