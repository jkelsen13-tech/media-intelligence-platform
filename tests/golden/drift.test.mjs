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
import { guardAllows, R5_TEMPORAL_ALTERNATION, R4_TEMPORAL_ALTERNATION } from './harness/causal.mjs'

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

// --- Strengthened r5 fixture guards (2026-08-10, incident session) ---
// The pre-repair fixture passed the marker check above while its CHECK body
// matched nothing ever deployed. These guards cover the FULL phrase space
// and structural facts, so any future drift in any branch fails here first.

test('golden r5 fixture is structurally the deployed form (source column, operators, terminator)', () => {
  const body = r5sql.slice(r5sql.indexOf('CHECK ('))
  assert.ok(body.includes("metadata ->> 'evidence'"), 'fixture must read evidence from metadata (edges has no bare evidence column)')
  assert.ok(!/COALESCE\(evidence/i.test(body), 'bare evidence column reintroduced')
  assert.ok(!body.includes('~*'), 'case-insensitive operator reintroduced (deployed form lowercases then uses ~)')
  assert.ok(!body.includes('\\b'), 'word-boundary \\b reintroduced (PG ARE: backspace, not a boundary)')
  assert.ok(body.includes('(\\s|$)'), 'deployed (\\s|$) terminator missing')
  assert.ok(body.includes('convalidated') || r5sql.includes('convalidated=true'), 'validated status undocumented')
})

test('golden r5 fixture alternation equals the harness r5 alternation across the FULL phrase space', () => {
  // SQL regex literals in the fixture escape backslashes the same way the JS
  // string does, so a direct containment check is an exact comparison.
  const occurrences = r5sql.split(R5_TEMPORAL_ALTERNATION).length - 1
  assert.equal(occurrences, 2, `deployed r5 alternation must appear verbatim in BOTH arms of the fixture (found ${occurrences})`)
  // and the harness must not secretly carry extra/missing branches:
  const branches = R5_TEMPORAL_ALTERNATION.split('|')
  assert.deepEqual(
    branches,
    ['after(wards?)?', 'following', 'amid(st)?', 'in\\s+the\\s+wake\\s+of', 'on\\s+the\\s+back\\s+of', 'in\\s+the\\s+aftermath\\s+of', 'later', 'subsequently', 'days?\\s+after', 'hours?\\s+after'],
    'harness r5 alternation branches changed — resync to pg_get_constraintdef in the same PR',
  )
  // r4 variant: identical phrase space, deliberate 'amidst?' bug only.
  const r4branches = R4_TEMPORAL_ALTERNATION.split('|')
  assert.deepEqual(
    r4branches.map((b) => (b === 'amidst?' ? 'amid(st)?' : b)),
    branches,
    'r4 variant must differ from r5 ONLY in the deliberate amid(st)?/amidst? bug',
  )
})

test('behavioral: every deployed r5 alternation branch rejects as an evidence/label lead', () => {
  // One representative literal per branch — if any branch silently drops out
  // of the harness regex, its literal here goes from rejected to admitted.
  const leads = [
    'after the vote',
    'afterwards the vote',
    'following the attack',
    'amid rising tensions',
    'amidst rising tensions',
    'in the wake of the ruling',
    'on the back of the ruling',
    'in the aftermath of the vote',
    'later that day',
    'subsequently the court acted',
    'day after the filing',
    'days after the ceasefire',
    'hour after the announcement',
    'hours after the announcement',
  ]
  for (const lead of leads) {
    assert.equal(
      guardAllows({ type: 'causal', signal_source: 'causal_language', label: `causal: ${lead}`, evidence: lead }, 'r5'),
      false,
      `deployed r5 must reject lead '${lead}'`,
    )
  }
})

test('behavioral: phrases NOT in the deployed alternation stay admitted (no over-broad mirror)', () => {
  // The pre-repair mirror rejected these; the deployed guard admits them.
  const admitted = [
    'in the days after the vote, lawmakers reacted',
    'in the weeks following the ruling, states responded',
    'weeks after the filing, the court acted',
    'months after the decision, maps were redrawn',
    '1 day after the vote',
    'as a result of the ruling',
  ]
  for (const lead of admitted) {
    assert.equal(
      guardAllows({ type: 'causal', signal_source: 'causal_language', label: `causal: ${lead}`, evidence: lead }, 'r5'),
      true,
      `deployed r5 must admit lead '${lead}'`,
    )
  }
})

test('app timelineDedup module still exports the canonical rule', () => {
  assert.ok(dedupSrc.includes('export function canonicalizeTimelineEvents'))
  assert.ok(dedupSrc.includes('export function remapTimelineEdges'))
})
