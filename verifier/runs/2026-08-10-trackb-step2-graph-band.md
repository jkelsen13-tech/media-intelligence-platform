# Run log — 2026-08-10 — Track B Step 2: disconnected-node band

Scope: owner-approved option (b) + parameter tweaks. Non-scope honored: no
zoom-bound / wheel / keyboard changes, no focused-subgraph redesign.

## Commits (main)

| commit | content |
|---|---|
| `5cec58e0` | src/graph/bandPlacement.js + tests/bandPlacement.test.mjs |
| `a36ce31c` | src/graph/GraphView.jsx (band integration + params) |
| `9db34829` | src/index.css (.graph-band-label) |
| `99a487e4` | verifier v3 measures doc + metrics harness |
| (this push) | verifier v3 run log + README entry |

Disclosure: fragmented into 3 source commits + 2 docs commits (push tooling
has no squash; remote state verified after each).

## Byte verification (local git blob SHA vs GitHub blob SHA)

| file | remote SHA | status |
|---|---|---|
| src/graph/bandPlacement.js | f0773da92686b60407b77864d537cacec6db4f72 | match |
| tests/bandPlacement.test.mjs | e97965b79c3f8b733f0f51e777552033cc98d83a | match |
| src/graph/GraphView.jsx | f1df5e4632454059a3ff53a4725e2c0ec643ac8c | verified via raw re-download hash |
| src/index.css | 8361e93e4ebbd7eb809bab92f5812f97b9e7fde1 | match |

Note: the GraphView.jsx blob SHA recorded mid-session (pre-push workspace)
could not be reproduced after /tmp was wiped; the remote blob was instead
re-downloaded raw and re-hashed (f1df5e46, matches the API), content
inspected (all intended changes present, no debug lines), and functional
equivalence re-established by re-running the full suite + production build
at HEAD: 157/157 tests pass, build clean (6.67s).

## CI at HEAD 9db34829

- Golden regression suite: success
- Deploy to GitHub Pages: success
(also green at 5cec58e0 and a36ce31c)

## Metrics

BEFORE/AFTER table: see v3/graph-band.md (numbers are the committed
harness's reproducible output; a mid-session draft approximation recorded
higher collision counts — superseded, disclosed in the v3 doc). Headline:
all-label collisions 20667→11729 @1.2 (−43%), hub collisions 12→11 @0.9,
area/node 973→1822 (+87%, deliberate band+gap), cluster-only fit zoom
0.884→0.93.

## Live production checks (Playwright, Pages build)

- Desktop 1920×1080: band below cluster, arc-hue-ordered rows then
  arc-less; label "No documented connections (252)" visible at band
  top-left. Screenshot: part3-live-desktop.png.
- Deterministic: two ?layout=deterministic loads → 0/1,971,840 changed px.
- Drag-reheat exclusion: band node dragged; pixel diff confined to dragged
  node's neighborhood; band grid intact; cluster reheated.
  Screenshots: _drag2_before/_drag2_after, part3-live-after-drag.png.
- Portrait 430×900: band placed to the right (portrait rule); reachable by
  pan; label follows. Pre-existing minZoom clamp means the full graph does
  not fit at 430px without pan (unchanged behavior, zoom bounds non-scope).
  Screenshots: part3-live-portrait.png, part3-live-portrait-band.png.

Evidence screenshots: doc04add-evidence/ (delivered with the report).
