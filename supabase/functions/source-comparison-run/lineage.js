// 20_IDEA capability 1 — Source Independence & Claim Lineage.
// Detection pipeline, pure logic. Implementation brief 2026-08-17 Section 3.
//
// Lives beside the Source Comparison pipeline deliberately: Stage 3 is the
// SAME syndication-collapse logic that already runs correctly in
// source-comparison-run's write path (canonical URL + normalized body hash +
// union-find). Per the brief it is extracted and persisted here, never
// reimplemented — this module imports detectSyndicates/canonicalUrl/bodyHash
// from ./lib.js rather than carrying a second copy.
//
// Runtime-agnostic (Deno edge function + node:test): no Deno.*, no process.*.
//
// Hard rules honored here, not just at review:
//   - no composite lineage or independence score is computed anywhere;
//     relationship_type, confidence_band and origin_status stay separate;
//   - absence of a detected parent is NEVER a confident independence claim
//     (extends locked G2: missing evidence is not contradicting evidence);
//   - every parentless finding carries its detection method, corpus scope
//     and check date in evidence_basis (locked guardrail 4);
//   - publication count is never treated as evidence.

import { canonicalUrl, bodyHash } from './lib.js'

export const LINEAGE_RULE_VERSION = 'lineage-v1'

// How much of the article lead is scanned for a dateline/byline. Wire
// datelines are a lead-paragraph convention; scanning the whole body would
// turn any in-passing mention ("Reuters reported last week") into a false
// syndication claim.
export const LEAD_SCAN_CHARS = 400

// ---- wire service registry -------------------------------------------------------
// `abbrev` entries are matched ONLY inside an explicit parenthetical dateline
// tag — a bare "AP" or "ANI" in running text is far too ambiguous to carry a
// high-confidence syndication assertion. `domains` are the service's own
// publishing hosts: an article ON those hosts is the wire ORIGINAL, not a
// syndicated copy of one.
export const WIRE_SERVICES = [
  { canonical: 'Associated Press', names: ['Associated Press'], abbrev: ['AP'], domains: ['apnews.com', 'ap.org'] },
  { canonical: 'Reuters', names: ['Reuters'], abbrev: [], domains: ['reuters.com'] },
  { canonical: 'Agence France-Presse', names: ['Agence France-Presse', 'Agence France Presse'], abbrev: ['AFP'], domains: ['afp.com'] },
  { canonical: 'PA Media', names: ['PA Media', 'Press Association'], abbrev: [], domains: ['pamediagroup.com'] },
  { canonical: 'Deutsche Presse-Agentur', names: ['Deutsche Presse-Agentur'], abbrev: ['dpa'], domains: ['dpa.com'] },
  { canonical: 'EFE', names: ['Agencia EFE'], abbrev: ['EFE'], domains: ['efe.com'] },
  { canonical: 'ANSA', names: ['Agenzia ANSA'], abbrev: ['ANSA'], domains: ['ansa.it'] },
  { canonical: 'Xinhua', names: ['Xinhua'], abbrev: [], domains: ['xinhuanet.com', 'news.cn'] },
  { canonical: 'Kyodo News', names: ['Kyodo News'], abbrev: ['Kyodo'], domains: ['kyodonews.net'] },
  { canonical: 'Yonhap', names: ['Yonhap'], abbrev: [], domains: ['yna.co.kr'] },
  { canonical: 'Bloomberg', names: ['Bloomberg News'], abbrev: [], domains: ['bloomberg.com'] },
  { canonical: 'TASS', names: ['TASS'], abbrev: [], domains: ['tass.com', 'tass.ru'] },
  { canonical: 'Press Trust of India', names: ['Press Trust of India'], abbrev: ['PTI'], domains: ['ptinews.com'] },
  { canonical: 'Asian News International', names: ['Asian News International'], abbrev: ['ANI'], domains: ['aninews.in'] },
  { canonical: 'Indo-Asian News Service', names: ['Indo-Asian News Service'], abbrev: ['IANS'], domains: ['ians.in'] },
  { canonical: 'Anadolu Agency', names: ['Anadolu Agency'], abbrev: [], domains: ['aa.com.tr'] },
  { canonical: 'Interfax', names: ['Interfax'], abbrev: [], domains: ['interfax.com', 'interfax.ru'] },
]

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// A wire name mentioned as a CONTRIBUTOR is not a syndication claim: the
// outlet did its own reporting and credited a wire for part of it. Treating
// "Reuters contributed to this report" as syndicated_from would collapse a
// genuinely independent outlet into the wire's origin cluster and UNDERCOUNT
// corroboration — the mirror image of the bug this capability exists to fix.
const CONTRIBUTION_CONTEXT =
  /\b(contributed|contributing|additional reporting|with reporting|reporting by|also reported|first reported|according to)\b/i

