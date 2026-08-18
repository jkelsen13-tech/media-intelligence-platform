// Package 1 item 2 (22_NOTE) — navigation contract pins.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  NAV_VIEWS,
  NAV_TARGET_KEYS,
  navTarget,
  coerceTimelineTarget,
  resolveTimelineJump,
} from '../src/lib/navigationContract.js'

const appSrc = readFileSync(
  fileURLToPath(new URL('../src/App.jsx', import.meta.url)),
  'utf8',
)

test('item2: contract covers exactly the four core views plus compare', () => {
  assert.deepEqual([...NAV_VIEWS].sort(), ['arcs', 'compare', 'graph', 'news', 'timeline'])
})

test('item2: target vocabulary is arcId/eventKey/nodeId/relationshipId/articleId', () => {
  assert.deepEqual(
    [...NAV_TARGET_KEYS].sort(),
    ['arcId', 'articleId', 'eventKey', 'nodeId', 'relationshipId'],
  )
})

test('item2: navTarget freezes a normalized shape and drops unknown keys', () => {
  const t = navTarget({ view: 'graph', nodeId: 'n1', bogus: 'x' })
  assert.equal(t.nodeId, 'n1')
  assert.equal(t.arcId, null)
  assert.equal('bogus' in t, false)
  assert.ok(Object.isFrozen(t))
})

test('item2: navTarget refuses an unknown view', () => {
  assert.equal(navTarget({ view: 'settings' }), null)
})

// THE named Three-Screen Review finding: News → Timeline must land on the
// originating arc/event, not the global timeline.
test('item2: return-to-origin — article with an arc lands on that arc', () => {
  const r = resolveTimelineJump({ arcId: 'arc-7', eventKey: 'a1b2c3d4' })
  assert.deepEqual(r, { scope: 'arc', arcId: 'arc-7', eventKey: 'a1b2c3d4' })
})

test('item2: return-to-origin — arc alone is enough (no event key needed)', () => {
  const r = resolveTimelineJump({ arcId: 'arc-7' })
  assert.deepEqual(r, { scope: 'arc', arcId: 'arc-7', eventKey: null })
})

test('item2: article with no arc falls back to global scope, declared', () => {
  const r = resolveTimelineJump({ eventKey: 'a1b2c3d4' })
  assert.deepEqual(r, { scope: 'global', arcId: null, eventKey: 'a1b2c3d4' })
})

test('item2: no known target → no jump', () => {
  assert.equal(resolveTimelineJump({}), null)
  assert.equal(resolveTimelineJump(null), null)
  assert.equal(resolveTimelineJump(undefined), null)
})

test('item2: legacy bare-string eventKey still resolves (global fallback)', () => {
  assert.deepEqual(coerceTimelineTarget('a1b2c3d4'), navTarget({ view: 'timeline', eventKey: 'a1b2c3d4' }))
  assert.deepEqual(resolveTimelineJump('a1b2c3d4'), { scope: 'global', arcId: null, eventKey: 'a1b2c3d4' })
})

test('item2: App wires the timeline jump through the contract resolver', () => {
  assert.match(appSrc, /resolveTimelineJump\(/)
  assert.match(appSrc, /from '\.\/lib\/navigationContract'/)
})

test('item2: App passes the resolved arc scope into TimelineView', () => {
  assert.match(appSrc, /focusArcKey=\{/)
})
