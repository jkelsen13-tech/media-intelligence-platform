-- 06C repair (owner-authorized 2026-08-09): extend explanations_assertion_type_check
--
-- Gap: the 06C Batch 1 migration (20260806_source_comparison_primitives.sql)
-- created the Source Comparison tables but never extended the Phase 2
-- explanations assertion_type CHECK. lib.js emits assertion_type
-- 'event_membership' and 'claim_grouping' (owner-authorized Batch 2 design),
-- which the original 8-value constraint rejects. Latent until the first
-- full-corpus live write (2026-08-09) because dry-runs never insert and no
-- prior run reached the explanations write.
--
-- Change: additive vocabulary extension only — the original 8 values remain
-- valid; every existing row satisfies the new constraint (verified: live
-- distinct assertion_type values are edge / arc_assignment / classification).
-- No data rewrite.
--
-- ROLLBACK (restore the original 8-value constraint; not expected to be
-- needed — only safe while no sc-v1 explanation rows exist):
--   ALTER TABLE explanations DROP CONSTRAINT explanations_assertion_type_check;
--   ALTER TABLE explanations ADD CONSTRAINT explanations_assertion_type_check
--     CHECK (assertion_type = ANY (ARRAY['edge','arc_assignment','classification','score','anomaly_flag','timeline_relationship','policy_transition','evidence_track']));
--   (If sc-v1 explanation rows already exist, first delete them:
--    DELETE FROM explanations WHERE assertion_type IN ('event_membership','claim_grouping');)

ALTER TABLE explanations DROP CONSTRAINT explanations_assertion_type_check;
ALTER TABLE explanations ADD CONSTRAINT explanations_assertion_type_check
  CHECK (assertion_type = ANY (ARRAY['edge','arc_assignment','classification','score','anomaly_flag','timeline_relationship','policy_transition','evidence_track','event_membership','claim_grouping']));