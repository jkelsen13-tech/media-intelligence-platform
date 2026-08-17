# v14 — Desktop default to focused subgraph (Track B Step 2 item 3)

Created 2026-08-17. Verifies that on desktop the Knowledge Graph renders
the top hub's focused (depth-2) subgraph by default instead of the full
750-node graph, that the full graph remains reachable through an
explicit, discoverable opt-in, and that mobile behavior is unchanged
(item 3 is desktop-scoped; mobile was not in scope).

## Acceptance gate (owner, verbatim)

"confirm live on desktop that the focused subgraph is the default render,
not full graph; confirm full graph remains reachable via an explicit,
discoverable opt-in (not buried); confirm mobile behavior is unaffected
unless mobile was already in scope for this item — if it wasn't, say so
explicitly rather than silently touching it."

Mobile was NOT in scope for item 3. Two mobile-visible side effects are
disclosed in the run log (fit-fix improvement to the mobile hub-subgraph
view; trail opt-in label now reads "Show full graph (750 nodes)" on all
viewports). Neither changes mobile navigation semantics.

## Criteria

1. **Default render is the focused subgraph (desktop).** First Graph
   paint on desktop (1280x800) renders the top hub's depth-2 subgraph —
   cytoscape node count strictly less than the full-graph total
   (live: 20 of 750 nodes, 22 edges around hub "Middle East") — not the
   full graph.
2. **Default state is labeled, not silent.** The focus trail shows a
   non-interactive crumb "Default focus: Middle East" so the user can
   tell they are looking at a focused view, not the whole graph.
3. **Full graph is an explicit, discoverable opt-in.** The same trail
   carries a "Show full graph (750 nodes)" button (adjacent to the
   default-focus crumb, not buried in a menu). Clicking it renders all
   750 nodes and clears the trail.
4. **Discoverable return.** While the full graph is shown by opt-in,
   the toolbar carries a "Focused view: Middle East" button that
   restores the default subgraph (rendered count returns to 20).
5. **User focus semantics unchanged.** Search-selecting a node still
   pushes a real interactive focus crumb that replaces the synthetic
   default crumb; focus-stack navigation (crumbs, back) is untouched.
6. **Mobile unchanged.** Mobile (390x844) entry is still the ranked hub
   list; no synthetic "Default focus" crumb and no "Focused view"
   toolbar button are ever synthesized on mobile; the hub-list →
   full-graph path still renders all 750 nodes.
7. **Fit correctness (fix verified live).** The initial subgraph render
   is fitted to the viewport (pre-fix regression: fcose's pre-settle
   fit left focused subgraphs at zoom ~2.5-2.9, mostly off-canvas, on
   desktop AND mobile openHub). Post-fix: constructor layout runs with
   `fit: false` plus a one-shot `layoutstop` fit (80px padding);
   resetLayout uses the same pattern. Band path unchanged.
8. **Regression floor.** Full unit suite 246/246 green (240 prior +
   6 new desktopFocus tests); v12 overlap suite and v13 canvas suite
   re-run green on the item-3 tree; clean build; byte-verified pushes;
   CI green on every item-3 commit.

## Method

- Playwright script: `v14/check_item3.py` (criteria 1-6; desktop
  1280x800 + mobile 390x844; cytoscape instance read via the
  container's `_cyreg.cy` registry — no debug globals required).
  Writes timestamped screenshots to the local evidence folder.
- Fit correctness (criterion 7): bounding-box/zoom probes during
  implementation (pre-fix zoom 2.54 static vs Fit-button 0.39; post-fix
  initial 0.526 vs Fit 0.544 — correctly fitted).
- Byte verification: fresh codeload tarball of `main` after the final
  push; `git hash-object` on every item-3 file must equal the local
  working-copy blob SHA; full-tree `diff -r` must be empty.
- CI: check-runs endpoint on each commit (test x2, build, deploy).

Differs from prior version: first navigation-default criterion set;
asserts rendered-graph cardinality against the live total (via the
cytoscape registry) rather than DOM text alone, and adds the first
mobile-unchanged invariant with explicit side-effect disclosure.
