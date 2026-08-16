# v10 — Source Comparison in-page de-beta (2026-08-16)

Scope: presentational only. Drop the beta qualifier from the Source
Comparison view's own copy, matching the nav-label ruling (06C shipped and
closed, not experimental).

## Criteria
1. `src/views/SourceComparisonView.jsx` h2 reads exactly "Source Comparison".
2. No user-facing "beta" string remains on that screen (header, disabled
   notice, subtitle, tooltips, aria-labels). Code comments referencing the
   pipeline_config flag name (source_comparison_beta) are not screen copy.
3. No logic/routing/data changes — diff limited to two copy strings.
4. Full suite green; build clean; byte-verified push; CI green.
5. Live screenshots mobile (390px) and desktop showing the updated header.

## Results
- h2: "Source Comparison" (was "Source Comparison — beta").
- Disabled notice: "Source Comparison is currently unavailable." (was
  "…is a beta surface… (source_comparison_beta flag off)").
- Subtitle paragraph: no beta copy (unchanged). Tooltips/aria-labels: none
  contain beta. Live body text scan on both viewports: "beta" absent.
- Tests: 240/240. Build clean. Commit 90cdc79, blob 19d2a0dd — byte-verify
  MATCH on first push. CI on 90cdc79: test x2, build, deploy — all success.
- Out-of-scope observation: Phase3View's own header still reads
  "Legal & Policy — internal closed beta" (different screen; flagged to
  owner, not changed).
