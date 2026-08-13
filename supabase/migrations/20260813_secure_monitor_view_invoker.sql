-- Supabase Advisor fix (owner-approved 2026-08-13):
-- public.duplicate_actor_label_monitor ran SECURITY DEFINER by default
-- (plain CREATE VIEW, owner = postgres, bypasses RLS). Recreate as
-- security_invoker so the underlying nodes RLS applies, and revoke the
-- overbroad default write grants on the view.
--
-- Rollback: re-run the original plain CREATE OR REPLACE VIEW without the
-- security_invoker option (definition unchanged from migration
-- 20260728015537 tier6_iran_actor_dedup) and re-grant defaults:
--   GRANT INSERT, UPDATE, DELETE ON public.duplicate_actor_label_monitor
--     TO anon, authenticated;

create or replace view public.duplicate_actor_label_monitor
with (security_invoker = true) as
 SELECT lower(btrim(label)) AS norm_label,
    count(*) AS node_count,
    array_agg(id ORDER BY created_at) AS node_ids,
    array_agg(slug ORDER BY created_at) AS slugs
   FROM nodes
  WHERE (type = 'actor'::text)
  GROUP BY (lower(btrim(label)))
 HAVING (count(*) > 1);

revoke insert, update, delete on public.duplicate_actor_label_monitor from anon, authenticated;
