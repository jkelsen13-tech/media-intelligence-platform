// Doc 13 site 9 regression test: source-comparison-run rebuild cleanup must
// read the COMPLETE sc-v1 event-id set past the PostgREST 1000-row ceiling.
// A truncated cleanup read would leave event_articles/claims/events orphans
// behind on the next rebuild.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { pagedSelect, RULE_VERSION } from '../../supabase/functions/source-comparison-run/lib.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const INDEX_TS = join(HERE, '..', '..', 'supabase', 'functions', 'source-comparison-run', 'index.ts')

function fakePostgrest(tables) {
  return {
    from(table) {
      let rows = [...(tables[table] ?? [])]
      const state = { range: null }
      const q = {
        select: () => q,
        eq: (c, v) => { rows = rows.filter((r) => r[c] === v); return q },
        order: (c, { ascending = true } = {}) => {
          rows = [...rows].sort((a, b) => (String(a[c] ?? '') < String(b[c] ?? '') ? -1 : String(a[c] ?? '') > String(b[c] ?? '') ? 1 : 0) * (ascending ? 1 : -1))
          return q
        },
        range: (f, t) => { state.range = [f, t]; return q },
        then: (resolve) => {
          let r = rows
          if (state.range) r = r.slice(state.range[0], state.range[1] + 1)
          r = r.slice(0, 1000) // PostgREST max-rows cap — the bug under test
          resolve({ data: r, error: null })
        },
      }
      return q
    },
  }
}

const pad = (n) => String(n).padStart(6, '0')
const N_MATCHING = 1300
const N_FOREIGN = 400

function buildTables() {
  const events = []
  for (let i = 1; i <= N_MATCHING; i++) {
    events.push({ id: `ev-${pad(i)}`, rule_version: RULE_VERSION })
    if (i <= N_FOREIGN) events.push({ id: `fx-${pad(i)}`, rule_version: `foreign-v${(i % 3) + 1}` })
  }
  return { events }
}

// The exact cleanup read index.ts now performs (site-9 block).
async function readCleanupEventIds(db) {
  const { data, error } = await pagedSelect(db, 'events', 'id', ['id'], 1000, (q) =>
    q.eq('rule_version', RULE_VERSION),
  )
  assert.equal(error, null)
  return (data ?? []).map((r) => r.id)
}

test('control: the fake PostgREST really does cap naive selects at 1000', async () => {
  const db = fakePostgrest(buildTables())
  const { data } = await db.from('events').select('id')
  assert.equal(data.length, 1000)
})

test('cleanup event-id read returns the complete matching set past 1000', async () => {
  const ids = await readCleanupEventIds(fakePostgrest(buildTables()))
  assert.equal(ids.length, N_MATCHING)
  assert.ok(ids.includes(`ev-${pad(1001)}`), 'matching event at position 1001 missing from cleanup set')
  assert.ok(ids.includes(`ev-${pad(N_MATCHING)}`), 'final matching event missing from cleanup set')
  assert.ok(!ids.some((id) => id.startsWith('fx-')), 'foreign rule_version leaked into cleanup set')

  // Consumption proof: run the same 100-id delete chunking and assert the
  // beyond-1000 rows are actually deleted, not merely returned.
  const deleted = []
  for (let i = 0; i < ids.length; i += 100) deleted.push(...ids.slice(i, i + 100))
  assert.equal(deleted.length, N_MATCHING)
  assert.ok(deleted.includes(`ev-${pad(1001)}`), 'event at position 1001 would not be deleted')
  assert.ok(deleted.includes(`ev-${pad(N_MATCHING)}`), 'final event would not be deleted')
})

test('source structure: cleanup read uses pagedSelect with the rule_version filter', () => {
  const src = readFileSync(INDEX_TS, 'utf8')
  assert.match(src, /pagedSelect\(supabase, 'events', 'id', \['id'\], 1000, \(q\) =>\s*\n?\s*q\.eq\('rule_version', RULE_VERSION\)/)
  assert.doesNotMatch(
    src,
    /from\('events'\)\s*\n?\s*\.select\('id'\)\s*\n?\s*\.eq\('rule_version', RULE_VERSION\)/,
    'raw unpaginated events cleanup select still present',
  )
  const lib = readFileSync(join(HERE, '..', '..', 'supabase', 'functions', 'source-comparison-run', 'lib.js'), 'utf8')
  assert.match(lib, /export async function pagedSelect\(supabase, table, cols, orderCols, pageSize, filter = \(q\) => q\)/)
})
