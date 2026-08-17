// Golden tests — 20_IDEA capability 1, Stage 1 (byline/wire attribution).
//
// Covers the brief Section 3 rules and the guardrails that constrain them:
//   - a wire dateline/byline produces syndicated_from at high confidence;
//   - a wire's OWN article is an origin, never a copy of itself;
//   - a contributor credit is NOT a syndication claim;
//   - a bare wire mention in running text is not a dateline;
//   - no parent found is never a confident independence claim;
//   - every finding carries detection method, corpus scope and check date.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  WIRE_SERVICES,
  LINEAGE_RULE_VERSION,
  detectWireAttribution,
  buildStage1Assertions,
  isWireOwnDomain,
  urlHost,
  leadText,
} from '../../supabase/functions/source-comparison-run/lineage.js'

const SCOPE = { articles_scanned: 752, corpus: 'live', outlets: 26 }
const AT = '2026-08-17T00:00:00.000Z'

const build = (articles, opts = {}) =>
  buildStage1Assertions(articles, { corpusScope: SCOPE, checkedAt: AT, ...opts })

test('parenthetical wire dateline -> syndicated_from, high confidence', () => {
  const a = {
    id: 'a1', outlet: 'Billings Gazette', url: 'https://billingsgazette.com/news/x',
    body_text: 'WASHINGTON (Reuters) - The Supreme Court on Tuesday declined to hear the case, in a decision that leaves the lower court ruling in place.',
  }
  const hit = detectWireAttribution(a)
  assert.equal(hit.service, 'Reuters')
  assert.equal(hit.signal, 'dateline_parenthetical')
  assert.equal(hit.confidenceBand, 'high')
  assert.equal(hit.kind, 'syndicated_copy')

  const { assertions } = build([a])
  assert.equal(assertions.length, 1)
  assert.equal(assertions[0].relationship_class, 'derivation')
  assert.equal(assertions[0].relationship_type, 'syndicated_from')
  assert.equal(assertions[0].detection_method, 'byline_attribution')
  assert.equal(assertions[0].parent_article_id, null)
})

test('byline credit "By NAME, Associated Press" is detected', () => {
  const hit = detectWireAttribution({
    id: 'a2', outlet: 'Local Paper', url: 'https://local.example.com/a',
    body_text: 'By Mark Sherman, Associated Press\n\nWASHINGTON — The court ruled 6-3 on Wednesday morning after a long argument session.',
  })
  assert.equal(hit.service, 'Associated Press')
  assert.equal(hit.signal, 'byline_credit')
  assert.equal(hit.confidenceBand, 'high')
})

test("a wire's own article is an ORIGIN, not a syndicated copy of itself", () => {
  const ap = {
    id: 'a3', outlet: 'Associated Press',
    url: 'https://apnews.com/article/voting-rights-louisiana-963c002f',
    body_text: 'WASHINGTON (AP) — The Supreme Court appeared ready to gut a key part of the Voting Rights Act.',
  }
  const hit = detectWireAttribution(ap)
  assert.equal(hit.kind, 'wire_original')

  const { assertions, wireOriginals } = build([ap])
  // The critical assertion: NO derivation row is written for the origin.
  assert.equal(assertions.length, 0)
  assert.equal(wireOriginals.length, 1)
  assert.equal(wireOriginals[0].service, 'Associated Press')
})

test('contributor credit is NOT a syndication claim', () => {
  // Collapsing this outlet into the wire's origin cluster would UNDERCOUNT
  // corroboration — the mirror image of the bug capability 1 fixes.
  for (const body of [
    'LONDON — The minister resigned on Friday. Reuters contributed to this report.',
    'The vote passed narrowly, with additional reporting by Agence France-Presse.',
    'The figure was first reported by Reuters on Monday, according to two officials.',
  ]) {
    const hit = detectWireAttribution({ id: 'x', outlet: 'The Guardian', url: 'https://theguardian.com/a', body_text: body })
    assert.equal(hit, null, `should not fire on: ${body}`)
  }
})

test('a wire cited as the SOURCE OF A FACT is not a syndication claim', () => {
  // Every one of these is a real 2026-08-17 live-corpus case. Each is
  // original reporting by a non-wire outlet that cites a wire; asserting
  // syndicated_from over them would be a false accusation of syndication
  // AND would collapse independent outlets in the E2 corroboration count.
  const liveCases = [
    ['The Guardian', 'its 2026 edition, despite continuing aggression on Ukraine, Reuters reported. The Italian government sharply criticised the move.'],
    ['South China Morning Post', 'perform surgery on two patients that day, state news agency Xinhua reported. It was on July 13 when Shenyang was hit by a downpour.'],
    ['The Guardian', 'nesday with two additional missile falling in an open area, AFP reports. The two missiles that the army did not intercept fell in remote areas.'],
    ['The Guardian', 'restrictions, the head of a US charity employing them told Reuters. The aid workers are the first known people to quarantine at the facility.'],
    ['South China Morning Post', 'er construction was completed on Tuesday, state news agency Xinhua reported. Known as the High Intensity accelerator.'],
  ]
  for (const [outlet, summary] of liveCases) {
    const hit = detectWireAttribution({ id: 'live', outlet, url: 'https://example.com/a', body_text: null, summary })
    assert.equal(hit, null, `should not fire on: ${summary.slice(0, 60)}…`)
  }
})

