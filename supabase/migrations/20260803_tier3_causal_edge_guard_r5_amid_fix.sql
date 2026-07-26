-- Phase 0 Part 2, Tier 3: causal-edge evidence guard r5 -- bare-'amid' fix.
-- Additive migration. The r4 migration (20260802_tier3_causal_edge_guard.sql)
-- is left untouched as applied history.
--
-- Gate round 3 (2026-07-27) found that r4's 'amidst?' binds '?' to the final
-- 't' only, so it matches 'amids'/'amidst' but never bare 'amid' -- the same
-- bug class as r3's 'afterwards?' that r4 fixed for 'after' but missed for
-- 'amid'. Two negative controls landed (evidence 'amid the fallout'; label
-- '. . . amid the fallout'); both were cleaned immediately and independently
-- verified. r5 replaces 'amidst?' with 'amid(st)?' in BOTH the evidence and
-- label alternations. No other change.
--
-- No data remediation required: zero causal rows exist, so no production row
-- can violate the tightened guard.

ALTER TABLE edges DROP CONSTRAINT IF EXISTS edges_causal_evidence_guard;
ALTER TABLE edges
  ADD CONSTRAINT edges_causal_evidence_guard CHECK (
    type <> 'causal'
    OR (
      coalesce(signal_source, '') IN ('causal_language', 'citation')
      AND NOT (
        lower(regexp_replace(regexp_replace(coalesce(metadata->>'evidence', ''), '^[^a-zA-Z0-9]+', ''), '[^a-zA-Z0-9]+$', ''))
        ~ '^(after(wards?)?|following|amid(st)?|in\s+the\s+wake\s+of|on\s+the\s+back\s+of|in\s+the\s+aftermath\s+of|later|subsequently|days?\s+after|hours?\s+after)(\s|$)'
      )
      AND NOT (
        lower(regexp_replace(regexp_replace(regexp_replace(coalesce(label, ''), '^\s*causal:\s*', '', 'i'), '^[^a-zA-Z0-9]+', ''), '[^a-zA-Z0-9]+$', ''))
        ~ '^(after(wards?)?|following|amid(st)?|in\s+the\s+wake\s+of|on\s+the\s+back\s+of|in\s+the\s+aftermath\s+of|later|subsequently|days?\s+after|hours?\s+after)(\s|$)'
      )
    )
  );
