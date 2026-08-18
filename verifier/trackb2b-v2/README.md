# trackb2b-v2 — Step 2b FINAL-implementation re-confirmation (2026-08-18)

Created 2026-08-18, after implementation. The owner required the three
verification tests re-confirmed against the SHIPPED code, not just the
pre-build harness (trackb2b-v1). This version therefore imports the actual
shipped seams — `src/graph/cardRegions.js` (relaxCards, regionBoundaries,
cardRegime, collapsedCounts, CARD_W/CARD_H, CARD_ZOOM_MIN…),
`src/lib/desktopFocus.js` (focusDepth) — and re-runs the three tests against
the live corpus, plus a real-browser DOM smoke of the built bundle.

## Pass criteria (fixed before running; same thresholds as v1)

T1 mobile reflow (390×844, 360×800, focusDepth(true)=1):
  a) shipped focusDepth returns 1 for mobile, 2 for desktop;
  b) focused depth-1 subgraph with shipped CARD_W×CARD_H clears to ZERO card
     overlaps via shipped relaxCards; fit zoom >= 0.45; region labels inside
     the viewport.
T2 200% text scaling:
  a) card text is DOM by construction — static guard: `.graph-card` CSS uses
     px font sizes in the DOM layer (browser text scaling applies) and no
     canvas label carries node text at card zooms (applyLabels suppression
     is unit-pinned in tests/cardRegions.test.mjs via cardRegime);
  b) shipped cardRegime gates compact below CARD_ZOOM_MIN=1.0 and cards at
     reading zooms; region labels are DOM (.graph-region-label).
T3 dense states (full 750-node corpus):
  a) full-corpus view renders NO boundaries (focused=false path — unit-pinned
     via regionBoundaries gating in GraphView + smoke assertion);
  b) zoom-gated reading: at desktop z2 / mobile z1+z2 hub-centered
     viewports, shipped relaxCards clears visible-card overlaps to ZERO;
  c) boundary hulls in focused views enclose no foreign node centers;
  d) "+N" counts from shipped collapsedCounts sum correctly.
Accent removal: grayscale screenshot inspection — card structure (icon,
name, date, type label), region dashes + labels, and legend remain legible
with all color removed.

Harness: `measure-final.mjs`. Browser smoke: `smoke-dom.sh` (vite preview +
headless Chromium, DOM assertions + screenshots at 390px and desktop, normal
and grayscale-filtered). Run log: `../runs/2026-08-18-trackb-step2b-final.md`.
Differs from v1: v1 measured a MODEL of the design; v2 measures the SHIPPED
modules and the BUILT bundle. No production code lives under verifier/.
