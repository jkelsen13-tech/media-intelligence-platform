-- Phase 0 Part 2, Tier 6: duplicate Iran actor node repair.
-- Owner-authorized 2026-07-28. Applied to production as Supabase migration
-- "tier6_iran_actor_dedup" the same day.
--
-- Pre-mutation read confirmed:
--   * nodes 9ffd6cd4 (actor-iran yemen) and f4915c7f (actor-iran trump) share
--     label 'Iran' AND metadata.entity_id 1ffe9210-94cd-4244-bdb3-be4ad1eb430a
--     -> same resolved entity, true duplicate.
--   * Only references to either node: edges f0f62270 (-> 9ffd6cd4) and
--     7e974775 (-> f4915c7f). sources/story_arcs/citations/node_topics: 0 refs.
-- Canonical: 9ffd6cd4 kept; f4915c7f deleted after edge repoint.
--
-- Rollback: reinsert node f4915c7f from nodes_tier6_iran_backup_20260728,
-- restore edge 7e974775 target_id from edges_tier6_iran_backup_20260728,
-- DROP VIEW duplicate_actor_label_monitor.

-- (A) backups (RLS-secured, same pattern as secure_tier3_remediation_backup)
CREATE TABLE IF NOT EXISTS public.nodes_tier6_iran_backup_20260728 AS
SELECT * FROM public.nodes
WHERE id IN ('9ffd6cd4-d609-4d9e-a6d9-aa7e15f04b78','f4915c7f-114d-4f1b-b2d8-581c1e46f77c');

CREATE TABLE IF NOT EXISTS public.edges_tier6_iran_backup_20260728 AS
SELECT * FROM public.edges
WHERE id IN ('f0f62270-6243-4557-91e2-3f44a00eb6a6','7e974775-fbc4-4beb-a78f-128abc242dde');

ALTER TABLE public.nodes_tier6_iran_backup_20260728 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edges_tier6_iran_backup_20260728 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nodes_tier6_iran_backup_20260728 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.edges_tier6_iran_backup_20260728 FROM PUBLIC, anon, authenticated;

-- (B) repoint the duplicate's only edge to the canonical node, with provenance note
UPDATE public.edges
SET target_id = '9ffd6cd4-d609-4d9e-a6d9-aa7e15f04b78',
    metadata = metadata || jsonb_build_object(
      'repointed_from', 'f4915c7f-114d-4f1b-b2d8-581c1e46f77c',
      'repoint_reason', 'Tier 6 Iran actor dedup 2026-07-28: duplicate node sharing entity_id 1ffe9210-94cd-4244-bdb3-be4ad1eb430a merged into canonical actor'
    )
WHERE id = '7e974775-fbc4-4beb-a78f-128abc242dde';

-- (C) delete the duplicate node (zero remaining references after (B))
DELETE FROM public.nodes WHERE id = 'f4915c7f-114d-4f1b-b2d8-581c1e46f77c';

-- (D) permanent duplicate-actor monitor: flags any actor label shared by >1 node.
-- Pre-fix this returns the Iran pair (count 2); post-fix it returns zero rows.
CREATE OR REPLACE VIEW public.duplicate_actor_label_monitor AS
SELECT lower(btrim(label)) AS norm_label,
       count(*) AS node_count,
       array_agg(id ORDER BY created_at) AS node_ids,
       array_agg(slug ORDER BY created_at) AS slugs
FROM public.nodes
WHERE type = 'actor'
GROUP BY lower(btrim(label))
HAVING count(*) > 1;
