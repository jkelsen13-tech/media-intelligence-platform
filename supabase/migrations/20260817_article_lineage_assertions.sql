-- 20260817_article_lineage_assertions.sql
-- 20_IDEA capability 1 — Source Independence & Claim Lineage.
-- Implementation brief 2026-08-17, Section 2 (schema), owner-approved
-- adjustments 1-3 (RLS posture, version column, reviewer_id left FK-less).
--
-- ADDITIVE ONLY. Creates one table, its indexes, and its RLS policy.
-- No changes to existing tables/columns. No drops. No data mutation.
--
-- Storage decision (locked, brief Section 1): a DEDICATED table, not the
-- existing edges table. K3's read-only investigation (2026-08-16) confirmed
-- edges is structurally invalid for this: its FKs target nodes(id) and the
-- live node population is event/actor/policy only (no article nodes), so
-- there is no valid FK target for article-to-article lineage;
-- UNIQUE(source_id, target_id, type) plus upsert writers precludes
-- per-assertion history; and `public read edges USING (true)` would leak
-- unreviewed/shadow lineage straight onto the Graph canvas.
--
-- Lineage reaches the Graph through a read-only security_invoker projection
-- view (separate migration) — never by duplicating rows into edges.
--
-- Rollback (tested before this migration was accepted — see verifier log):
--   drop table if exists public.article_lineage_assertions cascade;
--   delete from public.pipeline_config where key = 'lineage_graph_mode';
-- The table is additive and unreferenced by any existing object, so the drop
-- is complete and leaves the 2026-08-10 core census unchanged.

-- ---- 1. table -------------------------------------------------------------------
create table public.article_lineage_assertions (
  id uuid primary key default gen_random_uuid(),
  child_article_id uuid not null references public.articles(id),

  -- Nullable BY DESIGN: no parent is NOT evidence of independence. When this
  -- is null, origin_status carries the honest finding (see constraints below).
  parent_article_id uuid references public.articles(id),

  relationship_class text not null
    check (relationship_class in ('derivation', 'reference', 'origin_classification')),
  relationship_type text not null,

  -- Populated when parent_article_id is null. Note the vocabulary: there is
  -- deliberately NO 'independent_origin' value. Absence of a detected parent
  -- is not evidence of independence (extends locked G2: missing evidence is
  -- not contradicting evidence).
  origin_status text
    check (origin_status in (
      'resolved_origin_found',
      'independent_origin_candidate',
      'no_shared_origin_detected_within_corpus'
    )),

  detection_method text not null,   -- byline_attribution|canonical_url_match|exact_text_hash|...
  evidence_basis jsonb not null,    -- matched byline string, hash value, matched URL, etc.

  -- A BAND, never a number. No composite lineage/independence score exists
  -- anywhere in this table by construction: relationship_type,
  -- confidence_band and origin_status are separate reported dimensions and
  -- are never collapsed into one figure (brief Section 6, Amendment A).
  confidence_band text not null
    check (confidence_band in ('high', 'medium', 'low')),

  -- Audit-history pattern modeled on explanations (version / is_current /
  -- review_status / rule_version). Owner-approved adjustment 2: `version` was
  -- named in the brief's stated pattern but omitted from its DDL block.
  review_status text not null default 'unreviewed'
    check (review_status in ('unreviewed', 'shadow', 'verified', 'rejected')),
  rule_version text not null,
  version int not null default 1,
  is_current boolean not null default true,
  superseded_by uuid references public.article_lineage_assertions(id),

  created_at timestamptz not null default now(),
  reviewed_at timestamptz,

  -- Owner-approved adjustment 3: left without an FK deliberately. Human
  -- identity lives in mip_profiles(id) -> auth.users; pointing public
  -- evidence data at the auth schema is a coupling this build does not need.
  reviewer_id uuid,

  -- Guardrail, enforced by the database rather than by code review alone:
  -- the class/type allowlist has no 'independent_origin' member, so a bare
  -- confident independence claim cannot be written even by a buggy or
  -- future writer holding the service role.
  constraint alas_class_type_valid check (
    (relationship_class = 'derivation' and relationship_type in ('derived_from', 'syndicated_from'))
    or (relationship_class = 'reference' and relationship_type = 'quotes')
    or (relationship_class = 'origin_classification'
        and relationship_type in ('press_release_origin', 'origin_undetermined'))
  ),

  -- origin_status describes the ABSENCE of a parent; it is meaningless
  -- alongside a resolved parent row.
  constraint alas_origin_status_requires_no_parent check (
    origin_status is null or parent_article_id is null
  ),

  -- The Stages 1-3 no-match outcome must state its finding. An
  -- origin_undetermined row with a null origin_status would be exactly the
  -- unfalsifiable bare assertion guardrail 4 forbids.
  constraint alas_undetermined_requires_status check (
    relationship_type <> 'origin_undetermined'
    or (parent_article_id is null and origin_status is not null)
  ),

  constraint alas_no_self_lineage check (
    parent_article_id is distinct from child_article_id
  )
);

