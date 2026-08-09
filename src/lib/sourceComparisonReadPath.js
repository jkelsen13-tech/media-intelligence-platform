// Source Comparison (03_BACKLOG Item 1) read path — beta only.
//
// Gate: pipeline_config.source_comparison_beta must be exactly true. When the
// flag is false (or unreadable) every fetch is skipped and the disabled view
// is returned — same withhold posture as phase3ReadPath / 02B provenance_ui.
// source_comparison_public is NOT consulted: public exposure is a separate
// owner-authorized gate and this UI never enables it.
//
// Hard rules honored at the read seam:
//   - no composite score is computed or served — dimensions stay separate;
//   - omission (extracted coverage, no matching claim) is structurally
//     distinct from coverage_unknown (extraction has not run / nothing to
//     compare against) — never collapsed;
//   - thin_extraction claims (title/summary-grain) carry a visible marker;
//   - syndicated copies collapse to one original source (canonical URL);
//   - no outlet-count gating — thin columns are honest signal;
//   - every surface claim carries its Phase 2 explanation object for the
//     details disclosure.

const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|igshid$|ref$|spm$)/

export function canonicalUrl(url) {
  if (!url) return null
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    const path = u.pathname.replace(/\/+$/, '').toLowerCase()
    const params = [...u.searchParams.entries()]
      .filter(([k]) => !TRACKING_PARAMS.test(k.toLowerCase()))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&')
    return host + path + (params ? '?' + params : '')
  } catch {
    return String(url).toLowerCase().trim()
  }
}

/** Map(articleId -> syndicateId) over event member articles (canonical URL). */
export function collapseBySyndication(articles) {
  const byUrl = new Map()
  for (const a of articles) {
    const key = canonicalUrl(a.url)
    if (!key) continue
    if (!byUrl.has(key)) byUrl.set(key, [])
    byUrl.get(key).push(a.id)
  }
  const out = new Map()
  let n = 0
  for (const ids of byUrl.values()) {
    if (ids.length < 2) continue
    const sid = 'syn-' + ++n
    for (const id of ids) out.set(id, sid)
  }
  return out
}

/** Distinct outlets after syndicate collapse. One syndicate = one source. */
export function independentOutlets(articleIds, articlesById, syndicates) {
  const seen = new Set()
  const outlets = []
  for (const id of articleIds) {
    const syn = syndicates.get(id)
    if (syn) {
      if (seen.has(syn)) continue
      seen.add(syn)
    }
    const outlet = articlesById.get(id)?.outlet
    if (outlet && !outlets.includes(outlet)) outlets.push(outlet)
  }
  return outlets
}

/**
 * Outlet reliability tiers per G2 Axis 1 worked examples (editorial judgment,
 * locked 2026-07-28). Outlets not tiered in the G2 record return null ->
 * rendered as "not yet tiered", never guessed.
 */
export const OUTLET_RELIABILITY = {
  'BBC': 'R1',
  'New York Times': 'R1',
  'The Guardian': 'R1',
  'NPR': 'R1',
  'Al Jazeera': 'R2',
  'South China Morning Post': 'R2',
  'Fox News': 'R3',
  'Democracy Now!': 'R3',
  'Times of India': 'R4',
}

export const R_LEVEL_NAMES = {
  R1: 'R1 established-primary',
  R2: 'R2 established-secondary',
  R3: 'R3 partisan-weighted',
  R4: 'R4 unvetted-origin',
}

export const E_LEVEL_NAMES = {
  E1: 'E1 documented',
  E2: 'E2 corroborated',
  E4: 'E4 asserted',
}

/**
 * Claim-level evidence strength (G2 Axis 2 mapping):
 *   primary-evidence link -> E1 documented
 *   >=2 independent outlets -> E2 corroborated
 *   single source -> E4 asserted
 * (E3 circumstantial is not produced by this read path.)
 */
export function evidenceStrength({ independentOutletCount, hasPrimaryEvidence }) {
  if (hasPrimaryEvidence) return 'E1'
  if (independentOutletCount >= 2) return 'E2'
  return 'E4'
}

