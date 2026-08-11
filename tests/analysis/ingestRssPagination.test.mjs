// Doc 13 sites 7-8 regression test: ingest-rss must read the COMPLETE nodes
// label set past the PostgREST 1000-row ceiling, and the monoculture citations
// read must deliver the intended most-recent 2000 — not a silently capped 1000.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { keysetAll } from '../../supabase/functions/ingest-rss/lib.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const INDEX_TS = join(HERE, '..', '..', 'supabase', 'functions', 'ingest-rss', 'index.ts')

function fakePostgrest(tables) {
  return {
    from(table) {
      let rows = [...(tables[table] ?? [])]
      const state = { cols: null, limit: null }
      const q = {
        select: (cols) => { state.cols = String(cols).split(',').map((c) => c.trim()); return q },
        gt: (c, v) => {
          if (v === undefined) throw new Error(`undefined keyset cursor for ${c}`)
          rows = rows.filter((r) => String(r[c]) > String(v))
          return q
        },
        order: (c, { ascending = true } = {}) => {
          rows = [...rows].sort((a, b) => (String(a[c] ?? '') < String(b[c] ?? '') ? -1 : String(a[c] ?? '') > String(b[c] ?? '') ? 1 : 0) * (ascending ? 1 : -1))
          return q
        },
        limit: (n) => { state.limit = n; return q },
        then: (resolve) => {
          let r = rows
          if (state.limit) r = r.slice(0, state.limit)
          r = r.slice(0, 1000) // PostgREST max-rows cap — the bug under test
          if (state.cols) r = r.map((row) => Object.fromEntries(state.cols.filter((c) => c in row).map((c) => [c, row[c]])))
          resolve({ data: r, error: null })
        },
      }
      return q
    },
  }
}

const pad = (n) => String(n).padStart(6, '0')
const N_NODES = 1200
const N_CITATIONS = 2500

function buildTables() {
  const nodes = []
  for (let i = 1; i <= N_NODES; i++) {
    nodes.push({ id: `node-${pad(i)}`, label: `Label ${i} padded` })
  }
  nodes.push({ id: 'node-000600a', label: 'tiny' }) // length < 5: filtered downstream
  const citations = []
  for (let i = 1; i <= N_CITATIONS; i++) {
    citations.push({
      id: `cit-${pad(i)}`,
      cited_entity: `Entity ${(i % 25) + 1}`,
      article_id: `art-${pad((i % 700) + 1)}`,
      created_at: `2026-08-01T00:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.000Z`,
    })
  }
  return { nodes, citations }
}

test('control: the fake PostgREST really does cap naive selects at 1000', async () => {
  const db = fakePostgrest(buildTables())
  const { data } = await db.from('nodes').select('id, label')
  assert.equal(data.length, 1000)
})

test('site 7: nodes label read returns every node past 1000', async () => {
  const db = fakePostgrest(buildTables())
  const { data: nodeRows, error } = await keysetAll(db, 'nodes', 'id, label')
  assert.equal(error, null)
  const nodeLabels = (nodeRows ?? [])
    .filter((n) => n.label && n.label.length >= 5)
    .sort((a, b) => b.label.length - a.label.length)
  assert.equal(nodeLabels.length, N_NODES)
  assert.ok(nodeLabels.some((n) => n.id === `node-${pad(1001)}`), 'node at position 1001 missing from label dedupe set')
  assert.ok(nodeLabels.some((n) => n.id === `node-${pad(N_NODES)}`), 'final node missing from label dedupe set')
  assert.ok(!nodeLabels.some((n) => n.id === 'node-000600a'), 'short label leaked into dedupe set')
})

test('site 8: citations read delivers the intended most-recent 2000, not a capped 1000', async () => {
  const db = fakePostgrest(buildTables())
  const { data: citAll, error: citErr } = await keysetAll(db, 'citations', 'id, cited_entity, article_id, created_at')
  assert.equal(citErr, null)
  assert.equal(citAll.length, N_CITATIONS)
  const citRows2 = (citAll ?? [])
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
    .slice(0, 2000)
  assert.equal(citRows2.length, 2000)
  assert.equal(citRows2[0].id, `cit-${pad(N_CITATIONS)}`, 'newest citation is not first after re-sort')
  assert.ok(citRows2.some((c) => c.id === `cit-${pad(1001)}`), 'citation beyond position 1000 missing')
  assert.ok(citRows2.some((c) => c.id === `cit-${pad(501)}`), 'boundary citation cit-000501 should be kept')
  assert.ok(!citRows2.some((c) => c.id === `cit-${pad(500)}`), 'oldest 500 citations should be the ones dropped')
})

test('source structure: both ingest-rss reads are keyset-paginated, citations keep slice(0, 2000)', () => {
  const src = readFileSync(INDEX_TS, 'utf8')
  assert.match(src, /import \{ keysetAll \} from '\.\/lib\.js'/)
  assert.match(src, /keysetAll\(supabase, 'nodes', 'id, label'\)/)
  assert.match(src, /keysetAll\(supabase, 'citations', 'id, cited_entity, article_id, created_at'\)/)
  assert.match(src, /\.slice\(0, 2000\)/)
  assert.doesNotMatch(src, /from\('nodes'\)\s*\n?\s*\.select\('id, label'\)/, 'raw nodes label select still present')
  // Writes are not exposed to the read ceiling; the citations INSERT remains.
  assert.doesNotMatch(src, /from\('citations'\)\s*\n?\s*\.select\(/, 'raw citations select still present')
})
