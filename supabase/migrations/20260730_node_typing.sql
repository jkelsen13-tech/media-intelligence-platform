-- Step 6 (§4): node typing — Event + Actor (two types only).
-- One ACTOR node per resolved entity (person/organization/institution),
-- backlinked via metadata.entity_id. Idempotent. Actor EDGES are created in
-- 20260730_edge_typing.sql (they carry the Step 7 signal columns).

insert into public.nodes (slug, label, type, metadata)
select
  'actor-' || e.normalized_name,
  e.canonical_name,
  'actor',
  jsonb_build_object('entity_id', e.id, 'entity_type', e.entity_type)
from public.entities e
where e.entity_type in ('person', 'organization', 'institution')
on conflict (slug) do update
set label = excluded.label,
    metadata = public.nodes.metadata || excluded.metadata;

create index if not exists nodes_entity_id_idx on public.nodes ((metadata->>'entity_id'));
