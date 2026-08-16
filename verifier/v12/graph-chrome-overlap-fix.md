# v12 — Track B Step 2 item 1 — Graph chrome overlap fix

Date: 2026-08-17
Scope: Knowledge Graph tab chrome layout. Overlap bug: floating
`.edge-list-toggle` buttons and absolute-positioned Legend / EdgeControls /
focus-trail / `.graph-search` could collide with or overlay the cytoscape
canvas; TopicBrowser rendered as a sheet-backdrop modal over the canvas.

## Change set (all byte-verified on remote)

| File | Blob SHA | Commit |
|---|---|---|
| `src/graph/TopicBrowser.jsx` | 65b8833afe7e2ffa6d64cd4748833021456ec0b5 | c7dd837 |
| `src/graph/edge-list.css` | c63f8014fb170a86418ac207ea81313c577145b5 | 787ce134 |
| `src/styles/news.css` | eb129d20e4361793ccfe0d400d4439121c034c5f | 787ce134 |
| `src/index.css` | 285aac6e878f95191237f91fd5b5c307ad633cd8 | 01af311 |
| `src/App.jsx` | 9aae9338b8c9087ee7cb656422749d921fedfb7b | 4a98d402 |

Note: commit 657c6f08 carried an App.jsx with a transcription regression
(bottom-nav `onClick` reduced to a no-op boolean expression, breaking all
mobile tab navigation). Caught by Playwright mobile run, fixed in 4a98d402;
diff against pre-item-1 App.jsx (01af311 tree) confirms only intended
item-1 changes plus this fix. The incident is recorded here because the
regression shipped to main for one commit window.

## What changed

- Graph chrome moves into normal flow: `.graph-toolbar` (search +
  "Relationship list" / "Review status" buttons) across the top, then the
  focus trail, then `.graph-body` = `.graph-rail` (Legend + EdgeControls +
  docked TopicBrowser when open) beside `.graph-stage` (canvas).
- `.edge-list-toggle` class retired. Floating toggles were the overlap
  bug; do not reintroduce it.
- TopicBrowser is a docked rail panel (`role="dialog"` div), no longer a
  sheet-backdrop modal.
- Mobile (<768px): same in-flow structure — toolbar wraps, rail becomes a
  horizontal strip above the canvas (`max-height: 40vh`, `overflow-y:
  auto`).

## Acceptance criteria (all must PASS)

1. Clip-aware geometry: no bounding-box overlap between any chrome pair
   (toolbar, rail, legend, controls, topics panel, focus trail, canvas
   stage) in every tested state. Clip-aware = element rects intersected
   with ancestor overflow clip boxes, so scrollable-rail content is not
   misreported as overlay. Verifier: `v12/check_overlap.py`.
2. States tested: desktop 1280×800 — baseline, topics-open,
   edge-list-open, review-status-open, search-open; mobile 390×844 —
   baseline, legend-expanded, topics-open.
3. Screenshots for human review in each screenshot state (desktop: graph,
   topics; mobile: graph, topics, legend-expanded).
4. Full test suite green (240/240) against the exact pushed tree.
5. Byte verification: remote blob SHA (via codeload tarball of main +
   `git hash-object`) matches the local working copy for every file in
   the change set.

## Result: PASS (all criteria)

Run log: `runs/2026-08-17-trackb-step2-item1.md`.
