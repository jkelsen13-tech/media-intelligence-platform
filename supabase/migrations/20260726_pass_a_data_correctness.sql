-- Pass A — Data Correctness (A1/A2/A3/A4)
-- 1) Fifth category: 'unclassified' (classifier may decline below confidence floor).
-- 2) story_arcs: provenance + classification evidence columns.
-- 3) pipeline_config: unified thresholds for attachment, origination gate,
--    classification floor, and status derivation. No threshold constants in code.

ALTER TABLE public.story_arcs
  DROP CONSTRAINT IF EXISTS story_arcs_category_check;

ALTER TABLE public.story_arcs
  ADD CONSTRAINT story_arcs_category_check CHECK (category = ANY (ARRAY[
    'institutional_accountability'::text,
    'geopolitical_consequence'::text,
    'economic_policy'::text,
    'legislative_regulatory'::text,
    'unclassified'::text
  ]));

ALTER TABLE public.story_arcs
  ADD COLUMN IF NOT EXISTS seed_article_id uuid REFERENCES public.articles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_confidence numeric CHECK (category_confidence IS NULL OR (category_confidence >= 0 AND category_confidence <= 1)),
  ADD COLUMN IF NOT EXISTS category_evidence text,
  ADD COLUMN IF NOT EXISTS title_article_count integer NOT NULL DEFAULT 0;

-- Unified pipeline settings (single settings table; extends the existing
-- pipeline_config rather than adding a second config table).
INSERT INTO public.pipeline_config (key, value, description) VALUES
  ('originate_min_outlets', '3', 'Arc origination gate (a): minimum distinct independent outlets covering the same event cluster within the origination window.'),
  ('originate_window_hours', '72', 'Arc origination gate (a): cluster articles must fall within this many hours of each other.'),
  ('originate_min_edges', '4', 'Arc origination gate (b): minimum extracted graph edges across the cluster.'),
  ('originate_require_actor', 'true', 'Arc origination gate (c): cluster must name at least one institution or public official as an actor.'),
  ('category_confidence_floor', '0.6', 'Below this classifier confidence an arc is stored as category = unclassified.'),
  ('status_dormant_days', '14', 'Arc status derivation: no arc_events within this many days => dormant (unless resolved by milestones).')
ON CONFLICT (key) DO NOTHING;

-- Raise the cross-outlet bar used by the origination gate (legacy key kept in
-- use by the similarity clustering step; gate minimum now lives in
-- originate_min_outlets above).
UPDATE public.pipeline_config
SET value = '3',
    description = 'Minimum distinct outlets covering a similar story in one cycle for arc origination. Superseded by originate_min_outlets for the hard gate.'
WHERE key = 'significance_min_outlets';
