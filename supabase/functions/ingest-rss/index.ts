import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// Pass A — Data Correctness.
// A1: hard arc-origination gate (outlets x window x edges x named actor).
// A2: classifier returns category + confidence + evidence span and may
//     decline ('unclassified' below the configured confidence floor).
// A3: arc titles are "[primary actor/institution] — [process]"; the seed
//     article headline is kept only as seed_article_id provenance.
// All thresholds come from pipeline_config (single settings table).
// ---------------------------------------------------------------------------

async function loadConfig(supabase: any) {
  const { data, error } = await supabase.from('pipeline_config').select('key, value')
  if (error) throw error
  const cfg: Record<string, any> = {}
  for (const row of data) cfg[row.key] = row.value
  return cfg
}

function tag(block: string, name: string): string | null {
  const openTag = '<' + name
  const i = block.indexOf(openTag)
  if (i < 0) return null
  const boundary = block[i + openTag.length]
  if (boundary !== '>' && boundary !== ' ' && boundary !== '\t' && boundary !== '\n' && boundary !== '/') return null
  const gt = block.indexOf('>', i)
  const closeTag = '</' + name + '>'
  const j = block.indexOf(closeTag, gt)
  if (gt < 0 || j < 0) return null
  const content = block.slice(gt + 1, j)
  return content.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim()
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim()
}

function parseDate(s: string | null): string | null {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function absoluteUrl(base: string, href: string): string {
  try {
    return new URL(href, base).toString()
  } catch {
    return href
  }
}

interface RawItem {
  title: string
  url: string
  summary: string | null
  published_at: string | null
  byline: string | null
}

function parseFeed(xml: string, feedUrl: string): RawItem[] {
  const items: RawItem[] = []
  for (const m of xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)) {
    const b = m[1]
    const title = tag(b, 'title')
    const link = tag(b, 'link') ?? tag(b, 'guid')
    if (!title || !link) continue
    items.push({
      title: stripHtml(title),
      url: absoluteUrl(feedUrl, link),
      summary: stripHtml(tag(b, 'description') ?? '').slice(0, 2000) || null,
      published_at: parseDate(tag(b, 'pubDate') ?? tag(b, 'dc:date')),
      byline: tag(b, 'dc:creator') ?? tag(b, 'author'),
    })
  }
  for (const m of xml.matchAll(/<entry[\s>]([\s\S]*?)<\/entry>/gi)) {
    const b = m[1]
    const title = tag(b, 'title')
    const linkMatch = b.match(/<link[^>]*href=["']([^"']+)["']/i)
    if (!title || !linkMatch) continue
    const authorBlock = b.match(/<author[\s>]([\s\S]*?)<\/author>/i)
    items.push({
      title: stripHtml(title),
      url: absoluteUrl(feedUrl, linkMatch[1]),
      summary: stripHtml(tag(b, 'summary') ?? tag(b, 'content') ?? '').slice(0, 2000) || null,
      published_at: parseDate(tag(b, 'published') ?? tag(b, 'updated')),
      byline: authorBlock ? tag(authorBlock[1], 'name') : null,
    })
  }
  return items
}

const CITATION_PATTERNS: Array<{ type: string; re: RegExp }> = [
  { type: 'court_doc', re: /(court documents?|court filing|court records?|indictment|affidavit|criminal complaint|lawsuit)([^.]{0,80})/i },
  { type: 'agency_release', re: /(press release|official statement|statement from the [A-Z][^.]{0,60}|agency (said|confirmed|reported)[^.]{0,60})/i },
  { type: 'named_official', re: /([A-Z][a-zA-Z'-]+ [A-Z][a-zA-Z'-]+ (?:said|told|announced|confirmed|stated)[^.]{0,60})/ },
  { type: 'anonymous_official', re: /((?:officials?|sources?)(?: familiar with| close to| briefed on)?[^.]{0,40}said|unnamed official[^.]{0,60}|anonymous official[^.]{0,60})/i },
  { type: 'study', re: /((?:study|report|poll|research|analysis)[^.]{0,40}(?:found|shows|published|concluded)[^.]{0,60})/i },
  { type: 'prior_reporting', re: /(previously reported[^.]{0,60}|according to (?:the )?(?:New York Times|BBC|CNN|Fox News|Al Jazeera|Reuters|AP)[^.]{0,60})/i },
]

