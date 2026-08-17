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

import { canonicalUrl } from './lib.js'

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