function hasContributionContext(text, matchIndex) {
  // Look at a window around the hit rather than the whole lead — a
  // contribution credit sits adjacent to the wire name, not paragraphs away.
  const from = Math.max(0, matchIndex - 60)
  return CONTRIBUTION_CONTEXT.test(text.slice(from, matchIndex + 60))
}

// A wire named as the SOURCE OF A FACT is a citation, not a byline:
// "Reuters reported", "AFP reports", "told Reuters", "state news agency
// Xinhua reported". Every wire-mention candidate in the live corpus at
// 2026-08-17 was of exactly this shape, so without this the detector would
// have asserted syndicated_from over five articles that are nothing of the
// kind — Guardian and SCMP original reporting that happens to cite a wire.
//
// These are Stage 2 material (relationship_class = 'reference',
// relationship_type = 'quotes'), never Stage 1 derivation. Per the locked
// schema-concepts decision a citation is never treated as derivation proof.
const CITATION_VERB_AFTER =
  /^\s*(?:'s\s+|’s\s+)?(reported|reports|report|said|says|noted|adds|added|confirmed|confirms|wrote|writes|quoted|cited|revealed|reveals|found|learned|understands|understood|announced)\b/i
const CITATION_LEAD_BEFORE = /\b(told|according to|per|cited by|quoted by|via|sources? at)\s*$/i

function isCitationUse(text, matchIndex, matchLength) {
  const after = text.slice(matchIndex + matchLength, matchIndex + matchLength + 40)
  if (CITATION_VERB_AFTER.test(after)) return true
  const before = text.slice(Math.max(0, matchIndex - 30), matchIndex)
  return CITATION_LEAD_BEFORE.test(before)
}

/** Host portion of an article URL, reusing the shared canonicalUrl seam. */
export function urlHost(url) {
  const canon = canonicalUrl(url)
  return canon ? canon.split('/')[0] : null
}

/** True when the article is published on the wire service's OWN host. */
export function isWireOwnDomain(service, url) {
  const host = urlHost(url)
  if (!host) return false
  return service.domains.some((d) => host === d || host.endsWith('.' + d))
}

/** Lead text scanned for datelines: body preferred, summary as fallback. */
export function leadText(article) {
  const body = article.body_text ? String(article.body_text) : ''
  if (body) return body.slice(0, LEAD_SCAN_CHARS)
  return article.summary ? String(article.summary).slice(0, LEAD_SCAN_CHARS) : ''
}

// ---- Stage 1 signals ---------------------------------------------------------------
// Ordered strongest first. Each returns {service, signal, matched} or null.

/** "WASHINGTON (Reuters) - ..." / "(AP) —" — the classic wire dateline tag. */
function matchDatelineParenthetical(service, lead) {
  const tokens = [...service.names, ...service.abbrev].map(escapeRe)
  const re = new RegExp('\\(\\s*(' + tokens.join('|') + ')\\s*\\)', 'i')
  const m = re.exec(lead)
  if (!m) return null
  if (hasContributionContext(lead, m.index)) return null
  if (isCitationUse(lead, m.index, m[0].length)) return null
  return { signal: 'dateline_parenthetical', matched: m[0] }
}

/** "By Mark Sherman, Associated Press" — byline credit to the wire. */
function matchBylineCredit(service, lead) {
  const tokens = service.names.map(escapeRe)
  if (!tokens.length) return null
  const re = new RegExp('\\bBy\\s+[^,\\n]{2,60},\\s*(' + tokens.join('|') + ')\\b', 'i')
  const m = re.exec(lead)
  if (!m) return null
  return { signal: 'byline_credit', matched: m[0].trim() }
}

/** Explicit staff/correspondent attribution: "Reuters staff". */
function matchStaffAttribution(service, lead) {
  const tokens = service.names.map(escapeRe)
  if (!tokens.length) return null
  const re = new RegExp('\\b(' + tokens.join('|') + ')\\s+(staff|correspondents?)\\b', 'i')
  const m = re.exec(lead)
  if (!m) return null
  if (hasContributionContext(lead, m.index)) return null
  if (isCitationUse(lead, m.index, m[0].length)) return null
  return { signal: 'staff_attribution', matched: m[0].trim() }
}

/** The authors table resolved this article's byline to a wire service. */
function matchAuthorField(service, authorName) {
  if (!authorName) return null
  const tokens = [...service.names, ...service.abbrev].map(escapeRe)
  const re = new RegExp('(^|\\W)(' + tokens.join('|') + ')(\\W|$)', 'i')
  if (!re.test(String(authorName))) return null
  return { signal: 'author_field', matched: String(authorName) }
}

/** outlet column names a wire service. */
function matchOutletField(service, outlet) {
  if (!outlet) return null
  const tokens = [...service.names, ...service.abbrev].map(escapeRe)
  const re = new RegExp('^\\s*(' + tokens.join('|') + ')\\s*$', 'i')
  if (!re.test(String(outlet))) return null
  return { signal: 'outlet_field', matched: String(outlet) }
}

/** Wire named in the curated summary. Weaker: editorial metadata, not the artifact. */
function matchSummaryMention(service, summary) {
  if (!summary) return null
  const tokens = service.names.map(escapeRe)
  if (!tokens.length) return null
  const text = String(summary)
  const re = new RegExp('\\b(' + tokens.join('|') + ')\\b', 'i')
  const m = re.exec(text)
  if (!m) return null
  if (hasContributionContext(text, m.index)) return null
  if (isCitationUse(text, m.index, m[0].length)) return null
  return { signal: 'summary_mention', matched: text.slice(Math.max(0, m.index - 40), m.index + 60).trim() }
}

// Signal -> confidence band. Bands, never numbers, and never summed.
const SIGNAL_BANDS = {
  dateline_parenthetical: 'high',
  byline_credit: 'high',
  staff_attribution: 'high',
  outlet_field: 'high',
  author_field: 'high',
  summary_mention: 'medium',
}

/**
 * Stage 1 — byline/wire-service attribution for ONE article.
 *
 * Returns null when no wire attribution is found, or:
 *   { service, signal, matched, confidenceBand, kind }
 * where kind is:
 *   'syndicated_copy' — wire-attributed, published somewhere other than the
 *                       wire's own host: a derivation;
 *   'wire_original'   — wire-attributed AND on the wire's own host. This is
 *                       the ORIGIN, not a copy of one. v1 emits NO assertion
 *                       for it: the brief's locked Stage 1 output is
 *                       derivation/syndicated_from, and inventing a
 *                       'wire_origin' relationship_type would extend locked
 *                       vocabulary. Reported to the caller so the fact is
 *                       visible rather than silently dropped.
 */
export function detectWireAttribution(article, { authorName = null } = {}) {
  const lead = leadText(article)
  const matchers = [
    (s) => matchDatelineParenthetical(s, lead),
    (s) => matchBylineCredit(s, lead),
    (s) => matchStaffAttribution(s, lead),
    (s) => matchOutletField(s, article.outlet),
    (s) => matchAuthorField(s, authorName),
    (s) => matchSummaryMention(s, article.summary),
  ]
  for (const matcher of matchers) {
    for (const service of WIRE_SERVICES) {
      const hit = matcher(service)
      if (!hit) continue
      return {
        service: service.canonical,
        signal: hit.signal,
        matched: hit.matched,
        confidenceBand: SIGNAL_BANDS[hit.signal],
        kind: isWireOwnDomain(service, article.url) ? 'wire_original' : 'syndicated_copy',
      }
    }
  }
  return null
}

/**
 * Stage 1 assertion rows for a corpus slice.
 *
 * Wire attribution identifies the ORIGIN (the agency) but the agency's own
 * article is usually not in the corpus, so parent_article_id stays null and
 * origin_status records 'resolved_origin_found': the origin IS known, it just
 * is not a corpus row. That is a positive finding about the origin, never an
 * independence claim — the two are different facts and the schema keeps them
 * apart.
 *
 * `corpusScope` is required rather than optional: locked guardrail 4 says an
 * absence/origin finding without its scope stated is unfalsifiable and must
 * not ship.
 */
export function buildStage1Assertions(articles, { authorNameById = new Map(), corpusScope, checkedAt } = {}) {
  if (!corpusScope || typeof corpusScope.articles_scanned !== 'number') {
    throw new Error('buildStage1Assertions: corpusScope.articles_scanned is required (locked guardrail 4)')
  }
  const scannedAt = checkedAt ?? new Date().toISOString()
  const assertions = []
  const wireOriginals = []
  for (const article of articles) {
    const hit = detectWireAttribution(article, { authorName: authorNameById.get(article.author_id) ?? null })
    if (!hit) continue
    if (hit.kind === 'wire_original') {
      wireOriginals.push({ articleId: article.id, service: hit.service, signal: hit.signal })
      continue
    }
    assertions.push({
      child_article_id: article.id,
      parent_article_id: null,
      relationship_class: 'derivation',
      relationship_type: 'syndicated_from',
      origin_status: 'resolved_origin_found',
      detection_method: 'byline_attribution',
      evidence_basis: {
        wire_service: hit.service,
        signal: hit.signal,
        matched_text: hit.matched,
        published_host: urlHost(article.url),
        corpus_scope: corpusScope,
        checked_at: scannedAt,
      },
      confidence_band: hit.confidenceBand,
      review_status: 'unreviewed',
      rule_version: LINEAGE_RULE_VERSION,
    })
  }
  return { assertions, wireOriginals }
}

// ---- Stage 3: normalized exact-text hashing -----------------------------------------
//
// THIS STAGE DOES NOT DETECT ANYTHING NEW. The canonical-URL + normalized
// body-hash + union-find collapse in ./lib.js detectSyndicates already ran
// correctly at write time and has since 2026-08-06; its only defect was that
// nothing persisted it (00_INDEX thread (i)). Stage 3 is therefore a
// PERSISTENCE seam over that existing computation: runPipeline hands its
// already-computed `syndicates` map to buildStage3Assertions, which turns each
// collapsed group into rows. detectSyndicates is not called a second time and
// its grouping rule is not restated here.
//
// The only thing computed locally is EVIDENCE ANNOTATION — which of the two
// keys (body hash / canonical URL) a given member shares with its group
// origin — using the same bodyHash/canonicalUrl helpers, so evidence_basis can
// name the matched value instead of asserting an unexplained match.

/**
 * Deterministic origin representative for one collapsed group.
 *
 * Earliest published_at wins; unknown timestamps sort last; ties break on the
 * lexically smallest id so re-runs are stable.
 *
 * NOTE ON WHAT THIS DOES AND DOES NOT CLAIM: this picks a representative, not
 * a proven source. The corpus may not contain the true original at all (the
 * live Reuters/billingsgazette case is exactly that). The defensible claim a
 * collapsed group supports is "these N articles share ONE origin, so they are
 * one corroborating source, not N" — which is all E2 needs. It is NOT "article
 * X is where this story came from", and nothing downstream renders it as such.
 */
export function selectGroupOrigin(members) {
  return [...members].sort((a, b) => {
    const ta = a.published_at ? Date.parse(a.published_at) : Number.POSITIVE_INFINITY
    const tb = b.published_at ? Date.parse(b.published_at) : Number.POSITIVE_INFINITY
    if (ta !== tb) return ta - tb
    return String(a.id).localeCompare(String(b.id))
  })[0]
}

// Match basis -> confidence band. Bands, never numbers, and never summed.
//
// FLAGGED FOR OWNER REVIEW: the brief says "confidence_band scaled to match
// percentage", but v1 matching is EXACT only (fuzzy/near-duplicate is
// shadow-mode and excluded), so match percentage takes exactly two values
// rather than a range:
//   exact_text_hash  — normalized bodies are byte-identical, 100%  -> high
//   canonical_url    — same document URL, but the stored text was NOT proven
//                      identical (missing body, sub-200-char body, or a page
//                      edited between fetches)                     -> medium
// Reading "scaled" as a real similarity percentage would require the fuzzy
// matching this build is explicitly forbidden from putting in presentation.
const MATCH_BASIS_BANDS = { exact_text_hash: 'high', canonical_url: 'medium' }

/** Which key this member actually shares with its group origin. */
function matchBasis(member, origin) {
  const mh = bodyHash(member.body_text)
  const oh = bodyHash(origin.body_text)
  if (mh && oh && mh === oh) {
    return { basis: 'exact_text_hash', match_percent: 100, matched_value: mh }
  }
  const mu = canonicalUrl(member.url)
  const ou = canonicalUrl(origin.url)
  if (mu && ou && mu === ou) {
    return { basis: 'canonical_url', match_percent: null, matched_value: mu }
  }
  // Transitively collapsed: joined to the group through another member rather
  // than by a key shared directly with the origin. Union-find guarantees the
  // group is genuinely connected; the direct pair simply is not the link.
  return { basis: 'canonical_url', match_percent: null, matched_value: null, transitive: true }
}

/**
 * Stage 3 assertion rows from an ALREADY-COMPUTED syndicate map.
 *
 * @param articles   corpus slice (needs id, url, body_text, published_at)
 * @param syndicates Map(articleId -> syndicateId) from lib.js detectSyndicates,
 *                   surfaced on the pipeline plan as plan.syndicates
 */
export function buildStage3Assertions(articles, syndicates, { corpusScope, checkedAt } = {}) {
  if (!corpusScope || typeof corpusScope.articles_scanned !== 'number') {
    throw new Error('buildStage3Assertions: corpusScope.articles_scanned is required (locked guardrail 4)')
  }
  const scannedAt = checkedAt ?? new Date().toISOString()
  const byId = new Map(articles.map((a) => [a.id, a]))

  const groups = new Map()
  for (const [articleId, syndicateId] of syndicates) {
    const article = byId.get(articleId)
    if (!article) continue
    if (!groups.has(syndicateId)) groups.set(syndicateId, [])
    groups.get(syndicateId).push(article)
  }

  const assertions = []
  for (const [syndicateId, members] of groups) {
    if (members.length < 2) continue
    const origin = selectGroupOrigin(members)
    for (const member of members) {
      if (member.id === origin.id) continue
      const { basis, match_percent, matched_value, transitive } = matchBasis(member, origin)
      assertions.push({
        child_article_id: member.id,
        parent_article_id: origin.id,
        relationship_class: 'derivation',
        relationship_type: 'syndicated_from',
        origin_status: null,          // parent resolved -> no origin_status (schema enforces this)
        detection_method: basis === 'exact_text_hash' ? 'exact_text_hash' : 'canonical_url_match',
        evidence_basis: {
          match_basis: basis,
          match_percent,              // 100 for byte-identical normalized bodies; null when unproven
          matched_value,
          transitive_via_group: !!transitive,
          syndicate_id: syndicateId,
          group_size: members.length,
          origin_selection: 'earliest_published_then_lexical_id',
          corpus_scope: corpusScope,
          checked_at: scannedAt,
        },
        confidence_band: MATCH_BASIS_BANDS[basis],
        review_status: 'unreviewed',
        rule_version: LINEAGE_RULE_VERSION,
      })
    }
  }
  return assertions
}

// ---- Stage 2: canonical URL / explicit source reference -----------------------------
//
// Brief Section 3 Stage 2: an article containing an explicit link or citation
// to ANOTHER CORPUS ARTICLE. Distinguish by signal — an attribution phrase
// ("originally reported by X") means derived_from; an inline citation or
// hyperlink carrying no attribution claim means quotes (relationship_class
// 'reference', never treated as derivation proof per the locked
// schema-concepts decision).
//
// THIS STAGE REFUSES TO GUESS. Three outcomes, not two: derivation, reference,
// and AMBIGUOUS. An ambiguous reference produces NO assertion and is returned
// for human review instead. Writing a coin-flip as either class would put a
// fabricated derivation claim (or a fabricated independence) into the origin
// clusters that E2 counts.

// The article says its OWN content comes from the other report.
const DERIVATION_PHRASES = [
  /\boriginally reported by\b/i,
  /\bbased on reporting by\b/i,
  /\bthis (?:story|article|report) (?:was )?originally (?:published|appeared)\b/i,
  /\badapted from\b/i,
  /\ba version of this (?:story|article) (?:first )?appeared\b/i,
]

// The article references another's report as a SOURCE while doing its own work.
const CITATION_PHRASES = [
  /\baccording to\b/i,
  /\bciting\b/i,
  /\btold\b/i,
  /\bper\b/i,
  /\b(?:reported|reports|said|says|wrote|noted|confirmed)\b/i,
]

// Genuinely undecidable from the phrase alone. Each of these is routinely used
// BOTH as a derivation credit and as a priority-of-discovery courtesy by an
// outlet doing entirely independent reporting.
const AMBIGUOUS_PHRASES = [
  { re: /\bfirst reported by\b/i, why: 'credits priority of discovery; does not state whether this article derives from that report' },
  { re: /\bwas first to report\b/i, why: 'priority credit, not a derivation claim' },
  { re: /\bas .{0,30}first reported\b/i, why: 'priority credit, not a derivation claim' },
  { re: /\bfollowing a report by\b/i, why: 'sequence, not stated dependence' },
  { re: /\bafter .{0,30} reported\b/i, why: 'sequence, not stated dependence' },
  { re: /\bcited a report by\b/i, why: 'cites the report as evidence but may also be its source' },
  { re: /\bconfirming a report by\b/i, why: 'independent confirmation and dependence are indistinguishable here' },
]

/**
 * Classify one reference window.
 * Returns { classification: 'derivation'|'reference'|'ambiguous', phrase, why }.
 *
 * Order matters and encodes the caution: ambiguity is checked FIRST, so a
 * phrase that is undecidable never gets captured by a broad citation pattern
 * and silently written as `quotes`.
 */
export function classifyReference(windowText) {
  const text = String(windowText || '')

  for (const { re, why } of AMBIGUOUS_PHRASES) {
    const m = re.exec(text)
    if (m) return { classification: 'ambiguous', phrase: m[0], why }
  }
  const derivation = DERIVATION_PHRASES.map((re) => re.exec(text)).find(Boolean)
  const citation = CITATION_PHRASES.map((re) => re.exec(text)).find(Boolean)

  // Both signals present and neither dominates -> undecidable, not a tiebreak.
  if (derivation && citation) {
    return {
      classification: 'ambiguous',
      phrase: derivation[0] + ' + ' + citation[0],
      why: 'attribution and citation language both present in the same reference',
    }
  }
  if (derivation) return { classification: 'derivation', phrase: derivation[0], why: 'states this article derives from the referenced report' }
  if (citation) return { classification: 'reference', phrase: citation[0], why: 'references the report as a source without claiming derivation' }

  // A bare link with no surrounding language. Brief Section 3: a hyperlink
  // without an attribution claim is `quotes`.
  return { classification: 'reference', phrase: null, why: 'bare link or citation with no attribution claim' }
}

// Outlet self-names. An outlet referring to its OWN masthead ("The Times
// reported", in a New York Times article) is not lineage at all — without this
// the corpus's live NYT case would produce an article derived from its own
// outlet.
export const OUTLET_SELF_NAMES = {
  'New York Times': ['The Times', 'The New York Times', 'NYT'],
  'The Guardian': ['The Guardian', 'the Guardian'],
  'BBC': ['The BBC', 'BBC News'],
  'South China Morning Post': ['the Post', 'the South China Morning Post', 'SCMP'],
  'NPR': ['NPR'],
  'Al Jazeera': ['Al Jazeera'],
  'Fox News': ['Fox News'],
  'Times of India': ['The Times of India', 'TOI'],
  'CNN': ['CNN'],
}

export function isSelfReference(outlet, windowText) {
  const names = OUTLET_SELF_NAMES[outlet] || []
  return names.some((n) => new RegExp('\\b' + escapeRe(n) + '\\b').test(String(windowText || '')))
}

const REFERENCE_WINDOW = 90

// A URL at the end of a sentence carries the sentence's punctuation into the
// regex match ("…/original." ), and that trailing character defeats the
// canonical-URL lookup entirely — a link in ordinary prose would never resolve
// to its corpus article. Trim the characters that cannot end a real URL.
// Caught by the Stage 2 tests, not by inspection.
const URL_TRAILING_PUNCT = /[.,;:!?)\]}'"\u00bb\u201d\u2019]+$/

