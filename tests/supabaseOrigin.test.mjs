// V2 origin allowlist — fail closed on missing/empty/any other host.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  V2_SUPABASE_HOST,
  V2_SUPABASE_REF,
  V2_SUPABASE_URL,
  rejectNonV2Client,
  resolveV2SupabaseUrl,
  supabaseClientUrl,
} from '../src/lib/supabaseOrigin.js'
import {
  loadSpatialProjection,
  spatialProjectionUnavailableCopy,
} from '../src/lib/spatialProjection.js'

function fetchSpy(supabaseUrl) {
  let fetched = false
  const client = {
    supabaseUrl,
    from() {
      fetched = true
      const chain = {
        select() {
          return chain
        },
        order() {
          return chain
        },
        gt() {
          return chain
        },
        async limit() {
          return { data: [{ mip_object_id: 'should-not-load' }], error: null }
        },
      }
      return chain
    },
  }
  return { client, wasFetched: () => fetched }
}

test('canonical V2 constants match the live project ref', () => {
  assert.equal(V2_SUPABASE_REF, 'qikvmopbtijoebdqosyq')
  assert.equal(V2_SUPABASE_HOST, 'qikvmopbtijoebdqosyq.supabase.co')
  assert.equal(V2_SUPABASE_URL, 'https://qikvmopbtijoebdqosyq.supabase.co')
})

test('resolveV2SupabaseUrl accepts only the V2 https origin', () => {
  assert.deepEqual(resolveV2SupabaseUrl('https://qikvmopbtijoebdqosyq.supabase.co'), {
    ok: true,
    url: V2_SUPABASE_URL,
    reason: null,
  })
  assert.deepEqual(resolveV2SupabaseUrl('https://qikvmopbtijoebdqosyq.supabase.co/'), {
    ok: true,
    url: V2_SUPABASE_URL,
    reason: null,
  })
  assert.deepEqual(resolveV2SupabaseUrl('  HTTPS://QIKVMOPBTIJOEBDQOSYQ.supabase.co  '), {
    ok: true,
    url: V2_SUPABASE_URL,
    reason: null,
  })
})

test('resolveV2SupabaseUrl: missing vs empty vs any other host', () => {
  assert.equal(resolveV2SupabaseUrl(undefined).reason, 'missing')
  assert.equal(resolveV2SupabaseUrl(null).reason, 'missing')
  assert.equal(resolveV2SupabaseUrl('').reason, 'empty')
  assert.equal(resolveV2SupabaseUrl('   ').reason, 'empty')

  const rejected = [
    'https://jkelsen13-tech.github.io/media-intelligence-platform-v2/',
    'https://jkelsen13-tech.github.io/media-intelligence-platform/',
    'https://yhbwnrtlqbjtcrrlpbge.supabase.co',
    'https://niejaejtbxgakyrsntxm.supabase.co',
    'https://otherproject.supabase.co',
    'http://qikvmopbtijoebdqosyq.supabase.co',
    'https://qikvmopbtijoebdqosyq.supabase.co/rest/v1',
    'https://qikvmopbtijoebdqosyq.supabase.co?x=1',
    'https://evil.qikvmopbtijoebdqosyq.supabase.co',
    'https://qikvmopbtijoebdqosyq.supabase.co.evil.com',
    'https://user:pass@qikvmopbtijoebdqosyq.supabase.co',
    'not-a-url',
    123,
  ]
  for (const raw of rejected) {
    const got = resolveV2SupabaseUrl(raw)
    assert.equal(got.ok, false, String(raw))
    assert.equal(got.url, null, String(raw))
    assert.equal(got.reason, 'origin_not_v2', String(raw))
  }
})

test('injected client with a non-V2 supabaseUrl is rejected without fetch', async () => {
  const cases = [
    'https://yhbwnrtlqbjtcrrlpbge.supabase.co',
    'https://niejaejtbxgakyrsntxm.supabase.co',
    'https://jkelsen13-tech.github.io/media-intelligence-platform-v2/',
  ]
  for (const url of cases) {
    const spy = fetchSpy(url)
    const result = await loadSpatialProjection({ supabaseClient: spy.client })
    assert.equal(result.status, 'unavailable', url)
    assert.equal(result.reason, 'origin_not_v2', url)
    assert.deepEqual(result.rows, [])
    assert.equal(spy.wasFetched(), false, url)
  }
})