comment on table public.article_lineage_assertions is
  '20_IDEA capability 1: per-assertion article-to-article lineage. relationship_type, confidence_band and origin_status are SEPARATE reported dimensions — never combined into a composite lineage or independence score. A null parent_article_id is not an independence claim; see origin_status.';

-- ---- 2. indexes -----------------------------------------------------------------
create index alas_child_idx on public.article_lineage_assertions (child_article_id) where is_current;
create index alas_parent_idx on public.article_lineage_assertions (parent_article_id)
  where is_current and parent_article_id is not null;
create index alas_presentation_idx on public.article_lineage_assertions (review_status, is_current);

-- Idempotent re-runs without precluding per-assertion history: only CURRENT
-- rows participate, so a superseded row (is_current = false) stays in the
-- table as history. NULLS NOT DISTINCT (PG15+) makes the parentless
-- origin_classification rows dedupe correctly too — a plain unique index
-- would treat every null parent as distinct and re-insert on every run.
-- This is deliberately NOT the edges-style UNIQUE(source, target, type) that
-- disqualified edges: that one is unconditional and therefore destroys history.
create unique index alas_current_assertion_idx on public.article_lineage_assertions
  (child_article_id, parent_article_id, relationship_type, detection_method)
  nulls not distinct
  where is_current;

-- ---- 3. RLS ---------------------------------------------------------------------
-- Owner-approved adjustment 1. Every comparable table here (articles, events,
-- claims, article_claims, explanations, edges) enables RLS; a table without it
-- is served unrestricted to anon through PostgREST.
--
-- The policy is deliberately NOT the conventional `using (true)` used by those
-- tables: that is precisely the read posture that disqualified edges as a
-- lineage store, because it would publish unreviewed and shadow-mode
-- assertions. Shadow/unreviewed exclusion therefore holds at the row level as
-- well as in the projection view's WHERE clause — the same predicate enforced
-- one layer lower, so a direct base-table query cannot reach shadow rows
-- either. The service role (write path) bypasses RLS as usual.
alter table public.article_lineage_assertions enable row level security;

create policy "public read verified lineage" on public.article_lineage_assertions
  for select to public using (review_status = 'verified' and is_current);

-- TRUNCATE is included deliberately: Supabase grants it to anon and
-- authenticated by default, and TRUNCATE BYPASSES row level security — the
-- policy above would not stop it. (Applied to production in two steps:
-- '..._article_lineage_assertions' then '..._article_lineage_assertions_revoke_truncate';
-- a fresh apply of this file reaches the same end state in one.)
revoke insert, update, delete, truncate, references, trigger
  on public.article_lineage_assertions from anon, authenticated;

-- ---- 4. release flag ------------------------------------------------------------
-- 03_BACKLOG execution contract: one feature flag and release record per item.
-- Withhold posture, default false — mirrors track_b_light_theme / phase3_beta.
insert into public.pipeline_config (key, value, description) values
  ('lineage_graph_mode', 'false',
   '20_IDEA capability 1: Graph lineage mode + Source Comparison origin-cluster read path. Withhold posture; owner flips to true.')
on conflict (key) do nothing;