export function trimUrlPunctuation(url) {
  return String(url || '').replace(URL_TRAILING_PUNCT, '')
}

/**
 * Stage 2 over a corpus slice.
 *
 * Returns { assertions, ambiguous, unresolvable }:
 *   assertions   — decided cases with a RESOLVED corpus parent, ready to write
 *   ambiguous    — flagged for human review; NEVER written as assertions
 *   unresolvable — a reference to an outlet rather than to a specific article
 *                  (and self-references), recorded so the fact is visible
 *
 * Parent resolution is by canonical URL only: a hyperlink in the body whose
 * canonical URL matches a corpus article. An outlet-name reference ("The Times
 * reported") identifies an OUTLET, not an article — picking one of that
 * outlet's articles would be a guess dressed as evidence, so it never resolves.
 */
export function buildStage2Assertions(articles, { corpusScope, checkedAt } = {}) {
  if (!corpusScope || typeof corpusScope.articles_scanned !== 'number') {
    throw new Error('buildStage2Assertions: corpusScope.articles_scanned is required (locked guardrail 4)')
  }
  const scannedAt = checkedAt ?? new Date().toISOString()

  const byCanonicalUrl = new Map()
  for (const a of articles) {
    const c = canonicalUrl(a.url)
    if (c && !byCanonicalUrl.has(c)) byCanonicalUrl.set(c, a)
  }

  const assertions = []
  const ambiguous = []
  const unresolvable = []

  for (const article of articles) {
    const text = [article.body_text, article.summary].filter(Boolean).join('\n')
    if (!text) continue

    for (const m of text.matchAll(/https?:\/\/[^\s"'<>]+/g)) {
      const rawUrl = trimUrlPunctuation(m[0])
      const target = byCanonicalUrl.get(canonicalUrl(rawUrl))
      if (!target || target.id === article.id) continue

      const from = Math.max(0, m.index - REFERENCE_WINDOW)
      const windowText = text.slice(from, m.index + m[0].length + REFERENCE_WINDOW)
      const verdict = classifyReference(windowText)

      const base = {
        child_article_id: article.id,
        parent_article_id: target.id,
        matched_url: rawUrl,
        window: windowText.trim(),
        ...verdict,
      }

      if (verdict.classification === 'ambiguous') {
        ambiguous.push({ ...base, child_outlet: article.outlet, parent_outlet: target.outlet })
        continue
      }
      if (article.outlet === target.outlet || isSelfReference(article.outlet, windowText)) {
        unresolvable.push({ ...base, reason: 'self_reference_same_outlet', child_outlet: article.outlet })
        continue
      }

      const isDerivation = verdict.classification === 'derivation'
      assertions.push({
        child_article_id: article.id,
        parent_article_id: target.id,
        relationship_class: isDerivation ? 'derivation' : 'reference',
        relationship_type: isDerivation ? 'derived_from' : 'quotes',
        origin_status: null,
        detection_method: 'canonical_url_match',
        evidence_basis: {
          matched_url: rawUrl,
          matched_phrase: verdict.phrase,
          classification_reason: verdict.why,
          reference_window: windowText.trim(),
          corpus_scope: corpusScope,
          checked_at: scannedAt,
        },
        // A citation is evidence of a citation, never of derivation. Even a
        // clearly-worded attribution phrase is one sentence of self-report, so
        // derivation caps at medium here — Stage 3's byte-identical text is
        // what earns 'high'.
        confidence_band: 'medium',
        review_status: 'unreviewed',
        rule_version: LINEAGE_RULE_VERSION,
      })
    }
  }
  return { assertions, ambiguous, unresolvable }
}

/**
 * Outlet-level reference scan — reporting only, produces NO assertions.
 *
 * Surfaces "X reported" style references to another OUTLET so the ambiguity
 * they carry is visible to a reviewer rather than invisible. These can never
 * become lineage rows: they name an outlet, not an article.
 */
export function scanOutletReferences(articles, knownOutlets) {
  const outlets = [...new Set(knownOutlets)].filter(Boolean)
  const found = []
  for (const article of articles) {
    const text = [article.body_text, article.summary].filter(Boolean).join('\n')
    if (!text) continue
    for (const outlet of outlets) {
      // Match the masthead AND its known aliases: the live New York Times case
      // says "The Times", never "New York Times", so a canonical-name-only
      // scan would miss precisely the self-reference worth surfacing.
      const aliases = [outlet, ...(OUTLET_SELF_NAMES[outlet] || [])]
      const re = new RegExp('.{0,60}\\b(?:' + aliases.map(escapeRe).join('|') + ')\\b.{0,60}', 'i')
      const m = re.exec(text)
      if (!m) continue
      const verdict = classifyReference(m[0])
      found.push({
        child_article_id: article.id,
        child_outlet: article.outlet,
        referenced_outlet: outlet,
        self_reference: article.outlet === outlet || isSelfReference(article.outlet, m[0]),
        window: m[0].trim(),
        ...verdict,
      })
    }
  }
  return found
}
