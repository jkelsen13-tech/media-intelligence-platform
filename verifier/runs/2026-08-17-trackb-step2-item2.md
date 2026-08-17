# Run log — 2026-08-17 — Track B Step 2 item 2 (canvas/token restyle)

Criteria: `verifier/v13/graph-canvas-restyle.md`. Script:
`verifier/v13/check_item2.py`.

## Commits (in order)

| Commit | Contents |
|---|---|
| `aeba5e9062f7186f081e3d524c211583d91a257d` | src/graph/{styles.js, theme.js, GraphView.jsx, GraphViewControls.jsx (new), Legend.jsx, bandPlacement.js} |
| `693322c83416448393ae171ee72bd696c0d12ce1` | src/styles/tokens.css, src/App.jsx (controlsDimmed prop rename) |
| `8a8a01d9f78626b62bd87820e4da44f7f2639e75` | src/index.css (.graph-view-controls replaces .pan-joystick*; legend swatches use --bg-panel fill) |
| `43bca1b05f4226a91e662f54104db0ad2a42333f` | delete src/graph/PanJoystick.jsx |

## Byte verification (post-push, codeload tarball of main @ 43bca1b0)

All blob SHAs match the local working copy exactly:

- `9334b6de334ff3f26bb462f8fecd88aea36fcba8` src/graph/styles.js
- `d48fcf9a76f7e8a2ceb2750481c9fbf67d3fe1ff` src/graph/theme.js
- `5320a01a82d4d946205af2c822486624c2c06622` src/graph/GraphView.jsx
- `03b441c3f9f74b2c9db32683dcc9179fcd473539` src/graph/GraphViewControls.jsx
- `20cd306f1ba5bbf38cd304d6db678304fde5755e` src/graph/Legend.jsx
- `fc92655ee8c39451bd9a835e4c83b342ebb25913` src/graph/bandPlacement.js
- `ca6abe030eab1243cd92ab59d56c23a80c3efc60` src/styles/tokens.css
- `261c3ed7332380744df6f81a624efdfc9060822f` src/index.css
- `724bd60085a5520ee80cdbee80d4507b92ed54ef` src/App.jsx
- src/graph/PanJoystick.jsx: ABSENT (correct)

Full-tree `diff -r` (remote tarball vs local working copy): empty.

## Test / build (fresh copy of the verified tarball)

- `npm ci` clean; `node --test tests/`: **240 pass, 0 fail**.
- `npm run build`: clean (7.12s).

## Playwright (dev server on the verified tree, desktop 1280×800 + mobile 390×844)

```
[PASS] controls/plain-buttons — labels=['+', '−', 'Fit', 'Reset']
[PASS] controls/no-joystick-dom — joystick nodes=0
[PASS] canvas/light-theme-active — {'page': '#F7F7F4', 'grid': 'rgba(26, 26, 23, 0.08)', 'theme': 'light'}
[PASS] canvas/grid-token — rgba(26, 26, 23, 0.08)
[PASS] selection/panel-opens — node=Commodity Futures Trading Commission
[PASS] controls/fit-reset-run
[PASS] grayscale/legend-text-labels — 20 legend rows
[PASS] mobile/controls-plain-buttons — labels=['+', '−', 'Fit', 'Reset']
[PASS] mobile/no-joystick-dom — joystick nodes=0
OVERALL: PASS
```

Programmatic selection proof (criterion 4): highest-weight `sequence`
edge selected via the cytoscape instance → computed `line-color:
rgb(109,40,217)` (light `--cat-violet`), width 2.5px (rest 1.5 + 1).
Edges at rest render neutral grey; grid visible in canvas space.

Screenshots (local evidence, `/mnt/agents/work/screenshots/`):
`2026-08-17-item2-desktop-graph.png`, `-desktop-selected.png`,
`-desktop-grayscale.png`, `-mobile-graph.png`,
`-postpush-graph.png`, `-postpush-edge-selected.png`
(violet selected Sequence edge, grey edges at rest).

## CI (check-runs)

- `aeba5e90`: test ×2 success, build success, deploy success.
- `693322c8`: test ×2 success, build success, deploy success.
- `8a8a01d9`: test success on one workflow; remaining runs cancelled —
  superseded within seconds by `43bca1b0` (normal concurrency cancel).
- `43bca1b0` (tip): test ×2 success, build success, deploy success.

## Findings / notes

1. **Live edge vocabulary mismatch (fixed during implementation).**
   Pre-item-2 EDGE_TYPES keyed causal/financial/conflict/documentary,
   but the 2026-08-17 live census is actor 330, sequence 80,
   constrained_by 1 (zero of the legacy four). Without adding
   `sequence` + `constrained_by` entries, the selected-edge type color
   could never fire on real data. Verified live with the violet
   Sequence edge screenshot.
2. **"Expand" interpretation.** The spec phrase "plain Fit/Reset/Expand
   controls" was read as Fit/Reset plus zoom (+/−), with hub/topic
   expansion already handled by the focus controls. Flagged to the
   owner for correction if a distinct Expand control was intended.
3. Item 1 overlap geometry (v12) remains green on this tree — the
   `.graph-stage`/rail structure is unchanged; only visual tokens and
   the controls layer moved.
