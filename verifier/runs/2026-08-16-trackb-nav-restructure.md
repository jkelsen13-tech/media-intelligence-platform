# Run log — 2026-08-16 — Track B nav restructure (v9)

Scope: 6-tab nav → 5 tabs + "More" bottom sheet. Owner rulings applied:
(a) More = bottom sheet reusing the About sheet pattern; (b) "(Beta)" suffix
dropped from both entries; (c) both flags off → More hidden entirely (withhold
posture, no disabled trace).

## Commits (all byte-verified: local git hash-object vs GitHub blob SHA)

| Commit  | Files | Result |
|---------|-------|--------|
| 1251547 | src/lib/navViews.js (new), tests/navViews.test.mjs (new) | MATCH |
| 176f1d4 | src/App.jsx | MISMATCH — transcription dropped `graph.edges` arg at topicSubgraph call; caught by byte-verify |
| 7fe8775 | src/App.jsx (corrected full content) | MATCH (blob bcd28ae7) |
| aad5e41 | src/index.css, verifier/v9/trackb-nav-restructure.md, verifier/README.md | MATCH |

## Tests / CI

- Local suite: 240/240 green (incl. 7 new navViews tests).
- Build: `vite build` clean.
- CI on aad5e41: Golden regression suite ✅, Deploy to GitHub Pages ✅.

## Live verification (production, 2026-08-16, Playwright chromium)

- After-state 390px: 5 tabs (News | Graph | Timeline | Arcs | More), no
  ellipsis truncation. Screenshot: after-mobile-390px.png.
- More sheet: opens from both nav bars; entries exactly Source Comparison then
  Legal & Policy (mockup order); no "(Beta)" suffix. More tab shows active
  state while a member view is on screen.
- Both entries render fully via More (phase3 + compare, 390px and desktop).
- Flag-off withhold: local build with Supabase unreachable → 4 tabs, no More,
  no disabled trace. Screenshot: local-flags-off-390px.png.
- Doc 05 pair 5 (News → Compare): expanded article card, clicked
  "◈ Compare coverage: Two Deaths Linked to Cyclospora Outbreak in Michigan →"
  → app switched to Source Comparison view, focused event present, More tab
  active. Screenshots: live-pair5-chip-390px.png,
  live-pair5-news-to-compare-390px.png.
- Graph policy path: full graph → tapped policy node "Suspended Counterparty
  Program" (27 policy nodes in production graph) → PolicyPanel consequence
  view opened (POLICY tag, upstream/downstream structure). Path never touches
  nav (App.jsx handleSelect → setPolicyNode → PolicyPanel render);
  code untouched by this change. Screenshot: live-graph-policy-panel-390px.png.

## Notes

- Source Comparison initial load takes ~16–24 s (heavy full-corpus read,
  pre-existing; render block byte-identical, not a regression).
- SourceComparisonView's in-page header still reads "Source Comparison — beta"
  — that is the view's own title, outside the nav-label scope of this change.
- compare / phase3 view keys and render blocks byte-identical; every existing
  setView call unchanged.
