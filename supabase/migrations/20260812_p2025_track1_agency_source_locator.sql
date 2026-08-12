-- Doc 08 Track 1 (Project 2025 — DOJ Civil Rights Division enforcement posture), Stage C.
-- Owner-authorized 2026-08-12. Applied to production via Supabase migration
-- 'add_p2025_track1_agency_and_source_locator' (this file is its byte-exact repo mirror).
-- Additive only. No data mutation to existing rows (p3_policy and p3_policy_track_event
-- both held 0 rows at migration time; p3_legal_case fixtures untouched).
-- Owner-approved shape (Stage B, 2026-08-12): policy-only placement — agency and
-- source_locator live on p3_policy; track events reach both via the policy_id FK.

ALTER TABLE p3_policy ADD COLUMN agency text;
COMMENT ON COLUMN p3_policy.agency IS
  'Owning federal agency for the tracked policy objective (Doc 08 Track 1: always DOJ). Single-valued by Stage A resolution; revisit only if a cross-agency track is scoped.';

ALTER TABLE p3_policy ADD COLUMN source_locator jsonb;
COMMENT ON COLUMN p3_policy.source_locator IS
  'Structured provenance anchor to the origin document: {chapter int, chapter_title text, pages text (range allowed), edition date}. Chapter is the stable unit; pages are edition-specific.';

ALTER TABLE p3_policy ADD CONSTRAINT p3_policy_source_locator_shape_check
  CHECK (source_locator IS NULL OR (
    jsonb_typeof(source_locator) = 'object'
    AND source_locator ?& ARRAY['chapter','chapter_title','pages','edition']
  ));

-- DOCUMENTED EXTENSION POINT (reserved, unused at Stage C):
-- A future actual-outcome event may need its own locator when its source differs from
-- the policy's stated-objective source (e.g. a court docket instead of the book).
-- The column below is present in schema for that purpose, is NULL for every Stage C row,
-- and no read path or UI consults it. No behavior change now.
ALTER TABLE p3_policy_track_event ADD COLUMN source_locator jsonb;
COMMENT ON COLUMN p3_policy_track_event.source_locator IS
  'RESERVED extension point (Doc 08 Track 1): per-event source locator for actual-outcome events whose evidence source differs from the policy stated-objective source. NULL and unused for all Stage C rows; not consulted by any read path.';

-- DOCUMENTED ROLLBACK PATH (owner-authorized Stage C/D gate):
--   DELETE FROM p3_policy_track_event WHERE method_version = 'p2025-track1-stageC-v1';
--   DELETE FROM p3_policy WHERE agency = 'DOJ' AND name LIKE 'P2025-T1-G%';
--   ALTER TABLE p3_policy DROP CONSTRAINT p3_policy_source_locator_shape_check,
--     DROP COLUMN agency, DROP COLUMN source_locator;
--   ALTER TABLE p3_policy_track_event DROP COLUMN source_locator;
