# Run log — 2026-08-17 — Track B Step 2 item 4 (plain-language edge labels)

Criteria: `verifier/v15/plain-language-edge-labels.md`. Script:
`verifier/v15/check_item4.py`.

## Commits (in order)

| Commit | Contents |
|---|---|
| `320106b34b4794d652b9eab68ed63afc6185fa64` | src/graph/theme.js (plain phrases + edgePlainLabel helper), src/graph/styles.js (edge.lbl rule with function label, ordered after base edge rule), tests/edgePlainLabel.test.mjs (new, 7 tests) |
| `e3d036fc89c8c224029c3485b69be85bd6da2b01` | src/graph/Legend.jsx (Label — "phrase" rows + distinction note), src/graph/EdgeEvidence.jsx (Meaning row, raw Relation kept), src/graph/EdgeList.jsx (plain Relationship column) |
| `078b2499d72b3852bf9062eca1d23ab963a52c05` | src/views/TimelineView.jsx, src/views/GroupedTimelineView.jsx, src/panels/ArticlePanel.jsx (all link/relation rendering via edgePlainLabel) |

## Byte verification (post-push, codeload tarball of main @ 078b2499)

All blob SHAs match the local working copy exactly:

- `4a5c8742beb6272724910b0f87a0681e14fa99f9` src/graph/theme.js
- `db525daa4d8b03b3a29c26dfe6f005fe47fd306e` src/graph/styles.js
- `5e6ba00860f3ffbeaf331cda9325b030fc2b03e5` tests/edgePlainLabel.test.mjs
- `e16b44ee649103323861f28d831d9c6c139656c6` src/graph/Legend.jsx
- `793578ea52d1f95700bb54ab5f2122b12901423c` src/graph/EdgeEvidence.jsx
- `72a887db8056d9819f71a3ff40f109f75af41d93` src/graph/EdgeList.jsx
- `8d4f097bcb676a08b537ee46a3fac37b15193d0d` src/views/TimelineView.jsx
- `540067d5d2e205d1048574c19a69f41056b6461a` src/views/GroupedTimelineView.jsx
- `85bb8fc3b37a3f638a91233d839ba7340eede8f4` src/panels/ArticlePanel.jsx

Full-tree `diff -r` (remote tarball vs local working copy): empty.

## Test / build (dev tree, item-4 working copy)

- `node --test tests/`: **253 pass, 0 fail** (246 prior + 7 new
  edgePlainLabel tests: every type has plain; causal = "led to";
  sequence = "happened before" and never /led to|caused/i; phrases
  differ across types; live vocabulary covered; unknown-type humanize
  fallback strips "type: " prefix; empty input returns '').
- `npm run build`: clean.

## Playwright (dev server on the item-4 tree, desktop 1280x800 + mobile 390x844)

```
[PASS] desktop/canvas-labels-present — labeled edges incl. sequence, zoom 1.5
[PASS] desktop/canvas-sequence-plain — every sequence edge shown='happened before'
[PASS] desktop/canvas-no-machine-vocab — violations=0
[PASS] desktop/legend-plain-phrases — Causal — "led to"; Sequence — "happened before"; Actor — "involves"
[PASS] desktop/legend-distinction-in-words
[PASS] desktop/grayscale-meaning-survives
[PASS] desktop/evidence-sequence-meaning — 'happened before — temporal order only, no causation claimed'
[PASS] desktop/evidence-raw-relation-kept — Relation: sequence: ... retained
[PASS] desktop/edge-list-plain
[PASS] desktop/timeline-plain — '(happened before)', no '(sequence:'
[PASS] mobile/legend-plain-phrases
OVERALL: PASS
```

Regression suites re-run on the same tree: v14 item-3 `OVERALL: PASS`;
v12 overlap `OVERALL: PASS`; v13 canvas `OVERALL: PASS`.

Screenshots (local evidence, `/mnt/agents/work/screenshots/`):
`2026-08-17-item4-desktop-grayscale.png` (legend under grayscale(1),
distinction note legible), `-item4-evidence-sequence.png` (Meaning +
raw Relation rows), `-item4-timeline.png`, `-item4-mobile-legend.png`.

## CI (check-runs)

- `320106b3`: test x2 success, build success, deploy success.
- `e3d036fc`: test x2 success, build success, deploy success.
- `078b2499` (tip): test x2 success, build success, deploy success.

## Findings / notes

1. **Cytoscape stylesheet-ordering bug (found and fixed during
   implementation).** The `edge.lbl` rule with a function `label` was
   originally placed BEFORE the base `edge` rule in the stylesheet
   array; cytoscape resolved the `label` conflict in file order and the
   base rule's `label: ''` won, so every edge label computed empty.
   Isolated empirically: the module and function were proven correct
   via dynamic import (`edgePlainLabel({type:'sequence',...})` =
   'happened before'), and re-setting the identical rule at the END of
   the stylesheet
   (`cy.style().selector('edge.lbl').style({label: fn}).update()`)
   worked immediately. Fix: the `edge.lbl` block now sits after the
   base `edge` block in src/graph/styles.js, with an explanatory
   comment so the ordering constraint is not re-broken.
2. **Design: single helper, one vocabulary.** `edgePlainLabel(edge)` in
   src/graph/theme.js is the only source of the plain-language phrase;
   canvas stylesheet, legend, evidence popover, relationship list, both
   timelines, and the article panel all consume it, so the vocabulary
   cannot drift between surfaces. Unknown future types humanize their
   raw label (stripping a "type: " prefix) rather than rendering
   machine vocabulary.
3. **Provenance preserved.** Plain language replaces machine vocabulary
   in the user-facing position only: EdgeEvidence keeps the raw DB
   label as a "Relation" row (extraction detail), and timeline badges
   still show the type key. The live data census (411 edges: 330 actor,
   80 sequence, 1 constrained_by; zero causal) means the causal branch
   of the Meaning row is exercised by unit tests, not live edges — no
   live edge currently claims causation, consistent with the backend's
   `counterfactual_test: 'sequence_only'` semantics.
4. **ArticlePanel raw-label path converted.** The connected-node meta
   line previously rendered the raw DB label (`c.rel`); it now renders
   `edgePlainLabel(c.edge) || edgeMeta?.label`, closing the last
   machine-vocabulary leak found during verification (the same pattern
   had already been fixed in both timeline views, inbound + outbound).
