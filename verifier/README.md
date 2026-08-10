# Verifier index — 04-ADD Step 3 Arc-Grouped Timeline

Append-only. One entry per version.

## v1 (created 2026-08-10, ~09:20 UTC+8)
Measures:
- **Hard count** (acceptance gate): live DB canonical event groups = 362 = 271 direct (nodes.arc_id) + 26 article-derivable + 65 orphaned; each event exactly once across sections + Unclassified. Script: `v1/count-check.mjs` (read-only, publishable key via PostgREST, recomputes grouping the same way the app does).
- **Unit suite**: `node --test tests/` must stay green (123 baseline + new grouping tests).
- **Render legibility (accent removal)**: manual + screenshot — all arc-header/status/Unclassified meaning carried by labeled text on the live dark theme.
- **Performance**: live-measured load/render/interaction numbers captured at verification time (recorded in the run log).
Differs from prior version: first version.

## v2 (created 2026-08-10)
Measures: Arc sidebar search (title + category-label) and Source Comparison
title search — unit seam (`listFilters.js`, 10 tests), live filter-correctness
and honest-degradation checks with screenshots, CI at HEAD 7d67cd06.
Details: `v2/search-filters.md`. Run log: `runs/2026-08-10-part2-search-filters.md`.
Differs from prior version: adds search/filter verification; no grouping or
schema changes (read-path UI only). B(b) SC category filter skipped per owner —
`sc_events` has no category-equivalent field.
