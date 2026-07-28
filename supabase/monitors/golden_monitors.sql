-- G1 automated monitors (Phase 0, owner-authorized 2026-07-28).
-- READ-ONLY. Run manually before/after any ingestion or classification change,
-- and on a weekly review cadence, via the Supabase SQL editor or:
--   psql "$DATABASE_URL" -f supabase/monitors/golden_monitors.sql
-- Every row returns monitor, value, threshold, status (PASS/ALERT).
-- Thresholds, owners, alert destinations, rollback: docs/GOLDEN_REGRESSION.md.
-- Baselines captured 2026-07-28 (see docs). Crons stay OFF — these run by hand.

WITH m(name, value, numerator, denominator) AS (
  -- 1a. duplicate actor nodes (live Tier 6 monitor view)
  SELECT 'duplicate_actor_labels', count(*)::numeric, NULL::numeric, NULL::numeric
  FROM public.duplicate_actor_label_monitor
  UNION ALL
  -- 1b. duplicate arcs (normalized titles)
  SELECT 'duplicate_arc_titles', count(*)::numeric, NULL, NULL FROM (
    SELECT lower(btrim(title)) t FROM public.story_arcs
    GROUP BY lower(btrim(title)) HAVING count(*) > 1
  ) d
  UNION ALL
  -- 2. unattached-article rate (percent)
  SELECT 'unattached_article_pct',
         round(100.0 * count(*) FILTER (WHERE arc_id IS NULL) / NULLIF(count(*), 0), 1),
         count(*) FILTER (WHERE arc_id IS NULL)::numeric, count(*)::numeric
  FROM public.articles
  UNION ALL
  -- 3. category-fallback rate: unclassified arcs (percent)
  SELECT 'category_fallback_pct',
         round(100.0 * count(*) FILTER (WHERE category = 'Unclassified') / NULLIF(count(*), 0), 1),
         count(*) FILTER (WHERE category = 'Unclassified')::numeric, count(*)::numeric
  FROM public.story_arcs
  UNION ALL
  -- 4. arc-size spike: largest arc by article count
  SELECT 'arc_max_articles', COALESCE(max(n), 0), NULL, NULL FROM (
    SELECT count(*) n FROM public.articles WHERE arc_id IS NOT NULL GROUP BY arc_id
  ) s
  UNION ALL
  -- 5. HTML/encoding artifacts in article text
  SELECT 'html_encoding_artifacts', count(*)::numeric, NULL, NULL
  FROM public.articles
  WHERE title ~ '&[a-zA-Z]+;|Ã.|â€' OR summary ~ '&[a-zA-Z]+;|Ã.|â€'
  UNION ALL
  -- 6. unsupported causal edges (defense-in-depth behind the r5 CHECK)
  SELECT 'unsupported_causal_edges', count(*)::numeric, NULL, NULL
  FROM public.edges
  WHERE type = 'causal'
    AND (
      signal_source NOT IN ('causal_language', 'citation')
      OR btrim(COALESCE(metadata->>'evidence', ''), ' .,;:!?') ~*
         '^\s*(after(wards?)?|following|in the (days|weeks|months) (after|since|following)|in the wake of|amid(st)?|hours after|days after|weeks after|months after|later|subsequently)\b'
      OR btrim(regexp_replace(COALESCE(label, ''), '^\s*causal:\s*', '', 'i'), ' .,;:!?') ~*
         '^\s*(after(wards?)?|following|in the (days|weeks|months) (after|since|following)|in the wake of|amid(st)?|hours after|days after|weeks after|months after|later|subsequently)\b'
    )
  UNION ALL
  -- 7a. relationship-class drop-to-zero: sequence (baseline 67)
  SELECT 'sequence_edges_zero', (count(*) = 0)::int::numeric, NULL, NULL
  FROM public.edges WHERE type = 'sequence'
  UNION ALL
  -- 7b. relationship-class drop-to-zero: actor (baseline 304)
  SELECT 'actor_edges_zero', (count(*) = 0)::int::numeric, NULL, NULL
  FROM public.edges WHERE type = 'actor'
  UNION ALL
  -- 8. cleanup probes / fixture rows left in production tables
  SELECT 'cleanup_probe_rows', (
    (SELECT count(*) FROM public.nodes
      WHERE label ~* '\bgate\b[^a-z]{0,12}(round\s*\d+)?[^a-z]{0,12}\bprobe\b|\bbackfill\b|\bfixture\b|\bprobe[-\s]?(causal|test|node|edge|validation|row)\b'
         OR slug ~* '\bbackfill\b|\bfixture\b|\bprobe[-\s]?(causal|test|node|edge|validation|row)\b')
  + (SELECT count(*) FROM public.edges
      WHERE label ~* '\bgate\b[^a-z]{0,12}(round\s*\d+)?[^a-z]{0,12}\bprobe\b|\bbackfill\b|\bfixture\b|\bprobe[-\s]?(causal|test|node|edge|validation|row)\b')
  + (SELECT count(*) FROM public.arc_events
      WHERE title ~* '\bgate\b[^a-z]{0,12}(round\s*\d+)?[^a-z]{0,12}\bprobe\b|\bbackfill\b|\bfixture\b|\bprobe[-\s]?(causal|test|node|edge|validation|row)\b')
  )::numeric, NULL, NULL
)
SELECT
  name AS monitor,
  value,
  numerator,
  denominator,
  CASE name
    WHEN 'duplicate_actor_labels'    THEN 'expect 0'
    WHEN 'duplicate_arc_titles'      THEN 'expect 0'
    WHEN 'unattached_article_pct'    THEN 'alert > 85.0 (baseline 70.8)'
    WHEN 'category_fallback_pct'     THEN 'alert > 25.0 (baseline 0.0)'
    WHEN 'arc_max_articles'          THEN 'alert > 72 (baseline 36, 2x)'
    WHEN 'html_encoding_artifacts'   THEN 'expect 0'
    WHEN 'unsupported_causal_edges'  THEN 'expect 0'
    WHEN 'sequence_edges_zero'       THEN 'expect 0 (baseline 67)'
    WHEN 'actor_edges_zero'          THEN 'expect 0 (baseline 304)'
    WHEN 'cleanup_probe_rows'        THEN 'expect 0'
  END AS threshold,
  CASE
    WHEN name IN ('duplicate_actor_labels', 'duplicate_arc_titles',
                  'html_encoding_artifacts', 'unsupported_causal_edges',
                  'sequence_edges_zero', 'actor_edges_zero', 'cleanup_probe_rows')
      THEN CASE WHEN value = 0 THEN 'PASS' ELSE 'ALERT' END
    WHEN name = 'unattached_article_pct'
      THEN CASE WHEN value <= 85.0 THEN 'PASS' ELSE 'ALERT' END
    WHEN name = 'category_fallback_pct'
      THEN CASE WHEN value <= 25.0 THEN 'PASS' ELSE 'ALERT' END
    WHEN name = 'arc_max_articles'
      THEN CASE WHEN value <= 72 THEN 'PASS' ELSE 'ALERT' END
  END AS status
FROM m
ORDER BY name;
