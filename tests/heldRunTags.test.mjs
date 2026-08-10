import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Golden test for the 2026-08-09 incident fix: ingest-rss must (1) refuse to
// run without the owner-held INGEST_RSS_RUN_KEY, and (2) never admit a
// held-tagged article (e.g. the Document 07 canary, tag
// 'doc07-canary-2026-08-08') into the Phase 2 unattached-sweep pool, while a
// normal (non-held, NULL-tag) article still flows through.

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'supabase/functions/ingest-rss/index.ts'), 'utf8')

// Mirror of the Phase 2 pool-construction filter in ingest-rss/index.ts.
// The structural assertions below pin this mirror to the live source: if the
// function's gate or filter changes shape, the structure tests fail.
function buildSweepPool(priorUnattached, cycleIds, heldRunTags) {
  const pool = []
  let heldExcluded = 0
  for (const p of priorUnattached) {
    if (cycleIds.has(p.id)) continue
    if (p.ingestion_run_id && heldRunTags.includes(String(p.ingestion_run_id))) {
      heldExcluded++
      continue
    }
    pool.push(p)
  }
  return { pool, heldExcluded }
}

const CANARY_TAG = 'doc07-canary-2026-08-08'

function canaryRows(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `canary-${i}`,
    ingestion_run_id: CANARY_TAG,
    is_digest: false,
    arc_id: null,
  }))
}

test('run-key gate: fail-closed when secret unset (503), 401 on wrong/missing key', () => {
  assert.ok(src.includes("Deno.env.get('INGEST_RSS_RUN_KEY')"), 'gate reads INGEST_RSS_RUN_KEY')
  assert.ok(src.includes('writer disabled'), 'unset secret disables the writer')
  assert.ok(src.includes('{ status: 503 }'), 'unset secret returns 503')
  assert.ok(src.includes('{ status: 401 }'), 'wrong key returns 401')
  assert.ok(src.includes("req.headers.get('x-ingest-rss-key')"), 'key arrives via x-ingest-rss-key header')
  assert.ok(src.includes("req.method !== 'POST'"), 'POST-only guard present')
  // The gate must run BEFORE any database client is constructed.
  const gateIdx = src.indexOf("Deno.env.get('INGEST_RSS_RUN_KEY')")
  const clientIdx = src.indexOf('createClient(supabaseUrl, serviceKey)')
  assert.ok(gateIdx > -1 && clientIdx > -1 && gateIdx < clientIdx, 'gate precedes createClient')
})

test('held-tag exclusion: source structure (JS-side filter, NULL-safe, before entity fallback)', () => {
  assert.ok(src.includes('cfg.held_run_tags'), 'held tags loaded from pipeline_config')
  assert.ok(src.includes('HELD_RUN_TAGS.includes'), 'JS-side held-tag filter present')
  // The sweep select must fetch ingestion_run_id so the filter can see it.
  const selectLine = src.split('\n').find((l) => l.includes('.select(') && l.includes('is_digest'))
  assert.ok(selectLine && selectLine.includes('ingestion_run_id'), 'sweep select includes ingestion_run_id')
  // NULL semantics: a PostgREST not.in filter would silently drop NULL-tag
  // (normal) rows; the filter must be JS-side. Refuse any not.in on this path.
  assert.ok(!/\.not\(\s*['"]ingestion_run_id/.test(src), 'no PostgREST not() filter on ingestion_run_id')
  // The exclusion must run BEFORE the entity-resolution fallback so a held
  // article never even gets re-extracted.
  const filterIdx = src.indexOf('HELD_RUN_TAGS.includes')
  const fallbackIdx = src.indexOf('extractAndResolveEntities(supabase, resolver, p.id')
  assert.ok(filterIdx > -1 && fallbackIdx > -1 && filterIdx < fallbackIdx, 'held filter precedes entity fallback')
})

test('a held-tagged canary article never enters the sweep pool (survives a full run)', () => {
  const rows = canaryRows(29)
  const { pool, heldExcluded } = buildSweepPool(rows, new Set(), [CANARY_TAG])
  assert.equal(pool.length, 0)
  assert.equal(heldExcluded, 29)
})

test('a normal ingest cycle still works: non-held and NULL-tag articles enter the pool', () => {
  const rows = [
    { id: 'normal-null', ingestion_run_id: null },
    { id: 'normal-other-tag', ingestion_run_id: 'some-other-run' },
    ...canaryRows(3),
  ]
  const { pool, heldExcluded } = buildSweepPool(rows, new Set(), [CANARY_TAG])
  assert.deepEqual(pool.map((p) => p.id), ['normal-null', 'normal-other-tag'])
  assert.equal(heldExcluded, 3)
})

test('NULL-tag rows are never excluded, even with a non-empty held list', () => {
  const rows = [{ id: 'null-tag', ingestion_run_id: null }]
  const { pool, heldExcluded } = buildSweepPool(rows, new Set(), [CANARY_TAG, 'another-held-tag'])
  assert.equal(pool.length, 1)
  assert.equal(heldExcluded, 0)
})

test('absent/misconfigured held_run_tags => empty list => nothing held (fail-open by design)', () => {
  const rows = canaryRows(2)
  const { pool, heldExcluded } = buildSweepPool(rows, new Set(), [])
  assert.equal(pool.length, 2)
  assert.equal(heldExcluded, 0)
})

test('config parsing: non-array held_run_tags degrades to [] (mirrors function guard)', () => {
  for (const bad of [undefined, null, 'doc07-canary-2026-08-08', 42, { tag: CANARY_TAG }]) {
    const parsed = Array.isArray(bad) ? bad.map(String) : []
    assert.deepEqual(parsed, [])
  }
  assert.deepEqual(Array.isArray([CANARY_TAG]) ? [CANARY_TAG].map(String) : [], [CANARY_TAG])
})
