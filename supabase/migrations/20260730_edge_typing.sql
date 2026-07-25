-- Step 7 (§4, §3.4): edge typing + reliability + evidence tracks.
-- Widened type vocabulary; ranked-signal reliability (1 highest … 4;
-- 5/temporal-proximity is NEVER stored); evidence-track columns built now
-- even where empty. Backfills signal columns from edges.metadata.

-- ---- 1. widen edges.type CHECK ------------------------------------------------
alter table public.edges drop constraint if exists edges_type_check;
alter table public.edges add constraint edges_type_check check (type in (
  'causal', 'actor', 'financial', 'conflict', 'documentary',
  'enables', 'constrains', 'enabled', 'constrained_by', 'amends',
  'supersedes', 'conflicts_with', 'triggered_compliance', 'violated', 'tested'
));

-- ---- 2. new columns -----------------------------------------------------------
alter table public.edges add column if not exists signal_source text
  check (signal_source is null or signal_source in ('citation', 'shared_entity', 'causal_language', 'topic_actor_temporal'));
alter table public.edges add column if not exists doc_strength text
  check (doc_strength is null or doc_strength in ('documented', 'corroborated', 'circumstantial'));
alter table public.edges add column if not exists claimed_by text
  check (claimed_by is null or claimed_by in ('source_document', 'analysis', 'reporting', 'MIP_inferred'));
alter table public.edges add column if not exists stance text not null default 'supports'
  check (stance in ('supports', 'disputes'));
alter table public.edges add column if not exists disputed_by jsonb not null default '[]'::jsonb;
alter table public.edges add column if not exists alternative_causes jsonb not null default '[]'::jsonb;
alter table public.edges add column if not exists counterfactual_test text
  check (counterfactual_test is null or counterfactual_test in ('natural_experiment', 'discontinuity', 'sequence_only'));
alter table public.edges add column if not exists reliability int
  check (reliability is null or (reliability >= 1 and reliability <= 5));

-- ---- 3. backfill signal columns from metadata->>'signal_source' ----------------
-- shared_entity+citation -> citation. reliability 1 only when the citation is
-- to a primary document (court filing / agency release / official statement),
-- else 2. doc_strength documented (primary) / corroborated (otherwise).
update public.edges
set signal_source = 'citation',
    reliability = case
      when lower(coalesce(metadata->>'evidence', '') || ' ' || coalesce(label, '')) ~ '(court|filing|indictment|affidavit|press release|official statement|agency (said|confirmed|reported))'
      then 1 else 2 end,
    doc_strength = case
      when lower(coalesce(metadata->>'evidence', '') || ' ' || coalesce(label, '')) ~ '(court|filing|indictment|affidavit|press release|official statement|agency (said|confirmed|reported))'
      then 'documented' else 'corroborated' end,
    claimed_by = case
      when lower(coalesce(metadata->>'evidence', '') || ' ' || coalesce(label, '')) ~ '(court|filing|indictment|affidavit|press release|official statement|agency (said|confirmed|reported))'
      then 'source_document' else 'reporting' end
where metadata->>'signal_source' = 'shared_entity+citation'
  and signal_source is null;

-- shared_entity+causal_language -> causal_language, reliability 3,
-- corroborated, claimed_by reporting.
update public.edges
set signal_source = 'causal_language',
    reliability = 3,
    doc_strength = 'corroborated',
    claimed_by = 'reporting'
where metadata->>'signal_source' = 'shared_entity+causal_language'
  and signal_source is null;

-- pure shared_entity (actor edges created below use this too) -> reliability 2.
update public.edges
set signal_source = 'shared_entity',
    reliability = 2,
    doc_strength = 'corroborated',
    claimed_by = 'reporting'
where signal_source is null
  and type = 'actor';

-- ---- 4. weight consistent with reliability (heavy=1-2, medium=3, light=4) -----
update public.edges
set weight = case when reliability <= 2 then 'heavy' when reliability = 3 then 'medium' else 'light' end
where reliability is not null;

-- ---- 5. Step 6 actor edges for the current graph -------------------------------
-- EVENT node <-> ACTOR node for every entity (conf >= 0.5) resolved from the
-- event node's source article. Event<->article linkage uses the article-id
-- prefix embedded in event node slugs ('art-...-<id8>').
insert into public.edges (source_id, target_id, type, label, weight, signal_source, doc_strength, claimed_by, reliability, metadata)
select
  n.id,
  an.id,
  'actor',
  'involves',
  'heavy',
  'shared_entity',
  'corroborated',
  'reporting',
  2,
  jsonb_build_object('entity_id', e.id, 'article_id', a.id, 'confidence', ae.confidence)
from public.articles a
join public.article_entities ae on ae.article_id = a.id and ae.confidence >= 0.5
join public.entities e on e.id = ae.entity_id and e.entity_type in ('person', 'organization', 'institution')
join public.nodes an on an.type = 'actor' and an.metadata->>'entity_id' = e.id::text
join public.nodes n on n.type = 'event' and n.slug like 'art-%' and n.slug like '%' || left(a.id::text, 8)
on conflict (source_id, target_id, type) do nothing;

-- ---- 6. pipeline_config defaults ------------------------------------------------
insert into public.pipeline_config (key, value, description)
values
  ('cluster_entity_max_df', '5', 'originate clustering: drop entities appearing in > N pool articles (anti-hairball)'),
  ('topic_confidence_floor', '0.4', 'topic tagging: minimum rubric confidence to attach a topic to a node')
on conflict (key) do nothing;
