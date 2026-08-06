// Source Comparison (03_BACKLOG Item 1) — pipeline runner. Owner-authorized Batch 2, 2026-08-06.
//
// Manually invoked, service-role only. Reads articles + article_entities
// (read-only), runs the deterministic sc-v1 pipeline, and writes ONLY to the
// Item 1 tables (events, claims, article_claims, event_articles) plus Phase 2
// explanation rows (assertion_type event_membership / claim_grouping,
// rule_version sc-v1|<method>). It NEVER writes to articles, nodes, edges,
// story_arcs, arc_events, or any other production table.
// Rebuild semantics: before writing, it deletes its own prior sc-v1 rows
// (events/claims with rule_version 'sc-v1', their dependent rows, and
// explanations with assertion_type in (event_membership, claim_grouping) and
// rule_version LIKE 'sc-v1|%'). No cron, no trigger: runs only when called.
//
// Auth: fail-closed shared secret. Requires header
//   x-source-comparison-key: <SOURCE_COMPARISON_RUN_KEY>
// and refuses to run at all if the secret is not configured.
// Body: {"dry_run": true} computes and returns stats without writing.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { runPipeline, parseEmbedding, RULE_VERSION } from './lib.js'
import lexicon from './loadedLanguageLexicon.json' with { type: 'json' }

const JSON_HEADERS = { 'content-type': 'application/json' }
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

const ARTICLE_COLS = 'id,outlet,title,url,summary,body_text,published_at,claims,embedding,unattributed,monoculture,is_digest'

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' })

  const expected = Deno.env.get('SOURCE_COMPARISON_RUN_KEY')
  if (!expected) return json(503, { error: 'SOURCE_COMPARISON_RUN_KEY not configured; writer disabled' })
  if (req.headers.get('x-source-comparison-key') !== expected) return json(401, { error: 'unauthorized' })

  let dryRun = false
  try { dryRun = !!(await req.json())?.dry_run } catch { /* empty body = write run */ }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Config from pipeline_config (locked values; owner-tunable without migration)
  const { data: cfgRows, error: cfgErr } = await supabase.from('pipeline_config')
    .select('key,value').in('key', [
      'event_cluster_similarity_threshold', 'event_cluster_window_days',
      'claim_group_confidence_floor', 'event_membership_confidence_floor'])
  if (cfgErr) return json(500, { error: `config read failed: ${cfgErr.message}` })
  const cfgVal = (k: string, d: number) => Number(cfgRows?.find((r: any) => r.key === k)?.value ?? d)
  const cfg = {
    similarityThreshold: cfgVal('event_cluster_similarity_threshold', 0.82),
    windowDays: cfgVal('event_cluster_window_days', 3),
    groupFloor: cfgVal('claim_group_confidence_floor', 0.6),
    membershipFloor: cfgVal('event_membership_confidence_floor', 0.55),
    minSharedEntities: 2,
  }

  const { data: articleRows, error: aErr } = await supabase.from('articles').select(ARTICLE_COLS)
  if (aErr) return json(500, { error: `articles read failed: ${aErr.message}` })
  const { data: entityPairs, error: eErr } = await supabase.from('article_entities').select('article_id,entity_id')
  if (eErr) return json(500, { error: `article_entities read failed: ${eErr.message}` })

  const articles = (articleRows || []).map((a: any) => ({ ...a, embedding: parseEmbedding(a.embedding) }))
  const plan = runPipeline(articles, entityPairs || [], cfg, lexicon)

  const stats = { ...plan.stats, comparisons: undefined, comparison_sample: plan.stats.comparisons.slice(0, 5) }
  if (dryRun) return json(200, { dry_run: true, rule_version: RULE_VERSION, ...stats })

  // Rebuild: clear own sc-v1 namespace only, in dependency order.
  // (article_claims/event_articles carry no rule_version; scope through the
  // sc-v1 events/claims they belong to.)
  {
    const eventIds = (await supabase.from('events').select('id').eq('rule_version', RULE_VERSION)).data?.map((r: any) => r.id) || []
    if (eventIds.length) {
      const { error: e0 } = await supabase.from('event_articles').delete().in('event_id', eventIds)
      if (e0) return json(500, { error: `event_articles cleanup failed: ${e0.message}` })
      const claimIds = (await supabase.from('claims').select('id').in('event_id', eventIds)).data?.map((r: any) => r.id) || []
      if (claimIds.length) {
        const { error } = await supabase.from('article_claims').delete().in('claim_id', claimIds)
        if (error) return json(500, { error: `article_claims cleanup failed: ${error.message}` })
        const { error: e2 } = await supabase.from('claims').delete().in('id', claimIds)
        if (e2) return json(500, { error: `claims cleanup failed: ${e2.message}` })
      }
      const { error: e3 } = await supabase.from('events').delete().in('id', eventIds)
      if (e3) return json(500, { error: `events cleanup failed: ${e3.message}` })
    }
  }
  {
    const { error } = await supabase.from('explanations').delete()
      .in('assertion_type', ['event_membership', 'claim_grouping']).like('rule_version', RULE_VERSION + '|%')
    if (error) return json(500, { error: `explanations cleanup failed: ${error.message}` })
  }

  // Write: events first, then resolve keys to ids
  const keyToEventId = new Map<string, string>()
  for (const ev of plan.events) {
    const { event_key, ...row } = ev as any
    const { data, error } = await supabase.from('events').insert(row).select('id').single()
    if (error) return json(500, { error: `event insert failed: ${error.message}` })
    keyToEventId.set(event_key, data.id)
  }
  const keyToClaimId = new Map<string, string>()
  for (const c of plan.claims) {
    const { claim_key, event_key, ...row } = c as any
    const { data, error } = await supabase.from('claims')
      .insert({ ...row, event_id: keyToEventId.get(event_key) }).select('id').single()
    if (error) return json(500, { error: `claim insert failed: ${error.message}` })
    keyToClaimId.set(claim_key, data.id)
  }
  for (const t of ['event_articles', 'article_claims'] as const) {
    const rows = (plan as any)[t].map((r: any) => t === 'event_articles'
      ? { event_id: keyToEventId.get(r.event_key), article_id: r.article_id, membership_method: r.membership_method, membership_confidence: r.membership_confidence }
      : { claim_id: keyToClaimId.get(r.claim_key), article_id: r.article_id, surface_text: r.surface_text, extraction_method: r.extraction_method, extraction_confidence: r.extraction_confidence, stance: r.stance, loaded_language: r.loaded_language })
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from(t).insert(rows.slice(i, i + 500))
      if (error) return json(500, { error: `${t} insert failed: ${error.message}` })
    }
  }
  for (let i = 0; i < plan.explanations.length; i += 500) {
    const { error } = await supabase.from('explanations').insert(plan.explanations.slice(i, i + 500))
    if (error) return json(500, { error: `explanations insert failed: ${error.message}` })
  }

  return json(200, { dry_run: false, rule_version: RULE_VERSION, ...stats })
})