test('a bare wire mention in running text is not a dateline', () => {
  const hit = detectWireAttribution({
    id: 'a4', outlet: 'BBC', url: 'https://bbc.co.uk/news/a',
    body_text: 'The prime minister told reporters that the Reuters report published last week had misstated the timeline of the negotiations.',
  })
  assert.equal(hit, null)
})

test('bare abbreviations never fire outside an explicit parenthetical tag', () => {
  // "AP" and "ANI" in running prose are far too ambiguous to carry a
  // high-confidence syndication assertion.
  const hit = detectWireAttribution({
    id: 'a5', outlet: 'Times of India', url: 'https://timesofindia.com/a',
    body_text: 'The AP exam results were announced on Tuesday and ANI reporters were present at the venue.',
  })
  assert.equal(hit, null)
})

test('outlet column naming a wire, published off-domain -> syndicated copy', () => {
  const hit = detectWireAttribution({
    id: 'a6', outlet: 'Reuters', url: 'https://billingsgazette.com/news/nation-world/article_fed5f073.html',
    body_text: 'Only 32 of 435 House seats are considered competitive this cycle, the fewest at this stage since at least 2008.',
  })
  assert.equal(hit.service, 'Reuters')
  assert.equal(hit.signal, 'outlet_field')
  assert.equal(hit.kind, 'syndicated_copy')
})

test('summary mention is medium confidence, not high', () => {
  const hit = detectWireAttribution({
    id: 'a7', outlet: 'Billings Gazette', url: 'https://billingsgazette.com/a',
    body_text: null,
    summary: 'Reuters analysis by Joseph Ax (syndicated copy): only 32 of 435 House seats are competitive.',
  })
  assert.equal(hit.service, 'Reuters')
  assert.equal(hit.signal, 'summary_mention')
  assert.equal(hit.confidenceBand, 'medium')
})

test('author field resolved to a wire service fires', () => {
  const hit = detectWireAttribution(
    { id: 'a8', outlet: 'Local Paper', url: 'https://local.example.com/a', body_text: 'A story with no dateline at all in its opening paragraph.', author_id: 'au1' },
    { authorName: 'Reuters' },
  )
  assert.equal(hit.signal, 'author_field')
})

test('no parent found is never a confident independence claim', () => {
  const { assertions } = build([{
    id: 'a9', outlet: 'Local Paper', url: 'https://local.example.com/a',
    body_text: 'SEOUL (Yonhap) — Officials confirmed the meeting would proceed as scheduled next month.',
  }])
  const row = assertions[0]
  assert.equal(row.parent_article_id, null)
  // The origin IS known (the agency) — it simply is not a corpus row. That is
  // a positive finding about the origin, not a claim of independence.
  assert.equal(row.origin_status, 'resolved_origin_found')
  assert.notEqual(row.origin_status, 'independent_origin')
  assert.notEqual(row.relationship_type, 'independent_origin')
})

test('every finding carries detection method, corpus scope and check date', () => {
  // Locked guardrail 4: a finding without its scope stated is unfalsifiable.
  const { assertions } = build([{
    id: 'a10', outlet: 'Local Paper', url: 'https://local.example.com/a',
    body_text: 'PARIS (AFP) — The summit concluded without a joint statement on Thursday evening.',
  }])
  const ev = assertions[0].evidence_basis
  assert.equal(assertions[0].detection_method, 'byline_attribution')
  assert.deepEqual(ev.corpus_scope, SCOPE)
  assert.equal(ev.checked_at, AT)
  assert.equal(ev.wire_service, 'Agence France-Presse')
  assert.ok(ev.matched_text.includes('AFP'))
  assert.equal(assertions[0].rule_version, LINEAGE_RULE_VERSION)
})

test('corpus scope is required — a scopeless run throws rather than shipping', () => {
  assert.throws(
    () => buildStage1Assertions([], {}),
    /corpusScope\.articles_scanned is required/,
  )
})

test('no composite score appears on any Stage 1 row', () => {
  const { assertions } = build([{
    id: 'a11', outlet: 'Local Paper', url: 'https://local.example.com/a',
    body_text: 'BERLIN (dpa) — The coalition agreed on the budget framework after overnight talks.',
  }])
  const row = assertions[0]
  // confidence_band is a BAND; nothing numeric, nothing summed.
  assert.equal(typeof row.confidence_band, 'string')
  assert.ok(['high', 'medium', 'low'].includes(row.confidence_band))
  for (const [key, value] of Object.entries(row)) {
    assert.notEqual(typeof value, 'number', `${key} must not be a numeric score`)
    assert.ok(!/score/i.test(key), `${key} must not be a score field`)
  }
})

test('wire own-domain detection covers subdomains and every registry entry', () => {
  assert.equal(urlHost('https://www.apnews.com/article/x?utm_source=rss'), 'apnews.com')
  assert.equal(leadText({ body_text: 'x'.repeat(900) }).length, 400)
  const ap = WIRE_SERVICES.find((s) => s.canonical === 'Associated Press')
  assert.ok(isWireOwnDomain(ap, 'https://apnews.com/article/x'))
  assert.ok(isWireOwnDomain(ap, 'https://live.apnews.com/x'))
  assert.ok(!isWireOwnDomain(ap, 'https://billingsgazette.com/x'))
  // Registry integrity: every service has a canonical name and at least one domain.
  for (const s of WIRE_SERVICES) {
    assert.ok(s.canonical && s.domains.length, `${s.canonical} incomplete`)
  }
})
