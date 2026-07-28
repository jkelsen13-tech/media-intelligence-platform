// G1 — cleanup golden suite: probe/fixture/backfill rows must be detected;
// clean production-shaped rows (including journalism 'probe') must pass.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { isProbeRow } from './harness/cleanup.mjs'

const fx = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'cleanup.json'), 'utf8'),
)

test('all probe/fixture rows are flagged', () => {
  for (const r of fx.probeRows) {
    assert.equal(isProbeRow(r), true, `not flagged: ${r.label ?? r.slug}`)
  }
})

test('clean production rows pass (journalism probe is not a gate probe)', () => {
  for (const r of fx.cleanRows) {
    assert.equal(isProbeRow(r), false, `wrongly flagged: ${r.label ?? r.slug}`)
  }
})

test('mutation proof: bare-probe regex over-flags the journalism headline', () => {
  const journalism = fx.cleanRows.find((r) => r.note?.includes('journalism'))
  assert.equal(isProbeRow(journalism, { variant: 'bare-probe-regex' }), true)
  assert.equal(isProbeRow(journalism), false)
})