function extractCitations(text: string, weights: Record<string, number>) {
  const found: Array<{ cited_entity: string; cited_type: string; documentation_strength: number }> = []
  const seen = new Set<string>()
  for (const { type, re } of CITATION_PATTERNS) {
    const m = text.match(re)
    if (m && !seen.has(type)) {
      seen.add(type)
      found.push({
        cited_entity: (m[1] ?? m[0]).trim().slice(0, 160),
        cited_type: type,
        documentation_strength: weights[type] ?? 0.2,
      })
    }
  }
  return found
}

const FRAMING_MARKERS = /\b(critics say|supporters say|some say|many believe|could|may|might|appears|seems|allegedly|reportedly|so-called|claims? to)\b/i

function extractClaims(text: string) {
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 40 && s.length < 400)
  const claims: Array<{ text: string; kind: 'substantive' | 'framing' }> = []
  for (const s of sentences.slice(0, 12)) {
    claims.push({ text: s.trim(), kind: FRAMING_MARKERS.test(s) ? 'framing' : 'substantive' })
    if (claims.length >= 6) break
  }
  return claims
}

// ---------------------------------------------------------------------------
// Graph-signal extraction: candidate edges + named actors from article text.
// Used by the A1 origination gate (needs >= originate_min_edges edges and a
// named institution or public official) and by A3 title generation.
// ---------------------------------------------------------------------------

const INSTITUTION_RE =
  /\b((?:[A-Z][A-Za-z'&-]*\s+){0,3}(?:Police|Ministry|Department|Agency|Court|Senate|Congress|Parliament|Government|Army|Navy|Air Force|Garda|Gardaí|PSNI|NATO|UN|FBI|CIA|Federal Reserve|Commission|Authority|Council|Marine Park))\b/g
const OFFICIAL_TITLE_FIRST_RE =
  /\b(?:President|Prime Minister|Minister|Mayor|Senator|Governor|Secretary|Chancellor|Chancellor of the Exchequer|Spokesperson)\s+([A-Z][a-z'-]+(?:\s+[A-Z][a-z'-]+)?)/g
const OFFICIAL_NAME_FIRST_RE =
  /\b([A-Z][a-z'-]+\s+[A-Z][a-z'-]+)\s*,?\s*(?:the\s+)?(?:president|prime minister|minister|mayor|senator|governor|secretary|chancellor|mp\b)/gi

interface Actor {
  name: string
  kind: 'institution' | 'official'
}

function extractActors(text: string): Actor[] {
  const actors: Actor[] = []
  const seen = new Set<string>()
  const push = (name: string, kind: Actor['kind']) => {
    const clean = name.trim().replace(/\s+/g, ' ')
    const key = clean.toLowerCase()
    if (clean.length < 3 || seen.has(key)) return
    seen.add(key)
    actors.push({ name: clean, kind })
  }
  for (const m of text.matchAll(INSTITUTION_RE)) push(m[1], 'institution')
  for (const m of text.matchAll(OFFICIAL_TITLE_FIRST_RE)) push(m[1], 'official')
  for (const m of text.matchAll(OFFICIAL_NAME_FIRST_RE)) push(m[1], 'official')
  return actors
}

const RELATION_PATTERNS: Array<{ type: string; re: RegExp }> = [
  { type: 'causal', re: /\b(after|following|amid|because of|citing|in response to|sparked by|triggered by)\b/i },
  { type: 'conflict', re: /\b(threat(?:ens|ened)?|accus\w+|against|versus|clash\w*|attack\w*|strike\w*|seiz\w+|intercept\w+)\b/i },
  { type: 'financial', re: /\b(tariff\w*|sanction\w*|\$\d|billion|million|fund\w*|pay\w*|fine\w*)\b/i },
  { type: 'actor', re: /\b(said|announced|ordered|vowed|pledged|ruled out|backs off|called for|confirmed)\b/i },
  { type: 'documentary', re: /\b(documents?|filing|report|statement|release|records?)\b/i },
]

// Candidate graph edges = relation hits + citations + actor mentions.
function countExtractedEdges(text: string, citationCount: number, actorCount: number): number {
  let relations = 0
  for (const { re } of RELATION_PATTERNS) {
    const hits = text.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))
    if (hits) relations += Math.min(hits.length, 3)
  }
  return citationCount + actorCount + relations
}

