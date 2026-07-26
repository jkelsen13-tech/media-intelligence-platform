import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// MIP Build Directive v2 — Steps 5-8 (backfill-legacy, spec §2.5/§4/§5).
//
// Step 5: iterative arcing — first cycle seeds from the 30d lookback corpus,
//         every subsequent cycle attaches newly assigned articles, builds a
//         multi-article summary from member texts, and re-evaluates the arc's
//         category with confidence. Runs until no cycle assigns anything.
// Step 6: actor nodes/edges (§4) for every article (entity-backed, typed,
//         idempotent, cycle-independent). Entity types are resolved from the
//         entities table with a name-pattern fallback.
// Step 7: ranked signal reliability (§4/§3.4) — every edge carries
//         signal_source / doc_strength / claimed_by / reliability, replacing
//         per-article averages with per-claim attribution. New 4-tier edges
//         (topic+actor+temporal overlap) land between causal (3) and the
//         never-stored date-proximity (5).
// Step 8: topic tagging (§5) — articles/nodes tag against the FIXED topic
//         tree from node_topics only; no invented topics; low-confidence
//         tags stay untagged.
// ---------------------------------------------------------------------------

const CTX = { days: 30, concurrency: 8, maxArcsPerRun: 200, maxCycles: 10 }

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

// Prefixes (>= 2 chars) of known entity names. A trailing '&' + one of these
// at end-of-text is a truncated entity fragment ("...Asia.&lt"), not prose;
// single-letter tails ("M&A", "R&D") and non-entity words ("Goldman & Co")
// are left alone.
const TRUNCATED_ENTITY_PREFIXES = new Set([
  'lt', 'gt', 'am', 'amp', 'qu', 'quo', 'quot', 'ap', 'apo', 'apos',
  'nb', 'nbs', 'nbsp', 'hel', 'hell', 'helli', 'hellip',
  'mda', 'mdas', 'mdash', 'nda', 'ndas', 'ndash',
  'lsq', 'lsqu', 'lsquo', 'rsq', 'rsqu', 'rsquo',
  'ldq', 'ldqu', 'ldquo', 'rdq', 'rdqu', 'rdquo',
  'mid', 'midd', 'middo', 'middot', 'bul', 'bull',
  'cop', 'copy', 'reg', 'tra', 'trad', 'trade', 'deg',
])

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
// (whitespace-tolerant), decode bare entity words left by legacy
// half-stripped input (apos;/quot;), remove truncated entity tails at
// end-of-text, then collapse whitespace.
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
  // Tier 2 round 2: repair half-stripped entities (mirrors the r2
  // mip_clean_display_text() in the database).
  // (1) Bare known-entity words whose '&' was stripped upstream by legacy
  //     cleaners ("Trump apos;s", 'quot;60 Minutes quot;') decode to their
  //     character; an optional leading '&' and whitespace before ';' are
  //     tolerated. For quot;, a preceding space is consumed only for a
  //     CLOSING quote (followed by whitespace/end) so 'her quot;60' keeps
  //     its opening-quote spacing.
  s = s.replace(/&?\s+apos\s*;/g, "'")
  s = s.replace(/&?\bapos\s*;/g, "'")
  s = s.replace(/&?\s+quot\s*;(?=\s|$)/g, '"')
  s = s.replace(/&?\bquot\s*;/g, '"')
  s = s.replace(/&?\s*\bnbsp\s*;/g, ' ')
  s = s.replace(/&?\bamp\s*;/g, '&')
  s = s.replace(/&?\blt\s*;/g, '<')
  s = s.replace(/&?\bgt\s*;/g, '>')
  // (2) Truncated entity tails at end-of-text ("...war&", "...Asia.&lt")
  //     are removed; trailing punctuation is kept (and not duplicated when
  //     it already precedes the fragment: "Asia.&lt." -> "Asia.").
  s = s.replace(/&(#x?[0-9a-fA-F]{0,7}|[a-zA-Z]{2,9})([.,;:!?)\]]*)\s*$/, (m, g, punct, off, str) => {
    if (g[0] !== '#' && !TRUNCATED_ENTITY_PREFIXES.has(g.toLowerCase())) return m
    const prev = str[off - 1]
    return prev && punct.startsWith(prev) ? punct.slice(1) : punct
  })
  s = s.replace(/&(\s*[.,;:!?)\]]*)$/, '$1') // bare trailing '&' ("war&." -> "war.")
  s = s.replace(/\s+/g, ' ').trim()
  return { text: s, imageUrl, imageAlt }
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

