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

## v3 (created 2026-08-10)
Measures: Track B Step 2 Knowledge Graph band — owner-required BEFORE/AFTER
pair (label-box collision count, bounding-box area per node) via headless
fcose harness (`v3/measure-layout.mjs`), unit suite 157 green, live
production checks of the four care points (drag-reheat exclusion,
deterministic seed mode, restPositions-after-placement, portrait
adaptation), byte-verified pushes, CI at HEAD 9db34829.
Details: `v3/graph-band.md`. Run log: `runs/2026-08-10-trackb-step2-graph-band.md`.
Differs from prior version: first graph-layout verification; adds headless
fcose metrics harness. No schema changes; rendering only.
## v4 (created 2026-08-11)
Measures: Doc 13 scaling/pagination ceiling — every unpaginated .select()
that can exceed PostgREST's silent 1000-row cap. Criteria: limited read-path
change only (no algorithm/schema/UI); fixture-seeded >1000 proof with named
rows beyond position 1000 present; zero-count cleanup for temporary fixtures;
full npm test green in /tmp copy; one commit per site, byte-verified push.
Details: `v4/doc13-pagination.md`. Run log: `runs/2026-08-11-doc13-per-site.md`.
Differs from prior version: first backend/Edge-Function verification; adds
plain-ESM shared-helper pattern (Deno edge + node:test parity) and keyset
composite-PK pagination proof.

## v5 (created 2026-08-12)
Measures: 00_INDEX Doc 13 checkpoint closure — CLOSED status + nine-site
ledger + final commit 8d6f8ef, FRESH post-close live census (entities/nodes/
edges/articles), reconciliation of three stale working-document status fields
(04 addendum Step 3, 05, 07), session git-token destruction proof, and
byte-verified push. Details: `v5/index-doc13-checkpoint.md`. Run log:
`runs/2026-08-12-index-doc13-closure.md`.
Differs from prior version: doc/checkpoint verification rather than code
behavior; first criterion set that includes credential-destruction proof.

## v6 (created 2026-08-12)
Measures: Doc 15A atomic centroid + idempotent attach — four required tests
run before-state-first against the live DB with scratch fixtures (race loss
reproduced: 0.045 vs 0.06; double-count reproduced: 0.035 vs 0.03; orphan
reproduced), RPC after-state all exact; cleanup zero-delta census; static
drift-guard test (tests/atomicAttach15A.test.mjs) guarding both callers;
inherited re-parenting limitation documented (owner instruction). Details:
`v6/doc15a-atomic-attach.md`. Run log: `runs/2026-08-12-doc15a-atomic-attach.md`.
Differs from prior version: first concurrency/atomicity verification.