// ---------------------------------------------------------------------------
// A2 — Category classifier.
// TODO(spec): rubric below is RECONSTRUCTED from the directive examples and
// the pre-existing keyword lists. Replace with the verbatim spec §2.5.3
// category definitions when the spec doc is available.
//   - Institutional Accountability: scrutiny of whether an institution or
//     officeholder discharged their duties — investigations, failures,
//     misconduct, oversight, legal exposure of officials.
//   - Geopolitical Consequence: state / armed-actor actions and their
//     cross-border effects (incl. commercial fallout, e.g. "Tankers make
//     sharp U-turns after Houthi shipping threat" — the shipping disruption
//     is a CONSEQUENCE of a geopolitical actor, not accountability).
//   - Economic Policy: policy levers acting on the economy — tariffs,
//     rates, budgets, trade measures, industrial policy.
//   - Legislative / Regulatory: the lawmaking and rulemaking process —
//     bills, votes, rulings, executive orders, regulatory decisions.
// Returns category + confidence (0..1) + the evidence span that justified it.
// Below category_confidence_floor the classifier declines: 'unclassified'.
// ---------------------------------------------------------------------------

const CATEGORY_RUBRIC: Array<{
  category: string
  weight: number
  re: RegExp
}> = [
  // Geopolitical consequence first: armed actors / inter-state actions and
  // their knock-on effects (shipping reroutes, displacement, escalation).
  { category: 'geopolitical_consequence', weight: 0.45, re: /\b(war|ceasefire|missile\w*|troops|invasion|drone strike|nato|treaty|houthis?|red sea|escalation)\b/i },
  { category: 'geopolitical_consequence', weight: 0.35, re: /\b(sanctions?|shipping threat|tanker\w*|u-turn\w*|evacuation|displacement|cross-border)\b/i },
  // Economic policy.
  { category: 'economic_policy', weight: 0.45, re: /\b(tariff\w*|inflation|interest rate\w*|federal reserve|trade (deal|war|dispute|crosshairs)|recession|budget)\b/i },
  { category: 'economic_policy', weight: 0.3, re: /\b(supply chain|jobs report|dairy sector|auto industry|rent control\w*)\b/i },
  // Legislative / regulatory process.
  { category: 'legislative_regulatory', weight: 0.45, re: /\b(bill|senate|house passes|regulation|supreme court|executive order|congress|parliament|vote\w*|ruling)\b/i },
  { category: 'legislative_regulatory', weight: 0.3, re: /\b(rules out|backs off|pledge|ban\w*|controls|amendment|legislation)\b/i },
  // Institutional accountability.
  { category: 'institutional_accountability', weight: 0.45, re: /\b(investigation|probe|misconduct|cover-up|oversight|indictment|arrest\w*|charged|jailed|blackmail)\b/i },
  { category: 'institutional_accountability', weight: 0.3, re: /\b(lack of authority|accountability|failure\w*|negligence|whistleblow\w*|lawsuit|inquiry)\b/i },
]

interface Classification {
  category: string
  confidence: number
  evidence: string | null
}

function classifyArc(text: string, floor: number): Classification {
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
  if (!best || best.confidence < floor) {
    return {
      category: 'unclassified',
      confidence: best?.confidence ?? 0,
      evidence: best?.evidence ?? null,
    }
  }
  return best
}

const ARC_EVENT_CATEGORY: Record<string, string> = {
  institutional_accountability: 'accountability',
  geopolitical_consequence: 'geopolitical',
  economic_policy: 'economic',
  legislative_regulatory: 'legislative',
  unclassified: 'accountability',
}

// ---------------------------------------------------------------------------
// A3 — Arc titles: "[primary actor or institution] — [process]".
// ---------------------------------------------------------------------------

