-- MIP migration: article panel, story arcs, RSS ingestion (applied 2026-07-23)
-- Applied via Supabase MCP as migrations:
--   mip_knowledge_graph_schema_v2 (nodes/edges + confidence/summary/occurred_at)
--   plus sources, story_arcs, arc_milestones, arc_events, articles tables.

create extension if not exists "pgcrypto";

create table if not exists public.nodes (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  label       text not null,
  type        text not null check (type in ('event', 'actor', 'institution', 'document', 'anomaly')),
  description text,
  confidence  int check (confidence between 0 and 100),
  summary     text,
  occurred_at date,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.edges (
  id         uuid primary key default gen_random_uuid(),
  source_id  uuid not null references public.nodes (id) on delete cascade,
  target_id  uuid not null references public.nodes (id) on delete cascade,
  type       text not null check (type in ('causal', 'actor', 'financial', 'conflict', 'documentary')),
  weight     text not null default 'medium' check (weight in ('heavy', 'medium', 'light')),
  label      text,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (source_id <> target_id),
  unique (source_id, target_id, type)
);

create table if not exists public.sources (
  id           uuid primary key default gen_random_uuid(),
  node_id      uuid not null references public.nodes (id) on delete cascade,
  outlet       text not null,
  headline     text not null,
  url          text,
  published_at date,
  created_at   timestamptz not null default now()
);

create table if not exists public.story_arcs (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  title          text not null,
  category       text not null check (category in ('institutional_accountability','geopolitical_consequence','economic_policy','legislative_regulatory')),
  status         text not null default 'active' check (status in ('active','dormant','resolved','cold')),
  root_node_id   uuid references public.nodes (id) on delete set null,
  coverage_gap   boolean not null default false,
  summary        text,
  started_at     date not null default current_date,
  last_update_at timestamptz not null default now()
);

create table if not exists public.arc_milestones (
  id         uuid primary key default gen_random_uuid(),
  arc_id     uuid not null references public.story_arcs (id) on delete cascade,
  title      text not null,
  status     text not null default 'pending' check (status in ('pending','confirmed_complete','confirmed_failed','unresolved')),
  notes      text,
  updated_at timestamptz not null default now()
);

create table if not exists public.arc_events (
  id          uuid primary key default gen_random_uuid(),
  arc_id      uuid not null references public.story_arcs (id) on delete cascade,
  title       text not null,
  category    text not null check (category in ('accountability','economic','geopolitical','legislative')),
  confidence  text not null default 'confirmed' check (confidence in ('confirmed','corroborated','inferred')),
  occurred_at date,
  description text
);

create table if not exists public.articles (
  id           uuid primary key default gen_random_uuid(),
  feed         text not null,
  outlet       text not null,
  title        text not null,
  url          text not null unique,
  summary      text,
  published_at timestamptz,
  fetched_at   timestamptz not null default now()
);

-- All tables: RLS enabled, anon role gets read-only; writes via service role
-- (edge function) or authenticated users. See seed.sql for demo data.
