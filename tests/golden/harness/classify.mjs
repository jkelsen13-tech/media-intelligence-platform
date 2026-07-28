// G1 harness — JS port of ingest-rss arc/category classification,
// transcribed from supabase/functions/ingest-rss/index.ts @ 445503ee:
// CATEGORY_RUBRIC (flat rule array), classifyArc, applyFloor,
// PROCESS_PATTERNS (economic/legal BEFORE military; no bare strike/attack),
// findProcess, makeArcTitle. Bug variants reintroduce known failures.

export const CATEGORY_RUBRIC = [
  { category: 'institutional_accountability', weight: 0.45, re: /\b(inquiry|misconduct|cover-up|whistleblower|resignation|resigned|charged)\b/i },
  { category: 'institutional_accountability', weight: 0.35, re: /\b(investigation|convicted|sentenced|guilty)\b/i },
  { category: 'institutional_accountability', weight: 0.3, re: /\b(failings?|negligence|disciplined|verdict|complaint|tribunal|watchdog)\b/i },
  { category: 'institutional_accountability', weight: 0.2, re: /\b(sanctioned|accountab\w*)\b/i },
  { category: 'institutional_accountability', weight: 0.15, re: /\b(audit|report found|findings)\b/i },
  { category: 'geopolitical_consequence', weight: 0.45, re: /\b(missile\w*|houthis?|red sea|nuclear program|enrichment|humanitarian crisis|escalation)\b/i },
  { category: 'geopolitical_consequence', weight: 0.4, re: /\b(ceasefire|retaliat\w*|nuclear talks|ultimatum)\b/i },
  { category: 'geopolitical_consequence', weight: 0.35, re: /\b(refugee\w*|embargo|militia?|tanker\w*)\b/i },
  { category: 'geopolitical_consequence', weight: 0.3, re: /\b(attack\w*|displaced|civil war)\b/i },
  { category: 'geopolitical_consequence', weight: 0.25, re: /\b(nato|alliance|un security council)\b/i },
  { category: 'geopolitical_consequence', weight: 0.2, re: /\b(sanction\w*|diplomatic)\b/i },
  { category: 'economic_policy', weight: 0.45, re: /\b(tariff\w*|inflation|interest rate\w*|central bank|federal reserve|bank of england|ecb|gdp|trade war)\b/i },
  { category: 'economic_policy', weight: 0.35, re: /\b(recession|unemployment|payrolls|jobs report)\b/i },
  { category: 'economic_policy', weight: 0.3, re: /\b(budget|deficit|debt ceiling|fiscal|bond yields?|treasur\w+|energy prices?|opec|trade (deal|deficit|surplus|policy))\b/i },
  { category: 'economic_policy', weight: 0.15, re: /\b(markets?|stocks?|equities|rally|selloff|oil prices?)\b/i },
  { category: 'legislative_regulatory', weight: 0.45, re: /\b(executive order|legislation|bill\b|parliament|congress|senate|vote\w*|house passes)\b/i },
  { category: 'legislative_regulatory', weight: 0.35, re: /\b(regulation|regulatory|ruling|antitrust|merger)\b/i },
  { category: 'legislative_regulatory', weight: 0.3, re: /\b(ban\w*|mandate|framework|statutory|ordinance|decree|amendment|committee stage|royal assent)\b/i },
  { category: 'legislative_regulatory', weight: 0.25, re: /\b(law|legal|court|judge|appeal|hearing)\b/i },
]

export function classifyArc(text) {
  const scores = {}
  for (const rule of CATEGORY_RUBRIC) {
    if (rule.re.test(text)) scores[rule.category] = (scores[rule.category] ?? 0) + rule.weight
  }
  let best = null
  let bestScore = 0
  for (const [cat, score] of Object.entries(scores)) {
    const s = Math.min(score, 1)
    if (s > bestScore) {
      bestScore = s
      best = cat
    }
  }
  if (!best) return { category: 'unclassified', confidence: 0, evidence: 'no rubric matches' }
  const matched = CATEGORY_RUBRIC.filter((r) => r.category === best && r.re.test(text)).length
  return { category: best, confidence: bestScore, evidence: `rubric score ${bestScore.toFixed(2)} via ${matched} pattern(s)` }
}

