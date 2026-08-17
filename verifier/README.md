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

## v7 (created 2026-08-15)
Measures: Track B Step 1 shared light-theme tokens — flag withhold unit
test (`tests/themeFlag.test.mjs`, withhold posture for every non-true value),
before/after screenshots of header + all four tabs in both themes with
programmatic body-background assertion, accent-removal test on Header and
News Feed, WCAG AA contrast on all light-theme text pairs (22/22 >= 4.5:1;
three marginal values fixed during verification), live rollback drill
(flag true -> live light, flag false -> instant dark revert), byte-verified
pushes, CI at final HEAD. Owner adjustment: 13px -> 16–18px body-text change
held out of this pass (open item; affects layout/density, not just color).
Details: `v7/trackb-step1-tokens.md`. Run log:
`runs/2026-08-15-trackb-step1.md`.
Differs from prior version: first styling/theme verification; adds
token-level contrast measurement and a live feature-flag rollback drill.

## v8 — 2026-08-15 — Track B card-radius 20px
Measures: token value change 8px → 20px, radius audit (23 hardcoded card
radii onto the token), untouched-scope confirmation, tests/build, byte-
verified push, 6-tab visual regression check, CI, and live bundle
confirmation. Details: `v8/trackb-radius-20px.md`. Run log:
`runs/2026-08-15-trackb-step1.md` (appended).
Differs from prior version: first purely cosmetic token-value change; adds
a card-vs-control radius classification audit and a live-bundle CSS check.

## v9 — 2026-08-16 — Track B nav restructure (6 tabs -> 5 + More sheet)
Measures: nav structure 4 core tabs + More (phase3/compare never top-level),
More-sheet order and per-flag gating, '(Beta)' suffix removal, withhold
posture (both flags off => no More, no disabled trace), unchanged view keys
for cross-jump stability (tests/navViews.test.mjs, 7 tests); 390px
before/after screenshots (live truncation -> 5 tabs, no ellipsis); live
click-through of both cross-jump paths (News 'Compare sources' -> compare;
Graph policy node -> PolicyPanel, structurally unaffected); byte-verified
pushes; both CI workflows green on final commit.
Details: `v9/trackb-nav-restructure.md`. Run log:
`runs/2026-08-16-trackb-nav-restructure.md`.
Differs from prior version: first navigation-structure change; adds live
cross-jump click-through and production before/after screenshot criteria.

## v10 — 2026-08-16 — Source Comparison in-page de-beta
Measures: presentational-only copy change in SourceComparisonView.jsx — h2
reads exactly "Source Comparison"; no user-facing "beta" string anywhere on
that screen (header, disabled notice, subtitle, tooltips, aria-labels);
diff limited to two copy strings (no logic/routing/data); suite 240/240;
build clean; byte-verified push (commit 90cdc79, blob 19d2a0dd, MATCH);
CI green; live mobile (390px) and desktop screenshots. Out-of-scope
observation recorded: Phase3View's own header still reads
"Legal & Policy — internal closed beta".
Details: `v10/source-comparison-debeta.md`. Run log:
`runs/2026-08-16-sc-debeta.md`.
Differs from prior version: first single-screen copy-alignment pass; adds
a full-screen "beta" absence scan on live body text as a criterion.

## v11 — 2026-08-16 — Legal & Policy in-page de-beta
Measures: presentational-only copy change in Phase3View.jsx — h2 reads
exactly "Legal & Policy"; no user-facing "beta" string anywhere on that
screen (header, subtitle, disabled notice, error notice, tooltips,
aria-labels); diff limited to three copy strings (no logic/routing/data);
suite 240/240 rerun against the exact deployed file; build clean;
byte-verified push (commit fe4d0e7, blob e0674b76, MATCH after adopting
remote &amp; entity as canonical); CI green; live mobile (390px) and
desktop screenshots with programmatic h2 confirmation.
Details: `v11/phase3-debeta.md`. Run log: `runs/2026-08-16-phase3-debeta.md`.
Differs from prior version: same criterion set as v10, applied to the
Legal & Policy screen; closes the observation v10 flagged.

## v12 — 2026-08-17 — Graph chrome overlap fix (Track B Step 2 item 1)
Measures: graph chrome in normal flow (toolbar / rail / stage), retired
floating `.edge-list-toggle`, docked TopicBrowser; clip-aware geometry
verifier across 8 browser states (desktop 1280×800 + mobile 390×844:
baseline, topics-open, edge-list-open, review-status-open, search-open,
legend-expanded) with zero chrome-on-canvas overlaps; suite 240/240;
byte-verified pushes (App.jsx final blob 9aae9338, commit 4a98d402 —
includes fix for a one-commit bottom-nav onClick regression at 657c6f08,
caught by the mobile Playwright run); live screenshots desktop + mobile.
Details: `v12/graph-chrome-overlap-fix.md`. Run log:
`runs/2026-08-17-trackb-step2-item1.md`. Verifier script:
`v12/check_overlap.py`.
Differs from prior version: first layout-geometry criterion set; introduces
the clip-aware overlap checker (ancestor overflow clipping, so scrollable
rail content is not misreported as overlay).

## v13 — 2026-08-17 — Graph canvas/token restyle (Track B Step 2 item 2)
Measures: plain view controls (+/−/Fit/Reset, zero joystick DOM, desktop
+ mobile); light canvas live with --graph-grid ink rgba(26, 26, 23, 0.08);
white node fill with type colored borders; neutral edges at rest with
type color on selection (programmatic proof: selected sequence edge
computed line-color rgb(109,40,217), width 2.5px); EDGE_TYPES extended
to the live 2026-08-17 vocabulary (sequence, constrained_by) so selection
coloring fires on real data; v7 accent-removal bar extended to Graph
(grayscale screenshot + 20 labeled legend rows); suite 240/240; byte-
verified pushes (four commits, tip 43bca1b0); CI green on all tips.
Blob SHAs: criteria 30c4ad76, checker 687601ab, run log 8e45fb89.
Details: `v13/graph-canvas-restyle.md`. Run log:
`runs/2026-08-17-trackb-step2-item2.md`. Verifier script:
`v13/check_item2.py`.
Differs from prior version: first canvas-visual-encoding criterion set;
adds computed-style assertions on cytoscape elements and extends the v7
accent-removal bar to the Graph tab.
