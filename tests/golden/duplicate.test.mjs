// G1 — duplicate golden suite: evt-/art- mirror rule (imported from app
// source), Tier 6 actor-duplicate detection (mirror of the live monitor
// view), and the entity-resolution type-agreement guard.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { canonicalizeTimelineEvents, findDuplicateActors, fuzzyResolves } from './harness/dedup.mjs'

const fx = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'actors.json'), 'utf8'),
)

test('evt-/art- mirror rule: canonical survives, mirror suppressed (Tier 4)', () => {
  for (const c of fx.mirrorCases) {
    const { events, suppressed } = canonicalizeTimelineEvents(c.events)
    assert.equal(events.length, c.expectKept, `${c.name}: kept`)
    assert.equal(suppressed, c.expectSuppressed, `${c.name}: suppressed`)
    const canonical = events.find((e) => e.slug.startsWith('evt-'))
    assert.equal(canonical.slug, c.expectCanonicalSlug, `${c.name}: canonical`)
    // the suppressed mirror's different score (70) must not surface:
    assert.ok(!events.some((e) => e.slug === 'art-trump-vows-action-08736d53'))
  }
})

test('mutation proof: without the mirror rule the duplicate renders twice with different scores', () => {
  const c = fx.mirrorCases[0]
  // no-mirror-rule variant = identity: every node renders
  const rendered = c.events
  const sameArticle = rendered.filter((e) => e.slug.endsWith('08736d53'))
  assert.equal(sameArticle.length, 2)
  assert.notEqual(sameArticle[0].confidence, sameArticle[1].confidence)
  // repaired rule collapses them:
  assert.equal(canonicalizeTimelineEvents(c.events).events.filter((e) => e.slug.endsWith('08736d53')).length, 1)
})

test('Tier 6 actor duplicates: pre-fix Iran pair flagged, post-fix clean', () => {
  const [pre, post] = fx.duplicateActorCases
  const flagged = findDuplicateActors(pre.nodes)
  assert.equal(flagged.length, pre.expectFlaggedGroups)
  assert.equal(flagged[0].label, 'iran')
  assert.equal(flagged[0].count, 2)
  assert.equal(findDuplicateActors(post.nodes).length, post.expectFlaggedGroups)
})

test('distinct entities are NOT flagged as duplicates (Yemeni/Houthis stay separate)', () => {
  const pre = fx.duplicateActorCases[0]
  const flagged = findDuplicateActors(pre.nodes)
  assert.ok(!flagged.some((g) => g.label.includes('yemeni') || g.label.includes('houthis')))
})

test('type-agreement guard: cross-type fuzzy junk rejected (entity hygiene)', () => {
  for (const c of fx.fuzzyResolutionCases) {
    assert.equal(fuzzyResolves(c.candidateSurface, c.candidateType, c.storedType), c.expectResolved, c.name)
  }
})

test('mutation proof: no-type-guard variant admits cross-type fuzzy junk', () => {
  const c = fx.fuzzyResolutionCases.find((x) => x.name === 'cross_type_rejected')
  assert.equal(fuzzyResolves(c.candidateSurface, c.candidateType, c.storedType, { variant: 'no-type-guard' }), true)
})