test('default path: missing/empty/wrong envUrl never fetches', async () => {
  const spy = fetchSpy(V2_SUPABASE_URL)
  for (const [envUrl, reason] of [
    [undefined, 'missing'],
    ['', 'empty'],
    ['https://yhbwnrtlqbjtcrrlpbge.supabase.co', 'origin_not_v2'],
    ['https://jkelsen13-tech.github.io/media-intelligence-platform-v2/', 'origin_not_v2'],
    ['https://niejaejtbxgakyrsntxm.supabase.co', 'origin_not_v2'],
  ]) {
    const result = await loadSpatialProjection({ envUrl })
    assert.equal(result.status, 'unavailable', String(envUrl))
    assert.equal(result.reason, reason, String(envUrl))
    assert.deepEqual(result.rows, [])
  }
  assert.equal(spy.wasFetched(), false)
})

test('default path V2 env still does not use a non-V2 module client; fakes without URL still load', async () => {
  // envUrl V2 with no injected client uses the module supabase (null in Node tests).
  const gated = await loadSpatialProjection({ envUrl: V2_SUPABASE_URL })
  assert.equal(gated.status, 'unavailable')
  assert.equal(gated.reason, 'client_not_configured')
  assert.deepEqual(gated.rows, [])
})

test('rejectNonV2Client / supabaseClientUrl', () => {
  assert.equal(rejectNonV2Client({}), null)
  assert.equal(rejectNonV2Client({ supabaseUrl: V2_SUPABASE_URL }), null)
  assert.equal(rejectNonV2Client({ supabaseUrl: 'https://yhbwnrtlqbjtcrrlpbge.supabase.co' }), 'origin_not_v2')
  assert.equal(supabaseClientUrl({ supabaseUrl: V2_SUPABASE_URL }), V2_SUPABASE_URL)
})

test('unavailable copy is honest for origin failures', () => {
  assert.match(spatialProjectionUnavailableCopy('missing'), /missing or empty/)
  assert.match(spatialProjectionUnavailableCopy('empty'), /qikvmopbtijoebdqosyq/)
  assert.match(spatialProjectionUnavailableCopy('origin_not_v2'), /media-intelligence-platform-v2/)
  assert.match(spatialProjectionUnavailableCopy('origin_not_v2'), /No spatial fetch ran/)
  assert.doesNotMatch(spatialProjectionUnavailableCopy('origin_not_v2'), /Cleveland|Fort Campbell|Port Meridian|Gulf Coast/)
})

test('supabase.js constructs the client only after V2 origin resolve', () => {
  const src = readFileSync(new URL('../src/lib/supabase.js', import.meta.url), 'utf8')
  assert.match(src, /resolveV2SupabaseUrl\(readViteSupabaseUrl\(\)\)/)
  assert.match(src, /createClient\(origin\.url, anonKey\)/)
  assert.doesNotMatch(src, /createClient\(url,/)
  assert.doesNotMatch(src, /https:\/\/niejaejtbxgakyrsntxm/)
  assert.doesNotMatch(src, /https:\/\/yhbwnrtlqbjtcrrlpbge/)
  assert.doesNotMatch(src, /jkelsen13-tech\.github\.io/)
})

test('Pages workflow does not inject a hosted origin or print secrets', () => {
  const yml = readFileSync(new URL('../.github/workflows/blank.yml', import.meta.url), 'utf8')
  assert.doesNotMatch(yml, /VITE_SUPABASE/)
  assert.doesNotMatch(yml, /qikvmopbtijoebdqosyq|niejaejtbxgakyrsntxm|yhbwnrtlqbjtcrrlpbge/)
  assert.doesNotMatch(yml, /github\.io/)
  assert.doesNotMatch(yml, /secrets\./)
})
