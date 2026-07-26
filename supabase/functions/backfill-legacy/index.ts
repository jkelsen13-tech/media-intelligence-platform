import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Backfill the legacy 'articles' table into the full v2 schema.
// Idempotent (upserts + existence checks). Dry-run supported via ?dry=1.
//
// Phase 0 Part 2: 21 fixes from the 2026-07-26 manual review:
//  1  attach threshold + fallback rules now read from pipeline_config
//  2  embedding centroid update wrapped in try/catch
//  3  hub entities removed from origination input (same as ingest-rss #16)
//  4  entity mention_count incremented per article, not per article_entities row
//  5  'The <entity>' prefix variant added as alias on fuzzy resolution
//  6  no more junk 'other' entities from trailing stopwords
//  7  (deferred — needs real fix)
//  8  (deferred — needs real fix)
//  9  entities only written when arc is created; rolled back on failure
// 10  (already implemented via title recompute — left as-is)
// 11  (already implemented via category_evidence — left as-is)
// 12  Phase 1 article_entities backfill capped at 1000/run; unprocessed
//     articles logged and reprocessed on next run
// 13  entities with zero article/arc links older than 30d are deleted
// 14  article_entities confidence/extraction_method backfilled from heuristics
// 15  last_assignment_run updated only on arcs that received articles
// 16  hub entity list logged for transparency
// 17  (test-only concern)
// 18  (test-only concern)
// 19  (test-only concern)
// 20  rollback helper also deletes pre-existing arc_entities it created
// 21  backfill_status checkpointing per phase (cursor in pipeline_config)

async function loadConfig(supabase: any) {
  const { data, error } = await supabase.from('pipeline_config').select('key, value')
  if (error) throw error
  const cfg: Record<string, any> = {}
  for (const row of data) cfg[row.key] = row.value
  return cfg
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  hellip: '…', middot: '·', bull: '•', dagger: '†', Dagger: '‡',
  prime: '′', Prime: '″', minus: '−', permil: '‰', frasl: '⁄',
  trade: '™', copy: '©', reg: '®', deg: '°', plusmn: '±', times: '×', divide: '÷',
  pound: '£', euro: '€', yen: '¥', cent: '¢', sect: '§', para: '¶', micro: 'µ',
  eacute: 'é', Eacute: 'É', egrave: 'è', Egrave: 'È', agrave: 'à', Agrave: 'À',
  ccedil: 'ç', Ccedil: 'Ç', uuml: 'ü', Uuml: 'Ü', ouml: 'ö', Ouml: 'Ö',
  auml: 'ä', Auml: 'Ä', iuml: 'ï', euml: 'ë', iacute: 'í', Iacute: 'Í',
  oacute: 'ó', Oacute: 'Ó', uacute: 'ú', Uacute: 'Ú', ntilde: 'ñ', Ntilde: 'Ñ',
  szlig: 'ß', oelig: 'œ', OElig: 'Œ', aelig: 'æ', AElig: 'Æ', aring: 'å', Aring: 'Å',
  oslash: 'ø', Oslash: 'Ø', ecirc: 'ê', Ecirc: 'Ê', acirc: 'â', Acirc: 'Â',
  ocirc: 'ô', Ocirc: 'Ô', ucirc: 'û', Ucirc: 'Û', icirc: 'î', Icirc: 'Î',
  atilde: 'ã', Atilde: 'Ã', otilde: 'õ', Otilde: 'Õ',
  rsaquo: '›', lsaquo: '‹', laquo: '«', raquo: '»', rarr: '→', larr: '←', harr: '↔',
  sup2: '²', sup3: '³', frac12: '½', frac14: '¼', frac34: '¾',
  brvbar: '¦', uml: '¨', acute: '´', cedil: '¸', ordf: 'ª', ordm: 'º',
  iexcl: '¡', iquest: '¿', shy: '',
}

function decodeEntities(s: string): string {
  // Phase 0 Part 2 Tier 2: decode to a FIXPOINT (max 3 passes) so
  // double-encoded input resolves fully (&amp;apos; -> &apos; -> '), and
  // tolerate whitespace-malformed entities (& apos; -> ').
  for (let pass = 0; pass < 3; pass++) {
    const before = s
    s = s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{0,9}|\s+[a-zA-Z]{2,9});/g, (m, g) => {
      if (g[0] === '#') {
        const n = g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10)
        if (Number.isFinite(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)) {
          try { return String.fromCodePoint(n) } catch { return m }
        }
        return m
      }
      return NAMED_ENTITIES[g.trim()] ?? m
    })
    if (s === before) break
  }
  return s
}

interface Sanitized {
  text: string
  imageUrl: string | null
  imageAlt: string | null
}

// Sanitize ONCE at the boundary: strip CDATA wrappers, pull image provenance
// into separate fields, DECODE entities first (so entity-encoded tags like
// &lt;a href="..."&gt; become literal markup and get stripped too), strip
// complete tags, strip broken/truncated tag fragments (</span&, unterminated
// <a href="..., bare trailing <), drop residual unknown entities
// (whitespace-tolerant), then collapse whitespace.
function sanitize(raw: string | null | undefined): Sanitized {
  if (!raw) return { text: '', imageUrl: null, imageAlt: null }
  let s = String(raw).replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
  let imageUrl: string | null = null
  let imageAlt: string | null = null
  const img = s.match(/<img\b[^>]*>/i) ?? s.match(/<img\b[\s\S]*$/i)
  if (img) {
    const src = img[0].match(/src\s*=\s*"([^"]+)"/i) ?? img[0].match(/src\s*=\s*'([^']+)'/i)
    const alt = img[0].match(/alt\s*=\s*"([^"]*)"/i) ?? img[0].match(/alt\s*=\s*'([^']*)'/i)
    imageUrl = src ? src[1] : null
    imageAlt = alt ? alt[1] : null
  }
  s = s.replace(/<img\b[^>]*>?/gi, ' ')
  // Decode BEFORE tag-stripping: encoded tags (&lt;b&gt;, &lt;/span&amp;gt;)
  // become literal markup here and are removed by the next passes.
  s = decodeEntities(s)
  s = s.replace(/<[^>]+>/g, ' ') // complete tags (incl. decoded ones)
  s = s.replace(/<\/?[a-zA-Z][a-zA-Z0-9]*&[a-zA-Z]{0,9}(?![a-zA-Z0-9]*;)/g, ' ') // broken fragments: </span&, </a&gt (any position)
  s = s.replace(/<\/?[a-zA-Z!][^>]{0,400}$/, ' ') // unterminated tag at end (<a href="htt)
  s = s.replace(/<\/?$/, ' ') // bare trailing < or </
  s = s.replace(/&\s*[a-zA-Z#0-9]{1,10};/g, ' ') // residual unknown entities (whitespace-tolerant)
  s = s.replace(/\s+/g, ' ').trim()
  return { text: s, imageUrl, imageAlt }
}

// ---------- port of ingest-rss logic (kept in sync) ----------

const MONTHS_DAYS = new Set([
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december', 'monday', 'tuesday',
  'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
])

const STOP_SINGLE = new Set([
  ...MONTHS_DAYS,
  'the', 'a', 'an', 'in', 'on', 'at', 'as', 'it', 'he', 'she', 'but', 'and',
  'or', 'if', 'by', 'to', 'from', 'with', 'after', 'before', 'this', 'that',
  'these', 'those', 'there', 'here', 'what', 'how', 'why', 'when', 'where',
  'who', 'will', 'would', 'could', 'should', 'is', 'are', 'was', 'were',
  'has', 'have', 'had', 'not', 'no', 'yes', 'now', 'new', 'more', 'most',
  'all', 'one', 'two', 'first', 'last', 'latest', 'breaking', 'watch',
  'video', 'live', 'opinion', 'analysis', 'explainer', 'quiz', 'podcast',
  'newsletter', 'according', 'report', 'reports', 'source', 'sources',
  'official', 'officials', 'government', 'police', 'ministry', 'department',
  'court', 'senate', 'parliament', 'congress', 'army', 'navy', 'spokesperson',
  'headlines', 'digest', 'briefing', 'roundup', 'bulletin', 'updates',
  'uk', 'us', 'eu', 'un', 'mp', 'mps', 'pm',
])

const ROLE_TITLES_RE = /^(?:President|Prime Minister|Vice President|Deputy Prime Minister|Minister|Foreign Minister|Defence Minister|Senator|Governor|Mayor|Secretary(?: of State)?|Chancellor(?: of the Exchequer)?|Attorney General|MP|Mr|Ms|Mrs|Miss|Dr|Sir|Dame|Judge|Justice|Chief|General|Admiral|Captain|Colonel|Spokesperson|Officer|Professor|Father|Rabbi|Pope|King|Queen|Prince|Princess)\s+/i

// Outlet names/aliases that must never become story entities even when absent
// from the outlets table (e.g. 'Daily Mail' typed as PERSON).
const OUTLET_NAME_ALIASES = new Set([
  'daily mail', 'mail online', 'mailonline', 'the daily mail', 'dailymail',
])

const PROPER_RE = /\b((?:(?:[A-Z]\.){2,}|[A-Z][\w'’\-]*)(?:(?:\s+(?:of|the|de|del|van|von|der|al|bin|and|&|for)\s+|\s+)(?:(?:[A-Z]\.){2,}|[A-Z][\w'’\-]*))*)/g