function parseVec(v: any): number[] | null {
  if (!v) return null
  if (Array.isArray(v)) return v as number[]
  try { return JSON.parse(v) } catch {
    return String(v).replace(/[\[\]]/g, '').split(',').map(Number)
  }
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

function meanVec(vecs: number[][]): number[] {
  const n = vecs[0].length
  const out = new Array(n).fill(0)
  for (const v of vecs) for (let i = 0; i < n; i++) out[i] += v[i]
  return out.map((x) => x / vecs.length)
}

// ---------- Step 3b signals ----------

const CAUSAL_RE = /\b(as a result of|following|in response to|in the wake of|on the back of|after|amid|because of|due to|owing to|sparked by|triggered by|prompted by|citing|linked to|in retaliation for|in protest (of|at|against)|days? after|hours? after)\b/i

const CITATION_PATTERNS: Array<{ type: string; re: RegExp }> = [
  { type: 'court_doc', re: /(court documents?|court filing|court records?|indictment|affidavit|criminal complaint|lawsuit)([^.]{0,80})/i },
  { type: 'agency_release', re: /(press release|official statement|statement from the [A-Z][^.]{0,60}|agency (said|confirmed|reported)[^.]{0,60})/i },
  { type: 'named_official', re: /([A-Z][a-zA-Z'’-]+ [A-Z][a-zA-Z'’-]+ (?:said|told|announced|confirmed|stated)[^.]{0,60})/ },
  { type: 'anonymous_official', re: /((?:officials?|sources?)(?: familiar with| close to| briefed on)?[^.]{0,40}said|unnamed official[^.]{0,60}|anonymous official[^.]{0,60})/i },
  { type: 'study', re: /((?:study|report|poll|research|analysis)[^.]{0,40}(?:found|shows|published|concluded)[^.]{0,60})/i },
  { type: 'prior_reporting', re: /(previously reported[^.]{0,60}|according to (?:the )?(?:New York Times|BBC|CNN|Fox News|Al Jazeera|Reuters|AP)[^.]{0,60})/i },
]

function hasCitation(text: string): boolean {
  return CITATION_PATTERNS.some((p) => p.re.test(text))
}

function hasPrimaryCitation(text: string): boolean {
  return /court documents?|court filing|court records?|indictment|affidavit|criminal complaint|lawsuit|press release|official statement/i.test(text)
}

function causalEvidence(text: string): string | null {
  const m = text.match(CAUSAL_RE)
  return m ? m[0] : null
}

// ---------- classifier ----------
// Spec §2.5.3 defines exactly four named categories; 'unclassified' only when
// genuinely ambiguous. Keyword/weight rubric operationalises those category
// definitions; confidence is logged for every arc and the floor is calibrated
// from the measured distribution (stored in pipeline_config).

const CATEGORY_RUBRIC: Array<{ category: string; weight: number; re: RegExp }> = [
  // Institutional accountability: scrutiny of whether an institution or
  // officeholder discharged their duties — investigations, failures,
  // misconduct, oversight, legal exposure of officials.
  { category: 'institutional_accountability', weight: 0.45, re: /\b(investigation|investigating|probe|inquiry|inquest|misconduct|cover-up|oversight|indictment|indicted|arrest\w*|charged|jailed|blackmail|sacked|suspended|resignation|resigned)\b/i },
  { category: 'institutional_accountability', weight: 0.3, re: /\b(lack of authority|accountability|failure\w*|failings|negligence|whistleblow\w*|lawsuit|scandal|corruption|disciplinary|grooming|abuse)\b/i },
  { category: 'institutional_accountability', weight: 0.15, re: /\b(apolog\w+|compensation|report found|review found|criticis\w+)\b/i },
  // Geopolitical consequence: state / armed-actor actions and their
  // cross-border effects (shipping disruption, displacement, escalation).
  { category: 'geopolitical_consequence', weight: 0.45, re: /\b(war|ceasefire|missile\w*|troops|invasion|drone strike|nato|treaty|houthis?|red sea|escalation|airstrike\w*|hostages?|gaza|ukraine)\b/i },
  { category: 'geopolitical_consequence', weight: 0.35, re: /\b(sanctions?|shipping threat|tanker\w*|u-turn\w*|evacuation|displacement|cross-border|diplomat\w*|embassy|militia|insurgent\w*)\b/i },
  { category: 'geopolitical_consequence', weight: 0.15, re: /\b(allies|summit|foreign minister|defence|defense|security council|border)\b/i },
  // Economic policy: policy levers acting on the economy.
  { category: 'economic_policy', weight: 0.45, re: /\b(tariff\w*|inflation|interest rate\w*|federal reserve|trade (deal|war|dispute|crosshairs)|recession|budget|gdp|central bank)\b/i },
  { category: 'economic_policy', weight: 0.3, re: /\b(supply chain|jobs report|dairy sector|auto industry|rent control\w*|cost of living|wages?|deficit|spending|economy|economic)\b/i },
  { category: 'economic_policy', weight: 0.15, re: /\b(markets?|stocks?|shares|oil prices?|energy prices?|prices?)\b/i },
  // Legislative / regulatory: the lawmaking and rulemaking process.
  { category: 'legislative_regulatory', weight: 0.45, re: /\b(bill|senate|house passes|regulation|supreme court|executive order|congress|parliament|vote\w*|ruling|legislation|lawmakers)\b/i },
  { category: 'legislative_regulatory', weight: 0.3, re: /\b(rules out|backs off|pledge|ban\w*|controls|amendment|regulator\w*|white paper|statutory|clause|committee stage)\b/i },
  { category: 'legislative_regulatory', weight: 0.15, re: /\b(law|legal|court|judge|appeal|hearing)\b/i },
]

interface Classification {
  category: string
  confidence: number
  evidence: string | null
}

// Confidence is computed and logged regardless of floor; applyFloor decides
// whether the label stands.
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

// ---------- Step 3c: arc titles "[actor] — [process]" (expanded processes) ----------

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

// NO 'developments' fallback: callers must not originate without a process.
function makeArcTitle(actorName: string | null, process: string | null): string | null {
  if (!process) return null
  if (!actorName) return `Unattributed cluster — ${process}`
  // Strip possessive leaks ("Charlie Kirk's" -> "Charlie Kirk") so the title
  // subject is the entity name, not a surface form.
  const subject = actorName.replace(/['’]s$/u, '').trim()
  if (!subject) return `Unattributed cluster — ${process}`
  return `${subject} — ${process}`.slice(0, 140)
}

// Union-find over articles sharing resolved entities.
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
      arr.push(e)
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

// ---------------------------------------------------------------------------

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: 'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
  }
  const supabase = createClient(supabaseUrl, serviceKey)
  const cfg = await loadConfig(supabase)

  const CAT_FLOOR = Number(cfg.category_confidence_floor ?? 0.35)
  const TOPIC_FLOOR = Number(cfg.topic_confidence_floor ?? 0.4)
  const SIM_ATTACH = Number(cfg.similarity_attach ?? 0.78)
  const ENT_MIN_CONF = Number(cfg.entity_resolve_min_confidence ?? 0.5)
  const EMBED_MODEL = String(cfg.embedding_model ?? 'gte-small')
  const MAX_ORIGINATE_DF = Number(cfg.cluster_entity_max_df ?? 5)

  const report: any = {
    ranAt: new Date().toISOString(),
    thresholds: {
      similarity_attach: SIM_ATTACH,
      category_confidence_floor: CAT_FLOOR,
      entity_resolve_min_confidence: ENT_MIN_CONF,
      cluster_entity_max_df: MAX_ORIGINATE_DF,
    },
    // Phase 0 Part 1 — stage counters for diagnosis:
    // pool loaded / clusters attempted / passed each originate gate / arcs created.
    poolLoaded: 0,
    poolClustersAttempted: 0,
    poolClustersPassedProcess: 0,
    poolClustersPassedActor: 0,
    poolClustersOriginated: 0,
    poolAttached: 0,
    milestonesCreated: 0,
    milestonesUpdated: 0,
    actorNodesCreated: 0,
    actorEdgesCreated: 0,
    tier4EdgesCreated: 0,
    topicTagsWritten: 0,
    iterations: 0,
    arcsCreated: 0,
    attachments: 0,
    reEvaluated: 0,
    arcsRetitled: 0,
    resolvedConflicts: 0,
    unresolvedConflicts: 0,
    digestsUnattached: 0,
    noEntityUnattached: 0,
    terminals: 0,
    arcWarnings: [] as string[],
    errors: [] as string[],
  }

  // ---------- Pool: non-digest unattached articles in lookback window ----------
  const cutoff = new Date(Date.now() - CTX.days * 86400000).toISOString()
  const { data: poolArts, error: poolErr } = await supabase
    .from('articles')
    .select('id, title, summary, url, outlet, outlet_id, published_at, embedding, fetched_at')
    .is('arc_id', null)
    .eq('is_digest', false)
    .gte('fetched_at', cutoff)
    .order('published_at', { ascending: true })
  if (poolErr) throw poolErr

  // ---------- Step 5: entity-driven iterative arcing ----------
  interface PoolItem {
    id: string
    title: string
    summary: string
    url: string
    outlet: string
    published_at: string | null
    fetched_at: string | null
    embedding: number[] | null
    entityIds: string[]
    entityNames: Map<string, string>
    entityTypes: Map<string, string>
  }

  const byId = new Map<string, PoolItem>()
  for (const a of poolArts ?? []) {
    byId.set(a.id, {
      id: a.id,
      title: a.title,
      summary: a.summary ?? '',
      url: a.url ?? '',
      outlet: a.outlet ?? '',
      published_at: a.published_at,
      fetched_at: a.fetched_at,
      embedding: parseVec(a.embedding),
      entityIds: [],
      entityNames: new Map(),
      entityTypes: new Map(),
    })
  }
  report.poolLoaded = byId.size

  const { data: aeRows } = await supabase
    .from('article_entities')
    .select('article_id, entity_id, confidence, entities!inner(canonical_name, entity_type)')
    .in('article_id', [...byId.keys()])
  for (const r of aeRows ?? []) {
    const p = byId.get(r.article_id)
    if (!p) continue
    if (r.confidence < ENT_MIN_CONF) continue
    p.entityIds.push(r.entity_id)
    p.entityNames.set(r.entity_id, (r as any).entities.canonical_name)
    p.entityTypes.set(r.entity_id, (r as any).entities.entity_type ?? 'other')
  }

  // Document frequency of each entity across the POOL (used for origination gating).
  const entityDf = new Map<string, number>()
  for (const p of byId.values()) {
    for (const e of p.entityIds) entityDf.set(e, (entityDf.get(e) ?? 0) + 1)
  }

  // ---------- Step 6: actor nodes/edges for the pool ----------
  async function ensureActorNode(e: { id: string; name: string; type: string }): Promise<string | null> {
    // Type guard: never write non-string or malformed labels (a stray object
    // here once rendered literally as "[object Object]" in the graph).
    if (typeof e?.name !== 'string' || !e.name.trim()) return null
    if (e.name.includes('. ') || e.name.trim().split(/\s+/).length > 6) return null
    const slug = `actor-${e.name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()}`
    const { data, error } = await supabase
      .from('nodes')
      .upsert(
        { slug, label: e.name.slice(0, 160), type: 'actor', metadata: { entity_id: e.id, entity_type: e.type } },
        { onConflict: 'slug' },
      )
      .select('id')
      .single()
    if (error || !data) return null
    return data.id
  }

  for (const p of byId.values()) {
    const slug = `art-${slugify(p.title).slice(0, 40)}-${p.id.slice(0, 8)}`
    const { data: evNode } = await supabase
      .from('nodes')
      .upsert(
        {
          slug,
          label: p.title.slice(0, 120),
          type: 'event',
          description: p.summary.slice(0, 400),
          confidence: 70,
          occurred_at: p.published_at ? String(p.published_at).slice(0, 10) : null,
          metadata: { article_id: p.id },
        },
        { onConflict: 'slug' },
      )
      .select('id')
      .single()
    if (!evNode) continue
    for (const [eid, name] of p.entityNames) {
      const etype = p.entityTypes.get(eid) ?? 'other'
      if (!['person', 'organization', 'institution'].includes(etype)) continue
      const actorNodeId = await ensureActorNode({ id: eid, name, type: etype })
      if (!actorNodeId || actorNodeId === evNode.id) continue
      const { error } = await supabase.from('edges').upsert(
        {
          source_id: evNode.id,
          target_id: actorNodeId,
          type: 'actor',
          label: 'involves',
          weight: 'heavy',
          signal_source: 'shared_entity',
          doc_strength: 'corroborated',
          claimed_by: 'reporting',
          reliability: 2,
          metadata: { entity_id: eid, article_id: p.id },
        },
        { onConflict: 'source_id,target_id,type' },
      )
      if (!error) report.actorEdgesCreated++
    }
  }

  // ---------- Step 8: topic tagging (fixed tree; conservative) ----------
  const TOPIC_PARENT: Record<string, string | null> = {
    technology: null,
    ai: 'technology',
    'ai-model-development': 'ai',
    'ai-regulation': 'ai',
    'ai-infrastructure': 'ai',
    semiconductors: 'technology',
    'semiconductors-fabrication': 'semiconductors',
    'semiconductors-export-controls': 'semiconductors',
    'semiconductors-supply-chain': 'semiconductors',
    'quantum-computing': 'technology',
    'data-centers': 'technology',
    'data-centers-siting': 'data-centers',
    'data-centers-energy': 'data-centers',
    'data-centers-water': 'data-centers',
    telecommunications: 'technology',
    governance: null,
    'governance-legislation': 'governance',
    'governance-regulatory-action': 'governance',
    'governance-judicial': 'governance',
    'governance-executive-action': 'governance',
    'security-defense': null,
    'energy-environment': null,
    'labor-economy': null,
    'public-health': null,
    'civil-liberties': null,
  }
  const TOPIC_RULES: Array<{ slug: string; weight: number; re: RegExp }> = [
    { slug: 'ai-model-development', weight: 0.45, re: /\b(large language model|llm\b|frontier model|model (release|launch|training)|gpt-?\w*)\b/i },
    { slug: 'ai-regulation', weight: 0.45, re: /\b(ai (act|regulation|rules|bill|safety|governance)|artificial intelligence (regulation|bill|rules|safety))\b/i },
    { slug: 'ai-infrastructure', weight: 0.45, re: /\b(ai (infrastructure|compute|chips?|accelerators?))\b/i },
    { slug: 'ai', weight: 0.3, re: /\b(artificial intelligence|openai|anthropic|deepmind|machine learning)\b/i },
    { slug: 'semiconductors-fabrication', weight: 0.45, re: /\b(fabs?\b|foundry|tsmc|chip (plant|manufacturing|fab))\b/i },
    { slug: 'semiconductors-export-controls', weight: 0.45, re: /\b(export controls?|entity list|chip exports?)\b/i },
    { slug: 'semiconductors-supply-chain', weight: 0.45, re: /\b(chip supply|semiconductor supply|supply chains?)\b/i },
    { slug: 'semiconductors', weight: 0.3, re: /\bsemiconductors?\b/i },
    { slug: 'quantum-computing', weight: 0.45, re: /\bquantum (comput\w+|processor|supremacy)\b/i },
    { slug: 'data-centers-siting', weight: 0.45, re: /\bdata cent(er|re)\w*[\s\S]{0,40}(siting|permit\w*|zoning|construction)\b/i },
    { slug: 'data-centers-energy', weight: 0.45, re: /\bdata cent(er|re)\w*[\s\S]{0,40}(energy|power|electricity)\b/i },
    { slug: 'data-centers-water', weight: 0.45, re: /\bdata cent(er|re)\w*[\s\S]{0,40}water\b/i },
    { slug: 'data-centers', weight: 0.3, re: /\bdata cent(er|re)\w*\b/i },
    { slug: 'telecommunications', weight: 0.45, re: /\b(5g|6g|telecom\w*|broadband|spectrum auction)\b/i },
    { slug: 'technology', weight: 0.25, re: /\b(algorithm\w*|software|cyberattack\w*|app\b|platform\w*)\b/i },
    { slug: 'governance-legislation', weight: 0.45, re: /\b(bill|legislation|act passed|house passes|senate (vote|passes)|parliament|amendment)\b/i },
    { slug: 'governance-regulatory-action', weight: 0.45, re: /\b(regulator\w*|regulation|ban\w*|rules out|ftc|sec\b|fcc|ofcom|statutory)\b/i },
    { slug: 'governance-judicial', weight: 0.45, re: /\b(supreme court|court rules|ruling|verdict|judge|appeal|judgment)\b/i },
    { slug: 'governance-executive-action', weight: 0.45, re: /\b(executive order|white house|downing street|president (signed|ordered)|administration)\b/i },
    { slug: 'governance', weight: 0.25, re: /\b(government|minister|ministry|congress|senate)\b/i },
    { slug: 'security-defense', weight: 0.45, re: /\b(military|missile\w*|troops|defen[cs]e|nato|airstrike\w*|drone strike|\bwar\b|ceasefire|hostages?|sanction\w*|militia)\b/i },
    { slug: 'energy-environment', weight: 0.45, re: /\b(renewable\w*|solar|wind farm|nuclear|carbon|emission\w*|climate|flood\w*|wildfire\w*|hurricane|storm)\b/i },
    { slug: 'energy-environment', weight: 0.3, re: /\b(oil|gas prices?|energy)\b/i },
    { slug: 'labor-economy', weight: 0.45, re: /\b(inflation|tariff\w*|trade (deal|war|dispute)|recession|budget|gdp|interest rate\w*|federal reserve|jobs report|wages?|strike\w*|union\w*)\b/i },
    { slug: 'labor-economy', weight: 0.3, re: /\b(econom\w+|markets?|stocks?|shares)\b/i },
    { slug: 'public-health', weight: 0.45, re: /\b(hospital\w*|vaccin\w*|pandemic|disease|virus|cdc\b|who\b|public health|medical)\b/i },
    { slug: 'civil-liberties', weight: 0.45, re: /\b(civil libert\w+|free speech|privacy|protest\w*|dissent|censorship|surveillance|press freedom)\b/i },
  ]

  function tagTopics(text: string): Array<{ slug: string; confidence: number }> {
    const conf = new Map<string, number>()
    for (const { slug, weight, re } of TOPIC_RULES) {
      if (re.test(text)) conf.set(slug, Math.min(1, (conf.get(slug) ?? 0) + weight))
    }
    for (const [slug, c] of [...conf]) {
      let p = TOPIC_PARENT[slug]
      while (p) {
        conf.set(p, Math.max(conf.get(p) ?? 0, c))
        p = TOPIC_PARENT[p] ?? null
      }
    }
    return [...conf].filter(([, c]) => c >= TOPIC_FLOOR).map(([slug, confidence]) => ({ slug, confidence }))
  }

  const { data: topicRows } = await supabase.from('topics').select('id, slug')
  const topicIds = new Map<string, string>((topicRows ?? []).map((t: any) => [t.slug, t.id]))
  for (const p of byId.values()) {
    const tags = tagTopics(`${p.title}. ${p.summary}`)
    if (tags.length === 0) continue
    const slug = `art-${slugify(p.title).slice(0, 40)}-${p.id.slice(0, 8)}`
    const { data: evNode } = await supabase.from('nodes').select('id').eq('slug', slug).maybeSingle()
    if (!evNode) continue
    const rows = tags
      .map((t) => ({ node_id: evNode.id, topic_id: topicIds.get(t.slug), confidence: t.confidence }))
      .filter((r) => r.topic_id)
    if (rows.length === 0) continue
    const { error } = await supabase.from('node_topics').upsert(rows, { onConflict: 'node_id,topic_id' })
    if (!error) report.topicTagsWritten += rows.length
  }

  // ---------- Step 7: tier-4 edges (topic + actor + temporal overlap) ----------
  const { data: allNodes } = await supabase
    .from('nodes')
    .select('id, label, type, occurred_at')
    .eq('type', 'event')
    .not('occurred_at', 'is', null)
  const eventNodes = allNodes ?? []
  for (let i = 0; i < eventNodes.length; i++) {
    for (let j = i + 1; j < eventNodes.length; j++) {
      const a = eventNodes[i]
      const b = eventNodes[j]
      const days = Math.abs(new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()) / 86400000
      if (days > 14) continue
      const { data: shared } = await supabase
        .from('edges')
        .select('id')
        .eq('source_id', a.id)
        .eq('target_id', b.id)
        .maybeSingle()
      if (shared) continue
      const { data: sharedActors } = await supabase
        .from('edges')
        .select('target_id')
        .eq('source_id', a.id)
        .eq('type', 'actor')
      const aActors = new Set((sharedActors ?? []).map((e: any) => e.target_id))
      if (aActors.size === 0) continue
      const { data: bActors } = await supabase
        .from('edges')
        .select('target_id')
        .eq('source_id', b.id)
        .eq('type', 'actor')
      const sharedActor = (bActors ?? []).some((e: any) => aActors.has(e.target_id))
      if (!sharedActor) continue
      const { data: aTopics } = await supabase.from('node_topics').select('topic_id').eq('node_id', a.id)
      const aT = new Set((aTopics ?? []).map((t: any) => t.topic_id))
      const { data: bTopics } = await supabase.from('node_topics').select('topic_id').eq('node_id', b.id)
      const sharedTopic = (bTopics ?? []).some((t: any) => aT.has(t.topic_id))
      if (!sharedTopic) continue
      const { error } = await supabase.from('edges').upsert(
        {
          source_id: a.id,
          target_id: b.id,
          type: 'causal',
          label: 'topic + actor + temporal overlap',
          weight: 'light',
          signal_source: 'topic_actor_temporal',
          doc_strength: 'single_source',
          claimed_by: 'reporting',
          reliability: 4,
        },
        { onConflict: 'source_id,target_id,type' },
      )
      if (!error) report.tier4EdgesCreated++
    }
  }

  // ---------- Step 5: iterative arcing ----------
  for (let cycle = 0; cycle < CTX.maxCycles; cycle++) {
    report.iterations = cycle + 1
    let cycleAttachments = 0

    // Re-load active arcs every cycle so newly created arcs participate.
    const { data: arcs } = await supabase
      .from('story_arcs')
      .select('id, slug, title, category, summary, status, root_node_id, embedding, title_article_count, last_assignment_run')
      .eq('status', 'active')
    const arcList = (arcs ?? []).slice(0, CTX.maxArcsPerRun)
    const arcById = new Map<string, any>((arcs ?? []).map((a: any) => [a.id, a]))

    // Arc entity sets for shared-entity matching.
    const { data: arcEntRows } = await supabase
      .from('arc_entities')
      .select('arc_id, entity_id, role, entities!inner(canonical_name)')
      .in('arc_id', arcList.map((a: any) => a.id))
    const arcEnts = new Map<string, Map<string, { name: string; role: string }>>()
    for (const r of arcEntRows ?? []) {
      const m = arcEnts.get(r.arc_id) ?? new Map()
      m.set(r.entity_id, { name: (r as any).entities.canonical_name, role: (r as any).role })
      arcEnts.set(r.arc_id, m)
    }

    // Attach pool items to arcs by shared entity (>= 2 shared, or the arc's
    // primary entity; single-entity matches additionally need similarity).
    for (const p of byId.values()) {
      if (p.entityIds.length === 0) continue
      let bestArc: any = null
      let bestShared: string[] = []
      let bestSim: number | null = null
      for (const arc of arcList) {
        const ents = arcEnts.get(arc.id)
        if (!ents) continue
        const shared = p.entityIds.filter((e) => ents.has(e))
        const sharesPrimary = shared.some((e) => ents.get(e)?.role === 'primary')
        if (shared.length < 2 && !sharesPrimary) continue
        let sim: number | null = null
        const arcVec = parseVec(arc.embedding)
        if (p.embedding && arcVec) sim = cosine(p.embedding, arcVec)
        if (shared.length < 2 && (sim === null || sim < SIM_ATTACH)) continue
        if (!bestArc || shared.length > bestShared.length || (shared.length === bestShared.length && (sim ?? 0) > (bestSim ?? 0))) {
          bestArc = arc
          bestShared = shared
          bestSim = sim
        }
      }
      if (!bestArc) continue
      await supabase.from('articles').update({ arc_id: bestArc.id }).eq('id', p.id)
      const text = `${p.title}. ${p.summary}`
      const causal = causalEvidence(text)
      const cited = hasCitation(text)
      const citedPrimary = hasPrimaryCitation(text)
      const evSlug = `art-${slugify(p.title).slice(0, 40)}-${p.id.slice(0, 8)}`
      const { data: evNode } = await supabase.from('nodes').select('id').eq('slug', evSlug).maybeSingle()
      if ((causal || cited) && evNode && bestArc.root_node_id) {
        const reliability = causal ? 3 : citedPrimary ? 1 : 2
        await supabase.from('arc_events').insert({
          arc_id: bestArc.id,
          title: p.title.slice(0, 200),
          category: ARC_EVENT_CATEGORY[bestArc.category] ?? 'accountability',
          confidence: !causal && citedPrimary ? 'confirmed' : 'corroborated',
          occurred_at: p.published_at ? String(p.published_at).slice(0, 10) : null,
          description: p.summary.slice(0, 400),
        })
        await supabase.from('edges').upsert(
          {
            source_id: bestArc.root_node_id,
            target_id: evNode.id,
            type: 'causal',
            weight: reliability <= 2 ? 'heavy' : reliability === 3 ? 'medium' : 'light',
            label: causal ? `causal: ${causal}` : 'cited development in arc',
            similarity: bestSim,
            signal_source: causal ? 'causal_language' : 'citation',
            doc_strength: causal ? 'corroborated' : citedPrimary ? 'documented' : 'corroborated',
            claimed_by: !causal && citedPrimary ? 'source_document' : 'reporting',
            reliability,
            metadata: { signal_source: causal ? 'shared_entity+causal_language' : 'shared_entity+citation', shared_entities: bestShared.map((e) => arcEnts.get(bestArc.id)?.get(e)?.name), evidence: causal ?? 'explicit citation in article' },
          },
          { onConflict: 'source_id,target_id,type' },
        )
      }
      // Refresh arc centroid with the new member's embedding.
      if (p.embedding) {
        const { count } = await supabase
          .from('articles')
          .select('id', { count: 'exact', head: true })
          .eq('arc_id', bestArc.id)
          .not('embedding', 'is', null)
        const m = count ?? 1
        const old = parseVec(bestArc.embedding)
        const n = p.embedding.length
        const next: number[] = new Array(n)
        for (let i = 0; i < n; i++) {
          const prev = old && old.length === n && m > 1 ? old[i] * (m - 1) : 0
          next[i] = (prev + p.embedding[i]) / m
        }
        await supabase.from('story_arcs').update({ embedding: `[${next.join(',')}]`, last_update_at: new Date().toISOString() }).eq('id', bestArc.id)
        bestArc.embedding = next
      } else {
        await supabase.from('story_arcs').update({ last_update_at: new Date().toISOString() }).eq('id', bestArc.id)
      }
      // Ingest-time milestone evidence check.
      const { data: pending } = await supabase
        .from('arc_milestones')
        .select('id, milestone_key')
        .eq('arc_id', bestArc.id)
        .eq('status', 'pending')
      for (const ms of pending ?? []) {
        const tpl = (MILESTONE_TEMPLATES[bestArc.category] ?? MILESTONE_TEMPLATES.unclassified).find((t: any) => t.key === ms.milestone_key)
        if (!tpl) continue
        let status: string | null = null
        if (tpl.fail && tpl.fail.test(text)) status = 'failed'
        else if (tpl.confirm.test(text)) status = 'confirmed'
        if (!status) continue
        await supabase
          .from('arc_milestones')
          .update({ status, notes: `Evidence: "${p.title}" (${p.url || 'no url'})`, updated_at: new Date().toISOString() })
          .eq('id', ms.id)
        report.milestonesUpdated++
      }
      byId.delete(p.id)
      cycleAttachments++
      report.attachments++
    }

    // Originate new arcs from remaining pool clusters.
    const remaining = [...byId.values()].filter((p) => p.entityIds.length > 0)
    const components = clusterBySharedEntities(remaining.map((p) => ({ id: p.id, entityIds: p.entityIds })))
    for (const comp of components) {
      if (comp.length < 2) continue
      report.poolClustersAttempted++
      const members = comp.map((id) => byId.get(id)!).filter(Boolean)
      const clusterText = members.map((m) => `${m.title}. ${m.summary}`).join(' ')
      const process = findProcess(clusterText)
      if (!process) continue
      report.poolClustersPassedProcess++
      // Actor = highest-df entity in the cluster, typed institution > person > other.
      const entityCounts = new Map<string, number>()
      for (const m of members) for (const e of m.entityIds) entityCounts.set(e, (entityCounts.get(e) ?? 0) + 1)
      const candidates = [...entityCounts.entries()].filter(([e, c]) => c >= 2 && (entityDf.get(e) ?? 0) <= MAX_ORIGINATE_DF)
      if (candidates.length === 0) continue
      const actorEntry =
        candidates.find(([e]) => members.some((m) => m.entityTypes.get(e) === 'institution')) ??
        candidates.find(([e]) => members.some((m) => m.entityTypes.get(e) === 'person')) ??
        candidates[0]
      const actorName = members.find((m) => m.entityNames.has(actorEntry[0]))?.entityNames.get(actorEntry[0]) ?? null
      if (!actorName) continue
      report.poolClustersPassedActor++
      const cls = applyFloor(classifyArc(clusterText), CAT_FLOOR)
      const title = makeArcTitle(actorName, process)
      if (!title) continue
      members.sort((a, b) => String(a.published_at ?? '').localeCompare(String(b.published_at ?? '')))
      const seed = members[0]
      const { data: rootNode } = await supabase
        .from('nodes')
        .insert({
          slug: `evt-${slugify(seed.title).slice(0, 40)}-${seed.id.slice(0, 8)}`,
          label: seed.title.slice(0, 120),
          type: 'event',
          description: seed.summary.slice(0, 400),
          confidence: 65,
          summary: seed.summary.slice(0, 400),
          occurred_at: seed.published_at ? String(seed.published_at).slice(0, 10) : null,
        })
        .select('id')
        .single()
      const { data: arc } = await supabase
        .from('story_arcs')
        .insert({
          slug: `arc-${slugify(title).slice(0, 40)}-${seed.id.slice(0, 8)}`,
          title,
          category: cls.category,
          category_confidence: cls.confidence,
          category_evidence: cls.evidence,
          seed_article_id: seed.id,
          title_article_count: members.length,
          status: 'active',
          root_node_id: rootNode?.id ?? null,
          summary: seed.summary.slice(0, 500),
          started_at: seed.published_at ? String(seed.published_at).slice(0, 10) : null,
          embedding: seed.embedding ? `[${seed.embedding.join(',')}]` : null,
          last_assignment_run: new Date().toISOString(),
        })
        .select('id, slug, title, category, summary, status, root_node_id, title_article_count')
        .single()
      if (!arc) continue
      // Persist only cluster-stable entities (>= 2 members) as arc entities.
      const seen = new Set<string>()
      const rows: any[] = []
      for (const [e, c] of entityCounts) {
        if (c < 2 || seen.has(e)) continue
        seen.add(e)
        rows.push({ arc_id: arc.id, entity_id: e, role: e === actorEntry[0] ? 'primary' : 'participant' })
      }
      if (rows.length === 0) rows.push({ arc_id: arc.id, entity_id: actorEntry[0], role: 'primary' })
      await supabase.from('arc_entities').upsert(rows, { onConflict: 'arc_id,entity_id' })
      const templates = MILESTONE_TEMPLATES[cls.category] ?? MILESTONE_TEMPLATES.unclassified
      await supabase.from('arc_milestones').insert(
        templates.slice(0, 6).map((t: any) => ({
          arc_id: arc.id,
          title: t.title,
          milestone_key: t.key,
          status: 'pending',
          notes: `Expected outcome for ${cls.category} arc (${process}).`,
        })),
      )
      report.milestonesCreated += templates.length
      for (const m of members) {
        await supabase.from('articles').update({ arc_id: arc.id }).eq('id', m.id)
        byId.delete(m.id)
      }
      report.poolClustersOriginated++
      report.arcsCreated++
      cycleAttachments += members.length
    }

    // Re-evaluate arcs with new members (summary rebuild + category + retitle).
    for (const arc of arcList) {
      const { data: members } = await supabase
        .from('articles')
        .select('id, title, summary, published_at')
        .eq('arc_id', arc.id)
        .order('published_at', { ascending: true })
        .limit(10)
      const n = members?.length ?? 0
      if (n === 0) continue
      const last = arc.title_article_count ?? 0
      if (last > 0 && n < Math.max(last * 2, last + 5)) continue
      const text = (members ?? []).map((m: any) => `${m.title}. ${m.summary ?? ''}`).join(' ')
      const { data: primary } = await supabase
        .from('arc_entities')
        .select('entity_id, entities!inner(canonical_name)')
        .eq('arc_id', arc.id)
        .eq('role', 'primary')
        .limit(1)
      const actorName = (primary?.[0] as any)?.entities?.canonical_name ?? null
      const process = findProcess(text)
      const newTitle = makeArcTitle(actorName, process)
      const cls = applyFloor(classifyArc(text), CAT_FLOOR)
      const summaryText = (members ?? []).slice(0, 3).map((m: any) => m.summary).filter(Boolean).join(' ').slice(0, 500)
      const update: any = {
        title_article_count: n,
        summary: summaryText || arc.summary,
        category: cls.category,
        category_confidence: cls.category === 'unclassified' ? null : cls.confidence,
        category_evidence: cls.evidence,
      }
      if (newTitle) update.title = newTitle
      await supabase.from('story_arcs').update(update).eq('id', arc.id)
      report.reEvaluated++
      if (newTitle && newTitle !== arc.title) report.arcsRetitled++
    }

    if (cycleAttachments === 0) break
  }

  // ---------- Conflict resolution (multi-arc entities) ----------
  const { data: conflicts } = await supabase
    .from('arc_entities')
    .select('entity_id, arc_id')
  const byEntity = new Map<string, string[]>()
  for (const c of conflicts ?? []) {
    const arr = byEntity.get(c.entity_id) ?? []
    arr.push(c.arc_id)
    byEntity.set(c.entity_id, arr)
  }
  for (const [, arcIds] of byEntity) {
    if (arcIds.length < 2) continue
    report.unresolvedConflicts++
  }

  report.terminals = byId.size
  report.noEntityUnattached = [...byId.values()].filter((p) => p.entityIds.length === 0).length
  return Response.json({ ok: true, ...report })
})