const PROCESS_PATTERNS: Array<{ process: string; re: RegExp }> = [
  { process: 'cross-border explosives interdiction', re: /\b(bomb|explosive\w*|ied)\b.*\b(intercept\w*|seiz\w*)\b/i },
  { process: 'shipping interdiction', re: /\b(tanker\w*|shipping|vessel\w*).*(threat|u-turn|rerout\w*)|\b(shipping threat)\b/i },
  { process: 'military escalation', re: /\b(missile\w*|strike\w*|attack\w*|war)\b/i },
  { process: 'trade dispute', re: /\b(tariff\w*|trade (war|deal|dispute|crosshairs))\b/i },
  { process: 'criminal prosecution', re: /\b(arrest\w*|charged|indict\w*|jailed|prosecut\w*)\b/i },
  { process: 'legislative action', re: /\b(bill|vote\w*|executive order|rules out|regulation)\b/i },
  { process: 'policy reversal', re: /\b(backs off|revers\w*|drops|abandon\w*)\b/i },
  { process: 'medical evacuation', re: /\b(evacuation)\b/i },
]

function makeArcTitle(text: string, actors: Actor[]): string {
  const actor = actors.find((a) => a.kind === 'institution') ?? actors[0]
  let process: string | null = null
  for (const { process: p, re } of PROCESS_PATTERNS) {
    if (re.test(text)) {
      process = p
      break
    }
  }
  if (!process) process = 'developments'
  if (!actor) return `Unattributed cluster — ${process}`
  return `${actor.name} — ${process}`.slice(0, 140)
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
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
  try {
    return JSON.parse(v)
  } catch {
    return String(v).replace(/[\[\]]/g, '').split(',').map(Number)
  }
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z\s.'-]/g, '').replace(/\s+/g, ' ').trim()
}

async function resolveAuthor(supabase: any, byline: string | null, outletId: string) {
  if (!byline) return { authorId: null, unattributed: true, isNew: false }
  const clean = stripHtml(byline).replace(/^(by|By)\s+/, '').slice(0, 120)
  const norm = normalizeName(clean)
  if (!norm || norm.length < 3) return { authorId: null, unattributed: true, isNew: false }
  const { data: existing } = await supabase.from('authors').select('id, outlet_ids').eq('normalized_name', norm).maybeSingle()
  if (existing) {
    const outlets = new Set(existing.outlet_ids ?? [])
    outlets.add(outletId)
    await supabase.from('authors').update({ last_seen: new Date().toISOString(), outlet_ids: Array.from(outlets) }).eq('id', existing.id)
    return { authorId: existing.id, unattributed: false, isNew: false }
  }
  const { data: created, error } = await supabase.from('authors').insert({ name: clean, normalized_name: norm, outlet_ids: [outletId] }).select('id').single()
  if (error) return { authorId: null, unattributed: true, isNew: false }
  await supabase.from('author_profile_queue').upsert({ author_id: created.id }, { onConflict: 'author_id' })
  return { authorId: created.id, unattributed: false, isNew: true }
}

