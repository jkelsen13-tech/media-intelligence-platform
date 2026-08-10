# Verifier v3 — Track B Step 2: disconnected-node band (Knowledge Graph)

Created 2026-08-10. Scope: owner-approved option (b) — dedicated peripheral
band for zero-edge nodes (arc-hue ordered first, arc-less last), plus fcose
parameter tweaks (nodeRepulsion 8000→12000, cross-arc idealEdgeLength
260→320, padding 60→80). Positional grouping only — no fabricated edges.

## Measures

1. **Owner-required pair** (identical methodology BEFORE and AFTER —
   deterministic seeds, randomize:false, numIter 2500, fixed 1600×900
   fit-zoom assumption; harness `v3/measure-layout.mjs`):
   - label-box collision count (approx label boxes, same metrics as the
     graph label policy: 6.1px/char, 13px line, 120px wrap, 40-char truncation)
   - bounding-box area per node
2. **Unit suite**: `node --test tests/` — 145 baseline + 12 new band tests
   (`tests/bandPlacement.test.mjs`) = 157, must stay green.
3. **Live production checks** (Playwright, deployed Pages build): band
   visible with plain-text label, deterministic mode pixel-identical,
   drag-reheat exclusion, portrait adaptation — the four owner care points.
4. **Byte-verified push**: git blob SHA of every pushed file recomputed
   locally and compared against the GitHub blob SHA.

## BEFORE / AFTER numbers (live DB: 800 nodes, 450 edges, 252 zero-edge)

| metric | BEFORE (8000/260/60, no band) | AFTER (12000/320/80, band) | delta |
|---|---|---|---|
| label collisions @ fit-policy zoom, top-20 hubs | 12 | 0 (fit zoom 0.465 → no labels rendered) | n/a (see note) |
| label collisions @ zoom 0.9, top-20 hubs | 12 | 11 | −8% |
| label collisions @ zoom 1.2, all nodes | 20667 | 11729 | −43% |
| bounding box (model px) | 882×882 | 915×1593 | — |
| area per node | 973 | 1822 | +87% (deliberate: band + gap) |
| fit zoom (1600×900) | 0.884 | 0.465 | — |
| cluster-only bb / fit zoom | 882×882 / 0.884 | 795×795 / 0.93 | cluster tighter + cleaner |

Numbers above are the output of the committed harness
(`node verifier/v3/measure-layout.mjs`, run against live data on
2026-08-10) — anyone can reproduce them. Disclosure: a mid-session draft
of the harness used a coarser label-box approximation and recorded higher
collision counts (before: 23/22/19837; after: 0/11/11408); the geometry
metrics (bb, area/node, fit zooms, cluster-only numbers) are identical
across both. The committed-harness numbers supersede the draft ones.

Note on the 0 at fit-policy zoom: the AFTER fit zoom (0.465) is below the
0.6 label threshold, so no labels render at full fit — that 0 is honest
but not comparable. The zoom-matched rows (0.9 hubs, 1.2 all) are the
comparable evidence. The all-labels row improves −43%; the hub row is
roughly flat in-headless-approximation (12→11) — the visible qualitative
gain at 0.9x comes from the declutter pass and the band removal from the
cluster, not from hub geometry alone. Harness-vs-browser absolute scale
differs; harness numbers are used for relative comparison only.

## Care points (owner: confirm each explicitly)

1. **Drag-reheat excludes singletons — verified live.** Band nodes are not
   in the reheat element set (`dragfree` handler lays out connected∪edges
   only). Live pixel diff after dragging a band node: changes confined to
   the dragged node's neighborhood (x 503–703, y 890–959); the other 251
   band nodes pixel-identical, band grid intact. Cluster reheated as
   designed (10.4% of cluster region changed).
2. **Deterministic under `?layout=deterministic` — verified live.** Two
   full loads, canvas-wrap screenshots compared: 0 changed pixels of
   1,971,840 (0.0000%).
3. **restPositions/declutter capture runs after band placement — verified
   in code and live.** The band layoutstop handler is registered before
   the declutter section's `captureRest` (`cy.on('layoutstop', ...)`), so
   rest positions are captured only after band positions are set. Local
   production-build introspection (previous session): restPositions
   captured post-placement for all 800 nodes.
4. **Band adapts on mobile/portrait — checked live.** 430×900 viewport:
   portrait rule applied (band to the right of the cluster), same ordered
   grid, label follows pan/zoom. Disclosure: at 430px the whole graph
   cannot fit at minZoom 0.2 (pre-existing clamp property, unchanged by
   this work — zoom bounds were explicit non-scope), so the band is
   reached by panning; verified visible with label after a rightward pan.

## Files

- `src/graph/bandPlacement.js` — pure helper (split / order / place), no DOM.
- `tests/bandPlacement.test.mjs` — 12 unit tests.
- `src/graph/GraphView.jsx` — band integration, parameter tweaks, dragfree
  exclusion, band label.
- `src/index.css` — `.graph-band-label` rule (plain text, no box).
- `verifier/v3/measure-layout.mjs` — metrics harness (this folder).

Differs from prior version: first graph-layout verification; adds headless
fcose metrics harness. No schema changes; read-path rendering only.
