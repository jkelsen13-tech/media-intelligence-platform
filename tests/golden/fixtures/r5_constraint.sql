-- G1 golden artifact: live production constraint, captured 2026-07-28.
-- Table: public.edges, constraint: edges_causal_evidence_guard (convalidated).
-- Source: pg_get_constraintdef on project niejaejtbxgakyrsntxm.
-- This is the r5 form (migration 20260803_tier3_causal_edge_guard_r5_amid_fix):
-- the temporal alternation uses 'amid(st)?' — closing the r4 gap where
-- 'amidst?' missed bare 'amid' (gate-round-3 finding, 2026-07-27).

CHECK (
  (type <> 'causal'::text) OR
  (
    (signal_source = ANY (ARRAY['causal_language'::text, 'citation'::text]))
    AND (NOT (btrim(COALESCE(evidence, ''::text), ' .,;:!?') ~* '^\s*(after(wards?)?|following|in the (days|weeks|months) (after|since|following)|in the wake of|amid(st)?|hours after|days after|weeks after|months after|later|subsequently)\b'::text))
    AND (NOT (btrim(regexp_replace(COALESCE(label, ''::text), '^\s*causal:\s*'::text, ''::text, 'i'::text), ' .,;:!?') ~* '^\s*(after(wards?)?|following|in the (days|weeks|months) (after|since|following)|in the wake of|amid(st)?|hours after|days after|weeks after|months after|later|subsequently)\b'::text))
  )
)
