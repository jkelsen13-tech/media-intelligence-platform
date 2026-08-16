# verifier v9 — Track B nav restructure (6 tabs -> 5 + More sheet)
Created 2026-08-16. Owner-authorized implementation of the 2026-08-16
read-only investigation (report: nav restructure 6->5 per the six locked
mockups). Owner rulings: (a) More = bottom sheet reusing the About sheet
pattern; (b) "(Beta)" suffix dropped from both entries; (c) both flags off
=> More hides entirely (withhold posture, no grayed state).

## Criteria
1. Nav bar = 4 core tabs + More (order: news, graph, timeline, arcs, more);
   'phase3'/'compare' never appear as top-level tabs. [tests/navViews.test.mjs]
2. More sheet lists Source Comparison then Legal & Policy, each gated on
   its own flag; both flags off => More absent from the bar. [unit tests +
   local screenshots]
3. "(Beta)" absent from all nav labels. [unit test]
4. 'phase3'/'compare' view keys and their render blocks unchanged, so all
   setView callers and Doc 05 cross-jumps keep working. [unit test + code
   inspection + live click-through]
5. 390px before/after: before = 6 tabs with "Comp…" truncation (live,
   captured 2026-08-16 pre-change); after = 5 tabs, no ellipsis.
6. Full suite green; byte-verified push; both CI workflows green on the
   final commit.

## Results
- npm test: 240/240 pass (233 prior + 7 new navViews tests).
- npm run build: clean.
- Flag-off withhold: local build with Supabase unreachable renders 4 tabs,
  no More, no disabled trace (local-flags-off-390px.png).
- Flag-on local preview at 390px: News | Graph | Timeline | Arcs | More,
  no truncation.
- Cross-jump audit: News "Compare sources" -> setView('compare')
  (App.jsx, unchanged); Graph policy node -> PolicyPanel via setPolicyNode,
  in-graph, never routed through nav — structurally unaffected.
  Live click-through results: see runs/ log.
- Push ledger: commit 1251547 (nav module + tests, blobs byte-verified
  MATCH); commit 176f1d4 (App.jsx — byte-verify FAILED, one dropped
  argument in topicSubgraph call; fixed and re-pushed as 7fe8775, blob
  bcd28ae7 MATCH); commit for index.css + verifier records byte-verified
  MATCH. Rule 9 handling done correctly: the failed push's content was
  confirmed via diff against local before retrying.
- Live production verification + CI: see runs/ log (appended post-deploy).
