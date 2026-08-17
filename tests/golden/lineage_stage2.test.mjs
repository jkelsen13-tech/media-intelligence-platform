// Golden tests — 20_IDEA capability 1, Stage 2 (canonical URL / explicit
// source reference), brief Section 3.
//
// PROVISIONAL: the derived_from-vs-quotes heuristic is pending owner review of
// the ambiguous sample (checkpoint 6). These tests pin CURRENT behavior so any
// change to the ruling shows up as a failing expectation rather than a silent
// reclassification. Stage 2 is deliberately NOT wired into the write path yet.
//
// The property that is NOT provisional, and must survive any ruling: an
// ambiguous reference produces no assertion at all.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyReference,
  isSelfReference,
  buildStage2Assertions,
  scanOutletReferences,
} from '../../supabase/functions/source-comparison-run/lineage.js'

const SCOPE = { articles_scanned: 4, corpus: 'fixture' }
const AT = '2026-08-17T00:00:00.000Z'
const build = (articles) => buildStage2Assertions(articles, { corpusScope: SCOPE, checkedAt: AT })

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

test('explicit attribution of this article\'s own content -> derivation', () => {
  for (const text of [
    'This story was originally published by ProPublica and is republished here with permission.',
    'Based on reporting by the Associated Press, the death toll now stands at 44.',
    'Adapted from a Reuters dispatch filed on Wednesday.',
  ]) {
    assert.equal(classifyReference(text).classification, 'derivation', text)
  }
})

test('referencing another report as a source -> reference, never derivation', () => {
  for (const text of [
    'the cause of death is undetermined pending an investigation, according to attorney Ben Crump.',
    'despite continuing aggression on Ukraine, Reuters reported.',
    'the head of a US charity employing them told Reuters.',
    'The minister denied the allegation, citing a report by the state auditor.',
  ]) {
    assert.equal(classifyReference(text).classification, 'reference', text)
  }
})

test('a bare link with no attribution language -> reference (brief Section 3)', () => {
  const v = classifyReference('See the full filing here.')
  assert.equal(v.classification, 'reference')
  assert.equal(v.phrase, null)
})

test('RULING 1: priority-of-discovery credit stays ambiguous, never derived_from', () => {
  // Used both as a derivation credit and as a courtesy by an outlet doing
  // entirely independent reporting; nothing in the phrase separates the two.
  // "first reported by" also contains "reported", so if ambiguity were checked
  // after the citation patterns it would be silently written as quotes.
  for (const text of [
    'The scheme was first reported by The Guardian on Tuesday, and officials later confirmed the details to this newspaper.',
    'The Guardian was first to report the scheme on Tuesday.',
    'As the Financial Times first reported, the review had already begun.',
  ]) {
    const v = classifyReference(text)
    assert.equal(v.classification, 'ambiguous', text)
    assert.notEqual(v.classification, 'derivation', 'must never be reclassified as derived_from')
    assert.ok(v.why.length > 0)
  }
})

test('RULING 2: sequence framing is a DECIDED reference, not ambiguous', () => {
  // "After X reported" / "following a report by X" locate this article in time
  // relative to another report; neither states its content came from it.
  const cases = [
    ['Following a report by the Financial Times, the company announced an internal review.', 'Following a report by'],
    ['After Bloomberg reported the merger talks, shares rose four per cent.', 'After Bloomberg reported'],
    ['The officer left the country after The Times reported that he was using the Aeroflot office.', 'after The Times reported'],
  ]
  for (const [text, phrase] of cases) {
    const v = classifyReference(text)
    assert.equal(v.classification, 'reference', text)
    assert.notEqual(v.classification, 'ambiguous', 'reclassified by owner ruling 2026-08-17')
    // The specific phrase must be what is recorded as evidence, not a looser
    // pattern that happened to match first.
    assert.equal(v.phrase, phrase)
  }
})

test('"per" records a source, never a unit of measure', () => {
  // A bare /\bper\b/ matched "four per cent" and recorded it as the evidence
  // for a real classification. Caught on the live-shaped probe set.
  assert.equal(classifyReference('The toll stands at 44, per Reuters.').phrase, 'per Reuters')
  assert.equal(classifyReference('Shares rose four per cent on Tuesday.').phrase, null)
})

test('attribution AND citation language together is ambiguous, not a tiebreak', () => {
  const v = classifyReference('Adapted from a Reuters dispatch, according to an editor\'s note.')
  assert.equal(v.classification, 'ambiguous')
  assert.match(v.why, /both present/)
})

// ---------------------------------------------------------------------------
// Assertion building
// ---------------------------------------------------------------------------

const linked = (bodyForA) => ([
  { id: 'A', outlet: 'Outlet A', url: 'https://a.example.com/story', body_text: bodyForA },
  { id: 'B', outlet: 'Outlet B', url: 'https://b.example.com/original', body_text: 'Original reporting.' },
])

test('a decided derivation reference writes derived_from at medium confidence', () => {
  const { assertions, ambiguous } = build(linked(
    'Based on reporting by Outlet B — see https://b.example.com/original — the toll rose.'))
  assert.equal(ambiguous.length, 0)
  assert.equal(assertions.length, 1)
  const r = assertions[0]
  assert.equal(r.relationship_class, 'derivation')
  assert.equal(r.relationship_type, 'derived_from')
  assert.equal(r.parent_article_id, 'B')
  // A sentence of self-report never earns 'high' — that is Stage 3's bar.
  assert.equal(r.confidence_band, 'medium')
  assert.equal(r.detection_method, 'canonical_url_match')
  assert.deepEqual(r.evidence_basis.corpus_scope, SCOPE)
  assert.ok(r.evidence_basis.reference_window.length > 0)
})