interface EntityCandidate {
  surface: string
  role: string | null
  mentions: number
}

function extractEntityCandidates(text: string, outletNames: Set<string>): EntityCandidate[] {
  const candidates = new Map<string, EntityCandidate>()
  for (const m of text.matchAll(PROPER_RE)) {
    let surface = m[1].trim().replace(/[\s.,;:]+$/, '').replace(/^[\s.,;:]+/, '')
    if (surface.length < 2) continue
    let role: string | null = null
    for (let k = 0; k < 3; k++) {
      const r = surface.match(ROLE_TITLES_RE)
      if (!r) break
      role = role ? `${role} ${r[0].trim()}` : r[0].trim()
      surface = surface.slice(r[0].length).trim()
    }
    if (surface.length < 2) continue
    if (surface.includes('. ') || surface.split(/\s+/).length > 6) continue
    const words = surface.split(/\s+/)
    const norm = normalizeEntityName(surface)
    if (!norm) continue
    if (words.length === 1) {
      const isAcronym = /^[A-Z0-9&]{2,6}$/.test(surface)
      const occurrences = (text.match(new RegExp(`\\b${surface.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')) ?? []).length
      if (STOP_SINGLE.has(norm)) continue
      if (!isAcronym && occurrences < 2) continue
    } else {
      if (STOP_SINGLE.has(norm.split(' ')[0])) continue
      if (words.every((w) => STOP_SINGLE.has(w.toLowerCase()))) continue
    }
    if (outletNames.has(norm)) continue
    const cur = candidates.get(norm)
    if (cur) {
      cur.mentions++
      if (!cur.role && role) cur.role = role
      if (surface.length > cur.surface.length) cur.surface = surface
    } else {
      candidates.set(norm, { surface, role, mentions: 1 })
    }
  }
  return [...candidates.values()]
}

function normalizeEntityName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[''’]s\b/g, '')
    .replace(/\bs’$/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function guessEntityType(name: string): string {
  if (/\b(ministry|department|agency|police|court|senate|congress|parliament|government|army|navy|air force|commission|authority|council|committee|office|bureau|service|garda|gardaí|psni|nato|fbi|cia|federal reserve|met office|white house|downing street|pentagon|treasury|home office)\b/i.test(name)) return 'institution'
  if (/\b(inc|ltd|corp|corporation|company|group|holdings|airlines?|airways|bank|university|college|hospital|school|club|fc|party|union|association|institute|foundation|charity|trust|media|news|broadcasting)\b/i.test(name)) return 'organization'
  const words = name.split(/\s+/)
  if (words.length === 2 && words.every((w) => /^[A-Z][a-zA-Z'’.\-]+$/.test(w) && !/^[A-Z]{2,}$/.test(w))) return 'person'
  return 'other'
}

interface ResolvedEntity {
  id: string
  canonical_name: string
  entity_type: string
  confidence: number
  role: string | null
  isNew: boolean
}

// Fix 5: 'The <entity>' prefix variant added as alias on fuzzy resolution.
// Fix 13: resolver tracks created entity ids so rollback can delete them.
class EntityResolver {
  byNorm = new Map<string, any>()
  aliasIdx = new Map<string, any>()
  exactConf: number
  fuzzyConf: number
  newConf: number
  createdIds: string[] = []

  constructor(cfg: any) {
    this.exactConf = Number(cfg.entity_exact_confidence ?? 0.95)
    this.fuzzyConf = Number(cfg.entity_fuzzy_confidence ?? 0.7)
    this.newConf = Number(cfg.entity_new_confidence ?? 0.5)
  }

  async load(supabase: any) {
    let from = 0
    for (;;) {
      const { data, error } = await supabase
        .from('entities')
        .select('id, canonical_name, normalized_name, aliases, entity_type, mention_count')
        .range(from, from + 999)
      if (error) throw error
      if (!data || data.length === 0) break
      for (const e of data) this.index(e)
      if (data.length < 1000) break
      from += 1000
    }
  }

  index(e: any) {
    this.byNorm.set(e.normalized_name, e)
    for (const a of e.aliases ?? []) {
      const an = normalizeEntityName(a)
      if (an) this.aliasIdx.set(an, e)
    }
  }

  async resolve(supabase: any, cand: EntityCandidate): Promise<ResolvedEntity | null> {
    const norm = normalizeEntityName(cand.surface)
    if (!norm) return null
    let ent = this.byNorm.get(norm) ?? this.aliasIdx.get(norm)
    let conf = ent ? this.exactConf : 0
    if (!ent) {
      const toks = new Set(norm.split(' '))
      if (toks.size >= 2) {
        const hits: any[] = []
        for (const [en, e] of this.byNorm) {
          const et = new Set(en.split(' '))
          const sub = [...toks].every((t) => et.has(t)) || [...et].every((t) => toks.has(t))
          if (sub) hits.push(e)
        }
        if (hits.length === 1) {
          // Phase 0 fix (entity hygiene): token-subset fuzzy resolution
          // produced cross-type junk (e.g. outlets/places resolving onto
          // person entities). Accept a fuzzy hit only when the candidate's
          // type AGREES with the stored entity type and the fuzzy confidence
          // meets the resolve floor.
          const candType = guessEntityType(cand.surface)
          if (hits[0].entity_type === candType && this.fuzzyConf >= 0.5) {
            ent = hits[0]
            conf = this.fuzzyConf
            // Fix 5: 'The <entity>' prefix variant added as alias.
            const theVariant = `The ${cand.surface}`.slice(0, 160)
            const theNorm = normalizeEntityName(theVariant)
            const aliases = new Set(ent.aliases ?? [])
            if (!aliases.has(theVariant) && theNorm && theNorm !== normalizeEntityName(ent.canonical_name)) {
              aliases.add(theVariant)
              await supabase.from('entities').update({ aliases: [...aliases] }).eq('id', ent.id)
              ent.aliases = [...aliases]
              this.aliasIdx.set(theNorm, ent)
            }
          }
        }
      }
    }
    if (!ent) {
      const { data, error } = await supabase
        .from('entities')
        .upsert(
          {
            canonical_name: cand.surface.slice(0, 160),
            normalized_name: norm,
            entity_type: guessEntityType(cand.surface),
            mention_count: 0,
            last_seen: new Date().toISOString(),
          },
          { onConflict: 'normalized_name' },
        )
        .select('id, canonical_name, normalized_name, aliases, entity_type, mention_count')
        .single()
      if (error || !data) return null
      ent = data
      this.index(ent)
      this.createdIds.push(ent.id)
      if (cand.surface !== ent.canonical_name) {
        const aliases = new Set(ent.aliases ?? [])
        aliases.add(cand.surface.slice(0, 160))
        await supabase.from('entities').update({ aliases: [...aliases] }).eq('id', ent.id)
        ent.aliases = [...aliases]
        this.aliasIdx.set(norm, ent)
      }
      return { id: ent.id, canonical_name: ent.canonical_name, entity_type: ent.entity_type, confidence: this.newConf, role: cand.role, isNew: true }
    }
    if (cand.surface !== ent.canonical_name && !(ent.aliases ?? []).includes(cand.surface)) {
      const aliases = [...(ent.aliases ?? []), cand.surface.slice(0, 160)]
      await supabase.from('entities').update({ aliases }).eq('id', ent.id)
      ent.aliases = aliases
      this.aliasIdx.set(norm, ent)
    }
    return { id: ent.id, canonical_name: ent.canonical_name, entity_type: ent.entity_type, confidence: conf, role: cand.role, isNew: false }
  }
}

const CAUSAL_RE = /\b(as a result of|following|in response to|in the wake of|on the back of|after|amid|because of|due to|owing to|sparked by|triggered by|prompted by|citing|linked to|in retaliation for|in protest (of|at|against)|days? after|hours? after)\b/i

function causalEvidence(text: string): string | null {
  const m = text.match(CAUSAL_RE)
  return m ? m[0] : null
}

const CATEGORY_RUBRIC: Array<{ category: string; weight: number; re: RegExp }> = [
  { category: 'institutional_accountability', weight: 0.45, re: /\b(investigation|investigating|probe|inquiry|inquest|misconduct|cover-up|oversight|indictment|indicted|arrest\w*|charged|jailed|blackmail|sacked|suspended|resignation|resigned)\b/i },
  { category: 'institutional_accountability', weight: 0.3, re: /\b(lack of authority|accountability|failure\w*|failings|negligence|whistleblow\w*|lawsuit|scandal|corruption|disciplinary|grooming|abuse)\b/i },
  { category: 'institutional_accountability', weight: 0.15, re: /\b(apolog\w+|compensation|report found|review found|criticis\w+)\b/i },
  { category: 'geopolitical_consequence', weight: 0.45, re: /\b(war|ceasefire|missile\w*|troops|invasion|drone strike|nato|treaty|houthis?|red sea|escalation|airstrike\w*|hostages?|gaza|ukraine)\b/i },
  { category: 'geopolitical_consequence', weight: 0.35, re: /\b(sanctions?|shipping threat|tanker\w*|u-turn\w*|evacuation|displacement|cross-border|diplomat\w*|embassy|militia|insurgent\w*)\b/i },
  { category: 'geopolitical_consequence', weight: 0.15, re: /\b(allies|summit|foreign minister|defence|defense|security council|border)\b/i },
  { category: 'economic_policy', weight: 0.45, re: /\b(tariff\w*|inflation|interest rate\w*|federal reserve|trade (deal|war|dispute|crosshairs)|recession|budget|gdp|central bank)\b/i },
  { category: 'economic_policy', weight: 0.3, re: /\b(supply chain|jobs report|dairy sector|auto industry|rent control\w*|cost of living|wages?|deficit|spending|economy|economic)\b/i },
  { category: 'economic_policy', weight: 0.15, re: /\b(markets?|stocks?|shares|oil prices?|energy prices?|prices?)\b/i },
  { category: 'legislative_regulatory', weight: 0.45, re: /\b(bill|senate|house passes|regulation|supreme court|executive order|congress|parliament|vote\w*|ruling|legislation|lawmakers)\b/i },
  { category: 'legislative_regulatory', weight: 0.3, re: /\b(rules out|backs off|pledge|ban\w*|controls|amendment|regulator\w*|white paper|statutory|clause|committee stage)\b/i },
  { category: 'legislative_regulatory', weight: 0.15, re: /\b(law|legal|court|judge|appeal|hearing)\b/i },
]

interface Classification {
  category: string
  confidence: number
  evidence: string | null
}

function classifyArc(text: string): Classification {
  const scores = new Map<string, { score: number; evidence: string | null }>()
  for (const { category, weight, re } of CATEGORY_RUBRIC) {
    const m = text.match(re)
    if (!m) continue
    const cur = scores.get(category) ?? { score: 0, evidence: null }
    cur.score += weight
    if (!cur.evidence) cur.evidence = m[0]
    scores.set(category, cur)
  }
  let best: Classification | null = null
  for (const [category, { score, evidence }] of scores) {
    const confidence = Math.min(1, score)
    if (!best || confidence > best.confidence) best = { category, confidence, evidence }
  }
  return best ?? { category: 'unclassified', confidence: 0, evidence: null }
}

function applyFloor(cls: Classification, floor: number): Classification {
  if (cls.confidence < floor) return { ...cls, category: 'unclassified' }
  return cls
}

const ARC_EVENT_CATEGORY: Record<string, string> = {
  institutional_accountability: 'accountability',
  geopolitical_consequence: 'geopolitical',
  economic_policy: 'economic',
  legislative_regulatory: 'legislative',
  unclassified: 'accountability',
}

const PROCESS_PATTERNS: Array<{ process: string; re: RegExp }> = [
  { process: 'cross-border explosives interdiction', re: /\b(bomb|explosive\w*|ied)\b[\s\S]{0,80}\b(intercept\w*|seiz\w*)\b|\b(intercept\w*|seiz\w*)\b[\s\S]{0,80}\b(bomb|explosive\w*|ied)\b/i },
  { process: 'shipping interdiction', re: /\b(tanker\w*|shipping|vessel\w*)[\s\S]{0,80}(threat|u-turn|rerout\w*)|\b(shipping threat)\b/i },
  { process: 'ceasefire talks', re: /\b(ceasefire|truce|peace talks|peace deal)\b/i },
  // Phase 0 fix: economic/legal processes must win over 'military escalation'
  // (bare 'strike/attack/war' used to hijack trade-war and court stories), so
  // they are ordered BEFORE it, and military escalation now requires genuine
  // armed-conflict vocabulary — bare 'strike\w*|attack\w*' removed, 'war'
  // word-bounded.
  { process: 'trade dispute', re: /\b(tariff\w*|trade (war|deal|dispute|crosshairs))\b/i },
  { process: 'sanctions regime', re: /\bsanction\w*\b/i },
  { process: 'hostage negotiations', re: /\bhostage\w*\b/i },
  { process: 'military escalation', re: /\b(missile\w*|airstrike\w*|drone strike|troops|invasion)\b|\b(air|drone|missile|military) strike\w*\b|\bwar\b/i },
  { process: 'interest-rate decision', re: /\b(interest rate\w*|rate (cut|rise|hike|decision)|central bank)\b/i },
  { process: 'budget decision', re: /\b(budget|spending review|fiscal)\b/i },
  { process: 'rent-control decision', re: /\brent control\w*\b/i },
  { process: 'procurement', re: /\b(procurement|contract awarded|tender|defence contract|arms deal)\b/i },
  { process: 'criminal prosecution', re: /\b(arrest\w*|charged|indict\w*|jailed|prosecut\w*|trial)\b/i },
  { process: 'sentencing', re: /\b(sentenc\w+|jailed for)\b/i },
  { process: 'public inquiry', re: /\b(inquiry|inquest)\b/i },
  { process: 'investigation', re: /\b(investigat\w*|probe)\b/i },
  { process: 'misconduct case', re: /\b(misconduct|blackmail|harassment|abuse|scandal)\b/i },
  { process: 'resignation', re: /\b(resign\w+|steps down|quit\w*)\b/i },
  { process: 'appointment', re: /\b(appoint\w*|named as|takes office)\b/i },
  { process: 'policy reversal', re: /\b(backs off|revers\w*|u-turn|abandon\w*|scrap\w*)\b/i },
  { process: 'legislative action', re: /\b(bill|vote\w*|executive order|amendment|legislation|act passed)\b/i },
  { process: 'regulatory decision', re: /\b(regulat\w+|rules out|ban\w*|approv\w+|licen[cs]\w+)\b/i },
  { process: 'legal ruling', re: /\b(ruling|verdict|court rules|judgment|appeal)\b/i },
  { process: 'medical evacuation', re: /\b(evacuation|evacuate\w*)\b/i },
  { process: 'disaster response', re: /\b(flood\w*|wildfire\w*|storm|earthquake|hurricane)\b/i },
  { process: 'election campaign', re: /\b(election|campaign|ballot)\b/i },
  { process: 'diplomatic talks', re: /\b(summit|diplomat\w*|talks|envoy)\b/i },
  { process: 'rollout', re: /\b(rollout|roll-out|launch\w*|deploy\w+)\b/i },
  { process: 'data breach', re: /\b(data breach|hack\w*|cyberattack\w*)\b/i },
  { process: 'recall', re: /\brecall\w*\b/i },
  { process: 'funding decision', re: /\b(funding|allocat\w+|grant\w*|bailout)\b/i },
  { process: 'enforcement action', re: /\b(enforcement|fine\w*|penalt\w+|crackdown|raid\w*)\b/i },
]

// Phase 0 fix: pick the process with the MOST member-text matches instead of
// the first matching entry — first-match let an early broad pattern
// ('military escalation') claim arcs whose dominant signal was something else.
// Ties keep the earlier (more specific) pattern. No matches => null => no arc.
function findProcess(text: string): string | null {
  let best: string | null = null
  let bestCount = 0
  for (const { process, re } of PROCESS_PATTERNS) {
    const matches = text.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) ?? []
    if (matches.length > bestCount) {
      bestCount = matches.length
      best = process
    }
  }
  return best
}

function makeArcTitle(actorName: string | null, process: string | null): string | null {
  if (!process) return null
  if (!actorName) return `Unattributed cluster — ${process}`
  const subject = actorName.replace(/['’]s$/u, '').trim()
  if (!subject) return `Unattributed cluster — ${process}`
  return `${subject} — ${process}`.slice(0, 140)
}

interface MilestoneTemplate {
  key: string
  title: string
  confirm: RegExp
  fail?: RegExp
}

const MILESTONE_TEMPLATES: Record<string, MilestoneTemplate[]> = {
  institutional_accountability: [
    { key: 'ia_concludes', title: 'Investigation or inquiry concludes', confirm: /\b(findings?|report)\b[\s\S]{0,40}\b(published|released)\b|\b(investigat\w*|inquiry|probe|inquest)\b[\s\S]{0,80}\b(conclud\w*|complet\w*|publishes?|releases?)\b/i, fail: /\b(investigat\w*|inquiry|probe)\b[\s\S]{0,60}\b(dropped|abandoned|closed without|shelved)\b/i },
    { key: 'ia_charges', title: 'Charges or disciplinary action filed', confirm: /\b(charged|charges (filed|brought)|indict\w+|prosecut\w+|disciplin\w+|suspended|dismissed|sacked)\b/i, fail: /\b(cleared|no charges|charges dropped|acquit\w+|exonerat\w+)\b/i },
    { key: 'ia_policy', title: 'Institution policy change announced', confirm: /\b(policy change|reform\w*|new (rules|guidelines|protocols)|overhaul|code of conduct)\b/i },
    { key: 'ia_remedy', title: 'Remedy or settlement for affected party', confirm: /\b(settlement|compensation|payout|remedy|apolog\w+|damages awarded|redress)\b/i },
  ],
  geopolitical_consequence: [
    { key: 'gp_ceasefire', title: 'Ceasefire or de-escalation agreed', confirm: /\b(ceasefire|truce|de-escalat\w+|peace (deal|agreement)|armistice|withdraw\w*)\b/i, fail: /\b(talks? (collapse\w*|fail\w*)|ceasefire (broken|collapses?|ends?))\b/i },
    { key: 'gp_sanctions', title: 'Sanctions or retaliation imposed', confirm: /\b(sanctions? (imposed|announced|extended)|retaliat\w+|expel\w+|travel ban)\b/i },
    { key: 'gp_routes', title: 'Disrupted routes or activity normalize', confirm: /\b(resum\w+|reopen\w*|normali\w*|returns? to (the )?(red sea|route|port))\b/i },
    { key: 'gp_escalation', title: 'Further escalation or intervention', confirm: /\b(escalat\w+|strike\w*|attack\w*|intervention|deploy\w+|mobilis\w+|mobiliz\w+)\b/i },
  ],
  economic_policy: [
    { key: 'ep_enacted', title: 'Policy measure enacted or implemented', confirm: /\b(takes effect|comes into force|enacted|implement\w+|signed into law|approved)\b/i },
    { key: 'ep_market', title: 'Market or sector adjustment', confirm: /\b(markets? (react\w*|fall|rise|slide)|shares? (fell|fall|rose|rise)|prices? (rise|fall|rose|fell)|adjust\w+)\b/i },
    { key: 'ep_reversal', title: 'Policy reversed or withdrawn', confirm: /\b(revers\w+|withdraw\w+|scrapped|backs off|abandon\w+|u-turn)\b/i },
    { key: 'ep_funding', title: 'Funding or budget allocated', confirm: /\b(funding|allocat\w+|budget|appropriat\w+|bailout)\b/i },
  ],
  legislative_regulatory: [
    { key: 'lr_funding', title: 'Implementation funding allocated', confirm: /\b(funding|allocat\w+|appropriat\w+|budget)\b/i },
    { key: 'lr_enforcement', title: 'Enforcement action filed', confirm: /\b(enforcement|fined|fine\w*|penalt\w+|crackdown|sanctioned)\b/i },
    { key: 'lr_challenge', title: 'Legal challenge filed', confirm: /\b(lawsuit|legal challenge|judicial review|court challenge|appeal|injunction)\b/i },
    { key: 'lr_deadline', title: 'Implementation deadline met', confirm: /\b(takes effect|comes into force|deadline|implement\w+|in force)\b/i, fail: /\b(delayed|postponed|missed deadline|pushed back)\b/i },
  ],
  unclassified: [
    { key: 'gen_response', title: 'Official response issued', confirm: /\b(respond\w+|statement|comment\w+|reaction)\b/i },
    { key: 'gen_development', title: 'Further developments reported', confirm: /\b(develop\w+|update\w+|continu\w+|latest)\b/i },
    { key: 'gen_reaction', title: 'Stakeholder reaction emerges', confirm: /\b(react\w+|criticis\w+|criticiz\w+|praise\w+|backlash|condemn\w+)\b/i },
  ],
}

async function generateMilestones(supabase: any, arcId: string, category: string, process: string, dry: boolean) {
  if (dry) return
  const templates = MILESTONE_TEMPLATES[category] ?? MILESTONE_TEMPLATES.unclassified
  const rows = templates.slice(0, 6).map((t) => ({
    arc_id: arcId,
    title: t.title,
    milestone_key: t.key,
    status: 'pending',
    notes: `Expected outcome for ${category} arc (${process}).`,
  }))
  await supabase.from('arc_milestones').insert(rows)
}

let aiSession: any = null
function getSession(model: string) {
  if (!aiSession) {
    // @ts-ignore
    aiSession = new Supabase.ai.Session(model)
  }
  return aiSession
}

async function embed(text: string, model: string): Promise<number[]> {
  const session = getSession(model)
  const out = await session.run(text.slice(0, 8000), { mean_pool: true, normalize: true })
  const vec = Array.isArray(out) ? out : out?.embedding ?? out?.embeddings?.[0]
  if (!vec) throw new Error('embedding failed')
  return Array.from(vec as Iterable<number>)
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}

function parseVec(v: any): number[] | null {
  if (!v) return null
  if (Array.isArray(v)) return v as number[]
  try { return JSON.parse(v) } catch {
    return String(v).replace(/[\[\]]/g, '').split(',').map(Number)
  }
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

// Document frequency of every entity over article_entities, used to exclude
// hub entities (e.g. 'Iran', 'Trump', 'AI') from arc matching.
async function loadHubEntityIds(supabase: any, maxDf: number): Promise<Set<string>> {
  const df = new Map<string, Set<string>>()
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('article_entities')
      .select('article_id, entity_id')
      .range(from, from + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    for (const r of data) {
      const set = df.get(r.entity_id) ?? new Set<string>()
      set.add(r.article_id)
      df.set(r.entity_id, set)
    }
    if (data.length < 1000) break
    from += 1000
  }
  const hubs = new Set<string>()
  for (const [entityId, arts] of df) {
    if (arts.size > maxDf) hubs.add(entityId)
  }
  return hubs
}

// Embedding similarity only SHORTLISTS/ranks candidates that already share a
// resolved entity. Phase 0 hardening mirrors ingest-rss: >= 2 shared entities
// or the arc's primary entity; single-entity matches must clear the
// similarity floor.
async function findArcBySharedEntity(
  supabase: any,
  entityIds: string[],
  embedding: number[] | null,
  attachMinSimilarity = 0.78,
): Promise<{ arc: any; sharedEntityIds: string[]; sharedNames: string[]; similarity: number | null } | null> {
  if (entityIds.length === 0) return null
  const { data, error } = await supabase
    .from('arc_entities')
    .select('arc_id, entity_id, role, story_arcs!inner(id, slug, title, category, summary, status, root_node_id, embedding, title_article_count), entities!inner(canonical_name)')
    .in('entity_id', entityIds)
    .eq('story_arcs.status', 'active')
  if (error || !data || data.length === 0) return null
  const byArc = new Map<string, { arc: any; sharedEntityIds: string[]; sharedNames: string[]; sharedPrimary: boolean }>()
  for (const row of data) {
    const cur = byArc.get(row.arc_id) ?? { arc: (row as any).story_arcs, sharedEntityIds: [], sharedNames: [], sharedPrimary: false }
    cur.sharedEntityIds.push(row.entity_id)
    cur.sharedNames.push((row as any).entities.canonical_name)
    if ((row as any).role === 'primary') cur.sharedPrimary = true
    byArc.set(row.arc_id, cur)
  }
  let best: { arc: any; sharedEntityIds: string[]; sharedNames: string[]; similarity: number | null } | null = null
  for (const cand of byArc.values()) {
    const sharedCount = cand.sharedEntityIds.length
    if (sharedCount < 2 && !cand.sharedPrimary) continue
    let sim: number | null = null
    if (embedding) {
      const vec = parseVec(cand.arc.embedding)
      if (vec) sim = cosine(embedding, vec)
    }
    if (sharedCount < 2 && (sim === null || sim < attachMinSimilarity)) continue
    const entry = { ...cand, similarity: sim }
    if (
      !best ||
      entry.sharedEntityIds.length > best.sharedEntityIds.length ||
      (entry.sharedEntityIds.length === best.sharedEntityIds.length && (entry.similarity ?? 0) > (best.similarity ?? 0))
    ) {
      best = entry
    }
  }
  return best
}

async function attachToArc(supabase: any, art: any, arc: any, ctx: any, dry: boolean) {
  if (dry) return
  await supabase.from('articles').update({ arc_id: arc.id }).eq('id', art.id)

  // Phase 0 fix: keep the arc embedding a RUNNING CENTROID over member
  // embeddings (previously frozen at the seed article's vector).
  // Fix 2: centroid update wrapped in try/catch — it must never fail attach.
  if (ctx.embedding && ctx.embedding.length > 0) {
    try {
      const { data: fresh } = await supabase
        .from('story_arcs')
        .select('embedding')
        .eq('id', arc.id)
        .single()
      const { count } = await supabase
        .from('articles')
        .select('id', { count: 'exact', head: true })
        .eq('arc_id', arc.id)
        .not('embedding', 'is', null)
      const m = count ?? 1
      const old = parseVec(fresh?.embedding)
      const n = ctx.embedding.length
      const next: number[] = new Array(n)
      for (let i = 0; i < n; i++) {
        const prev = old && old.length === n && m > 1 ? old[i] * (m - 1) : 0
        next[i] = (prev + ctx.embedding[i]) / m
      }
      await supabase
        .from('story_arcs')
        .update({ embedding: `[${next.join(',')}]` })
        .eq('id', arc.id)
      arc.embedding = next
    } catch {
      // centroid refresh is best-effort; attachment itself must not fail
    }
  }

  const slug = `art-${slugify(art.title).slice(0, 40)}-${String(art.id).slice(0, 8)}`
  const { data: node } = await supabase
    .from('nodes')
    .upsert(
      {
        slug,
        label: art.title.slice(0, 120),
        type: 'event',
        description: (art.summary ?? '').slice(0, 400),
        confidence: 70,
        occurred_at: art.published_at ? String(art.published_at).slice(0, 10) : null,
        arc_id: arc.id,
        metadata: { article_id: art.id },
      },
      { onConflict: 'slug' },
    )
    .select('id')
    .single()

  if (node) {
    await supabase.from('sources').insert({
      node_id: node.id,
      outlet: art.outlet ?? null,
      headline: art.title.slice(0, 200),
      url: art.url ?? null,
      published_at: art.published_at ? String(art.published_at).slice(0, 10) : null,
    })
  }

  const signalSource = ctx.causal ? 'shared_entity+causal_language' : ctx.hasCitation ? 'shared_entity+citation' : null
  if (signalSource && node && arc.root_node_id) {
    // Phase 0 Step 7: ranked signal reliability at edge-creation time.
    const reliability = ctx.causal ? 3 : ctx.citationPrimary ? 1 : 2
    const docStrength = ctx.causal ? 'corroborated' : ctx.citationPrimary ? 'documented' : 'corroborated'
    const claimedBy = !ctx.causal && ctx.citationPrimary ? 'source_document' : 'reporting'
    await supabase.from('arc_events').insert({
      arc_id: arc.id,
      title: art.title.slice(0, 200),
      category: ARC_EVENT_CATEGORY[arc.category] ?? 'accountability',
      confidence: !ctx.causal && ctx.citationPrimary ? 'confirmed' : 'corroborated',
      occurred_at: art.published_at ? String(art.published_at).slice(0, 10) : null,
      description: (art.summary ?? '').slice(0, 400),
    })
    await supabase.from('edges').upsert(
      {
        source_id: arc.root_node_id,
        target_id: node.id,
        type: 'causal',
        weight: reliability <= 2 ? 'heavy' : reliability === 3 ? 'medium' : 'light',
        label: ctx.causal ? `causal: ${ctx.causal}` : 'cited development in arc',
        similarity: ctx.similarity,
        signal_source: ctx.causal ? 'causal_language' : 'citation',
        doc_strength: docStrength,
        claimed_by: claimedBy,
        reliability,
        metadata: {
          signal_source: signalSource, // legacy mirror for pre-Step-7 readers
          shared_entities: ctx.sharedEntities,
          evidence: ctx.causal ?? 'explicit citation in article',
        },
      },
      { onConflict: 'source_id,target_id,type' },
    )
  }
  await supabase.from('story_arcs').update({ last_update_at: new Date().toISOString() }).eq('id', arc.id)
}

async function maybeRetitleArc(supabase: any, arc: any, catFloor: number, dry: boolean): Promise<boolean> {
  const { count } = await supabase
    .from('articles')
    .select('id', { count: 'exact', head: true })
    .eq('arc_id', arc.id)
  const n = count ?? 0
  const last = arc.title_article_count ?? 0
  if (n === 0 || (last > 0 && n < Math.max(last * 2, last + 5))) return false

  const { data: primary } = await supabase
    .from('arc_entities')
    .select('entities!inner(canonical_name)')
    .eq('arc_id', arc.id)
    .eq('role', 'primary')
    .limit(1)
  const actorName = (primary?.[0] as any)?.entities?.canonical_name ?? null

  const { data: arts } = await supabase
    .from('articles')
    .select('id, title, summary')
    .eq('arc_id', arc.id)
    .order('published_at', { ascending: true })
    .limit(10)

  // Phase 0 fix: retitle/reclassify ONLY from members that pass the attach
  // keep-rule (share the arc's primary entity or >= 2 arc entities).
  const { data: arcEnts } = await supabase
    .from('arc_entities')
    .select('entity_id, role')
    .eq('arc_id', arc.id)
  const primaryId = (arcEnts ?? []).find((r: any) => r.role === 'primary')?.entity_id ?? null
  const arcEntIds = new Set((arcEnts ?? []).map((r: any) => r.entity_id))
  let memberIds = (arts ?? []).map((a: any) => a.id)
  if (arcEntIds.size > 0 && memberIds.length > 0) {
    const { data: aeRows } = await supabase
      .from('article_entities')
      .select('article_id, entity_id')
      .in('article_id', memberIds)
    const sharedBy = new Map<string, { shared: number; primary: boolean }>()
    for (const r of aeRows ?? []) {
      if (!arcEntIds.has(r.entity_id)) continue
      const cur = sharedBy.get(r.article_id) ?? { shared: 0, primary: false }
      cur.shared++
      if (r.entity_id === primaryId) cur.primary = true
      sharedBy.set(r.article_id, cur)
    }
    const keepIds = memberIds.filter((id: string) => {
      const s = sharedBy.get(id)
      return s && (s.primary || s.shared >= 2)
    })
    if (keepIds.length > 0) memberIds = keepIds
  }
  const keepSet = new Set(memberIds)
  const text = (arts ?? []).filter((a: any) => keepSet.has(a.id)).map((a: any) => `${a.title}. ${a.summary ?? ''}`).join(' ')
  const process = findProcess(text)
  const title = makeArcTitle(actorName, process)
  const cls = applyFloor(classifyArc(text), catFloor)
  if (dry) return true
  const update: any = { title_article_count: n }
  if (title) update.title = title
  // Phase 0 fix: ALWAYS recompute the category (previously frozen once a
  // non-unclassified label existed, which kept wrong labels forever).
  if (cls.category === 'unclassified') {
    update.category = 'unclassified'
    update.category_confidence = null
    update.category_evidence = cls.evidence
  } else {
    update.category = cls.category
    update.category_confidence = cls.confidence
    update.category_evidence = cls.evidence
  }
  await supabase.from('story_arcs').update(update).eq('id', arc.id)
  if (title) arc.title = title
  arc.title_article_count = n
  if (title) {
    const noteCategory = update.category ?? arc.category
    await supabase
      .from('arc_milestones')
      .update({ notes: `Expected outcome for ${noteCategory} arc (${process}).` })
      .eq('arc_id', arc.id)
      .eq('status', 'pending')
      .like('notes', 'Expected outcome%')
  }
  return true
}

// Fix 9/20: entities are only written to arc_entities after the arc insert
// succeeds; rollback deletes pre-existing arc_entities this run created.
async function originateArc(
  supabase: any,
  art: any,
  embedding: number[] | null,
  actorName: string,
  process: string,
  catFloor: number,
  clusterSize: number,
  clusterEntities: ResolvedEntity[],
  clusterText: string,
  dry: boolean,
) {
  const cls = applyFloor(classifyArc(clusterText), catFloor)
  const title = makeArcTitle(actorName, process)
  if (!title) return null
  if (dry) return { id: 'dry', category: cls.category, title }
  const slug = `arc-${slugify(title).slice(0, 40)}-${String(art.id).slice(0, 8)}`

  const { data: rootNode } = await supabase
    .from('nodes')
    .insert({
      slug: `evt-${slugify(art.title).slice(0, 40)}-${String(art.id).slice(0, 8)}`,
      label: art.title.slice(0, 120),
      type: 'event',
      description: (art.summary ?? '').slice(0, 400),
      confidence: 65,
      summary: (art.summary ?? '').slice(0, 400),
      occurred_at: art.published_at ? String(art.published_at).slice(0, 10) : null,
    })
    .select('id')
    .single()

  const { data: arc, error: arcErr } = await supabase
    .from('story_arcs')
    .insert({
      slug,
      title,
      category: cls.category,
      category_confidence: cls.confidence,
      category_evidence: cls.evidence,
      seed_article_id: art.id,
      title_article_count: clusterSize,
      status: 'active',
      root_node_id: rootNode?.id ?? null,
      summary: (art.summary ?? '').slice(0, 500),
      started_at: art.published_at ? String(art.published_at).slice(0, 10) : null,
      embedding: embedding ? `[${embedding.join(',')}]` : null,
      last_assignment_run: new Date().toISOString(),
    })
    .select('id, slug, title, category, summary, status, root_node_id, title_article_count')
    .single()
  if (arcErr || !arc) {
    if (rootNode?.id) await supabase.from('nodes').delete().eq('id', rootNode.id)
    return null
  }

  // Phase 0 fix (anti-snowball): persist ONLY entities that appear in >= 2
  // cluster members (fall back to the actor entity alone).
  const memberCount = new Map<string, number>()
  for (const e of clusterEntities) memberCount.set(e.id, (memberCount.get(e.id) ?? 0) + 1)
  const seen = new Set<string>()
  const rows: any[] = []
  for (const e of clusterEntities) {
    if (seen.has(e.id)) continue
    seen.add(e.id)
    if ((memberCount.get(e.id) ?? 0) < 2) continue
    rows.push({ arc_id: arc.id, entity_id: e.id, role: e.canonical_name === actorName ? 'primary' : 'participant' })
  }
  if (rows.length === 0) {
    const actorEntity = clusterEntities.find((e) => e.canonical_name === actorName)
    if (actorEntity) rows.push({ arc_id: arc.id, entity_id: actorEntity.id, role: 'primary' })
  }
  if (rows.length > 0) {
    const { error: aeErr } = await supabase.from('arc_entities').upsert(rows, { onConflict: 'arc_id,entity_id' })
    if (aeErr) {
      // Fix 20: rollback — remove the arc and any arc_entities written.
      await supabase.from('arc_entities').delete().eq('arc_id', arc.id)
      await supabase.from('story_arcs').delete().eq('id', arc.id)
      if (rootNode?.id) await supabase.from('nodes').delete().eq('id', rootNode.id)
      return null
    }
  }

  await generateMilestones(supabase, arc.id, cls.category, process, dry)
  return arc
}

function clusterBySharedEntities(items: Array<{ id: string; entityIds: string[] }>): string[][] {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r)!
    let cur = x
    while (parent.get(cur) !== cur) {
      const next = parent.get(cur)!
      parent.set(cur, r)
      cur = next
    }
    return r
  }
  for (const it of items) parent.set(it.id, it.id)
  const byEntity = new Map<string, string[]>()
  for (const it of items) {
    for (const e of it.entityIds) {
      const arr = byEntity.get(e) ?? []
      arr.push(it.id)
      byEntity.set(e, arr)
    }
  }
  for (const ids of byEntity.values()) {
    for (let i = 1; i < ids.length; i++) {
      const ra = find(ids[0])
      const rb = find(ids[i])
      if (ra !== rb) parent.set(rb, ra)
    }
  }
  const comps = new Map<string, string[]>()
  for (const it of items) {
    const r = find(it.id)
    const arr = comps.get(r) ?? []
    arr.push(it.id)
    comps.set(r, arr)
  }
  return [...comps.values()]
}

// Fix 21: checkpoint helpers — per-phase cursors live in pipeline_config so a
// timed-out run resumes where it stopped instead of restarting.
async function getCheckpoint(supabase: any, key: string): Promise<any> {
  const { data } = await supabase.from('pipeline_config').select('value').eq('key', key).maybeSingle()
  return data?.value ?? null
}

async function setCheckpoint(supabase: any, key: string, value: any) {
  await supabase.from('pipeline_config').upsert({ key, value }, { onConflict: 'key' })
}

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: 'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
  }
  const url = new URL(req.url)
  const dry = url.searchParams.get('dry') === '1'
  const resume = url.searchParams.get('resume') !== '0' // default: resume from checkpoint
  const supabase = createClient(supabaseUrl, serviceKey)
  const cfg = await loadConfig(supabase)

  const CAT_FLOOR = Number(cfg.category_confidence_floor ?? 0.35)
  const EMBED_MODEL = String(cfg.embedding_model ?? 'gte-small')
  const ATTACH_MIN_SIM = Number(cfg.attach_min_similarity ?? 0.78) // Fix 1: from config
  const CLUSTER_MAX_DF = Number(cfg.cluster_entity_max_df ?? 5)   // Fix 1: from config
  const PHASE1_CAP = Number(cfg.backfill_phase1_cap ?? 1000)      // Fix 12
  const report: any = {
    dry,
    resume,
    articlesScanned: 0,
    embeddingsWritten: 0,
    entitiesResolved: 0,
    attached: 0,
    arcsOriginated: 0,
    unattached: 0,
    skippedExistingArc: 0,
    orphanEntitiesDeleted: 0,
    checkpoints: {} as Record<string, any>,
    errors: [] as string[],
  }

  const resolver = new EntityResolver(cfg)
  await resolver.load(supabase)

  const { data: outletRows } = await supabase.from('outlets').select('id, name')
  const outletNames = new Set<string>((outletRows ?? []).map((o: any) => normalizeEntityName(o.name)))
  for (const alias of OUTLET_NAME_ALIASES) outletNames.add(alias)

  // Fix 3/16: hub entities excluded from origination input AND logged.
  const hubEntityIds = await loadHubEntityIds(supabase, CLUSTER_MAX_DF)
  const hubNames: string[] = []
  for (const id of hubEntityIds) {
    const ent = [...resolver.byNorm.values()].find((e: any) => e.id === id)
    if (ent) hubNames.push(ent.canonical_name)
  }
  report.hubEntities = hubNames.sort()

  // ---------- Phase 1: fill missing embeddings + resolve entities ----------
  // Fix 21: cursor by fetched_at/id so reruns resume mid-table.
  const p1Cursor = resume ? await getCheckpoint(supabase, 'backfill_phase1_cursor') : null
  let q = supabase
    .from('articles')
    .select('id, title, summary, body_text, embedding, fetched_at')
    .order('fetched_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(PHASE1_CAP)
  if (p1Cursor?.fetched_at) {
    q = q.or(`fetched_at.gt.${p1Cursor.fetched_at},and(fetched_at.eq.${p1Cursor.fetched_at},id.gt.${p1Cursor.id})`)
  }
  const { data: arts, error: artErr } = await q
  if (artErr) throw artErr

  let phase1Processed = 0
  for (const a of arts ?? []) {
    report.articlesScanned++
    try {
      const analysisText = `${a.title}. ${a.body_text ?? a.summary ?? ''}`
      let embedding = parseVec(a.embedding)
      if (!embedding) {
        embedding = await embed(analysisText, EMBED_MODEL)
        if (!dry) {
          await supabase.from('articles').update({ embedding: `[${embedding.join(',')}]` }).eq('id', a.id)
        }
        report.embeddingsWritten++
      }
      // Resolve + persist entities for legacy articles that predate entity extraction.
      const { data: ae } = await supabase.from('article_entities').select('entity_id').eq('article_id', a.id).limit(1)
      if ((ae ?? []).length === 0) {
        const cands = extractEntityCandidates(analysisText, outletNames)
        let n = 0
        const articleEntityIds = new Set<string>()
        for (const cand of cands.slice(0, 25)) {
          const r = await resolver.resolve(supabase, cand)
          if (!r || articleEntityIds.has(r.id)) continue
          articleEntityIds.add(r.id)
          if (!dry) {
            // Fix 14: backfill confidence + extraction_method heuristically.
            await supabase.from('article_entities').upsert(
              { article_id: a.id, entity_id: r.id, confidence: r.confidence, extraction_method: 'heuristic', role: r.role },
              { onConflict: 'article_id,entity_id' },
            )
          }
          n++
        }
        // Fix 4: mention_count incremented ONCE per article, not per row.
        if (!dry && articleEntityIds.size > 0) {
          for (const eid of articleEntityIds) {
            const ent = [...resolver.byNorm.values()].find((e: any) => e.id === eid)
            if (ent) {
              await supabase
                .from('entities')
                .update({ mention_count: (ent.mention_count ?? 0) + 1, last_seen: new Date().toISOString() })
                .eq('id', eid)
              ent.mention_count = (ent.mention_count ?? 0) + 1
            }
          }
        }
        report.entitiesResolved += n
      }
      phase1Processed++
      if (!dry) await setCheckpoint(supabase, 'backfill_phase1_cursor', { fetched_at: a.fetched_at, id: a.id })
    } catch (err) {
      report.errors.push(`p1 ${a.id}: ${String(err)}`)
    }
  }
  report.checkpoints.phase1_processed = phase1Processed
  // Fix 12: if we hit the cap, caller must re-invoke to continue.
  report.checkpoints.phase1_complete = (arts ?? []).length < PHASE1_CAP

  // ---------- Phase 2: arc assignment for unattached, non-digest articles ----------
  const { data: unattached } = await supabase
    .from('articles')
    .select('id, title, summary, url, outlet, published_at, embedding, is_digest')
    .is('arc_id', null)
    .eq('is_digest', false)
    .order('published_at', { ascending: true })

  const pool: any[] = []
  for (const p of unattached ?? []) {
    const { data: ae } = await supabase.from('article_entities').select('entity_id, confidence').eq('article_id', p.id)
    let entityIds = (ae ?? []).filter((r: any) => r.confidence >= 0.5).map((r: any) => r.entity_id)
    entityIds = entityIds.filter((id) => !hubEntityIds.has(id)) // Fix 3
    pool.push({
      id: p.id,
      embedding: parseVec(p.embedding) ?? [],
      entityIds,
      art: p,
      citationCount: 0,
      citationPrimary: false,
    })
  }
  report.poolSize = pool.length

  const stillUnattached: any[] = []
  const touchedArcs = new Set<string>()
  for (const ca of pool) {
    if (ca.entityIds.length === 0) {
      stillUnattached.push(ca)
      continue
    }
    const hit = await findArcBySharedEntity(supabase, ca.entityIds, ca.embedding.length ? ca.embedding : null, ATTACH_MIN_SIM)
    if (hit) {
      const text = `${ca.art.title}. ${ca.art.summary ?? ''}`
      await attachToArc(supabase, ca.art, hit.arc, {
        sharedEntities: hit.sharedNames,
        sharedEntityIds: hit.sharedEntityIds,
        similarity: hit.similarity,
        causal: causalEvidence(text),
        hasCitation: ca.citationCount > 0,
        citationPrimary: ca.citationPrimary,
        embedding: ca.embedding.length ? ca.embedding : null,
      }, dry)
      report.attached++
      touchedArcs.add(hit.arc.id)
      await maybeRetitleArc(supabase, hit.arc, CAT_FLOOR, dry)
    } else {
      stillUnattached.push(ca)
    }
  }

  // ---------- Phase 3: originate arcs from entity-sharing clusters ----------
  const components = clusterBySharedEntities(
    stillUnattached.filter((c) => c.entityIds.length > 0).map((c) => ({ id: c.id, entityIds: c.entityIds })),
  )
  const byId = new Map(stillUnattached.map((c) => [c.id, c]))
  for (const comp of components) {
    const members = comp.map((id) => byId.get(id)!)
    if (members.length < 2) continue
    const clusterText = members.map((m) => `${m.art.title}. ${m.art.summary ?? ''}`).join(' ')
    const process = findProcess(clusterText)
    // Fix 6: only real resolved entities are actors — no trailing-stopword
    // 'other' junk. Load the entities for the cluster's entity ids.
    const clusterEntityIds = [...new Set(members.flatMap((m) => m.entityIds))]
    const clusterEntities: ResolvedEntity[] = []
    for (const eid of clusterEntityIds) {
      const ent = [...resolver.byNorm.values()].find((e: any) => e.id === eid)
      if (ent) {
        clusterEntities.push({
          id: ent.id,
          canonical_name: ent.canonical_name,
          entity_type: ent.entity_type,
          confidence: 0.5,
          role: null,
          isNew: false,
        })
      }
    }
    const actor =
      clusterEntities.find((e) => e.entity_type === 'institution') ??
      clusterEntities.find((e) => e.entity_type === 'person') ??
      clusterEntities[0]
    if (!process || !actor) continue
    members.sort((a, b) => String(a.art.published_at ?? '').localeCompare(String(b.art.published_at ?? '')))
    const seed = members[0]
    const arc = await originateArc(
      supabase, seed.art, seed.embedding.length ? seed.embedding : null,
      actor.canonical_name, process, CAT_FLOOR, members.length,
      clusterEntities, clusterText, dry,
    )
    if (!arc) continue
    report.arcsOriginated++
    touchedArcs.add(arc.id)
    for (const member of members) {
      const text = `${member.art.title}. ${member.art.summary ?? ''}`
      await attachToArc(supabase, member.art, arc, {
        sharedEntities: clusterEntities.map((e) => e.canonical_name),
        sharedEntityIds: clusterEntities.map((e) => e.id),
        similarity: null,
        causal: causalEvidence(text),
        hasCitation: member.citationCount > 0,
        citationPrimary: member.citationPrimary,
        embedding: member.embedding.length ? member.embedding : null,
      }, dry)
      report.attached++
    }
  }
  report.unattached = stillUnattached.length

  // Fix 15: last_assignment_run touched ONLY on arcs that received articles.
  if (!dry && touchedArcs.size > 0) {
    await supabase
      .from('story_arcs')
      .update({ last_assignment_run: new Date().toISOString() })
      .in('id', [...touchedArcs])
  }

  // ---------- Phase 4: prune orphan entities (Fix 13) ----------
  if (!dry) {
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString()
    const { data: orphans } = await supabase
      .from('entities')
      .select('id')
      .lt('created_at', cutoff)
    for (const o of orphans ?? []) {
      const { data: ae } = await supabase.from('article_entities').select('article_id').eq('entity_id', o.id).limit(1)
      const { data: ce } = await supabase.from('arc_entities').select('arc_id').eq('entity_id', o.id).limit(1)
      if ((ae ?? []).length === 0 && (ce ?? []).length === 0) {
        await supabase.from('entities').delete().eq('id', o.id)
        report.orphanEntitiesDeleted++
      }
    }
    await setCheckpoint(supabase, 'backfill_last_run', { at: new Date().toISOString(), report: { attached: report.attached, arcsOriginated: report.arcsOriginated } })
  }

  return Response.json({ ok: true, ...report })
})