/** Pure seam: per-claim presentation object. */
export function buildClaimView(claim, surfaces, ctx) {
  const { articlesById, syndicates, eventOutlets, evidenceLinks, corrections, explanationsByArticle } = ctx
  const surfaceViews = surfaces.map((s) => {
    const article = articlesById.get(s.article_id) ?? {}
    return {
      id: s.id,
      articleId: s.article_id,
      outlet: article.outlet ?? 'unknown',
      surfaceText: s.surface_text,
      publishedAt: article.published_at ?? null,
      url: article.url ?? null,
      loadedLanguage: Array.isArray(s.loaded_language) ? s.loaded_language : [],
      explanation: explanationsByArticle.get(s.article_id) ?? null,
    }
  })
  const independent = independentOutlets(surfaces.map((s) => s.article_id), articlesById, syndicates)
  const syndicatedExtra = surfaces.length - independent.length
  const claimingOutlets = new Set(surfaceViews.map((s) => s.outlet))
  const omittedBy = []
  const coverageUnknown = []
  for (const outlet of eventOutlets) {
    if (claimingOutlets.has(outlet)) continue
    // Omission requires extracted coverage: the outlet's event articles must
    // have produced claim rows (or carry a non-empty claims payload). Empty
    // extraction means we cannot say "didn't cover" — only "nothing extracted".
    const outletArticles = ctx.eventArticlesByOutlet.get(outlet) ?? []
    const anyExtracted = outletArticles.some((a) => ctx.extractedArticleIds.has(a.id))
    if (anyExtracted) omittedBy.push(outlet)
    else coverageUnknown.push(outlet)
  }
  const links = evidenceLinks.filter((l) => l.claim_id === claim.id)
  const claimCorrections = corrections.filter((c) => c.claim_id === claim.id)
  return {
    id: claim.id,
    canonicalText: claim.canonical_text,
    classification: independent.length >= 2 ? 'shared' : 'unique',
    thinExtraction: claim.thin_extraction === true,
    independentOutlets: independent,
    syndicatedExtra,
    omittedBy,
    coverageUnknown,
    evidenceStrength: evidenceStrength({
      independentOutletCount: independent.length,
      hasPrimaryEvidence: links.length > 0,
    }),
    evidenceLinks: links,
    corrections: claimCorrections,
    surfaces: surfaceViews.sort((a, b) => String(a.publishedAt ?? '').localeCompare(String(b.publishedAt ?? ''))),
  }
}

/** Pure seam: per-event presentation object. No outlet-count gating. */
export function buildEventView(event, memberRows, ctx) {
  const articles = memberRows.map((m) => ctx.articlesById.get(m.article_id)).filter(Boolean)
  const outlets = [...new Set(articles.map((a) => a.outlet))]
  const timing = outlets
    .map((outlet) => {
      const times = articles.filter((a) => a.outlet === outlet).map((a) => a.published_at).filter(Boolean).sort()
      return { outlet, firstPublishedAt: times[0] ?? null }
    })
    .sort((a, b) => String(a.firstPublishedAt ?? '￿').localeCompare(String(b.firstPublishedAt ?? '￿')))
  const first = timing.find((t) => t.firstPublishedAt) ?? null
  const timingView = timing.map((t) => ({
    ...t,
    lagHours:
      first && t.firstPublishedAt
        ? Math.round(((new Date(t.firstPublishedAt) - new Date(first.firstPublishedAt)) / 3600000) * 10) / 10
        : null,
  }))
  return {
    id: event.id,
    title: event.canonical_title,
    occurredAtStart: event.occurred_at_start,
    occurredAtEnd: event.occurred_at_end,
    status: event.status,
    outlets, // all of them, thin included — no gating
    singleSource: outlets.length <= 1,
    firstOutlet: first?.outlet ?? null,
    timing: timingView,
    claims: ctx.claimViews,
  }
}

/** Flag read. Exactly-true only when the DB value is boolean true. */
export async function loadSourceComparisonBetaFlag() {
  const { supabase } = await import('./supabase.js')
  if (!supabase) return false
  const { data, error } = await supabase
    .from('pipeline_config')
    .select('value')
    .eq('key', 'source_comparison_beta')
    .maybeSingle()
  if (error) return false
  return data?.value === true
}

/**
 * Beta view loader. Disabled flag -> { enabled: false } and no table reads.
 * Item 1 tables may be empty (pipeline not yet invoked) — that is a normal
 * empty state, not an error.
 */
