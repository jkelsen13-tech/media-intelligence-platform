# Run log — 2026-08-17 — Track B Step 2 item 1 (graph chrome overlap fix)

Environment: sandbox Linux, Python 3.12, Playwright sync API (standalone
script), Chromium headless. App served by `npx vite` dev server from an
unpacked codeload tarball of `main` @ 4a98d402 (github.com:443 unreachable
from sandbox; codeload.github.com tarball is the fetch path).

## Steps

1. `npm ci` (in /tmp — the persistent mount does not support symlinks).
2. `npm test` → **240/240 pass, 0 fail** (duration ~4.1s).
3. Dev server on 127.0.0.1:5199, base `/media-intelligence-platform/`,
   live Supabase data (752 articles, full graph).
4. `python3 check_overlap.py` → 8 states × 12 chrome pair-checks.

## Results (clip-aware geometry)

| State | Result | Overlaps |
|---|---|---|
| desktop/baseline | PASS | 0/12 |
| desktop/topics-open | PASS | 0/12 |
| desktop/edge-list-open | PASS | 0/12 |
| desktop/review-status-open | PASS | 0/12 |
| desktop/search-open | PASS | 0/12 |
| mobile/baseline | PASS | 0/12 |
| mobile/legend-expanded | PASS | 0/12 |
| mobile/topics-open | PASS | 0/12 |

OVERALL: PASS

Raw-rect note: the first run flagged mobile/topics-open
(.topic-browser × .graph-stage, ~80,677 px²). Visual inspection of the
screenshot showed the panel fully in-flow above the canvas — the raw rect
of a child inside the `overflow-y: auto` rail overreports. The checker was
made clip-aware (rects intersected with ancestor overflow clip boxes) and
the state passes on geometry as well as visually. Screenshots:
`2026-08-17-item1-{desktop,mobile}-{graph,topics}.png` and
`2026-08-17-item1-mobile-legend-expanded.png` (kept with this run's
working files).

## Regression found and fixed during verification

App.jsx pushed at 657c6f08 contained a transcription regression: the
mobile bottom-nav `onClick` evaluated a boolean instead of calling
`setMoreOpen(true)`/`setView(v.key)`, silently breaking all mobile tab
navigation. The Playwright mobile run caught it (hub list unreachable).
Fixed in 4a98d402; full diff of the corrected file against the pre-item-1
App.jsx shows only the intended item-1 restructure. Suite rerun 240/240
on the corrected tree; all geometry states rerun PASS on the corrected
build.

## Byte verification

codeload tarball of main after each push; `git hash-object` on extracted
files. Final state:

- src/App.jsx: 9aae9338b8c9087ee7cb656422749d921fedfb7b — MATCH
- src/index.css: 285aac6e878f95191237f91fd5b5c307ad633cd8 — MATCH
- src/styles/news.css: eb129d20e4361793ccfe0d400d4439121c034c5f — MATCH
- src/graph/edge-list.css: c63f8014fb170a86418ac207ea81313c577145b5 — MATCH
- src/graph/TopicBrowser.jsx: 65b8833afe7e2ffa6d64cd4748833021456ec0b5 — MATCH

CI: blank.yml runs on push to main; status checked via commit check-runs
(see session report).
