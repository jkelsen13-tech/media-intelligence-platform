-- Phase 0 Part 2, Tier 3: causal-logic fix — DB layer.
-- Applied to production 2026-07-27.
--
-- (A) CHECK constraint applied as Supabase migrations
--     "tier3_causal_edge_evidence_guard" -> "_hardened" -> "_r2" -> "_r3"
--     -> "_r4". The r4 form below is the live one. History:
--       r0->r1: adversarial gate evaded anchored bare-keyword regex
--               ('amidst', whitespace/punctuation padding).
--       r1->r2: gate landed temporal PHRASES ('after the vote') and a
--               NULL-signal_source bypass.
--       r2->r3: self-caught — PostgreSQL ARE treats '\b' as backspace,
--               not a word boundary; r2 never fired. Replaced with (\s|$).
--       r3->r4: self-caught — 'afterwards?' requires the 'afterward' stem,
--               so bare 'after' escaped. Fixed to 'after(wards?)?'.
-- (B) Data remediation applied out-of-band via direct SQL the same day
--     (recorded here for the audit trail; all statements idempotent).
--
-- Context: audit of the 96 causal edges found 13 "kept" edges included
-- 5 same-article self-loops, 1 wrong-arc hub-entity residue, 1 duplicate
-- coverage of the root event, and 4 resting on a bare temporal keyword.
-- Originals preserved in edges_backup_20260726_tier3 (96 rows) and the
-- 17 rows touched below in edges_tier3_remediation_backup_20260727.

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

-- (B2) junk causal causal edges dropped: wrong-arc hub-entity residue (AI-trade arc
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

-- (B4) gate remediation round 1: the 2 causal edges kept in round 0 rest on
-- WEAK citations (named_official, 0.6). The deployed Step-3 standard
-- requires a PRIMARY document (court_doc / agency_release) for
-- citation-based causal; weak citation => sequence. Reclassified both.
UPDATE edges
SET type = 'sequence',
    label = 'sequence: cited development in arc',
    weight = 'light',
    signal_source = 'shared_entity',
    doc_strength = 'circumstantial',
    claimed_by = 'reporting',
    reliability = 4,
    counterfactual_test = 'sequence_only',
    metadata = metadata || jsonb_build_object(
      'signal_source', 'shared_entity+sequence',
      'reclassified_from', 'causal',
      'reclass_reason', 'Tier 3 gate remediation 2026-07-27: citation is named_official (weak); deployed standard requires primary document (court_doc/agency_release) for causal'
    )
WHERE type = 'causal';

-- (B5) gate remediation round 2: edge 1865cc04 (AI-trade arc -> US tariffs
-- article, label 'sequence: due to') dropped. The 'due to' was a regex false
-- positive on "levy was due to expire", not a causal statement, and the
-- arc link rested on hub entities (Trump/China/AI) + fragment entities —
-- same wrong-arc junk class as B2. Backed up (row 17 of the backup table).
INSERT INTO edges_tier3_remediation_backup_20260727
SELECT * FROM edges WHERE id='1865cc04-2135-417e-88e1-04e04b9414bd';
DELETE FROM edges WHERE id='1865cc04-2135-417e-88e1-04e04b9414bd';

-- (A) the guard (LIVE r4 form): a causal edge must rest on more than a
-- temporal opener. coalesce(signal_source,'') must be causal_language or
-- citation; label/evidence are normalized (strip 'causal:' prefix, trim
-- non-alphanumerics, lowercase, \s+ between words) then rejected when they
-- BEGIN with a temporal opener (prefix match, (\s|$) terminator — PG ARE:
-- '\b' is backspace, not a word boundary). None of the legitimate CAUSAL_RE
-- evidence phrases begin with a temporal opener, so no false positives.
-- Known residual limitation (accepted): a hand-crafted temporal phrase not
-- beginning with a listed opener could still pass; no code path can produce
-- one — the deployed functions write only exact TEMPORAL_RE/CAUSAL_RE
-- keywords or 'explicit citation in article' into evidence.
ALTER TABLE edges DROP CONSTRAINT IF EXISTS edges_causal_evidence_guard;
ALTER TABLE edges
  ADD CONSTRAINT edges_causal_evidence_guard CHECK (
    type <> 'causal'
    OR (
      coalesce(signal_source, '') IN ('causal_language', 'citation')
      AND NOT (
        lower(regexp_replace(regexp_replace(coalesce(metadata->>'evidence', ''), '^[^a-zA-Z0-9]+', ''), '[^a-zA-Z0-9]+$', ''))
        ~ '^(after(wards?)?|following|amidst?|in\s+the\s+wake\s+of|on\s+the\s+back\s+of|in\s+the\s+aftermath\s+of|later|subsequently|days?\s+after|hours?\s+after)(\s|$)'
      )
      AND NOT (
        lower(regexp_replace(regexp_replace(regexp_replace(coalesce(label, ''), '^\s*causal:\s*', '', 'i'), '^[^a-zA-Z0-9]+', ''), '[^a-zA-Z0-9]+$', ''))
        ~ '^(after(wards?)?|following|amidst?|in\s+the\s+wake\s+of|on\s+the\s+back\s+of|in\s+the\s+aftermath\s+of|later|subsequently|days?\s+after|hours?\s+after)(\s|$)'
      )
    )
  );
