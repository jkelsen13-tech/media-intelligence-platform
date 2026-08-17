# v13 — Graph canvas/token restyle (Track B Step 2 item 2)

Created 2026-08-17. Verifies the Step 2 item 2 visual restyle of the
Knowledge Graph against the Doc 04 design intent: light warm-gray canvas,
white nodes with colored borders (type = border color + shape), neutral
default edges (type color only on selection/highlight), graph-paper grid
in canvas space, and plain view controls replacing the joystick metaphor.

## Acceptance gate (owner)

"Canvas/tokens: accent-removal test passes on Graph (same bar as
Header/News Feed already met)."

The v7 accent-removal bar: with hue removed (grayscale filter over the
whole app), every piece of meaning must survive as labeled text, shape,
or position — no information channel may rely on color alone.

## Criteria

1. **Plain controls.** Exactly four buttons in `.graph-view-controls`:
   `+`, `−`, `Fit`, `Reset`. Zero `.pan-joystick*` / `.pan-zoom-*`
   artifacts anywhere in the DOM, desktop and mobile.
   ("Expand" from the original spec wording is covered by Fit/Reset/zoom;
   hub/topic expansion stays in the focus controls. Flagged to owner in
   the item-2 closure report for correction if a distinct Expand control
   was intended.)
2. **Light canvas live.** `data-theme="light"` active (flag
   `track_b_light_theme` = true), `--graph-grid` resolves to
   `rgba(26, 26, 23, 0.08)` — dark ink on the warm-gray canvas, visible.
3. **White nodes.** Node fill = `--bg-panel` (white in light theme);
   node type carried by border color + shape (screenshot evidence).
4. **Neutral edges at rest.** Base edge style line/target-arrow =
   `--cat-grey`; `:selected` and `.highlighted` edges paint in their
   EDGE_TYPES color. Programmatic proof: selected `sequence` edge
   reports `rgb(109,40,217)` (= light `--cat-violet`) at width 2.5px
   (rest width + 1).
5. **Live edge vocabulary covered.** EDGE_TYPES includes the types the
   live data actually uses (2026-08-17 census: actor 330, sequence 80,
   constrained_by 1; zero causal/conflict/financial/documentary) —
   `sequence` and `constrained_by` entries added so selection coloring
   can fire on real data.
6. **Accent removal (grayscale).** With `filter: grayscale(1)` on the
   app root: legend rows carry text labels for every node type (Event,
   Actor, Institution, Document, Anomaly, Topic, Policy) and every edge
   type (Causal, Actor, Financial, Conflict, Documentary, Sequence,
   Constrained by, Sourced, MIP hypothesis); legend explains the
   neutral-edge encoding in words ("Edges are neutral grey until
   selected…"); node-type meaning also carried by shape. Screenshot
   evidence in grayscale.
7. **Regression floor.** Full unit suite 240/240 green; clean build;
   byte-verified pushes; CI green on every item-2 commit.

## Method

- Playwright script: `v13/check_item2.py` (checks 1, 2, 6 + mobile
  parity; writes `item2-results.json` and timestamped screenshots).
- Programmatic selection proof (criterion 4): separate Playwright run
  selecting the highest-weight `sequence` edge via the cytoscape
  instance and reading its computed style.
- Byte verification: fresh codeload tarball of `main` after the final
  push; `git hash-object` on every item-2 file must equal the local
  working-copy blob SHA; full-tree `diff -r` must be empty.
- CI: check-runs endpoint on each commit (test ×2, build, deploy).

Differs from prior version: first canvas-visual-encoding criterion set;
adds computed-style assertions on cytoscape elements (not just DOM) and
extends the v7 accent-removal bar to the Graph tab.