// Shipped applyFloor: below the floor the category is relabeled
// 'unclassified' (confidence preserved; the DB write stores NULL confidence
// for unclassified — see maybeRetitleArc). variant 'no-floor': weak labels
// stand (pre-repair over-labeling bug).
export function applyFloor(cls, floor, { variant = 'repaired' } = {}) {
  if (variant === 'no-floor') return cls
  if (cls.category === 'unclassified') return cls
  if (cls.confidence < floor) return { ...cls, category: 'unclassified' }
  return cls
}

// Shipped PROCESS_PATTERNS (Phase 0 Part 2 Tier 2): economic/legal/conflict
// processes are ordered BEFORE 'military escalation', whose pattern has NO
// bare 'strike\w*|attack\w*' — those used to hijack trade-war and court
// stories.
const PROCESS_PATTERNS = [
  ['interest-rate decision', /\b(interest rate\w*|rate (hike|cut)|fed\b|ecb\b|central bank|monetary policy)\b/gi],
  ['budget decision', /\b(budget|deficit|debt ceiling|fiscal|treasury)\b/gi],
  ['trade dispute', /\b(tariff\w*|trade war|import duty|wto|free trade|trade deal)\b/gi],
  ['criminal prosecution', /\b(arrest\w*|charged|indict\w*|prosecut\w*|convict\w*|sentenc\w*|jailed|court|trial|jury)\b/gi],
  ['sentencing', /\b(sentenc\w*|jailed for)\b/gi],
  ['public inquiry', /\b(public inquiry|inquiry|tribunal|commission)\b/gi],
  ['investigation', /\b(investigat\w*|probe|prosecutor|lawsuit|sued)\b/gi],
  ['sanctions regime', /\b(sanction\w*|embargo|export control\w*)\b/gi],
  ['military escalation', /\b(missile\w*|airstrike\w*|air strike\w*|drone strike\w*|troops|invasion|escalation|retaliat\w*)\b|\bwar\b/gi],
  ['ceasefire talks', /\b(ceasefire|peace talk\w*|hostage\w*)\b/gi],
  ['shipping interdiction', /\b(tanker\w*|shipping|vessel\w*|houthi\w*|red sea|strait of hormuz)\b.*\b(threat\w*|attack\w*|seiz\w*|u-turn|rerout\w*)|u-turn|rerout\w*/gi],
  ['energy shock', /\b(oil price\w*|crude|opec|energy price\w*|gas price\w*)\b/gi],
  ['election campaign', /\b(election\w*|ballot\w*|polling|referendum|primary|midterm\w*)\b/gi],
  ['disaster response', /\b(flood\w*|wildfire\w*|storm\w*|hurricane\w*|earthquake\w*|disaster\w*)\b/gi],
  ['medical evacuation', /\b(medevac|evacuat\w*|airlift\w*|quarantin\w*|hospitalis\w*)\b/gi],
]

// KNOWN BUG variant: military escalation FIRST and with the bare
// 'strike\w*|attack\w*' pattern restored — this hijacked trade-war and
// court stories before the repair.
const PROCESS_PATTERNS_BUG = [
  ['military escalation', /\b(missile\w*|airstrike\w*|strike\w*|attack\w*|troops|invasion|escalation|retaliat\w*)\b|\bwar\b/gi],
  ...PROCESS_PATTERNS.filter(([n]) => n !== 'military escalation'),
]

export function findProcess(text, { variant = 'repaired' } = {}) {
  const patterns = variant === 'military-hijack' ? PROCESS_PATTERNS_BUG : PROCESS_PATTERNS
  let best = null
  let bestCount = 0
  for (const [name, re] of patterns) {
    re.lastIndex = 0
    const count = (text.match(re) ?? []).length
    if (count > bestCount) {
      bestCount = count
      best = name
    }
  }
  return best
}

export function makeArcTitle(actorName, process, { variant = 'repaired' } = {}) {
  const actor = (actorName ?? '').trim().replace(/[’']s$/, '')
  if (variant === 'developments-fallback') {
    // KNOWN BUG (pre-repair): meaningless 'developments' placeholder arcs.
    return `${actor || 'Unattributed cluster'} — ${process ?? 'developments'}`
  }
  // Shipped: NO 'developments' fallback — if we can't say what is actually
  // happening, the article gets NO arc rather than a meaningless one.
  if (!process) return null
  return `${actor || 'Unattributed cluster'} — ${process}`.slice(0, 140)
}
