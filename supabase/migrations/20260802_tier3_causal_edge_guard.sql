-- Phase 0 Part 2, Tier 3: causal-logic fix — DB layer.
-- Applied to production 2026-07-27.
--
-- (A) CHECK constraint applied as Supabase migration
--     "tier3_causal_edge_evidence_guard".
-- (B) Data remediation applied out-of-band via direct SQL the same day
--     (recorded here for the audit trail; all statements idempotent).
--
-- Context: audit of the 96 causal edges found 13 "kept" edges included
-- 5 same-article self-loops, 1 wrong-arc hub-entity residue, 1 duplicate
-- coverage of the root event, and 4 resting on a bare temporal keyword.
-- Originals preserved in edges_backup_20260726_tier3 (96 rows) and the
-- 16 rows touched below in edges_tier3_remediation_backup_20260727.

-- (B0) safety backup of every row touched (no-op if it already exists)
CREATE TABLE IF NOT EXISTS edges_tier3_remediation_backup_20260727 AS
SELECT e.* FROM edges e
WHERE e.id IN (
  '256349f7-d44e-47f7-8f1a-43f55da0860b','427e2c8c-61b2-4953-beb4-d4fa9a5c9be9',
  '5051f885-d649-4010-a7ad-07b1997c5f3a','fb06d5a5-72e8-4c1b-a834-86e97bb1f9f4',
  'f14f2784-7b94-49da-8b64-559fcb5f043d','1fb53b6f-bd54-4bf1-8f29-f21e207f1030'
)
OR (e.type IN ('causal','sequence') AND EXISTS (
  SELECT 1 FROM nodes ns JOIN nodes nt ON nt.id = e.target_id
  WHERE ns.id = e.source_id AND right(ns.slug,8) = right(nt.slug,8)
    AND ns.slug LIKE 'evt-%' AND nt.slug LIKE 'art-%'
));

-- (B1) temporal-only causal edges -> non-causal 'sequence'
-- (field shape matches what the deployed Tier-3 code writes)
UPDATE edges
SET type = 'sequence',
    label = 'sequence: ' || (metadata->>'evidence'),
    weight = 'light',
    signal_source = 'shared_entity',
    doc_strength = 'circumstantial',
    claimed_by = 'reporting',
    reliability = 4,
    counterfactual_test = 'sequence_only',
    metadata = metadata || jsonb_build_object(
      'signal_source', 'shared_entity+sequence',
      'reclassified_from', 'causal',
      'reclass_reason', 'Tier 3 remediation 2026-07-27: evidence was a bare temporal keyword, not an explicit causal statement'
    )
WHERE id IN (
  '256349f7-d44e-47f7-8f1a-43f55da0860b','427e2c8c-61b2-4953-beb4-d4fa9a5c9be9',
  '5051f885-d649-4010-a7ad-07b1997c5f3a','fb06d5a5-72e8-4c1b-a834-86e97bb1f9f4'
);

-- (B2) junk causal edges dropped: wrong-arc hub-entity residue (AI-trade arc
-- -> Red Sea oil article; shared entities only Trump/Saudi) and duplicate
-- coverage of the root event (same statement, second outlet).
DELETE FROM edges WHERE id IN (
  'f14f2784-7b94-49da-8b64-559fcb5f043d','1fb53b6f-bd54-4bf1-8f29-f21e207f1030'
);

-- (B3) same-article self-loops dropped (evt-X -> art-X, identical article
-- id8 slug suffix) — meaningless as causal OR sequence relations.
DELETE FROM edges e
USING nodes ns, nodes nt
WHERE e.source_id = ns.id AND e.target_id = nt.id
  AND e.type IN ('causal','sequence')
  AND right(ns.slug,8) = right(nt.slug,8)
  AND ns.slug LIKE 'evt-%' AND nt.slug LIKE 'art-%';

-- (A) the guard: a causal edge must rest on more than a bare temporal
-- keyword. Mirrors TEMPORAL_RE in ingest-rss / backfill-legacy.
ALTER TABLE edges
  ADD CONSTRAINT edges_causal_evidence_guard CHECK (
    type <> 'causal'
    OR (
      signal_source IN ('causal_language', 'citation')
      AND NOT (coalesce(metadata->>'evidence', '') ~* '^(after|following|amid|in the wake of|on the back of|days? after|hours? after)$')
      AND NOT (coalesce(label, '') ~* '^causal:\s*(after|following|amid|in the wake of|on the back of|days? after|hours? after)$')
    )
  );
