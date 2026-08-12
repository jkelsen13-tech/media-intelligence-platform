// 15A drift guard (Doc 15A, 2026-08-12): both attachToArc callers must route
// the membership + centroid write through the atomic RPC
// attach_article_to_arc (migration 20260813_atomic_arc_attach), and the old
// read-centroid/compute-in-JS/write-back sequence must not reappear.
// Static guards only — the live before/after concurrency proofs are recorded
// in verifier/v6/ and verifier/runs/2026-08-12-doc15a-atomic-attach.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const INGEST = readFileSync(new URL('../supabase/functions/ingest-rss/index.ts', import.meta.url), 'utf8')
const BACKFILL = readFileSync(new URL('../supabase/functions/backfill-legacy/index.ts', import.meta.url), 'utf8')
const MIGRATION_PATH = new URL('../supabase/migrations/20260813_atomic_arc_attach.sql', import.meta.url)
const MIGRATION = existsSync(MIGRATION_PATH) ? readFileSync(MIGRATION_PATH, 'utf8') : ''

for (const [name, src] of [['ingest-rss', INGEST], ['backfill-legacy', BACKFILL]]) {
  test(`${name}: attachToArc routes through attach_article_to_arc RPC`, () => {
    assert.match(src, /rpc\('attach_article_to_arc'/)
  })
  test(`${name}: old JS centroid read-compute-write sequence is gone`, () => {
    assert.ok(!src.includes('centroid refresh is best-effort'), 'best-effort try/catch must not return')
    assert.ok(!/select\('id', \{ count: 'exact', head: true \}\)[\s\S]{0,400}update\(\{ embedding:/.test(src),
      'read-count-then-write-centroid pattern must not return')
  })
  test(`${name}: RPC errors propagate (no silent swallow)`, () => {
    assert.match(src, /if \(attachErr\) throw attachErr/)
  })
}

test('migration exists and defines the atomic function', () => {
  assert.ok(MIGRATION.length > 0, 'migration file missing')
  assert.match(MIGRATION, /create or replace function public\.attach_article_to_arc\(/)
  assert.match(MIGRATION, /for update/i) // article + arc row locks
  assert.match(MIGRATION, /already_attached/) // idempotency branch
})

test('migration documents its rollback path', () => {
  assert.match(MIGRATION, /drop function if exists public\.attach_article_to_arc/i)
})
