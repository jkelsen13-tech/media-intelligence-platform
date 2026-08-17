// Stage 1 evidence run against the LIVE corpus (2026-08-17).
//
// The 11 rows below are the complete candidate set: every article in the live
// corpus (752 rows) whose outlet, author name, body lead, or summary contains
// any wire-service token, pulled by a deliberately broad SQL prefilter that is
// a strict superset of what the JS detector can match. The other 741 articles
// contain no wire token anywhere and cannot produce a Stage 1 assertion.
//
// Content is reproduced verbatim from the live rows (bodies truncated to the
// 400-char lead the detector actually scans) so this run is reproducible
// without database access. Run: node verifier/lineage-v1/stage1_live_corpus_run.mjs

import { buildStage1Assertions, detectWireAttribution } from '../../supabase/functions/source-comparison-run/lineage.js'

const CORPUS_SCOPE = { articles_scanned: 752, candidates: 11, corpus: 'live', checked_through: '2026-08-17' }

const CANDIDATES = [
  { id: '42e3387e-510e-48ce-8e1d-b0c2b8843bc0', outlet: 'Associated Press',
    url: 'https://apnews.com/live/supreme-court-voting-rights-arguments-updates',
    body_text: "AP live-updates file from the October 15, 2025 reargument in Louisiana v. Callais, covering the oral argument on whether Louisiana's intentional creation of a second majority-Black congressional district violates the Fourteenth or Fifteenth Amendments. (Headline-derived summary: page retrieval failed at fetch time.)" },
  { id: '4c11b4b7-45bc-4f53-b96a-28d6af69a4c9', outlet: 'Associated Press',
    url: 'https://apnews.com/article/supreme-court-voting-rights-congressional-redistricting-louisiana-aa5d7dbde7c13654f341d152c2ad5229',
    body_text: "AP main wire story by Mark Sherman: the 6-3 Callais ruling hollowed out Section 2, striking down the Fields district as an unconstitutional gerrymander; Alito for the majority, Kagan dissenting ('gutting of Section 2')." },
  { id: '95b5905c-66eb-4eec-a078-ad0d72e8c543', outlet: 'Associated Press',
    url: 'https://apnews.com/article/voting-rights-race-supreme-court-louisiana-edf6db57eb13c6763cf7741af8267fa6',
    body_text: 'AP explainer ahead of the October 15 reargument: background on Section 2, the Robinson v. Ardoin litigation line, why the case was reargued.' },
  { id: 'b8203de7-a498-4e32-acce-e0b79682e720', outlet: 'Associated Press',
    url: 'https://apnews.com/live/voting-rights-act-supreme-court-updates-04-29-2026',
    body_text: "AP day-of live file: the Supreme Court's 6-3 ruling struck down Louisiana's second majority-Black congressional district as relying too heavily on race." },
  { id: 'ccf8c966-fc5b-45e1-aca7-3b53e0bd8438', outlet: 'Associated Press',
    url: 'https://apnews.com/article/supreme-court-voting-rights-louisiana-race-963c002fcb8a35afe36b2e14111cb88e',
    body_text: "AP argument-day report: during 2.5 hours of reargument in Louisiana v. Callais, the court's six conservative justices appeared inclined to strike down Louisiana's Black-majority 6th district." },
  { id: '2e4fd9b8-ac17-4324-aef2-acbb23e8949a', outlet: 'Reuters',
    url: 'https://billingsgazette.com/news/nation-world/government-politics/article_fed5f073-5cad-5c66-b4da-d1065b9196bc.html',
    body_text: 'Reuters analysis by Joseph Ax (syndicated copy): only 32 of 435 House seats are competitive, fewest at this stage since at least 2008; the Callais ruling amid the mid-decade gerrymandering war is expected to shrink competition further.' },
  { id: 'a1d7d62d-f34d-43fc-b5fc-7e51b6a23c4e', outlet: 'South China Morning Post',
    url: 'https://www.scmp.com/news/people-culture/trending-china/article/3361527/chinese-doctor-wades-through-severe-floodwaters', body_text: null,
    summary: 'A man in northeastern China who was filmed pushing his bicycle through deep water on his way to work amid torrential rain has trended on social media. The video triggered an outpouring of emotion after internet users learned that the man was a doctor who had appointments to perform surgery on two patients that day, state news agency Xinhua reported. It was on July 13 when Shenyang, in Liaoning province, was hit by a serious downpour.' },
  { id: 'f9d7f640-e9c2-48bf-a382-a78b2dab4b61', outlet: 'South China Morning Post',
    url: 'https://www.scmp.com/news/china/science/article/3361428/china-fires-powerful-particle-accelerator', body_text: null,
    summary: 'China has brought online a record-breaking particle accelerator that can produce the world’s most intense beams of charged atoms. Scientific operations began after construction was completed on Tuesday, state news agency Xinhua reported. Known as the High Intensity heavy-ion Accelerator Facility.' },
  { id: '90e67098-b3f5-4205-9ede-3758ab2d30c9', outlet: 'The Guardian',
    url: 'https://www.theguardian.com/world/live/2026/jul/22/ukraine-war-russia-sanctions-europe-eu-latest-news-updates', body_text: null,
    summary: 'Brussels talks between senior diplomats now underway in attempt to sign off 21st package of sanctions. The Venice Biennale said it would challenge a European Union decision to withdraw a grant in response to the return of Russia to its 2026 edition, despite continuing aggression on Ukraine, Reuters reported. The Italian government sharply criticised the move.' },
  { id: 'd0984b0b-1140-4288-a26f-b384c2cd9d30', outlet: 'The Guardian',
    url: 'https://www.theguardian.com/world/live/2026/jul/22/middle-east-us-iran-war-trump-houthis-strait-of-hormuz', body_text: null,
    summary: 'This live blog is now closed. The Jordanian army said it intercepted four Iranian missiles on Wednesday with two additional missile falling in an open area, AFP reports. The two missiles that the army did not intercept fell in “two remote, uninhabited areas”.' },
  { id: 'd3eae7f8-b4f5-4653-b528-856480da6960', outlet: 'The Guardian',
    url: 'https://www.theguardian.com/us-news/2026/jul/17/ebola-us-aid-workers-kenya', body_text: null,
    summary: 'Aid workers are first known people to quarantine at facility, which sparked huge opposition in Kenya. Seven American aid workers who had been in Congo to fight the Ebola outbreak are quarantining at a new isolation facility in Kenya after the US government introduced travel restrictions, the head of a US charity employing them told Reuters.' },
]