// Milestone templates duplicated from ingest-rss for ingest-time evidence checks.
const MILESTONE_TEMPLATES: Record<string, Array<{ key: string; title: string; confirm: RegExp; fail?: RegExp }>> = {
  institutional_accountability: [
    { key: 'ia_concludes', title: 'Investigation or inquiry concludes', confirm: /\b(findings?|report)\b[\s\S]{0,40}\b(published|released)\b|\b(investigat\w*|inquiry|probe|inquest)\b[\s\S]{0,80}\b(conclud\w*|complet\w*|publishes?|releases?)\b/i, fail: /\b(investigat\w*|inquiry|probe)\b[\s\S]{0,60}\b(dropped|abandoned|closed without|shelved)\b/i },
    { key: 'ia_charges', title: 'Charges or disciplinary action filed', confirm: /\b(charged|charges (filed|brought)|indict\w+|prosecut\w+|disciplin\w+|suspended|dismissed|sacked)\b/i, fail: /\b(cleared|no charges|charges dropped|acquit\w+|exonerat\w+)\b/i },
    { key: 'ia_policy', title: 'Institution policy change announced', confirm: /\b(policy change|reform\w*|new (rules|guidelines|protocols)|overhaul|code of conduct)\b/i },
    { key: 'ia_remedy', title: 'Remedy or settlement for affected party', confirm: /\b(settlement|compensation|payout|remedy|apolog\w+|damages awarded|redress)\b/i },
  ],
  geopolitical_consequence: [
    { key: 'gp_ceasefire', title: 'Ceasefire or de-escalation agreed', confirm: /\b(ceasefire|truce|de-escalat\w+|peace (deal|agreement)|armistice|withdraw\w*)\b/i, fail: /\b(talks? (collapse\w*|fail\w*)|ceasefire (broken|collapses?|ends?))\b/i },
    { key: 'gp_sanctions', title: 'Sanctions or retaliation imposed', confirm: /\b(sanctions? (imposed|announced|extended)|retaliat\w+|expel\w+|travel ban)\b/i },
    { key: 'gp_routes', title: 'Disrupted routes or activity normalize', confirm: /\b(resum\w+|reopen\w*|normali[sz]e|returns? to (the )?(red sea|route|port))\b/i },
    { key: 'gp_escalation', title: 'Further escalation or intervention', confirm: /\b(escalat\w*|strike\w*|attack\w*|intervention|deploy\w+|mobilis\w+|mobiliz\w+)\b/i },
  ],
  economic_policy: [
    { key: 'ep_enacted', title: 'Policy measure enacted or implemented', confirm: /\b(takes effect|comes into force|enacted|implement\w+|signed into law|approved)\b/i },
    { key: 'ep_market', title: 'Market or sector adjustment', confirm: /\b(markets? (react\w*|fall|rise|slide)|shares? (fell|fall|rose|rise)|prices? (rise|fall|rose|fell)|adjust\w+)\b/i },
    { key: 'ep_reversal', title: 'Policy reversed or withdrawn', confirm: /\b(revers\w*|withdraw\w*|scrapped|backs off|abandon\w*|u-turn)\b/i },
    { key: 'ep_funding', title: 'Funding or budget allocated', confirm: /\b(funding|allocat\w+|budget|appropriat\w+|bailout)\b/i },
  ],
  legislative_regulatory: [
    { key: 'lr_funding', title: 'Implementation funding allocated', confirm: /\b(funding|allocat\w+|appropriat\w+|budget)\b/i },
    { key: 'lr_enforcement', title: 'Enforcement action filed', confirm: /\b(enforcement|fined|fine\w*|penalt\w+|crackdown|sanctioned)\b/i },
    { key: 'lr_challenge', title: 'Legal challenge filed', confirm: /\b(lawsuit|legal challenge|judicial review|court challenge|appeal|injunction)\b/i },
    { key: 'lr_deadline', title: 'Implementation deadline met', confirm: /\b(takes effect|comes into force|deadline|implement\w+|in force)\b/i, fail: /\b(delayed|postponed|missed deadline|pushed back)\b/i },
  ],
  unclassified: [
    { key: 'gen_response', title: 'Official response issued', confirm: /\b(respond\w*|statement|comment\w*|reaction)\b/i },
    { key: 'gen_development', title: 'Further developments reported', confirm: /\b(develop\w*|update\w*|continu\w+|latest)\b/i },
    { key: 'gen_reaction', title: 'Stakeholder reaction emerges', confirm: /\b(react\w*|criticis\w*|criticiz\w*|praise\w*|backlash|condemn\w+)\b/i },
  ],
}

const ARC_EVENT_CATEGORY: Record<string, string> = {
  institutional_accountability: 'accountability',
  geopolitical_consequence: 'geopolitical',
  economic_policy: 'economic',
  legislative_regulatory: 'legislative',
  unclassified: 'accountability',
}
