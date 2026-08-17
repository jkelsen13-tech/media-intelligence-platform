// Track B Step 2 item 4 (2026-08-17): plain-language edge labels.
// The causal-vs-sequence distinction must read from WORDS, not from
// line style or color alone: causal claims one event LED TO another;
// sequence claims temporal order only (the source happened before the
// target — explicitly no causation). Every EDGE_TYPES entry carries a
// `plain` verb phrase, and edgePlainLabel() resolves the phrase shown
// on the canvas, in the relationship list, in both timeline views, and
// in the evidence popover.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EDGE_TYPES, edgePlainLabel } from '../src/graph/theme.js'

test('every edge type carries a plain-language phrase', () => {
  for (const [key, meta] of Object.entries(EDGE_TYPES)) {
    assert.equal(typeof meta.plain, 'string', `${key} missing plain phrase`)
    assert.ok(meta.plain.length > 0, `${key} plain phrase empty`)
  }
})

test('causal reads as a causation claim', () => {
  assert.equal(edgePlainLabel({ type: 'causal', label: 'causal: after' }), 'led to')
  assert.equal(edgePlainLabel({ type: 'causal' }), 'led to')
})

test('sequence reads as temporal order only, never as causation', () => {
  for (const raw of ['sequence: after', 'sequence: amid', 'sequence: cited development in arc']) {
    const phrase = edgePlainLabel({ type: 'sequence', label: raw })
    assert.equal(phrase, 'happened before')
    assert.ok(!/led to|caused/i.test(phrase), `sequence phrase implies causation: ${phrase}`)
  }
  assert.equal(edgePlainLabel({ type: 'sequence' }), 'happened before')
})

test('causal and sequence phrases differ from each other', () => {
  assert.notEqual(
    edgePlainLabel({ type: 'causal' }),
    edgePlainLabel({ type: 'sequence' }),
  )
})

test('live vocabulary phrases', () => {
  assert.equal(edgePlainLabel({ type: 'actor', label: 'involves' }), 'involves')
  assert.equal(
    edgePlainLabel({ type: 'constrained_by', label: 'constrained_by: policy cited in article' }),
    'constrained by',
  )
})

test('unknown type falls back to a humanized raw label, then the type key', () => {
  assert.equal(edgePlainLabel({ type: 'mystery', label: 'mystery: some detail' }), 'some detail')
  assert.equal(edgePlainLabel({ type: 'mystery' }), 'mystery')
})

test('empty input is safe', () => {
  assert.equal(edgePlainLabel(null), '')
  assert.equal(edgePlainLabel({}), '')
})
