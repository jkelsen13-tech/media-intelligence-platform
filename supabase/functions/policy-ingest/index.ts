import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// Step 10 (§7, governed by §3): policy consequence ingestion.
//
// Sources are drop-in ADAPTERS (one per cross-domain source, §3.1) sharing a
// single upsert path:
//   - federalRegisterAdapter (IMPLEMENTED): FR API v1, no key. Highest-
//     confidence tier: structured amendment metadata => policy→policy AMENDS
//     edges with claimed_by=source_document / documented / citation / rel 1.
//   - gaoAdapter (IMPLEMENTED): GAO reports RSS => policy_documents rows
//     (claimed_by='analysis' claimant records; claims stored only as stated).
//   - future: crs / eurlex / legislation_gov_uk / courtlistener — implement
//     SourceAdapter and push into ADAPTERS.
//
// Policy→Event edges are CONSERVATIVE (§3.2): explicit citation of the policy
// (documented, rel 1-2) or explicit causal language naming it (reporting, 3).
// MIP_inferred edges only with all four mechanisms populated, and only when a
// policy actor is shared with the event + temporal ordering holds. When in
// doubt: NO edge.
//
// Modes: (default/?mode=ingest) run adapters; ?mode=backfill scans the
// existing corpus for well-known statutes/EOs and applies the same rules.
// Scheduling: daily alongside ingest-rss (same external cron pattern; see
// pipeline_config key policy_ingest_schedule).
// ---------------------------------------------------------------------------

async function loadConfig(supabase: any) {
  const { data, error } = await supabase.from('pipeline_config').select('key, value')
  if (error) throw error
  const cfg: Record<string, any> = {}
  for (const row of data) cfg[row.key] = row.value
  return cfg
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
}