function resolveNodeId(citedEntity: string, nodeLabels: Array<{ id: string; label: string }>): string | null {
  const hay = citedEntity.toLowerCase()
  for (const n of nodeLabels) {
    const lab = n.label.toLowerCase()
    if (lab.length >= 5 && (hay.includes(lab) || lab.includes(hay))) return n.id
  }
  return null
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: 'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
  }
  const supabase = createClient(supabaseUrl, serviceKey)
  const cfg = await loadConfig(supabase)

  // Attachment threshold.
  const ATTACH_THRESHOLD = Number(cfg.attach_threshold ?? 0.88)
  // A1 origination gate thresholds.
  const SIG_SIMILARITY = Number(cfg.significance_similarity ?? 0.72)
  const ORIG_MIN_OUTLETS = Number(cfg.originate_min_outlets ?? 3)
  const ORIG_WINDOW_HOURS = Number(cfg.originate_window_hours ?? 72)
  const ORIG_MIN_EDGES = Number(cfg.originate_min_edges ?? 4)
  const ORIG_REQUIRE_ACTOR = String(cfg.originate_require_actor ?? true) !== 'false'
  // A2 classification floor.
  const CAT_FLOOR = Number(cfg.category_confidence_floor ?? 0.6)

  const DOC_WEIGHTS = cfg.doc_strength_weights ?? {}
  const EMBED_MODEL = String(cfg.embedding_model ?? 'gte-small')
  const LOOKBACK_DAYS = Number(cfg.lookback_days ?? 30)
  const AUTHOR_MIN = Number(cfg.author_min_articles ?? 3)
  const AUTHOR_MAX_PRIOR = Number(cfg.author_profile_max_prior ?? 5)
  const AUTHOR_REFRESH_DAYS = Number(cfg.author_refresh_days ?? 90)
  const MAX_PER_FEED = Number(cfg.max_items_per_feed ?? 4)
  const MAX_NEW_PER_RUN = Number(cfg.max_new_per_run ?? 8)
  const PRIOR_POOL_LIMIT = 60

  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 86400000)

  const { data: sources, error: srcErr } = await supabase
    .from('ingest_sources')
    .select('feed_url, enabled, outlets (id, name)')
    .eq('enabled', true)
  if (srcErr) throw srcErr

  const { data: nodeRows } = await supabase.from('nodes').select('id, label')
  const nodeLabels = (nodeRows ?? [])
    .filter((n: any) => n.label && n.label.length >= 5)
    .sort((a: any, b: any) => b.label.length - a.label.length)

  const report: any = {
    ranAt: new Date().toISOString(),
    thresholds: {
      attach_threshold: ATTACH_THRESHOLD,
      significance_similarity: SIG_SIMILARITY,
      originate_min_outlets: ORIG_MIN_OUTLETS,
      originate_window_hours: ORIG_WINDOW_HOURS,
      originate_min_edges: ORIG_MIN_EDGES,
      originate_require_actor: ORIG_REQUIRE_ACTOR,
      category_confidence_floor: CAT_FLOOR,
      embedding_model: EMBED_MODEL,
      lookback_days: LOOKBACK_DAYS,
      max_items_per_feed: MAX_PER_FEED,
      max_new_per_run: MAX_NEW_PER_RUN,
    },
    feeds: [] as any[],
    ingested: 0,
    skippedExisting: 0,
    attached: 0,
    arcsOriginated: 0,
    gateRejected: 0,
    unattached: 0,
    arcsRetitled: 0,
    monocultureFlags: 0,
    authorsProfiled: 0,
    citationsResolvedToNodes: 0,
    errors: [] as string[],
  }

  const cycleArticles: Array<{ id: string; outletKey: string; embedding: number[]; citationCount: number }> = []

  // ---------- Phase 1: new items from feeds ----------
  for (const src of sources ?? []) {
    if (report.ingested >= MAX_NEW_PER_RUN) break
    const outlet = (src as any).outlets
    const feedReport: any = { outlet: outlet?.name, feed: src.feed_url, fetched: 0, new: 0 }
    try {
      const res = await fetch(src.feed_url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MIP-Pipeline/5.0)', Accept: 'application/rss+xml, application/xml, text/xml, */*' },
        signal: AbortSignal.timeout(20000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const xml = await res.text()
      const items = parseFeed(xml, src.feed_url)
      feedReport.fetched = items.length

      for (const item of items) {
        if (feedReport.new >= MAX_PER_FEED) break
        if (report.ingested >= MAX_NEW_PER_RUN) break
        if (item.published_at && new Date(item.published_at) < cutoff) continue

        const { data: dup } = await supabase.from('articles').select('id').eq('url', item.url).maybeSingle()
        if (dup) {
          report.skippedExisting++
          continue
        }

        const { authorId, unattributed } = await resolveAuthor(supabase, item.byline, outlet.id)
        const bodyText = item.summary ?? ''
        const analysisText = `${item.title}. ${bodyText}`
        const citations = extractCitations(analysisText, DOC_WEIGHTS)
        const claims = extractClaims(analysisText)
        const embedding = await embed(analysisText, EMBED_MODEL)

        const { data: art, error: artErr } = await supabase
          .from('articles')
          .insert({
            feed: slugify(outlet.name),
            outlet: outlet.name,
            title: item.title,
            url: item.url,
            summary: bodyText.slice(0, 500) || null,
            published_at: item.published_at,
            outlet_id: outlet.id,
            author_id: authorId,
            body_text: bodyText || null,
            embedding: `[${embedding.join(',')}]`,
            claims,
            unattributed,
          })
          .select('id')
          .single()
        if (artErr) throw artErr

        for (const c of citations) {
          const resolved = resolveNodeId(c.cited_entity, nodeLabels)
          if (resolved) report.citationsResolvedToNodes++
          await supabase.from('citations').insert({ ...c, article_id: art.id, resolved_node_id: resolved })
        }

        cycleArticles.push({ id: art.id, outletKey: outlet.id, embedding, citationCount: citations.length })
        feedReport.new++
        report.ingested++
      }
    } catch (err) {
      feedReport.error = String(err)
      report.errors.push(`${outlet?.name}: ${String(err)}`)
    }
    report.feeds.push(feedReport)
  }

  // ---------- Phase 2: arc assignment over cycle + prior unattached pool ----------
  const { data: arcs } = await supabase
    .from('story_arcs')
    .select('id, slug, title, category, summary, status, root_node_id, embedding, title_article_count')
    .eq('status', 'active')

  const arcVecs: Array<{ arc: any; vec: number[] }> = []
  for (const arc of arcs ?? []) {
    let vec = parseVec(arc.embedding)
    if (!vec) {
      vec = await embed(`${arc.title}. ${arc.summary ?? ''}`, EMBED_MODEL)
      await supabase.from('story_arcs').update({ embedding: `[${vec.join(',')}]` }).eq('id', arc.id)
    }
    arcVecs.push({ arc, vec })
  }

  const cycleIds = new Set(cycleArticles.map((c) => c.id))
  const { data: priorUnattached } = await supabase
    .from('articles')
    .select('id, outlet, outlet_id, embedding')
    .is('arc_id', null)
    .not('embedding', 'is', null)
    .order('fetched_at', { ascending: false })
    .limit(PRIOR_POOL_LIMIT)

  const pool: Array<{ id: string; outletKey: string; embedding: number[]; citationCount: number }> = [...cycleArticles]
  for (const p of priorUnattached ?? []) {
    if (cycleIds.has(p.id)) continue
    const vec = parseVec(p.embedding)
    if (!vec) continue
    pool.push({ id: p.id, outletKey: p.outlet_id ?? p.outlet ?? 'unknown', embedding: vec, citationCount: 0 })
  }
  report.poolSize = pool.length

  const poolIds = pool.map((p) => p.id)
  const citCountByArticle = new Map<string, number>()
  if (poolIds.length > 0) {
    const { data: citRows } = await supabase.from('citations').select('article_id').in('article_id', poolIds)
    for (const c of citRows ?? []) {
      citCountByArticle.set(c.article_id, (citCountByArticle.get(c.article_id) ?? 0) + 1)
    }
  }

  const artById = new Map<string, any>()
  if (poolIds.length > 0) {
    const { data: artRows } = await supabase
      .from('articles')
      .select('id, title, summary, published_at, url, arc_id')
      .in('id', poolIds)
    for (const a of artRows ?? []) artById.set(a.id, a)
  }

  const unattachedPool: Array<{ id: string; outletKey: string; embedding: number[]; citationCount: number; art: any }> = []

  for (const ca of pool) {
    const art = artById.get(ca.id)
    if (!art || art.arc_id) continue
    ca.citationCount = citCountByArticle.get(ca.id) ?? ca.citationCount

    let best: { arc: any; score: number } | null = null
    for (const { arc, vec } of arcVecs) {
      const score = cosine(ca.embedding, vec)
      if (!best || score > best.score) best = { arc, score }
    }

    if (best && best.score >= ATTACH_THRESHOLD) {
      await attachToArc(supabase, art, best.arc)
      report.attached++
      const retitled = await maybeRetitleArc(supabase, best.arc, CAT_FLOOR)
      if (retitled) report.arcsRetitled++
    } else {
      unattachedPool.push({ ...ca, art })
    }
  }

  // ---------- A1 origination: hard significance gate ----------
  // (a) >= ORIG_MIN_OUTLETS distinct outlets within ORIG_WINDOW_HOURS,
  // (b) >= ORIG_MIN_EDGES extracted graph edges across the cluster,
  // (c) at least one named institution or public official actor.
  // Failing the gate is a VALID terminal state: articles stay unattached.
  const used = new Set<string>()
  for (let i = 0; i < unattachedPool.length; i++) {
    const a = unattachedPool[i]
    if (used.has(a.id)) continue
    const cluster = [a]
    const outlets = new Set([a.outletKey])
    for (let j = i + 1; j < unattachedPool.length; j++) {
      const b = unattachedPool[j]
      if (used.has(b.id)) continue
      if (cosine(a.embedding, b.embedding) >= SIG_SIMILARITY) {
        cluster.push(b)
        outlets.add(b.outletKey)
        used.add(b.id)
      }
    }
    used.add(a.id)

    // Gate (a): cross-outlet coverage inside the origination window.
    const times = cluster
      .map((m) => (m.art.published_at ? new Date(m.art.published_at).getTime() : null))
      .filter((t): t is number => t !== null)
    const windowOk =
      times.length === 0 || (Math.max(...times) - Math.min(...times)) / 3600000 <= ORIG_WINDOW_HOURS
    const outletsOk = outlets.size >= ORIG_MIN_OUTLETS && windowOk

    // Gates (b) + (c): extracted edges and named actors across the cluster.
    let edgeCount = 0
    const actors: Actor[] = []
    const seenActors = new Set<string>()
    for (const m of cluster) {
      const text = `${m.art.title}. ${m.art.summary ?? ''}`
      const mActors = extractActors(text)
      edgeCount += countExtractedEdges(text, citCountByArticle.get(m.id) ?? m.citationCount, mActors.length)
      for (const act of mActors) {
        const key = act.name.toLowerCase()
        if (!seenActors.has(key)) {
          seenActors.add(key)
          actors.push(act)
        }
      }
    }
    const edgesOk = edgeCount >= ORIG_MIN_EDGES
    const actorOk = !ORIG_REQUIRE_ACTOR || actors.length > 0

    if (outletsOk && edgesOk && actorOk) {
      const arc = await originateArc(supabase, a.art, a.embedding, actors, CAT_FLOOR, cluster.length)
      arcVecs.push({ arc, vec: a.embedding })
      report.arcsOriginated++
      for (const member of cluster) {
        await attachToArc(supabase, member.art, arc)
        report.attached++
      }
    } else {
      report.gateRejected++
      report.unattached += cluster.length
    }
  }

  await supabase
    .from('story_arcs')
    .update({ last_assignment_run: new Date().toISOString() })
    .eq('status', 'active')

  // ---------- Phase 3: monoculture flags ----------
  const { data: citRows2 } = await supabase
    .from('citations')
    .select('cited_entity, article_id')
    .order('created_at', { ascending: false })
    .limit(2000)
  const byEntity = new Map<string, string[]>()
  for (const c of citRows2 ?? []) {
    const key = c.cited_entity.toLowerCase()
    const arr = byEntity.get(key) ?? []
    arr.push(c.article_id)
    byEntity.set(key, arr)
  }
  for (const [, articleIds] of byEntity) {
    if (new Set(articleIds).size < 2) continue
    const { data: flagged } = await supabase
      .from('articles')
      .update({ monoculture: true })
      .in('id', [...new Set(articleIds)])
      .select('id')
    report.monocultureFlags += flagged?.length ?? 0
  }

  // ---------- Phase 4: author profiling ----------
  const refreshCutoff = new Date(Date.now() - AUTHOR_REFRESH_DAYS * 86400000).toISOString()
  const { data: queue } = await supabase
    .from('author_profile_queue')
    .select('author_id, authors (id, name, article_count, last_computed)')
    .is('processed_at', null)
    .limit(5)
  for (const q of queue ?? []) {
    const author = (q as any).authors
    if (!author) continue
    if (author.last_computed && author.last_computed > refreshCutoff) {
      await supabase.from('author_profile_queue').update({ processed_at: new Date().toISOString() }).eq('author_id', author.id)
      continue
    }
    const { data: arts } = await supabase
      .from('articles')
      .select('claims, citations (cited_type)')
      .eq('author_id', author.id)
      .gte('published_at', new Date(Date.now() - 365 * 86400000).toISOString())
      .order('published_at', { ascending: false })
      .limit(AUTHOR_MAX_PRIOR)
    const count = arts?.length ?? 0
    await supabase.from('authors').update({ article_count: count }).eq('id', author.id)
    if (count < AUTHOR_MIN) continue

    let substantive = 0, framing = 0
    const typeDist: Record<string, number> = {}
    for (const a of arts ?? []) {
      for (const c of a.claims ?? []) {
        if (c.kind === 'substantive') substantive++
        else framing++
      }
      for (const cit of (a as any).citations ?? []) {
        typeDist[cit.cited_type] = (typeDist[cit.cited_type] ?? 0) + 1
      }
    }
    const profile = {
      settled_vs_contested: {
        substantive_claims: substantive,
        framing_claims: framing,
        settled_ratio: substantive + framing > 0 ? substantive / (substantive + framing) : null,
      },
      citation_diversity: typeDist,
      outlet_alignment: null,
      note: 'Heuristic profile from recent articles; no left-right score by design.',
      usable: count >= AUTHOR_MIN,
    }
    const confidence = Math.min(1, count / AUTHOR_MAX_PRIOR) * 0.8
    await supabase
      .from('authors')
      .update({ framing_profile: profile, confidence, last_computed: new Date().toISOString() })
      .eq('id', author.id)
    await supabase.from('author_profile_queue').update({ processed_at: new Date().toISOString() }).eq('author_id', author.id)
    report.authorsProfiled++
  }

  return Response.json({ ok: true, ...report })
})

async function attachToArc(supabase: any, art: any, arc: any) {
  await supabase.from('articles').update({ arc_id: arc.id }).eq('id', art.id)

  const slug = `art-${slugify(art.title).slice(0, 40)}-${art.id.slice(0, 8)}`
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
      },
      { onConflict: 'slug' },
    )
    .select('id')
    .single()

  await supabase.from('arc_events').insert({
    arc_id: arc.id,
    title: art.title.slice(0, 200),
    category: ARC_EVENT_CATEGORY[arc.category] ?? 'accountability',
    confidence: 'corroborated',
    occurred_at: art.published_at ? String(art.published_at).slice(0, 10) : null,
    description: (art.summary ?? '').slice(0, 400),
  })

  if (node && arc.root_node_id) {
    await supabase.from('edges').upsert(
      {
        source_id: arc.root_node_id,
        target_id: node.id,
        type: 'causal',
        weight: 'light',
        label: 'development in arc',
      },
      { onConflict: 'source_id,target_id,type' },
    )
  }
  await supabase.from('story_arcs').update({ last_update_at: new Date().toISOString() }).eq('id', arc.id)
}

// A3: retitle when the arc's node cluster shifts MATERIALLY — not per article.
// Material = attached-article count has doubled (or grown by >= 5) since the
// title was last generated.
async function maybeRetitleArc(supabase: any, arc: any, catFloor: number): Promise<boolean> {
  const { count } = await supabase
    .from('articles')
    .select('id', { count: 'exact', head: true })
    .eq('arc_id', arc.id)
  const n = count ?? 0
  const last = arc.title_article_count ?? 0
  if (n === 0 || (last > 0 && n < Math.max(last * 2, last + 5))) return false

  const { data: arts } = await supabase
    .from('articles')
    .select('title, summary')
    .eq('arc_id', arc.id)
    .order('published_at', { ascending: true })
    .limit(10)
  const text = (arts ?? []).map((a: any) => `${a.title}. ${a.summary ?? ''}`).join(' ')
  const actors = extractActors(text)
  const title = makeArcTitle(text, actors)
  const cls = classifyArc(text, catFloor)
  const update: any = { title, title_article_count: n }
  if (arc.category === 'unclassified' && cls.category !== 'unclassified') {
    update.category = cls.category
    update.category_confidence = cls.confidence
    update.category_evidence = cls.evidence
  }
  await supabase.from('story_arcs').update(update).eq('id', arc.id)
  arc.title = title
  arc.title_article_count = n
  return true
}

async function originateArc(
  supabase: any,
  art: any,
  embedding: number[],
  actors: Actor[],
  catFloor: number,
  clusterSize: number,
) {
  const text = `${art.title}. ${art.summary ?? ''}`
  const cls = classifyArc(text, catFloor)
  const title = makeArcTitle(text, actors)
  const slug = `arc-${slugify(title).slice(0, 40)}-${art.id.slice(0, 8)}`

  const { data: rootNode } = await supabase
    .from('nodes')
    .insert({
      slug: `evt-${slugify(art.title).slice(0, 40)}-${art.id.slice(0, 8)}`,
      label: art.title.slice(0, 120),
      type: 'event',
      description: (art.summary ?? '').slice(0, 400),
      confidence: 65,
      summary: (art.summary ?? '').slice(0, 400),
      occurred_at: art.published_at ? String(art.published_at).slice(0, 10) : null,
    })
    .select('id')
    .single()

  const { data: arc } = await supabase
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
      embedding: `[${embedding.join(',')}]`,
      last_assignment_run: new Date().toISOString(),
    })
    .select('id, slug, title, category, summary, status, root_node_id, title_article_count')
    .single()
  return arc
}
