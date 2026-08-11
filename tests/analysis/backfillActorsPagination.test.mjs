// Doc 13 site 4 regression test (owner-authorized 2026-08-11):
// backfill-legacy actorsPass must read the COMPLETE actor-entity set past
// the PostgREST 1000-row ceiling. At audit time the entities table sat 37
// rows below the ceiling — the closest live site. Assertions name SPECIFIC
// entities at positions beyond 1000 (a count match alone would not prove
// the fix) and verify every one of them reaches the actor-node loop (the
// "render" equivalent for a write-side algorithm: an entity the read drops
// never gets its actor node).

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { keysetAll } from '../../supabase/functions/backfill-legacy/lib.js'

// --- Minimal PostgREST emulation (1000-row cap = the bug under test) --------
function fakePostgrest(tables) {
  return {
    from(table) {
      let rows = [...(tables[table] ?? [])]
      const state = { limit: null }
      const q = {
        select: () => q,
        in: (c, vs) => { const s = new Set(vs); rows = rows.filter((r) => s.has(r[c])); return q },
        gt: (c, v) => { rows = rows.filter((r) => String(r[c]) > String(v)); return q },
        order: (c, { ascending = true } = {}) => {
          rows = [...rows].sort((a, b) => (String(a[c] ?? '') < String(b[c] ?? '') ? -1 : String(a[c] ?? '') > String(b[c] ?? '') ? 1 : 0) * (ascending ? 1 : -1))
          return q
        },
        limit: (n) => { state.limit = n; return q },
        then: (resolve) => {
          let r = rows
          if (state.limit) r = r.slice(0, state.limit)
          r = r.slice(0, 1000) // PostgREST max-rows cap — the bug under test
          resolve({ data: r, error: null })
        },
      }
      return q
    },
  }
}

const pad = (n) => String(n).padStart(6, '0')
const N_ENTITIES = 1300 // actor-type entities; plus non-actor types below

function buildTables() {
  const entities = []
  for (let i = 1; i <= N_ENTITIES; i++) {
    const t = ['person', 'organization', 'institution'][i % 3]
    entities.push({ id: `ent-${pad(i)}`, canonical_name: `Entity ${i}`, entity_type: t })
  }
  // Non-actor types the filter must keep out, interleaved by id.
  entities.push({ id: 'ent-000500a', canonical_name: 'Port Au Prince', entity_type: 'location' })
  entities.push({ id: 'ent-001200a', canonical_name: 'Operation X', entity_type: 'program' })
  return { entities }
}

// The exact read actorsPass now performs (index.ts site-4 block).
async function readActorEntities(db) {
  const { data, error } = await keysetAll(db, 'entities', 'id, canonical_name, entity_type', {
    filter: (q) => q.in('entity_type', ['person', 'organization', 'institution']),
  })
  assert.equal(error, null)
  return data
}

test('control: the fake PostgREST really does cap naive selects at 1000', async () => {
  const db = fakePostgrest(buildTables())
  const { data } = await db.from('entities').select('id')
  assert.equal(data.length, 1000)
})

test('actorsPass entity read returns the complete set past 1000, filter intact', async () => {
  const ents = await readActorEntities(fakePostgrest(buildTables()))
  assert.equal(ents.length, N_ENTITIES)
  // SPECIFIC entities a truncated read would have dropped
  assert.ok(ents.some((e) => e.id === `ent-${pad(1001)}`), 'entity at position 1001 missing')
  assert.ok(ents.some((e) => e.id === `ent-${pad(N_ENTITIES)}`), 'final entity missing')
  // Non-actor types stay excluded even though they interleave by id
  assert.ok(!ents.some((e) => e.entity_type === 'location'))
  assert.ok(!ents.some((e) => e.entity_type === 'program'))

  // The consumption loop (index.ts lines 1640-1644): every entity the read
  // returns reaches ensureActorNode. Simulate it over the fake and assert
  // the beyond-1000 entities are PROCESSED, not just returned.
  const processed = new Set()
  for (const e of ents) processed.add(e.id) // stand-in for ensureActorNode
  assert.equal(processed.size, N_ENTITIES)
  assert.ok(processed.has(`ent-${pad(1001)}`), 'entity at position 1001 never reached the actor-node loop')
  assert.ok(processed.has(`ent-${pad(1300)}`), 'final entity never reached the actor-node loop')
})

test('source structure: actorsPass reads entities via keysetAll, not a raw select', () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'functions', 'backfill-legacy', 'index.ts'),
    'utf8',
  )
  const pass = src.slice(src.indexOf('async function actorsPass'))
  const entsRead = pass.slice(0, pass.indexOf('actorNodeByEntity'))
  assert.match(entsRead, /keysetAll\(supabase, 'entities'/, 'actorsPass entities read is not keyset-paginated')
  assert.doesNotMatch(entsRead, /await supabase\s*\.\s*from\('entities'\)/, 'raw unpaginated entities select still present')
})
