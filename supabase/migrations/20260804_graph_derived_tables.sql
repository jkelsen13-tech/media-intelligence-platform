-- G-ALG-0: graph algorithm layer — derived-data tables (owner-authorized 2026-08-04).
-- Additive only: four NEW derived tables for server-side persisted layouts,
-- communities, and metrics. No existing table, row, function, flag, or policy
-- is touched. The analysis layer computes into these tables from a read-only
-- snapshot of nodes/edges; it never writes to live graph tables.
--
-- Rollback: drop table public.graph_metric_snapshots,
--           public.graph_community_assignments,
--           public.graph_layout_versions,
--           public.graph_checkpoints;

create table public.graph_checkpoints (
  id uuid primary key default gen_random_uuid(),
  node_count int not null,
  edge_count int not null,
  nodes_hash text not null,
  edges_hash text not null,
  created_at timestamptz not null default now()
);

create table public.graph_layout_versions (
  id uuid primary key default gen_random_uuid(),
  checkpoint_id uuid not null references public.graph_checkpoints(id),
  algorithm text not null,
  algorithm_version text not null,
  config jsonb not null,
  seed text not null,
  positions jsonb not null,
  generated_at timestamptz not null default now(),
  supersedes uuid references public.graph_layout_versions(id)
);

create table public.graph_community_assignments (
  id uuid primary key default gen_random_uuid(),
  checkpoint_id uuid not null references public.graph_checkpoints(id),
  algorithm text not null default 'louvain',
  algorithm_version text not null,
  config jsonb not null,
  assignment jsonb not null,
  generated_at timestamptz not null default now()
);

create table public.graph_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  checkpoint_id uuid not null references public.graph_checkpoints(id),
  algorithm text not null,
  algorithm_version text not null,
  config jsonb not null,
  metrics jsonb not null,
  generated_at timestamptz not null default now()
);

alter table public.graph_checkpoints enable row level security;
alter table public.graph_layout_versions enable row level security;
alter table public.graph_community_assignments enable row level security;
alter table public.graph_metric_snapshots enable row level security;

-- Read posture mirrors the rest of the platform: anon + authenticated SELECT;
-- writes are service-role only (no write policies created).
create policy graph_checkpoints_read on public.graph_checkpoints
  for select to anon, authenticated using (true);
create policy graph_layout_versions_read on public.graph_layout_versions
  for select to anon, authenticated using (true);
create policy graph_community_assignments_read on public.graph_community_assignments
  for select to anon, authenticated using (true);
create policy graph_metric_snapshots_read on public.graph_metric_snapshots
  for select to anon, authenticated using (true);