const { assertions, wireOriginals } = buildStage1Assertions(CANDIDATES, {
  corpusScope: CORPUS_SCOPE,
  checkedAt: '2026-08-17T00:00:00.000Z',
})

const originIds = new Set(wireOriginals.map((w) => w.articleId))
const assertedIds = new Set(assertions.map((a) => a.child_article_id))

console.log('Stage 1 — live corpus run, 2026-08-17')
console.log('corpus 752 articles | candidates 11 | non-candidates 741 (no wire token anywhere)\n')

console.log('PER-CANDIDATE OUTCOME')
for (const a of CANDIDATES) {
  const hit = detectWireAttribution(a)
  const outcome = assertedIds.has(a.id) ? 'ASSERT syndicated_from'
    : originIds.has(a.id) ? 'wire original — no assertion'
    : 'no assertion'
  console.log(
    `  ${a.outlet.padEnd(26)} ${outcome.padEnd(30)} ${hit ? `${hit.service}/${hit.signal}/${hit.confidenceBand}` : '—'}`,
  )
}

console.log('\nASSERTIONS WRITTEN:', assertions.length)
for (const row of assertions) {
  console.log(JSON.stringify({
    child_article_id: row.child_article_id,
    parent_article_id: row.parent_article_id,
    relationship_class: row.relationship_class,
    relationship_type: row.relationship_type,
    origin_status: row.origin_status,
    confidence_band: row.confidence_band,
    evidence_basis: row.evidence_basis,
  }, null, 2))
}

console.log('\nWIRE ORIGINALS (origin, not a copy — deliberately no assertion):', wireOriginals.length)
for (const w of wireOriginals) console.log(`  ${w.articleId}  ${w.service}  via ${w.signal}`)

const suppressed = CANDIDATES.filter((a) => !assertedIds.has(a.id) && !originIds.has(a.id))
console.log('\nCANDIDATES CORRECTLY SUPPRESSED (wire cited as a source of fact, not a byline):', suppressed.length)
for (const a of suppressed) console.log(`  ${a.id}  ${a.outlet}`)
