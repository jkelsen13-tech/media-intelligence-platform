# v2 measures — Arc search + Source Comparison title search (Part 2, 2026-08-10)

Scope: read-path UI additions only. Delivered A (Story Arcs sidebar search) + B(a)
(Source Comparison title search). B(b) (SC category grouping/filter) skipped per
owner decision — `sc_events` carries no category-equivalent field (347 rows
checked: status='candidate', arc_id NULL on all but ~12; no category column).

## Measures
- **Unit suite**: `node --test tests/` — 145/145 pass (135 prior + 10 new in
  `tests/listFilters.test.mjs` covering the pure seam `src/lib/listFilters.js`).
- **Live filter correctness (Arcs)**: query "trade dispute" -> exactly the 4
  matching arcs, none dropped/duplicated. Evidence: part2-arc-search-category.png.
- **Live honest-degradation (Arcs)**: no-match query -> 'No arcs match "...".'
  notice, no cards rendered. Evidence: part2-arc-search-nomatch.png.
- **Live filter correctness (SC)**: query "Rhine" -> exactly the one matching
  event card. Evidence: part2-sc-search-filter.png.
- **Live honest-degradation (SC)**: query "zzz-no-such-event" ->
  'No events match "zzz-no-such-event". Clear the search to see all 347
  comparison events.' Evidence: part2-sc-search-nomatch.png.
- **CI**: golden (npm ci + npm test) and Pages deploy both Success at HEAD
  7d67cd06 (golden #113, deploy #215).

Differs from v1: adds search/filter verification; v1 grouping count-check
unaffected (read-path only, no schema or grouping changes).
