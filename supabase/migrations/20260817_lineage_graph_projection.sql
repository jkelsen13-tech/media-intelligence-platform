-- 20260817_lineage_graph_projection.sql
-- 20_IDEA capability 1, brief Section 5 — read-only Graph projection.
--
-- ADDITIVE ONLY. Creates one view. No table changes, no data mutation.
--
-- WHY A VIEW AND NOT ROWS IN `edges` (brief Section 1, locked):
-- edges' FKs target nodes(id) and the live node population is
-- event/actor/policy only, so article-to-article lineage has no valid FK
-- target there; its UNIQUE(source_id, target_id, type) plus upsert writers
-- precludes per-assertion history; and `public read edges USING (true)` would
-- publish unreviewed and shadow lineage straight onto the Graph canvas.
-- Lineage therefore reaches the Graph by PROJECTION — no physical duplication
-- of rows into edges, and nothing here writes anywhere.
--
-- security_invoker = true: the view executes with the QUERYING user's rights,
-- so article_lineage_assertions' RLS applies to whoever selects from it. A
-- plain CREATE VIEW would run as its owner (postgres) and bypass that RLS
-- entirely — the defect fixed for duplicate_actor_label_monitor in
-- 20260813_secure_monitor_view_invoker, not reintroduced here.
--
-- TWO INDEPENDENT LAYERS EXCLUDE SHADOW/UNREVIEWED, deliberately:
--   1. the WHERE clause below filters to review_status = 'verified'
--      (brief Section 5: "a WHERE clause, not a schema change");
--   2. the base table's RLS policy withholds shadow and rejected rows from
--      public clients regardless of any view.
-- Neither is load-bearing alone. A future caller querying the base table
-- directly still cannot see shadow rows, and a future policy change still
-- cannot leak them through this view.
--
-- NO COMPOSITE SCORE: relationship_type, confidence_band and origin_status
-- are projected as SEPARATE columns exactly as stored. Nothing is combined,
-- ranked, or reduced to a number anywhere in this view.
--
-- Rollback:
--   drop view if exists public.article_lineage_graph;

create or replace view public.article_lineage_graph
with (security_invoker = true) as
select
  l.id                 as assertion_id,
  l.child_article_id,
  l.parent_article_id,
  -- Structural discriminator, not a judgment: an assertion with a resolved
  -- parent is drawable as an EDGE between two articles; a parentless one is a
  -- statement ABOUT one article (a wire attribution whose origin is outside
  -- the corpus, or a no-parent-detected finding) and has nothing to draw an
  -- edge to. Both must reach the Graph — the brief requires the
  -- independent_origin_candidate state to render as deliberately as a
  -- syndicated_from edge — so they are projected together and distinguished
  -- here rather than silently dropping the parentless ones.
  case when l.parent_article_id is null then 'origin_annotation' else 'edge' end
                       as projection_kind,
  l.relationship_class,
  l.relationship_type,
  l.origin_status,
  l.detection_method,
  l.confidence_band,
  l.evidence_basis,
  l.rule_version,
  l.created_at,
  l.reviewed_at
from public.article_lineage_assertions l
where l.review_status = 'verified'
  and l.is_current;

comment on view public.article_lineage_graph is
  '20_IDEA capability 1: read-only projection of verified, current lineage assertions for the Graph lineage mode. security_invoker; shadow/unreviewed/rejected excluded by the WHERE clause AND by the base table RLS. relationship_type, confidence_band and origin_status stay separate columns — never combined into a composite lineage or independence score.';

-- The view is read-only by intent; strip the default grants so that is
-- enforced rather than assumed. (Same posture as
-- 20260813_secure_monitor_view_invoker.) TRUNCATE/REFERENCES/TRIGGER are
-- included for consistency with article_lineage_assertions' posture — note
-- that unlike the table case this closes no live hole, since TRUNCATE on a
-- VIEW is inert in Postgres. Applied to production in two steps
-- ('lineage_graph_projection', then '..._revoke_defaults'); a fresh apply of
-- this file reaches the same end state in one.
revoke insert, update, delete, truncate, references, trigger
  on public.article_lineage_graph from anon, authenticated;
