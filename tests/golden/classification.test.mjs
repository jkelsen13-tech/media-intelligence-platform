// G1 — classification golden suite: category rubric, floor behavior,
// process identification (incl. the military-escalation hijack hard case),
// and the no-process/no-arc rule. Mutation proofs included.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { classifyArc, applyFloor, findProcess, makeArcTitle } from './harness/classify.mjs'

const fx = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'classification.json'), 'utf8'),
)

test('golden categories classify correctly', () => {
  for (const c of fx.categoryCases) {
    const r = classifyArc(c.text)
    assert.equal(r.category, c.expectCategory, `${c.name}: got ${r.category} (${r.confidence.toFixed(2)})`)
    if (c.expectConfidenceMax !== undefined) {
      assert.ok(r.confidence <= c.expectConfidenceMax, `${c.name}: confidence ${r.confidence} > ${c.expectConfidenceMax}`)
    }
    if (c.expectAfterFloor) {
      const floored = applyFloor(r, c.floor)
      assert.equal(floored.category, c.expectAfterFloor, `${c.name}: after floor`)
    }
  }
})

test('golden processes identify correctly (incl. trade-war hard case)', () => {
  for (const c of fx.processCases) {
    const p = findProcess(c.text)
    assert.equal(p, c.expectProcess, `${c.name}: got ${p}`)
    if (c.expectTitle === null) {
      assert.equal(makeArcTitle('Actor', p), null, `${c.name}: no process must yield NO arc`)
    }
  }
})

test('arc titles: possessive stripped, unattributed fallback, never "developments"', () => {
  for (const c of fx.titleCases) {
    assert.equal(makeArcTitle(c.actor, c.process), c.expectTitle)
  }
  assert.ok(!JSON.stringify(fx).includes('"expectTitle": "developments"'))
})

test('mutation proof: bare-strike military hijack FAILS the trade-war case', () => {
  const c = fx.processCases.find((x) => x.name === 'trade_war_not_hijacked')
  const hijacked = findProcess(c.text, { variant: 'military-hijack' })
  assert.notEqual(hijacked, c.expectProcess, 'military-hijack variant was not caught')
  assert.equal(hijacked, 'military escalation')
})

test('mutation proof: developments fallback produces placeholder arcs', () => {
  const c = fx.processCases.find((x) => x.name === 'no_process_no_arc')
  const title = makeArcTitle('Actor', findProcess(c.text), { variant: 'developments-fallback' })
  assert.match(title, /developments/, 'developments-fallback variant was not caught')
  // repaired path yields NO arc for the same input:
  assert.equal(makeArcTitle('Actor', findProcess(c.text)), null)
})

test('mutation proof: no-floor over-labels weak evidence', () => {
  const c = fx.categoryCases.find((x) => x.name === 'weak_signal_below_floor')
  const r = classifyArc(c.text)
  const buggy = applyFloor(r, c.floor, { variant: 'no-floor' })
  assert.notEqual(buggy.category, c.expectAfterFloor, 'no-floor variant was not caught')
})
