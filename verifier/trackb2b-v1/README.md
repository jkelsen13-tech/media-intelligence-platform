# trackb2b-v1 — Step 2b pre-build verification (the three outstanding 2026-08-08 tests)

Created 2026-08-18. Measures ONLY the three verification tests locked as
outstanding since 2026-08-08 (04_DECISION_GRAPH_REGION_BOUNDARIES, carried
into 04_ADDENDUM_SIX_SCREEN_REFERENCE_SPEC Screen 6). This is a PRE-BUILD
clearance harness: it models the addendum's card-node + dashed-region-boundary
design headlessly against the LIVE corpus (750 nodes / 411 edges) and the
app's real layout code path (fcose params, band placement, label policy
mirrored from src/graph/GraphView.jsx and verifier/v3). No production code is
touched; passing or failing here decides whether the design is cleared for
build, per the owner's instruction.

## Reference design under test (assumptions, documented so a later reviewer can re-run)

- Card node: rounded-rect card, 160 x 72 CSS px at 1x text — type icon (~20px),
  bold entity name (up to 2 lines, 40-char truncation carried from styles.js),
  date line, type-label line. Replaces the current 36–110px shape + external label.
  The card body IS the label carrier: card-body overlap = label illegibility.
- Region: convex hull of member CARD boxes (not center points) + 40px padding,
  dashed 1px, no fill. Label above the hull's top-left; "+N" badge top-right.
  Region assignment for the harness (live-vocabulary approximation of the
  mockup's semantic regions): type=policy → "Policy & courts";
  type=event → "Incidents"; type=actor + entity_type=person → "Civil society";
  type=actor + entity_type=organization → "Reporting".
- Focused subgraph: the app's actual desktop default — top hub by degree,
  depth-2 neighborhood (src/lib/desktopFocus.js).

## Pass criteria (fixed BEFORE running)

T1 — Mobile reflow (viewports 390x844 and 360x800):
  a) focused subgraph with card nodes fits at zoom >= 0.45 (card renders
     >= 72 CSS px wide — the floor at which a 12px name stays readable);
  b) zero card-body overlaps at fit zoom AND at zoom 1.0;
  c) every region label lands inside the viewport after fit.

T2 — 200% text scaling:
  a) FIXED cards: measure text overflow (name/date/type lines vs card inner
     width) — reported, not gated, since the build approach is undecided;
  b) AUTO-GROWN cards (card sized to doubled text): zero card-body overlaps
     at the same layout, fit zoom at desktop and mobile recorded;
  c) region labels (DOM, scale natively) pairwise-non-overlapping at 2x on
     both desktop and mobile fits.
  NOTE: cytoscape canvas text does not respond to browser text scaling at
  all; if card text is canvas-rendered the 200% requirement fails by
  construction. This test's job is to force that decision into the open with
  numbers, not to rubber-stamp either rendering path.

T3 — Dense/expanded states (full 750-node corpus, cards on):
  a) fcose layout completes; duration recorded (informational, no hard budget —
     Track B's performance budgets are still unfilled placeholders);
  b) card-body overlap count with the SHIPPED app params recorded; if non-zero,
     the minimal param adjustment that reaches zero is found and recorded —
     a required adjustment is a finding, not an automatic fail;
  c) hull computation < 100ms; containment purity 100% (no region hull
     encloses a non-member node center); inter-region hull overlap recorded;
  d) label-collision counts at the app's real zoom policy (0.6 top-20 hubs,
     1.2 all) recorded against the card model.

Harness: `measure-step2b.mjs [t1|t2|t3|all]`. Read-only PostgREST with the
publishable key; deterministic fcose (randomize:false, phyllotaxis seeds) so
runs are comparable. Run log: `../runs/2026-08-18-trackb-step2b-prebuild.md`.