test('a decided citation reference writes quotes under relationship_class reference', () => {
  const { assertions } = build(linked(
    'Officials denied it, according to https://b.example.com/original which published the memo.'))
  assert.equal(assertions.length, 1)
  assert.equal(assertions[0].relationship_class, 'reference')
  assert.equal(assertions[0].relationship_type, 'quotes')
})

test('AN AMBIGUOUS REFERENCE PRODUCES NO ASSERTION — it is queued for review', () => {
  // The non-negotiable property. Writing a coin flip as either class would put
  // a fabricated derivation claim into the origin clusters E2 counts.
  const { assertions, ambiguous } = build(linked(
    'The scheme was first reported by Outlet B at https://b.example.com/original on Tuesday.'))
  assert.equal(assertions.length, 0, 'no assertion may be written for an ambiguous reference')
  assert.equal(ambiguous.length, 1)
  assert.equal(ambiguous[0].child_article_id, 'A')
  assert.equal(ambiguous[0].parent_article_id, 'B')
  assert.ok(ambiguous[0].why)
  assert.ok(ambiguous[0].window)
})

test('RULING 3: self-reference exclusion is permanent', () => {
  // The live NYT case: "The Times reported" inside a New York Times article.
  assert.ok(isSelfReference('New York Times', 'after The Times reported that he was using the office'))
  assert.ok(isSelfReference('South China Morning Post', 'according to a tally by the South China Morning Post'))
  assert.ok(!isSelfReference('The Guardian', 'Reuters reported on Tuesday'))

  const { assertions, unresolvable } = build([
    { id: 'A', outlet: 'Outlet A', url: 'https://a.example.com/one', body_text: 'Adapted from https://a2.example.com/two, our earlier story.' },
    { id: 'A2', outlet: 'Outlet A', url: 'https://a2.example.com/two', body_text: 'Earlier.' },
  ])
  assert.equal(assertions.length, 0, 'same-outlet reference must not become lineage')
  assert.equal(unresolvable[0].reason, 'self_reference_same_outlet')
})

test('a link to a non-corpus URL resolves to nothing', () => {
  const { assertions, ambiguous, unresolvable } = build(linked(
    'Based on reporting by someone at https://notinthecorpus.example.org/x.'))
  assert.equal(assertions.length + ambiguous.length + unresolvable.length, 0)
})

test('an article linking to itself is never its own parent', () => {
  const { assertions } = build([
    { id: 'A', outlet: 'Outlet A', url: 'https://a.example.com/story', body_text: 'See https://a.example.com/story for more.' },
  ])
  assert.equal(assertions.length, 0)
})

test('no composite score on any Stage 2 row', () => {
  const { assertions } = build(linked('Adapted from https://b.example.com/original.'))
  for (const [k, v] of Object.entries(assertions[0])) {
    assert.notEqual(typeof v, 'number', `${k} must not be a numeric score`)
    assert.ok(!/score/i.test(k), `${k} must not be a score field`)
  }
})

test('corpus scope is required — a scopeless run throws rather than shipping', () => {
  assert.throws(() => buildStage2Assertions([], {}), /corpusScope\.articles_scanned is required/)
})

// ---------------------------------------------------------------------------
// Outlet-level references: reporting only, never assertions
// ---------------------------------------------------------------------------

test('RULING 4: outlet-level mentions are report-only, never a parentless quotes row', () => {
  // "The Times reported" names an OUTLET, not an article. Picking one of that
  // outlet's articles would be a guess dressed as evidence.
  const found = scanOutletReferences(
    [{ id: 'A', outlet: 'South China Morning Post', body_text: 'according to local media. The Guardian reported on Thursday that he was refused.' }],
    ['The Guardian', 'BBC'],
  )
  assert.equal(found.length, 1)
  assert.equal(found[0].referenced_outlet, 'The Guardian')
  assert.equal(found[0].self_reference, false)
  // scanOutletReferences returns findings only — it has no assertion output.
  assert.equal(found[0].child_article_id, 'A')
  assert.ok(!('relationship_type' in found[0]), 'a scan finding is not an assertion')

  // And the assertion builder produces nothing from an outlet-name mention:
  // it names an outlet, not an article, so no parent can resolve.
  const { assertions, ambiguous, unresolvable } = build([
    { id: 'A', outlet: 'South China Morning Post', url: 'https://scmp.com/a', body_text: 'The Guardian reported on Thursday that he was refused.' },
    { id: 'B', outlet: 'The Guardian', url: 'https://theguardian.com/b', body_text: 'Original.' },
  ])
  assert.equal(assertions.length, 0, 'no parentless quotes row may be written')
  assert.equal(ambiguous.length, 0)
  assert.equal(unresolvable.length, 0)
})

test('outlet self-reference is flagged as such in the scan', () => {
  const found = scanOutletReferences(
    [{ id: 'N', outlet: 'New York Times', body_text: 'left the country after The Times reported that he was using the office.' }],
    ['New York Times'],
  )
  assert.equal(found.length, 1)
  assert.equal(found[0].self_reference, true)
})
