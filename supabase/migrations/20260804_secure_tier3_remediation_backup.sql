-- Secure the Tier-3 remediation backup (owner-authorized containment action, 2026-07-27 UTC).
-- Scope: row-level security + grants ONLY. The table and its 17 rows are not
-- moved, truncated, altered, or deleted. No client-facing policies are
-- created, so no client role can read or write through RLS. service_role
-- keeps its existing grants and bypasses RLS (rolbypassrls=true), preserving
-- administrative rollback access. RLS is NOT forced, so the table owner
-- (postgres) is unaffected.
--
-- Rollback (DO NOT EXECUTE without explicit owner approval):
--   ALTER TABLE public.edges_tier3_remediation_backup_20260727 DISABLE ROW LEVEL SECURITY;
--   GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--     ON TABLE public.edges_tier3_remediation_backup_20260727 TO anon, authenticated;

ALTER TABLE public.edges_tier3_remediation_backup_20260727 ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.edges_tier3_remediation_backup_20260727 FROM PUBLIC;
REVOKE ALL ON TABLE public.edges_tier3_remediation_backup_20260727 FROM anon;
REVOKE ALL ON TABLE public.edges_tier3_remediation_backup_20260727 FROM authenticated;
