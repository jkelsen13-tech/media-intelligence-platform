-- MIP migration: ingestion / provenance / arc-assignment layer (applied 2026-07-24)
-- Applied via Supabase MCP as migration: mip_provenance_arc_assignment_layer

create extension if not exists vector;

-- Outlets (source registry; parent ownership tracked here)
create table if not exists public.outlets (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null unique,
  parent_ownership       text,
  country                text,
  known_editorial_stance text,
  notes                  text,
  created_at             timestamptz not null default now()
);

-- Ingestion source list as configuration (not hardcoded in the pipeline)
create table if not exists public.ingest_sources (
  id        uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets (id) on delete cascade,
  feed_url  text not null unique,
  enabled   boolean not null default true,
  added_at  timestamptz not null default now()
);

-- Pipeline configuration: every tunable constant lives here, one place.
create table if not exists public.pipeline_config (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);

-- Authors
create table if not exists public.authors (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  normalized_name text not null unique,
  outlet_ids      uuid[] not null default '{}',
  beats           text[] not null default '{}',
  article_count   int not null default 0,
  first_seen      timestamptz not null default now(),
  last_seen       timestamptz not null default now(),
  framing_profile jsonb,
  confidence      numeric check (confidence between 0 and 1),
  last_computed   timestamptz
);

create table if not exists public.author_profile_queue (
  id           uuid primary key default gen_random_uuid(),
  author_id    uuid not null references public.authors (id) on delete cascade,
  queued_at    timestamptz not null default now(),
  processed_at timestamptz,
  unique (author_id)
);

-- Articles: provenance + assignment columns
alter table public.articles add column if not exists outlet_id    uuid references public.outlets (id);
alter table public.articles add column if not exists author_id    uuid references public.authors (id);
alter table public.articles add column if not exists body_text    text;
alter table public.articles add column if not exists embedding    vector(384);
alter table public.articles add column if not exists claims       jsonb not null default '[]'::jsonb;
alter table public.articles add column if not exists arc_id       uuid references public.story_arcs (id);
alter table public.articles add column if not exists unattributed boolean not null default false;
alter table public.articles add column if not exists monoculture  boolean not null default false;

-- Citations extracted from articles
create table if not exists public.citations (
  id                    uuid primary key default gen_random_uuid(),
  article_id            uuid not null references public.articles (id) on delete cascade,
  cited_entity          text not null,
  cited_type            text not null check (cited_type in
    ('court_doc','agency_release','named_official','anonymous_official','prior_reporting','study','other')),
  documentation_strength numeric not null,
  resolved_node_id      uuid references public.nodes (id),
  created_at            timestamptz not null default now()
);
create index if not exists citations_article_id_idx on public.citations (article_id);

-- Arcs: embedding for similarity assignment + bookkeeping
alter table public.story_arcs add column if not exists embedding vector(384);
alter table public.story_arcs add column if not exists last_assignment_run timestamptz;

create index if not exists articles_embedding_idx on public.articles using hnsw (embedding vector_cosine_ops);
create index if not exists story_arcs_embedding_idx on public.story_arcs using hnsw (embedding vector_cosine_ops);

-- RLS: anon read-only everywhere; writes via service role only.
alter table public.outlets enable row level security;
alter table public.ingest_sources enable row level security;
alter table public.pipeline_config enable row level security;
alter table public.authors enable row level security;
alter table public.author_profile_queue enable row level security;
alter table public.citations enable row level security;

create policy "public read outlets" on public.outlets for select using (true);
create policy "public read ingest_sources" on public.ingest_sources for select using (true);
create policy "public read pipeline_config" on public.pipeline_config for select using (true);
create policy "public read authors" on public.authors for select using (true);
create policy "public read author_profile_queue" on public.author_profile_queue for select using (true);
create policy "public read citations" on public.citations for select using (true);

-- Config seed: outlets, feeds, thresholds, cadence.
-- Live values (query pipeline_config for current truth):
--   ingest_cron              "23 3 * * *"   (every 24h, applied via public.apply_ingest_schedule())
--   attach_threshold         0.88           (gte-small clusters short news tightly; 0.78 gave false attaches)
--   significance_similarity  0.72
--   significance_min_outlets 2
--   significance_min_citations 1
--   author_min_articles      3              (UI floor for surfacing framing profiles)
--   author_profile_max_prior 5
--   author_refresh_days      90             (quarterly refresh)
--   max_items_per_feed       4              (steady-state; bounds edge-function CPU)
--   max_new_per_run          8
--   doc_strength_weights     court_doc 1.0 / agency_release 0.85 / study 0.75 / named_official 0.6 / anonymous_official 0.35 / prior_reporting 0.3 / other 0.2
--   monoculture_confidence_factor 0.7
--   embedding_model          "gte-small"   (384-dim, Supabase AI session)
--   lookback_days            30
-- Cadence change procedure: update pipeline_config.ingest_cron, then
--   select public.apply_ingest_schedule();
