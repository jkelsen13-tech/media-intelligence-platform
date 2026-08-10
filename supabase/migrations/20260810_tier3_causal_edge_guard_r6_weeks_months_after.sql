-- Tier 3 causal-edge evidence guard, r6: close the weeks-after/months-after gap.
-- r5 -> r6 diff (single scoped change, owner-authorized 2026-08-10):
--   temporal alternation gains two trailing branches in BOTH arms
--   (evidence and label): |weeks?\s+after|months?\s+after
-- Nothing else touched: same normalization (strip non-alphanumerics off both
-- ends + lower()), same label-arm 'causal:' pre-strip, same (\s|$) terminator.
-- Explicit non-scope (stays admitted, no decision made):
--   'in the (days|weeks|months) after ...' leads; numeric leads ('1 day after').
-- Built programmatically from the live r5 pg_get_constraintdef text; live
-- post-apply capture must byte-equal the candidate text (verifier diff).

ALTER TABLE public.edges DROP CONSTRAINT edges_causal_evidence_guard;

ALTER TABLE public.edges ADD CONSTRAINT edges_causal_evidence_guard
CHECK (((type <> 'causal'::text) OR ((COALESCE(signal_source, ''::text) = ANY (ARRAY['causal_language'::text, 'citation'::text])) AND (NOT (lower(regexp_replace(regexp_replace(COALESCE((metadata ->> 'evidence'::text), ''::text), '^[^a-zA-Z0-9]+'::text, ''::text), '[^a-zA-Z0-9]+$'::text, ''::text)) ~ '^(after(wards?)?|following|amid(st)?|in\s+the\s+wake\s+of|on\s+the\s+back\s+of|in\s+the\s+aftermath\s+of|later|subsequently|days?\s+after|hours?\s+after|weeks?\s+after|months?\s+after)(\s|$)'::text)) AND (NOT (lower(regexp_replace(regexp_replace(regexp_replace(COALESCE(label, ''::text), '^\s*causal:\s*'::text, ''::text, 'i'::text), '^[^a-zA-Z0-9]+'::text, ''::text), '[^a-zA-Z0-9]+$'::text, ''::text)) ~ '^(after(wards?)?|following|amid(st)?|in\s+the\s+wake\s+of|on\s+the\s+back\s+of|in\s+the\s+aftermath\s+of|later|subsequently|days?\s+after|hours?\s+after|weeks?\s+after|months?\s+after)(\s|$)'::text)))));
