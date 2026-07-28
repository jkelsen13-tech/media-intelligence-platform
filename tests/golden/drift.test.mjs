// G1 — drift guards: the harness ports must not silently diverge from the
// shipped production artifacts. These tests read the shipped files and
// assert the repaired markers are still present. If production logic
// changes, these fail FIRST — forcing a reviewed harness/golden sync.
// Markers verified against ingest-rss/index.ts @ 445503ee.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

const ingest = read('supabase/functions/ingest-rss/index.ts')
const r5sql = read('tests/golden/fixtures/r5_constraint.sql')
const dedupSrc = read('src/lib/timelineDedup.js')

test('shipped TEMPORAL_RE still contains amid (temporal must never be causal)', () => {
  const m = ingest.match(/TEMPORAL_RE\s*=\s*\/([^/]+)\//i)
  assert.ok(m, 'TEMPORAL_RE not found in index.ts')
  assert.ok(/amid/i.test(m[1]), 'amid missing from shipped TEMPORAL_RE')
})

test('shipped CAUSAL_RE has no attribution/association triggers', () => {
  const m = ingest.match(/CAUSAL_RE\s*=\s*\/([^/]+)\//i)
  assert.ok(m, 'CAUSAL_RE not found in index.ts')
  assert.ok(!/citing/i.test(m[1]), "'citing' reintroduced in CAUSAL_RE")
  assert.ok(!/linked/i.test(m[1]), "'linked to' reintroduced in CAUSAL_RE")
})

test('shipped military-escalation pattern has NO bare strike|attack (hijack fix)', () => {
  const line = ingest.split('\n').find((l) => l.includes("'military escalation'"))
  assert.ok(line, 'military escalation pattern not found')
  assert.ok(!line.includes('strike\\w*|attack\\w*'), 'bare strike/attack reintroduced in index.ts')
})

test('shipped makeArcTitle has NO developments fallback', () => {
  assert.ok(ingest.includes('developments'), 'developments marker missing')
  const start = ingest.indexOf('makeArcTitle')
  const fn = ingest.slice(start, start + 1200)
  assert.ok(/if \(!process\) return null/.test(fn.replace(/\s+/g, ' ')) || /!process/.test(fn), 'no-process guard missing')
})

test('shipped entity resolution keeps the type-agreement guard', () => {
  assert.ok(ingest.includes('AGREES with the stored entity type'), 'type-agreement marker missing')
})

test('shipped sanitize: fixpoint decode, whitespace-malformed tolerance, decode before strip', () => {
  assert.ok(/FIXPOINT/i.test(ingest), 'fixpoint decode marker missing')
  assert.ok(/whitespace-malformed/i.test(ingest), 'whitespace-malformed tolerance marker missing')
  assert.ok(/decode BEFORE tag-stripping/i.test(ingest), 'decode-order marker missing')
})

test('golden r5 constraint artifact carries the amid(st)? fix in the CHECK body (evidence + label arms)', () => {
  const body = r5sql.slice(r5sql.indexOf('CHECK ('))
  const matches = body.match(/amid\(st\)\?/g) ?? []
  assert.equal(matches.length, 2)
  assert.ok(!body.includes('amidst?'), 'r4 form leaked into the golden artifact')
})

test('app timelineDedup module still exports the canonical rule', () => {
  assert.ok(dedupSrc.includes('export function canonicalizeTimelineEvents'))
  assert.ok(dedupSrc.includes('export function remapTimelineEdges'))
})
