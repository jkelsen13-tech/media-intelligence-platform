-- 20260817_article_lineage_assertions_rls_correction.sql
-- 20_IDEA capability 1 — RLS policy correction. Owner-approved 2026-08-17.
--
-- Separate file rather than an edit to 20260817_article_lineage_assertions.sql:
-- that migration is applied history, and this repo keeps applied history
-- untouched (same convention as the r4/r5/r6 causal-guard chain).
--
-- WHAT WAS WRONG
-- The shipped policy was `review_status = 'verified' and is_current`. That
-- conflated two exclusions the brief keeps separate:
--   Section 5 — the GRAPH PROJECTION VIEW is filtered to 'verified';
--   Section 6 — SHADOW-mode assertions never surface in the Graph projection
--               or in Source Comparison corroboration counts.
-- Section 6 names shadow, not unreviewed.
--
-- Stage 1-3 assertions are born 'unreviewed'. Auto-promoting them to
-- 'verified' is exactly the move reversed on 2026-08-07 and is NOT
-- reintroduced. So under the shipped policy every assertion was invisible to
-- the anon client that serves the Source Comparison read path, and the
-- thread (i) fix would have counted zero persisted origin clusters —
-- silently changing nothing in production while passing its own unit tests.
-- That is a Rule 7 "no success by absence" failure.
--
-- PROVEN, NOT ASSERTED (2026-08-17, against production):
--   before  — real Reuters/billingsgazette assertion inserted, `set local
--             role anon`, select -> 0 rows visible;
--   after   — same row plus a 'shadow' and a 'rejected' row on the same
--             article, as anon -> exactly 1 row visible (the unreviewed
--             Reuters assertion). Shadow and rejected stayed invisible.
--   drilled — policy rolled back (anon -> 0 again), re-applied (anon -> 1),
--             policy/constraint/index fingerprints identical before and
--             after. All probe rows were transaction-scoped and rolled back;
--             0 rows persisted, core census unchanged.
--
-- WHY ADMITTING UNREVIEWED ROWS IS SAFE HERE
-- Source Comparison's E2 count is a corroboration COLLAPSE: honoring an
-- unreviewed syndication assertion makes a claim look LESS corroborated,
-- never more. The error direction is conservative. Fuzzy/embedding-derived
-- assertions stay 'shadow' and remain excluded — guardrail 6 intact.
--
-- Rollback:
--   drop policy "public read non-shadow lineage" on public.article_lineage_assertions;
--   create policy "public read verified lineage" on public.article_lineage_assertions
--     for select to public using (review_status = 'verified' and is_current);

drop policy "public read verified lineage" on public.article_lineage_assertions;

create policy "public read non-shadow lineage" on public.article_lineage_assertions
  for select to public
  using (review_status in ('unreviewed', 'verified') and is_current);
