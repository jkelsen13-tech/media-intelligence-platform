// 04_TRACK_B Step 1 — lock the light-theme flag's withhold posture.
//
// The failure mode these tests guard against is silent: if resolveTheme
// ever treats a non-true value as "light" (truthy string, 1, missing row,
// error path), users get the light theme without owner authorization, and
// rollback-by-flag stops working.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveTheme, applyTheme, cacheTheme } from '../src/lib/themeFlag.js'

test('resolveTheme: exactly boolean true -> light', () => {
  assert.equal(resolveTheme(true), 'light')
})

test('resolveTheme: withhold posture — everything else -> dark', () => {
  for (const v of [false, null, undefined, 'true', 1, 0, {}, [], 'light']) {
    assert.equal(resolveTheme(v), 'dark', `value ${JSON.stringify(v)} must resolve dark`)
  }
})

test('applyTheme: light sets data-theme, dark removes it', () => {
  const el = { dataset: {} }
  applyTheme('light', el)
  assert.equal(el.dataset.theme, 'light')
  applyTheme('dark', el)
  assert.equal(el.dataset.theme, undefined)
})

test('applyTheme: unknown theme never sets the attribute', () => {
  const el = { dataset: {} }
  applyTheme('light', el)
  applyTheme('blue', el)
  assert.equal(el.dataset.theme, undefined)
})

test('cacheTheme: writes mip-theme, never throws on storage failure', () => {
  const store = { v: null, setItem(k, val) { this.v = [k, val] } }
  cacheTheme('light', store)
  assert.deepEqual(store.v, ['mip-theme', 'light'])
  const broken = { setItem() { throw new Error('blocked') } }
  cacheTheme('dark', broken) // must not throw
  cacheTheme('light', null) // no storage: no-op
})
