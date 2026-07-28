// G1 — sanitization golden suite. Repaired logic must pass every golden
// case; each known-bug variant must fail at least one case (mutation proof).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { sanitize } from './harness/sanitize.mjs'

const fx = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'sanitization.json'), 'utf8'),
)

test('repaired sanitize() passes every golden case', () => {
  for (const c of fx.cases) {
    const out = sanitize(c.input)
    assert.equal(out.text, c.expect, `${c.name}: text mismatch`)
    if (c.expectImageUrl !== undefined) assert.equal(out.imageUrl, c.expectImageUrl, `${c.name}: imageUrl`)
    if (c.expectImageAlt !== undefined) assert.equal(out.imageAlt, c.expectImageAlt, `${c.name}: imageAlt`)
  }
})

test('mutation proof: entities deleted instead of decoded FAILS golden cases', () => {
  const failures = fx.cases.filter((c) => sanitize(c.input, { variant: 'delete-entities' }).text !== c.expect)
  assert.ok(failures.length >= 1, 'delete-entities variant was not caught')
  // and specifically corrupts the apostrophe cases:
  assert.notEqual(sanitize('Trump&rsquo;s vow', { variant: 'delete-entities' }).text, 'Trump’s vow')
})

test('mutation proof: single-pass decode leaves double-encoding FAILS', () => {
  const c = fx.cases.find((x) => x.name === 'double_encoded_apos')
  assert.notEqual(sanitize(c.input, { variant: 'single-pass' }).text, c.expect)
})

test('mutation proof: no half-strip repair FAILS', () => {
  const c = fx.cases.find((x) => x.name === 'half_stripped_apos')
  assert.notEqual(sanitize(c.input, { variant: 'no-halfstrip' }).text, c.expect)
})
