// Package 1 item 3 (22_NOTE) — truthful action labels.
// A control that switches tabs in place must say so; navigation verbs
// ("View ... articles", "See ... connections") are reserved for controls
// that actually change the view.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const tlSrc = readFileSync(
  fileURLToPath(new URL('../src/views/TimelineView.jsx', import.meta.url)),
  'utf8',
)

// The footer-links block, isolated for behaviour assertions.
const footer = tlSrc.slice(tlSrc.indexOf('ep-tl-footerlinks'))
const footerBlock = footer.slice(0, footer.indexOf('</div>'))

test('item3: footer article link says Open Evidence', () => {
  assert.match(footerBlock, /Open Evidence \(/)
})

test('item3: footer connection link says Open Connections', () => {
  assert.match(footerBlock, /Open Connections \(/)
})

test('item3: footer links no longer use navigation verbs', () => {
  assert.doesNotMatch(footerBlock, /View \{?foot\.articles\}? related article/)
  assert.doesNotMatch(footerBlock, /See .*graph connection/)
})

test('item3: footer links only switch tabs — no cross-view navigation', () => {
  assert.doesNotMatch(footerBlock, /onOpen|setView|navigate/i)
  assert.match(footerBlock, /setActiveTab\('evidence'\)/)
  assert.match(footerBlock, /setActiveTab\('connections'\)/)
})

test('item3: live counts are preserved in the new labels (D6, never literals)', () => {
  assert.match(footerBlock, /\{foot\.articles\}/)
  assert.match(footerBlock, /foot\.connections/)
})
