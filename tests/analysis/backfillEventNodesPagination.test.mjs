// Doc 13 site 6 regression test: backfill-legacy actorsPass and topicsPass
// must read the COMPLETE event-node set past the PostgREST 1000-row ceiling.
// Both passes build nodeById8 from event-node slugs; an event node the read
// drops can never receive actor edges (actorsPass) or topic rows (topicsPass).

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { keysetAll } from '../../supabase/functions/backfill-legacy/lib.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const INDEX_TS = join(HERE, '..', '..', 'supabase', 'functions', 'backfill-legacy', 'index.ts')

// Minimal PostgREST emulation. The unconditional 1000-row cap is the bug
// under test. select() projects columns and gt() throws on an undefined
// cursor so a cols list missing `id` fails loudly instead of silently paging
// once and stopping.
function fakePostgrest(tables) {
  return {
    from(table) {
      let rows = [...(tables[table] ?? [])]
      const state = { cols: null, limit: null }
      const q = {
        select: (cols) => { state.cols = String(cols).split(',').map((c) => c.trim()); return q },
        eq: (c, v) => { rows = rows.filter((r) => r[c] === v); return q },
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
const hex8 = (n) => n.toString(16).padStart(8, '0')
const N_EVENT_NODES = 1300

function buildTables() {
  const nodes = []
  for (let i = 1; i <= N_EVENT_NODES; i++) {
    nodes.push({ id: `node-${pad(i)}`, slug: `evt-site6-${hex8(i)}`, type: 'event' })
  }
  // Non-event rows interleaved by id; the eq('type', 'event') filter must keep
  // them out even though keyset paging walks the same id space.
  nodes.push({ id: 'node-000500a', slug: 'actor-site6-000001f4', type: 'actor' })
  nodes.push({ id: 'node-001200a', slug: 'topic-site6-000004b0', type: 'topic' })
  return { nodes }
}

// The exact read actorsPass/topicsPass now perform (index.ts site-6 blocks).
async function readEventNodes(db) {
  const { data, error } = await keysetAll(db, 'nodes', 'id, slug', {
    filter: (q) => q.eq('type', 'event'),
  })
  assert.equal(error, null)
  return data
}

test('control: the fake PostgREST really does cap naive selects at 1000', async () => {
  const db = fakePostgrest(buildTables())
  const { data } = await db.from('nodes').select('id, slug').eq('type', 'event')
  assert.equal(data.length, 1000)
})

test('event-node read returns the complete set past 1000, filter intact', async () => {
  const evNodes = await readEventNodes(fakePostgrest(buildTables()))
  assert.equal(evNodes.length, N_EVENT_NODES)
  // SPECIFIC rows a truncated read would have dropped.
  assert.ok(evNodes.some((n) => n.id === `node-${pad(1001)}`), 'event node at position 1001 missing')
  assert.ok(evNodes.some((n) => n.id === `node-${pad(N_EVENT_NODES)}`), 'final event node missing')
  assert.ok(!evNodes.some((n) => n.id === 'node-000500a' || n.id === 'node-001200a'), 'non-event node leaked through the filter')

  // Consumption proof: build the same suffix map both passes build, and assert
  // the beyond-1000 rows are addressable by article-id prefix.
  const nodeById8 = new Map()
  for (const n of evNodes) {
    const m = String(n.slug).match(/-([0-9a-f]{8})$/)
    if (m) nodeById8.set(m[1], n.id)
  }
  assert.equal(nodeById8.size, N_EVENT_NODES)
  assert.equal(nodeById8.get(hex8(1001)), `node-${pad(1001)}`)
  assert.equal(nodeById8.get(hex8(N_EVENT_NODES)), `node-${pad(N_EVENT_NODES)}`)
})

test('source structure: BOTH event-node reads are keyset-paginated, no raw select', () => {
  const src = readFileSync(INDEX_TS, 'utf8')
  const keysetReads = src.match(/keysetAll\(supabase, 'nodes', 'id, slug'/g) ?? []
  assert.equal(keysetReads.length, 2, 'expected exactly two keysetAll event-node reads (actorsPass + topicsPass)')
  assert.doesNotMatch(
    src,
    /from\('nodes'\)\s*\n?\s*\.select\('id, slug'\)\s*\n?\s*\.eq\('type', 'event'\)/,
    'raw unpaginated event-node select still present',
  )
  for (const fn of ['actorsPass', 'topicsPass']) {
    const start = src.indexOf(`async function ${fn}`)
    assert.ok(start >= 0, `${fn} not found`)
    const block = src.slice(start, src.indexOf('\n}\n', start))
    assert.match(block, /keysetAll\(supabase, 'nodes', 'id, slug'/, `${fn} event-node read is not keyset-paginated`)
  }
})
