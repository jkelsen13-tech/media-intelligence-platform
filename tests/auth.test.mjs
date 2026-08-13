// 05_ACCOUNT_PIPELINE — lock the identity-layer wiring.
//
// The two failure modes these tests guard against are both silent:
//   1. MIP_USER_METADATA loses app:'mip' -> the DB trigger stops creating
//      mip_profiles rows, invisibly (signup still "works").
//   2. parseAuthRedirectError stops recognizing Supabase's URL-hash errors
//      -> expired magic links render as a plain signed-out screen.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MIP_USER_METADATA, parseAuthRedirectError } from '../src/lib/auth.js'

test('MIP_USER_METADATA carries the trigger-gating key', () => {
  assert.equal(MIP_USER_METADATA.app, 'mip')
})

test('parseAuthRedirectError: expired otp link', () => {
  const hash =
    '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
  const err = parseAuthRedirectError(hash)
  assert.equal(err.code, 'otp_expired')
  assert.match(err.description, /invalid or has expired/)
})

test('parseAuthRedirectError: access token hash is NOT an error', () => {
  assert.equal(
    parseAuthRedirectError('#access_token=abc&refresh_token=def&type=magiclink'),
    null,
  )
})

test('parseAuthRedirectError: empty and non-auth hashes', () => {
  assert.equal(parseAuthRedirectError(''), null)
  assert.equal(parseAuthRedirectError('#/some/route'), null)
})