function normalizeEntityName(s: string): string {
  return s.toLowerCase().replace(/[''’]s\b/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

const CAUSAL_RE = /\b(as a result of|following|in response to|in the wake of|on the back of|because of|due to|owing to|sparked by|triggered by|prompted by|pursuant to|under the|required by|mandated by)\b/i

function causalEvidence(text: string): string | null {
  const m = text.match(CAUSAL_RE)
  return m ? m[0] : null
}

// ---------- fixed topic tree tagging (same rules as ingest-rss/backfill) ----------

const TOPIC_PARENT: Record<string, string | null> = {
  technology: null, ai: 'technology', 'ai-model-development': 'ai', 'ai-regulation': 'ai', 'ai-infrastructure': 'ai',
  semiconductors: 'technology', 'semiconductors-fabrication': 'semiconductors', 'semiconductors-export-controls': 'semiconductors', 'semiconductors-supply-chain': 'semiconductors',
  'quantum-computing': 'technology', 'data-centers': 'technology', 'data-centers-siting': 'data-centers', 'data-centers-energy': 'data-centers', 'data-centers-water': 'data-centers',
  telecommunications: 'technology',
  governance: null, 'governance-legislation': 'governance', 'governance-regulatory-action': 'governance', 'governance-judicial': 'governance', 'governance-executive-action': 'governance',
  'security-defense': null, 'energy-environment': null, 'labor-economy': null, 'public-health': null, 'civil-liberties': null,
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

function tagTopics(text: string, floor: number): Array<{ slug: string; confidence: number }> {
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
  return [...conf].filter(([, c]) => c >= floor).map(([slug, confidence]) => ({ slug, confidence }))
}

// ---------- shared upsert path ----------

interface PolicyInput {
  name: string
  jurisdiction: string
  instrument_type: 'statute' | 'executive order' | 'regulation' | 'court ruling' | 'treaty'
  status: 'proposed' | 'enacted' | 'in force' | 'amended' | 'superseded' | 'repealed' | 'struck down'
  enacted_date: string | null // YYYY-MM-DD
  effective_date?: string | null
  source_url: string | null
  full_text_url: string | null
  external_id: string | null
  metadata?: Record<string, any>
  agencies?: string[] // resolved through entities -> policy_actors + actor nodes
  citation?: string | null // e.g. '90 FR 12345'
  topicText?: string // extra text for topic tagging
}

async function ensurePolicyNode(supabase: any, policy: any): Promise<string | null> {
  const slug = `policy-${policy.external_id ? slugify(policy.external_id) : slugify(policy.name)}`
  const { data, error } = await supabase
    .from('nodes')
    .upsert(
      {
        slug,
        label: policy.name.slice(0, 160),
        type: 'policy',
        description: `${policy.instrument_type ?? 'policy'} — ${policy.jurisdiction ?? ''}`.slice(0, 400),
        occurred_at: policy.enacted_date ?? null,
        metadata: { policy_id: policy.id },
      },
      { onConflict: 'slug' },
    )
    .select('id')
    .single()
  if (error || !data) return null
  return data.id
}

async function ensureActorNode(supabase: any, e: { id: string; canonical_name: string; entity_type: string }): Promise<string | null> {
  const slug = `actor-${normalizeEntityName(e.canonical_name)}`
  const { data, error } = await supabase
    .from('nodes')
    .upsert(
      { slug, label: e.canonical_name.slice(0, 160), type: 'actor', metadata: { entity_id: e.id, entity_type: e.entity_type } },
      { onConflict: 'slug' },
    )
    .select('id')
    .single()
  if (error || !data) return null
  return data.id
}

// Resolve an agency name through the entities pipeline (exact normalized
// match, else create institution). Agencies are institutions by construction.
async function resolveAgency(supabase: any, name: string): Promise<{ id: string; canonical_name: string; entity_type: string } | null> {
  const clean = name.trim().slice(0, 160)
  const norm = normalizeEntityName(clean)
  if (!norm) return null
  const { data: existing } = await supabase
    .from('entities')
    .select('id, canonical_name, entity_type')
    .eq('normalized_name', norm)
    .maybeSingle()
  if (existing) return existing
  const { data: created, error } = await supabase
    .from('entities')
    .upsert(
      { canonical_name: clean, normalized_name: norm, entity_type: 'institution', mention_count: 0, last_seen: new Date().toISOString() },
      { onConflict: 'normalized_name' },
    )
    .select('id, canonical_name, entity_type')
    .single()
  if (error || !created) return null
  return created
}

async function upsertPolicy(supabase: any, p: PolicyInput, topicFloor: number): Promise<{ id: string; nodeId: string | null } | null> {
  const row: any = {
    name: p.name.slice(0, 300),
    jurisdiction: p.jurisdiction,
    instrument_type: p.instrument_type,
    status: p.status,
    enacted_date: p.enacted_date,
    effective_date: p.effective_date ?? null,
    source_url: p.source_url,
    full_text_url: p.full_text_url,
    external_id: p.external_id,
    metadata: { ...(p.metadata ?? {}), citation: p.citation ?? null },
  }
  let pol: any = null
  let error: any = null
  if (p.external_id) {
    const r = await supabase.from('policies').upsert(row, { onConflict: 'external_id' }).select('id').single()
    pol = r.data
    error = r.error
  } else {
    // no external id: dedupe by exact name
    const { data: byName } = await supabase.from('policies').select('id').ilike('name', row.name).maybeSingle()
    if (byName) {
      await supabase.from('policies').update(row).eq('id', byName.id)
      pol = byName
    } else {
      const ins = await supabase.from('policies').insert(row).select('id').single()
      pol = ins.data
      error = ins.error
    }
  }
  if (error || !pol) return null
  const nodeId = await ensurePolicyNode(supabase, { ...row, id: pol.id })

  // agencies -> entities -> policy_actors + actor nodes + attributed actor edges
  for (const agency of p.agencies ?? []) {
    const ent = await resolveAgency(supabase, agency)
    if (!ent) continue
    await supabase.from('policy_actors').upsert(
      { policy_id: pol.id, entity_id: ent.id, role: 'issuing_authority' },
      { onConflict: 'policy_id,entity_id,role' },
    )
    const actorNodeId = await ensureActorNode(supabase, ent)
    if (actorNodeId && nodeId) {
      await supabase.from('edges').upsert(
        {
          source_id: nodeId,
          target_id: actorNodeId,
          type: 'actor',
          label: 'issued by',
          weight: 'heavy',
          signal_source: 'citation',
          doc_strength: 'documented',
          claimed_by: 'source_document',
          reliability: 1,
          stance: 'supports',
          metadata: { entity_id: ent.id, evidence: 'issuing agency stated in source document' },
        },
        { onConflict: 'source_id,target_id,type' },
      )
    }
  }

  // topic tagging against the fixed tree
  const tags = tagTopics(`${p.name}. ${p.topicText ?? ''}`, topicFloor)
  if (tags.length > 0) {
    const { data: topicRows } = await supabase.from('topics').select('id, slug')
    const idBySlug = new Map((topicRows ?? []).map((t: any) => [t.slug, t.id]))
    const rows = tags
      .map((t) => ({ policy_id: pol.id, topic_id: idBySlug.get(t.slug), confidence: t.confidence }))
      .filter((r) => r.topic_id)
    if (rows.length > 0) await supabase.from('policy_topics').upsert(rows, { onConflict: 'policy_id,topic_id' })
  }

  return { id: pol.id, nodeId }
}

// policy -> policy edge, fully attributed (trigger enforces)
async function policyPolicyEdge(
  supabase: any,
  fromNodeId: string,
  toNodeId: string,
  type: 'amends' | 'supersedes' | 'enables' | 'constrains' | 'conflicts_with',
  evidence: string,
) {
  await supabase.from('edges').upsert(
    {
      source_id: fromNodeId,
      target_id: toNodeId,
      type,
      label: `${type}: ${evidence}`.slice(0, 200),
      weight: 'heavy',
      signal_source: 'citation',
      doc_strength: 'documented',
      claimed_by: 'source_document',
      reliability: 1,
      stance: 'supports',
      metadata: { evidence },
    },
    { onConflict: 'source_id,target_id,type' },
  )
}

// ---------- SourceAdapter interface + adapters ----------

interface SourceAdapter {
  source: string
  run(supabase: any, cfg: any, report: any, deadline: number): Promise<void>
}

// §3.1 highest-confidence tier: Federal Register API v1 (free, no key).
const federalRegisterAdapter: SourceAdapter = {
  source: 'federal_register',
  async run(supabase, cfg, report, deadline) {
    const topicFloor = Number(cfg.topic_confidence_floor ?? 0.4)
    const perPage = Number(cfg.fr_per_page ?? 25)
    const fields = ['document_number', 'title', 'type', 'publication_date', 'agencies', 'citation', 'html_url', 'raw_text_url', 'abstract', 'cfr_references', 'significant', 'regulation_id_numbers']
    const url = `https://www.federalregister.gov/api/v1/documents.json?conditions[type][]=RULE&conditions[type][]=PRORULE&conditions[significant]=1&per_page=${perPage}&order=newest&fields[]=${fields.join('&fields[]=')}`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`federalregister HTTP ${res.status}`)
    const body = await res.json()
    const docs = body?.results ?? []
    report.frFetched = docs.length

    for (const d of docs) {
      if (Date.now() > deadline) { report.frIncomplete = true; break }
      try {
        const isRule = /^rule$/i.test(d.type ?? '')
        const up = await upsertPolicy(supabase, {
          name: d.title,
          jurisdiction: 'US Federal',
          instrument_type: 'regulation',
          status: isRule ? 'in force' : 'proposed',
          enacted_date: d.publication_date ?? null,
          source_url: d.html_url ?? null,
          full_text_url: d.raw_text_url ?? null,
          external_id: d.document_number,
          citation: d.citation ?? null,
          metadata: {
            fr_type: d.type,
            significant: !!d.significant,
            cfr_references: d.cfr_references ?? [],
            regulation_id_numbers: d.regulation_id_numbers ?? [],
            pending_amends: [],
          },
          agencies: (d.agencies ?? []).map((a: any) => a.name ?? String(a)),
          topicText: `${d.abstract ?? ''} ${(d.cfr_references ?? []).map((c: any) => c.title ?? '').join(' ')}`,
        }, topicFloor)
        if (!up) { report.errors.push(`fr upsert ${d.document_number}`); continue }
        report.policiesUpserted++

        // document record
        await supabase.from('policy_documents').upsert(
          {
            policy_id: up.id,
            source: 'federal_register',
            external_id: d.document_number,
            title: d.title,
            url: d.html_url ?? null,
            published_at: d.publication_date ?? null,
            raw_summary: d.abstract ?? null,
            extracted_claims: [],
          },
          { onConflict: 'source,external_id' },
        )

        // policy->policy AMENDS edges from structured metadata: the abstract /
        // title explicitly states amendment of another FR rule (by citation).
        const amendText = `${d.title}. ${d.abstract ?? ''}`
        const amendMentions = amendText.matchAll(/amend(?:s|ing)?\b[^.]{0,120}?(\d{2}\s+FR\s+\d+)/gi)
        let matched = 0
        for (const m of amendMentions) {
          const targetCitation = m[1]
          const { data: target } = await supabase
            .from('policies')
            .select('id, metadata')
            .eq('metadata->>citation', targetCitation)
            .maybeSingle()
          if (target) {
            const { data: targetNode } = await supabase.from('nodes').select('id').eq('type', 'policy').eq('metadata->>policy_id', target.id).maybeSingle()
            if (targetNode) {
              await policyPolicyEdge(supabase, up.nodeId!, targetNode.id, 'amends', `amends ${targetCitation} per document text`)
              report.amendsEdges++
              matched++
            }
          }
        }
        if (matched === 0 && /amend/i.test(amendText)) {
          // target not in our corpus yet — store pending reference, no fabrication
          await supabase.from('policies').update({ metadata: { ...(d.metadata ?? {}), fr_type: d.type, significant: !!d.significant, cfr_references: d.cfr_references ?? [], regulation_id_numbers: d.regulation_id_numbers ?? [], pending_amends: [targetCitationSafe(amendText)] } }).eq('id', up.id)
        }
      } catch (err) {
        report.errors.push(`fr ${d.document_number}: ${String(err)}`)
      }
    }
  },
}

function targetCitationSafe(text: string): string {
  const m = text.match(/amend(?:s|ing)?\b[^.]{0,120}?(\d{2}\s+FR\s+\d+)/i)
  return m ? m[1] : 'unparsed-amendment-reference'
}

// §3.1 cross-domain harvest: GAO reports (analysis claimants). Stores only
// what the documents state — no inferred claims.
const gaoAdapter: SourceAdapter = {
  source: 'gao',
  async run(supabase, _cfg, report, _deadline) {
    const res = await fetch('https://www.gao.gov/rss/reports.xml', {
      headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*' },
    })
    if (!res.ok) throw new Error(`gao HTTP ${res.status}`)
    const xml = await res.text()
    let n = 0
    for (const m of xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)) {
      if (n >= 25) break
      const b = m[1]
      const pick = (tag: string) => {
        const i = b.indexOf(`<${tag}`)
        if (i < 0) return null
        const gt = b.indexOf('>', i)
        const j = b.indexOf(`</${tag}>`, gt)
        if (gt < 0 || j < 0) return null
        return b.slice(gt + 1, j).replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      }
      const title = pick('title')
      const link = pick('link')
      if (!title || !link) continue
      const extId = link.split('/').pop() ?? link
      const summary = pick('description')
      // Only store explicit statements. A GAO report constrains/assesses a
      // policy only when its own title/summary names one — keyword scan.
      const claims: any[] = []
      for (const kp of KNOWN_POLICIES) {
        for (const alias of kp.aliases) {
          if (`${title} ${summary ?? ''}`.toLowerCase().includes(alias.toLowerCase())) {
            claims.push({ edge_hint: 'TESTED', target_ref: kp.name, claimed_by: 'analysis', claimant: 'U.S. Government Accountability Office' })
            break
          }
        }
      }
      const { data: pol } = claims.length > 0
        ? await supabase.from('policies').select('id').ilike('name', claims[0].target_ref).maybeSingle()
        : { data: null }
      await supabase.from('policy_documents').upsert(
        {
          policy_id: pol?.id ?? null,
          source: 'gao',
          external_id: extId,
          title: title.slice(0, 300),
          url: link,
          published_at: (() => { const pd = pick('pubDate'); return pd && !Number.isNaN(Date.parse(pd)) ? new Date(pd).toISOString() : null })(),
          raw_summary: (summary ?? '').slice(0, 2000) || null,
          extracted_claims: claims,
        },
        { onConflict: 'source,external_id' },
      )
      n++
      report.gaoDocs = (report.gaoDocs ?? 0) + 1
    }
  },
}

const ADAPTERS: SourceAdapter[] = [federalRegisterAdapter, gaoAdapter]

// ---------- policy -> event edges (conservative, §3.2) ----------

// well-known policies for backfill + GAO claim matching
const KNOWN_POLICIES: Array<{ name: string; aliases: string[]; instrument_type: PolicyInput['instrument_type']; jurisdiction: string; enacted_date: string; status: PolicyInput['status'] }> = [
  { name: 'CHIPS and Science Act', aliases: ['CHIPS Act', 'CHIPS and Science Act'], instrument_type: 'statute', jurisdiction: 'US Federal', enacted_date: '2022-08-09', status: 'in force' },
  { name: 'Inflation Reduction Act', aliases: ['Inflation Reduction Act', 'IRA'], instrument_type: 'statute', jurisdiction: 'US Federal', enacted_date: '2022-08-16', status: 'in force' },
  { name: 'Executive Order 14110', aliases: ['Executive Order 14110', 'EO 14110'], instrument_type: 'executive order', jurisdiction: 'US Federal', enacted_date: '2023-10-30', status: 'in force' },
  { name: 'EU AI Act', aliases: ['EU AI Act', 'AI Act', 'Artificial Intelligence Act'], instrument_type: 'regulation', jurisdiction: 'EU', enacted_date: '2024-08-01', status: 'in force' },
  { name: 'Infrastructure Investment and Jobs Act', aliases: ['Infrastructure Investment and Jobs Act', 'Bipartisan Infrastructure Law'], instrument_type: 'statute', jurisdiction: 'US Federal', enacted_date: '2021-11-15', status: 'in force' },
  { name: 'Digital Services Act', aliases: ['Digital Services Act', 'DSA'], instrument_type: 'regulation', jurisdiction: 'EU', enacted_date: '2022-11-16', status: 'in force' },
  { name: 'Digital Markets Act', aliases: ['Digital Markets Act', 'DMA'], instrument_type: 'regulation', jurisdiction: 'EU', enacted_date: '2023-05-04', status: 'in force' },
]

function policyEventEdgeType(text: string): 'enabled' | 'constrained_by' | 'triggered_compliance' | 'violated' | 'tested' {
  if (/\b(violat\w+|breach\w+|infring\w+)\b/i.test(text)) return 'violated'
  if (/\b(complian\w+|comply\w+|adher\w+|conform\w+)\b/i.test(text)) return 'triggered_compliance'
  if (/\b(challeng\w+|court|lawsuit|sued|ruling)\b/i.test(text)) return 'tested'
  if (/\b(constrain\w+|restrict\w+|limit\w+|ban\w*|prohibit\w+|block\w+)\b/i.test(text)) return 'constrained_by'
  return 'enabled'
}

// Link one policy to event nodes under §3.2 rules. Returns edge count.
async function linkPolicyToEvents(
  supabase: any,
  policy: { id: string; nodeId: string; name: string; enacted_date: string | null },
  aliases: string[],
  report: any,
  deadline: number,
) {
  let edges = 0
  let inferred = 0
  // candidate articles: text mentions an alias
  const mentions: any[] = []
  for (const alias of aliases) {
    const { data } = await supabase
      .from('articles')
      .select('id, title, summary, published_at')
      .or(`title.ilike.%${alias}%,summary.ilike.%${alias}%`)
      .limit(50)
    for (const a of data ?? []) mentions.push({ ...a, alias })
    if (Date.now() > deadline) break
  }
  const seen = new Set<string>()
  for (const art of mentions) {
    if (seen.has(art.id) || Date.now() > deadline) continue
    seen.add(art.id)
    // event node for this article
    const { data: evNode } = await supabase
      .from('nodes')
      .select('id')
      .eq('type', 'event')
      .like('slug', `%${String(art.id).slice(0, 8)}`)
      .maybeSingle()
    if (!evNode) continue
    const text = `${art.title}. ${art.summary ?? ''}`

    // signal 1: explicit citation of the policy in the article
    const { data: citRows } = await supabase.from('citations').select('cited_entity, cited_type').eq('article_id', art.id)
    const cit = (citRows ?? []).find((c: any) => aliases.some((al) => String(c.cited_entity).toLowerCase().includes(al.toLowerCase())))

    // signal 2: explicit causal language naming the policy
    const causal = causalEvidence(text)
    const causalNamesPolicy = causal && aliases.some((al) => text.toLowerCase().includes(al.toLowerCase()))

    // shared actor entity (policy_actors ∩ article entities)
    const { data: pa } = await supabase.from('policy_actors').select('entity_id').eq('policy_id', policy.id)
    const polEnts = new Set((pa ?? []).map((r: any) => r.entity_id))
    let sharedActor = false
    if (polEnts.size > 0) {
      const { data: ae } = await supabase.from('article_entities').select('entity_id').eq('article_id', art.id).gte('confidence', 0.5)
      sharedActor = (ae ?? []).some((r: any) => polEnts.has(r.entity_id))
    }

    const edgeType = policyEventEdgeType(text)
    const base = {
      source_id: policy.nodeId,
      target_id: evNode.id,
      type: edgeType,
      stance: 'supports',
      metadata: {},
    }
    if (cit) {
      const primary = ['court_doc', 'agency_release'].includes(cit.cited_type)
      await supabase.from('edges').upsert(
        {
          ...base,
          label: `${edgeType}: policy cited in article`,
          weight: 'heavy',
          signal_source: 'citation',
          doc_strength: primary ? 'documented' : 'corroborated',
          claimed_by: primary ? 'source_document' : 'reporting',
          reliability: primary ? 1 : 2,
          metadata: { evidence: `citation: ${cit.cited_entity}`, alias: art.alias },
        },
        { onConflict: 'source_id,target_id,type' },
      )
      edges++
    } else if (causal && causalNamesPolicy) {
      await supabase.from('edges').upsert(
        {
          ...base,
          label: `${edgeType}: causal language naming policy`,
          weight: 'medium',
          signal_source: 'causal_language',
          doc_strength: 'corroborated',
          claimed_by: 'reporting',
          reliability: 3,
          metadata: { evidence: causal, alias: art.alias },
        },
        { onConflict: 'source_id,target_id,type' },
      )
      edges++
    } else if (sharedActor && policy.enacted_date && String(art.published_at ?? '') >= policy.enacted_date) {
      // MIP_inferred: all four §3.2 mechanisms populated, else DON'T create.
      if (inferred >= 5) continue // conservative cap per policy
      inferred++
      await supabase.from('edges').upsert(
        {
          ...base,
          label: `${edgeType}: inferred via shared actor + temporal ordering`,
          weight: 'light',
          signal_source: 'topic_actor_temporal',
          doc_strength: 'circumstantial',
          claimed_by: 'MIP_inferred',
          reliability: 4,
          counterfactual_test: 'sequence_only',
          alternative_causes: [{ description: 'event attributable to the shared actor independent of this policy', ruled_out: false }],
          metadata: {
            reasoning: `shared actor entity + article (${String(art.published_at).slice(0, 10)}) after enacted_date (${policy.enacted_date}); no explicit citation or causal language`,
            alias: art.alias,
          },
        },
        { onConflict: 'source_id,target_id,type' },
      )
      edges++
      report.mipInferred++
    }
    // else: unsure => NO edge
  }
  return edges
}

// ---------- backfill pass ----------

async function backfillKnownPolicies(supabase: any, cfg: any, report: any, deadline: number) {
  const topicFloor = Number(cfg.topic_confidence_floor ?? 0.4)
  for (const kp of KNOWN_POLICIES) {
    if (Date.now() > deadline) { report.backfillIncomplete = true; break }
    // only create the policy when the corpus actually mentions it
    let mentioned = false
    for (const alias of kp.aliases) {
      const { count } = await supabase
        .from('articles')
        .select('id', { count: 'exact', head: true })
        .or(`title.ilike.%${alias}%,summary.ilike.%${alias}%`)
      if ((count ?? 0) > 0) { mentioned = true; break }
    }
    if (!mentioned) continue
    const up = await upsertPolicy(supabase, {
      name: kp.name,
      jurisdiction: kp.jurisdiction,
      instrument_type: kp.instrument_type,
      status: kp.status,
      enacted_date: kp.enacted_date,
      source_url: null,
      full_text_url: null,
      external_id: null,
      metadata: { aliases: kp.aliases, origin: 'backfill_known_policy' },
      topicText: kp.aliases.join(' '),
    }, topicFloor)
    if (!up || !up.nodeId) continue
    report.policiesUpserted++
    const n = await linkPolicyToEvents(supabase, { id: up.id, nodeId: up.nodeId, name: kp.name, enacted_date: kp.enacted_date }, kp.aliases, report, deadline)
    report.policyEventEdges += n
  }
}

// FR-ingested policies also get the conservative event-linking pass.
async function linkIngestedPolicies(supabase: any, report: any, deadline: number) {
  const { data: pols } = await supabase.from('policies').select('id, name, enacted_date')
  for (const p of pols ?? []) {
    if (Date.now() > deadline) break
    const { data: node } = await supabase.from('nodes').select('id').eq('type', 'policy').eq('metadata->>policy_id', p.id).maybeSingle()
    if (!node) continue
    const n = await linkPolicyToEvents(supabase, { id: p.id, nodeId: node.id, name: p.name, enacted_date: p.enacted_date }, [p.name], report, deadline)
    report.policyEventEdges += n
  }
}

// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: 'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
  }
  const supabase = createClient(supabaseUrl, serviceKey)
  const cfg = await loadConfig(supabase)
  const reqUrl = new URL(req.url)
  const mode = reqUrl.searchParams.get('mode') ?? 'ingest'

  const report: any = {
    ranAt: new Date().toISOString(),
    mode,
    policiesUpserted: 0,
    amendsEdges: 0,
    policyEventEdges: 0,
    mipInferred: 0,
    errors: [] as string[],
  }
  const deadline = Date.now() + 100_000

  try {
    if (mode === 'ingest') {
      for (const adapter of ADAPTERS) {
        if (Date.now() > deadline) break
        try {
          await adapter.run(supabase, cfg, report, deadline)
        } catch (err) {
          report.errors.push(`${adapter.source}: ${String(err)}`)
        }
      }
      await linkIngestedPolicies(supabase, report, deadline)
    } else if (mode === 'backfill') {
      await backfillKnownPolicies(supabase, cfg, report, deadline)
    } else {
      return Response.json({ ok: false, error: `unknown mode ${mode}` }, { status: 400 })
    }
  } catch (err) {
    report.errors.push(String(err))
  }

  const { count: policies } = await supabase.from('policies').select('id', { count: 'exact', head: true })
  const { count: docs } = await supabase.from('policy_documents').select('id', { count: 'exact', head: true })
  report.totalPolicies = policies ?? 0
  report.totalPolicyDocuments = docs ?? 0
  return Response.json({ ok: true, ...report })
})
