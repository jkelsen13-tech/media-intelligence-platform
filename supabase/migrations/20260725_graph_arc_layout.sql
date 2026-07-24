-- Graph arc layout: expose arc membership on nodes and the existing
-- embedding similarity score on edges for the force-directed layout.
alter table public.nodes
  add column if not exists arc_id uuid references public.story_arcs (id) on delete set null;

alter table public.edges
  add column if not exists similarity numeric;

-- Backfill node arc membership from arc root nodes where not already set.
update public.nodes n
set arc_id = sa.id
from public.story_arcs sa
where sa.root_node_id = n.id
  and n.arc_id is null;

-- Backfill edge similarity from metadata where the ingest pipeline stored it there.
update public.edges
set similarity = (metadata->>'similarity')::numeric
where similarity is null
  and metadata ? 'similarity';

create index if not exists nodes_arc_id_idx on public.nodes (arc_id);
