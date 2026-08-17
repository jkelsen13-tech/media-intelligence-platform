// Track B Step 2 item 3: desktop focused-subgraph default.
// Pins the resolveFocal contract App.jsx relies on:
//   - an explicit focus stack always wins (user navigation untouched)
//   - desktop with no stack and no opt-in gets the synthetic top-hub focus
//   - the full-graph opt-in (desktopShowAll) suppresses the synthetic focus
//   - mobile NEVER gets a synthetic focus (mobile entry = hub list; item 3
//     is desktop-only by scope)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveFocal } from '../src/lib/desktopFocus.js'

const hub = { id: 'hub-1', label: 'Top Hub' }

test('explicit focus stack always wins over the desktop default', () => {
  const stack = [{ kind: 'node', id: 'x', label: 'X' }]
  const focal = resolveFocal({ isMobile: false, desktopShowAll: false, focusStack: stack, topHub: hub })
  assert.equal(focal.id, 'x')
  assert.equal(focal.synthetic, undefined)
})

test('desktop with empty stack and no opt-in focuses the top hub (synthetic)', () => {
  const focal = resolveFocal({ isMobile: false, desktopShowAll: false, focusStack: [], topHub: hub })
  assert.equal(focal.kind, 'node')
  assert.equal(focal.id, 'hub-1')
  assert.equal(focal.label, 'Top Hub')
  assert.equal(focal.synthetic, true)
})

test('full-graph opt-in suppresses the synthetic focus', () => {
  const focal = resolveFocal({ isMobile: false, desktopShowAll: true, focusStack: [], topHub: hub })
  assert.equal(focal, null)
})

test('mobile never synthesizes a focus (mobile entry stays the hub list)', () => {
  const focal = resolveFocal({ isMobile: true, desktopShowAll: false, focusStack: [], topHub: hub })
  assert.equal(focal, null)
})

test('no hub available (empty graph) resolves null, not a broken crumb', () => {
  const focal = resolveFocal({ isMobile: false, desktopShowAll: false, focusStack: [], topHub: null })
  assert.equal(focal, null)
})

test('slug-keyed hubs fall back to slug for the focal id', () => {
  const focal = resolveFocal({
    isMobile: false,
    desktopShowAll: false,
    focusStack: [],
    topHub: { slug: 'hub-slug', label: 'Slug Hub' },
  })
  assert.equal(focal.id, 'hub-slug')
})
