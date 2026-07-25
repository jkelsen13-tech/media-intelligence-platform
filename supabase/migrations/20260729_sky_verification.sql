-- Sky Verification (Shadow-First) — Task 4 schema
--
-- Adaptations from the phase doc to the REAL schema (see 20260723_panel_arcs_ingestion.sql):
--   * FK target `arcs`        -> real table `story_arcs`
--   * `alter table graph_edges` -> real table is `edges`
-- Index names adjusted accordingly.
--
-- NOT applied by this repo — the orchestrator applies it after the
-- verification gate.

create table if not exists public.sky_verifications (
  id                    uuid primary key default gen_random_uuid(),
  article_id            uuid not null references public.articles (id) on delete cascade,
  arc_id                uuid references public.story_arcs (id) on delete set null,
  observed_azimuth_deg  numeric(6,2) not null,   -- 0..360, clockwise from north
  observed_altitude_deg numeric(5,2) not null,   -- degrees above horizon
  captured_at           timestamptz not null,    -- exact UTC capture instant
  centroid_lat          numeric(9,6),
  centroid_lng          numeric(9,6),
  confidence_radius_km  numeric(7,2) not null,   -- region, never a point
  sensor_quality        text not null check (sensor_quality in ('high','medium','low')),
  angular_error_deg     numeric(4,2),            -- solver best-fit residual
  image_hash            text not null,           -- SHA-256 of crop; no raw image, no GPS, no PII
  method                text not null default 'shadow_assisted'
                        check (method in ('shadow_assisted','shadow_auto','sky_disk','star_field')),
  created_at            timestamptz not null default now()
);

create index if not exists sky_verifications_article_id_idx
  on public.sky_verifications (article_id);
create index if not exists sky_verifications_story_arc_id_idx
  on public.sky_verifications (arc_id);

-- Phase doc says `alter table graph_edges add column sky_verified boolean`;
-- the real edge table is `edges`.
alter table public.edges
  add column if not exists sky_verified boolean not null default false;

-- RLS: public read-only (matches the platform's anon read pattern);
-- NO public insert — writes come from a future edge function using the
-- service role, which bypasses RLS.
alter table public.sky_verifications enable row level security;

create policy "public read sky_verifications"
  on public.sky_verifications for select using (true);
