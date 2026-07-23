-- MIP knowledge graph schema.
-- Run in the Supabase SQL editor (Dashboard → SQL Editor → New query).

create extension if not exists "pgcrypto";

create table public.nodes (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,            -- stable human-readable key, e.g. 'evt-theft'
  label       text not null,
  type        text not null
              check (type in ('event', 'actor', 'institution', 'document', 'anomaly')),
  description text,
  metadata    jsonb not null default '{}'::jsonb,  -- dates, sources, geo, story id, etc.
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.edges (
  id         uuid primary key default gen_random_uuid(),
  source_id  uuid not null references public.nodes (id) on delete cascade,
  target_id  uuid not null references public.nodes (id) on delete cascade,
  type       text not null
             check (type in ('causal', 'actor', 'financial', 'conflict', 'documentary')),
  weight     text not null default 'medium'
             check (weight in ('heavy', 'medium', 'light')),
  label      text,                             -- short verb phrase shown on the edge
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (source_id <> target_id),
  unique (source_id, target_id, type)
);

create index edges_source_id_idx on public.edges (source_id);
create index edges_target_id_idx on public.edges (target_id);
create index nodes_type_idx on public.nodes (type);

-- Keep updated_at fresh on node edits.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger nodes_touch_updated_at
  before update on public.nodes
  for each row execute function public.touch_updated_at();

-- Row Level Security: anon key gets read-only access; writes go through
-- authenticated users. Tighten/loosen as the app grows.
alter table public.nodes enable row level security;
alter table public.edges enable row level security;

create policy "public read nodes" on public.nodes
  for select using (true);

create policy "public read edges" on public.edges
  for select using (true);

create policy "authenticated write nodes" on public.nodes
  for all to authenticated using (true) with check (true);

create policy "authenticated write edges" on public.edges
  for all to authenticated using (true) with check (true);