export async function loadSourceComparisonView() {
  const enabled = await loadSourceComparisonBetaFlag()
  if (!enabled) return { enabled: false, events: [] }
  const { supabase } = await import('./supabase.js')

  const [eventsRes, membersRes, claimsRes, surfacesRes, linksRes, corrRes, explRes] = await Promise.all([
    supabase.from('events').select('id, canonical_title, occurred_at_start, occurred_at_end, status').order('occurred_at_start', { ascending: false, nullsFirst: false }),
    supabase.from('event_articles').select('event_id, article_id, membership_method, membership_confidence'),
    supabase.from('claims').select('id, event_id, canonical_text, thin_extraction, status').eq('status', 'active'),
    supabase.from('article_claims').select('id, claim_id, article_id, surface_text, stance, loaded_language').eq('is_current', true),
    supabase.from('claim_evidence_links').select('id, claim_id, evidence_url, evidence_type'),
    supabase.from('claim_corrections').select('id, claim_id, correcting_article_id, corrected_article_id, correction_text, occurred_at'),
    supabase.from('explanations').select('assertion_id, assertion_type, supporting_passage, rule_version, provenance_class, review_status, state, remaining_uncertainty')
      .in('assertion_type', ['event_membership', 'claim_grouping']).like('rule_version', 'sc-v1|%').eq('is_current', true),
  ])
  const firstError = [eventsRes, membersRes, claimsRes, surfacesRes].find((r) => r.error)?.error
  if (firstError) return { enabled: true, events: [], loadError: firstError.message }

  const events = eventsRes.data ?? []
  const members = membersRes.data ?? []
  const claims = claimsRes.data ?? []
  const surfaces = surfacesRes.data ?? []
  const links = linksRes.data ?? []
  const corrections = corrRes.data ?? []
  const explanations = explRes.data ?? []

  const articleIds = [...new Set([...members.map((m) => m.article_id), ...surfaces.map((s) => s.article_id)])]
  let articlesById = new Map()
  if (articleIds.length > 0) {
    const { data: articleRows } = await supabase
      .from('articles')
      .select('id, outlet, title, url, published_at, claims, unattributed, monoculture, is_digest, arc_id')
      .in('id', articleIds)
    articlesById = new Map((articleRows ?? []).map((a) => [a.id, a]))
  }

  // Doc 05 pair 6 (Open Decision resolved 2026-08-10): LIVE JOIN —
  // event_articles → articles.arc_id, resolved at read time. No backfill, no
  // migration; events.arc_id stays NULL. Events whose member articles carry
  // no arc_id get arcLinks: [] and render no chips (honest degradation).
  const arcIds = [...new Set([...articlesById.values()].map((a) => a.arc_id).filter(Boolean))]
  let arcTitleById = new Map()
  let timelineKeyByArcId = new Map()
  if (arcIds.length > 0) {
    const [arcRes, nodeRes] = await Promise.all([
      supabase.from('story_arcs').select('id, title').in('id', arcIds),
      supabase.from('nodes').select('id, slug, arc_id').eq('type', 'event').in('arc_id', arcIds),
    ])
    if (!arcRes.error) arcTitleById = new Map((arcRes.data ?? []).map((a) => [a.id, a.title]))
    if (!nodeRes.error) {
      const nodes = nodeRes.data ?? []
      // Prefer canonical evt- slugs over art- mirrors for the timeline focus
      // key (the 8-hex group suffix is shared, so either lands correctly).
      for (const preferEvt of [true, false]) {
        for (const n of nodes) {
          if (!n.arc_id || !n.slug || timelineKeyByArcId.has(n.arc_id)) continue
          if (preferEvt !== (n.slug.startsWith('evt-'))) continue
          timelineKeyByArcId.set(n.arc_id, n.slug.slice(-8))
        }
      }
    }
  }

  // Explanation objects keyed by trailing article id
  // (assertion_id = sc:<type>:<key>:<articleId>).
  const explanationsByArticle = new Map()
  for (const e of explanations) {
    const articleId = String(e.assertion_id).split(':').pop()
    if (e.assertion_type === 'claim_grouping') explanationsByArticle.set(articleId, e)
  }

  // An article counts as extracted when it produced surface rows or carries a
  // non-empty claims payload; empty extraction -> coverage_unknown, never omission.
  const extractedArticleIds = new Set(surfaces.map((s) => s.article_id))
  for (const a of articlesById.values()) {
    if (Array.isArray(a.claims) && a.claims.length > 0) extractedArticleIds.add(a.id)
  }

  const eventViews = events.map((event) => {
    const memberRows = members.filter((m) => m.event_id === event.id)
    const memberArticles = memberRows.map((m) => articlesById.get(m.article_id)).filter(Boolean)
    const syndicates = collapseBySyndication(memberArticles)
    const eventArticlesByOutlet = new Map()
    for (const a of memberArticles) {
      if (!eventArticlesByOutlet.has(a.outlet)) eventArticlesByOutlet.set(a.outlet, [])
      eventArticlesByOutlet.get(a.outlet).push(a)
    }
    const outlets = [...new Set(memberArticles.map((a) => a.outlet))]
    const claimViews = claims
      .filter((c) => c.event_id === event.id)
      .map((claim) => buildClaimView(claim, surfaces.filter((s) => s.claim_id === claim.id), {
        articlesById, syndicates, eventOutlets: outlets, eventArticlesByOutlet,
        extractedArticleIds, evidenceLinks: links, corrections, explanationsByArticle,
      }))
      // shared facts first, then unique claims; stable within class by canonical text
      .sort((a, b) => (a.classification === b.classification ? a.canonicalText.localeCompare(b.canonicalText) : a.classification === 'shared' ? -1 : 1))
    // Pair 6: distinct arcs across this event's member articles (live join).
    const eventArcIds = [...new Set(memberArticles.map((a) => a.arc_id).filter(Boolean))]
    const arcLinks = eventArcIds.map((arcId) => ({
      arcId,
      title: arcTitleById.get(arcId) ?? null,
      timelineKey: timelineKeyByArcId.get(arcId) ?? null,
    }))
    return { ...buildEventView(event, memberRows, { articlesById, claimViews }), arcLinks }
  })

  return { enabled: true, events: eventViews }
}
