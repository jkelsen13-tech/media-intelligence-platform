-- Doc 07 preflight B1: additive run tag so every row of a bounded ingestion
-- run (canary / full batch) is identifiable by a single predicate.
-- Additive only: new nullable column + partial index. No existing rows touched.
-- Applied to production as migration 20260807_ingestion_run_id (owner-authorized 2026-08-07).
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS ingestion_run_id text;

CREATE INDEX IF NOT EXISTS articles_ingestion_run_id_idx
  ON public.articles (ingestion_run_id)
  WHERE ingestion_run_id IS NOT NULL;

COMMENT ON COLUMN public.articles.ingestion_run_id IS
  'Bounded-run tag (e.g. doc07-canary-202608XX). Set only by gated batch intake; NULL for all legacy/feed-ingested rows. Child tables are reachable via article_id / metadata->>''article_id'' joins.';
