-- 20260806_source_comparison_primitives.sql
-- 03_BACKLOG Item 1 — Source Comparison View: shared event/claim primitives.
-- ADDITIVE ONLY. No changes to existing tables/columns. No drops of existing objects.
-- Owner decisions locked 2026-08-06 (single-pass answers):
--   Q1a full corpus, title/summary-grain claims labeled thin-extraction
--   Q2  deterministic-only grouping v1 (LLM grouping parked as follow-up)
--   Q3  floors: claim_group 0.6 / event_membership 0.55 (config-tunable)
--   Q4  no per-event outlet minimum at beta
--   Q5  syndication detection: content-hash + canonical URL
--   Q6  events.arc_event_id nullable link column, unpopulated at v1
--   Q8  beta flag only; source_comparison_public stays false
-- Rollback: DROP TABLE the six new tables; DELETE the new pipeline_config keys;
--   set source_comparison_beta back to false.
-- Applied to production 2026-08-06 via Supabase migration runner as
-- '20260806_source_comparison_primitives' (second attempt; first attempt failed
-- on unquoted jsonb string 'lexicon' and rolled back cleanly, verified empty).

-- ---- 1. events ----------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  canonical_title text not null,
  occurred_at_start date,
  occurred_at_end date,
  location_text text,
  arc_id uuid references public.story_arcs(id),
  arc_event_id uuid references public.arc_events(id),  -- Q6: link only, unpopulated v1
  status text not null default 'candidate',            -- candidate|confirmed|merged
  rule_version text,
  created_at timestamptz not null default now()
);

-- ---- 2. claims (canonical) -----------------------------------------------------
create table public.claims (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  canonical_text text not null,
  claim_kind text not null default 'fact',             -- fact|statement_by_actor|attributed_report|prediction|evaluation
  thin_extraction boolean not null default false,      -- Q1a: title/summary-grain marker
  status text not null default 'active',               -- active|merged|withdrawn
  rule_version text,
  first_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ---- 3. article_claims (surface forms + article<->claim link) ------------------
create table public.article_claims (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id),
  article_id uuid not null references public.articles(id),
  surface_text text not null,
  char_start int,
  char_end int,
  extraction_method text not null default 'existing_claims_jsonb', -- existing_claims_jsonb|deterministic_reextract|manual
  extraction_confidence numeric,
  stance text not null default 'asserts',              -- asserts|attributes|qualifies|corrects
  loaded_language jsonb not null default '[]',         -- [{term, span, category}]
  version int not null default 1,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  unique (claim_id, article_id, version)
);
create index article_claims_claim_idx on public.article_claims (claim_id) where is_current;
create index article_claims_article_idx on public.article_claims (article_id) where is_current;

-- ---- 4. event_articles (event membership) --------------------------------------
create table public.event_articles (
  event_id uuid not null references public.events(id),
  article_id uuid not null references public.articles(id),
  membership_method text not null,                     -- embedding_cluster|entity_overlap|manual
  membership_confidence numeric,
  created_at timestamptz not null default now(),
  primary key (event_id, article_id)
);

-- ---- 5. claim_evidence_links (primary-evidence links) --------------------------
create table public.claim_evidence_links (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id),
  evidence_url text not null,
  evidence_type text not null default 'other',         -- document|dataset|court_record|official_statement|multimedia_primary|other
  linked_from_article_id uuid references public.articles(id),
  created_at timestamptz not null default now()
);

-- ---- 6. claim_corrections ------------------------------------------------------
create table public.claim_corrections (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id),
  correcting_article_id uuid not null references public.articles(id),
  corrected_article_id uuid references public.articles(id),
  correction_text text,
  detected_method text not null default 'manual',      -- explicit_retraction_text|editor_note|manual
  occurred_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---- 7. RLS: mirror articles posture (public read, service-role write) ---------
alter table public.events enable row level security;
alter table public.claims enable row level security;
alter table public.article_claims enable row level security;
alter table public.event_articles enable row level security;
alter table public.claim_evidence_links enable row level security;
alter table public.claim_corrections enable row level security;

create policy "public read events" on public.events for select to public using (true);
create policy "public read claims" on public.claims for select to public using (true);
create policy "public read article_claims" on public.article_claims for select to public using (true);
create policy "public read event_articles" on public.event_articles for select to public using (true);
create policy "public read claim_evidence_links" on public.claim_evidence_links for select to public using (true);
create policy "public read claim_corrections" on public.claim_corrections for select to public using (true);

-- ---- 8. pipeline_config keys ----------------------------------------------------
insert into public.pipeline_config (key, value, description) values
  ('source_comparison_beta', 'true',  'Item 1 Source Comparison beta flag (Q8: beta first, mirrors phase3_beta)'),
  ('source_comparison_public', 'false', 'Item 1 public release flag — separate owner flip, stays false'),
  ('event_cluster_similarity_threshold', '0.82', 'Deterministic v1: embedding cosine floor for event clustering'),
  ('event_cluster_window_days', '3', 'Deterministic v1: publish-window half-width for event clustering'),
  ('claim_group_confidence_floor', '0.6', 'Q3: below floor excluded from shared/unique/omission sets'),
  ('event_membership_confidence_floor', '0.55', 'Q3: below floor excluded from event membership'),
  ('loaded_language_method', '"lexicon"', 'Loaded language detection: versioned lexicon only at v1')
on conflict (key) do nothing;
