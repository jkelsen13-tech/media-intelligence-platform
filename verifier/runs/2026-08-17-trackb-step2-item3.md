# Run log — 2026-08-17 — Track B Step 2 item 3 (desktop focused-subgraph default)

Criteria: `verifier/v14/desktop-focused-subgraph-default.md`. Script:
`verifier/v14/check_item3.py`.

## Commits (in order)

| Commit | Contents |
|---|---|
| `4e9c2e5c5f444eda2f0968b6fe9e68937ce64783` | src/lib/desktopFocus.js (new), tests/desktopFocus.test.mjs (new, 6 tests), src/graph/GraphView.jsx (stale-fit fix) |
| `524c3de206790e8dbed3b093e6400e3f1a16c659` | GraphView.jsx transcription fixup (two slips in 4e9c2e5c, self-caught by post-push hash verification: band maxCols term, redundant Math.max nesting — corrected before any further writes) |
| `2a6b924a1695c49f9efa9f13cc26da95a0258a69` | src/App.jsx (desktopShowAll state, resolveFocal wiring, synthetic default crumb, opt-in/opt-out controls) |
| `916bd7dbaaffdd58da7eae6790545e4759244afe` | src/index.css (.focus-crumb-static, .graph-toolbar-focus-btn) |

## Byte verification (post-push, codeload tarball of main @ 916bd7db)

All blob SHAs match the local working copy exactly:

- `466cdbb7e46039f0d58328028db43fd80ecb849e` src/lib/desktopFocus.js
- `42941b27bbd428d2d507e1c510c6b37c8ff2c818` tests/desktopFocus.test.mjs
- `a4795a01ae17c8b3d026a4e718be437a49ebfa8f` src/graph/GraphView.jsx
- `ae521897f0b748418fbd5ee7c84c7164f28a15fb` src/App.jsx
- `12a74de8b3ed652166020d1e555f3189e447dab7` src/index.css

Full-tree `diff -r` (remote tarball vs local working copy): empty.

## Test / build (fresh copy of the verified tarball)

- `npm ci` clean; `node --test tests/`: **246 pass, 0 fail** (240 prior
  + 6 new desktopFocus tests: stack wins / desktop synthetic default /
  showAll suppresses / mobile never / null hub / slug fallback).
- `npm run build`: clean (6.95s).

## Playwright (dev server on the verified tree, desktop 1280x800 + mobile 390x844)

```
[PASS] desktop/default-is-subgraph — rendered=20 total=750 edges=22
[PASS] desktop/default-focus-crumb — crumb='Default focus: Middle East'
[PASS] desktop/optin-explicit — optin='Show full graph (750 nodes)'
[PASS] desktop/optin-renders-full-graph — rendered=750 total=750
[PASS] desktop/trail-clears-on-full
[PASS] desktop/return-control-discoverable — return='Focused view: Middle East'
[PASS] desktop/return-restores-subgraph — rendered=20 expected=20
[PASS] desktop/search-pushes-real-crumb — crumbs=['Commodity Futures Trading Commission']
[PASS] desktop/static-crumb-replaced
[PASS] mobile/entry-still-hub-list
[PASS] mobile/no-synthetic-focus
[PASS] mobile/show-all-still-full-graph — rendered=750 total=750
OVERALL: PASS
```

Regression suites re-run on the same tree: v12 overlap `OVERALL: PASS`;
v13 canvas `OVERALL: PASS`.

Screenshots (local evidence, `/mnt/agents/work/screenshots/`):
`2026-08-17-item3-desktop-default-focus.png` (fitted 20-node subgraph,
"Default focus: Middle East" + "Show full graph (750 nodes)"),
`-item3-desktop-full-graph.png` (750 nodes + "Focused view: Middle East"
toolbar button), `-item3-mobile-hub-list.png`, `-item3-mobile-full-graph.png`,
`-item3-mobile-hub-subgraph.png`.

## CI (check-runs)

- `4e9c2e5c`: test x2 success, build success, deploy success.
- `524c3de2`: test x2 success, build success, deploy success.
- `2a6b924a`: test x2 success, build success, deploy success.
- `916bd7db` (tip): test x2 success, build success, deploy success.

## Findings / notes

1. **Stale-fit bug (fixed during implementation, disclosed).** fcose's
   own `fit: true` fires before the simulation settles, so focused
   subgraphs rendered at zoom ~2.5-2.9, mostly off-canvas (bounding-box
   probe: 1302x1218 model px at zoom 2.86; the Fit button corrected to
   0.39). This was PRE-EXISTING and also affected the mobile openHub
   subgraph view. Fix: non-band constructor layout runs `fit: false`
   with a one-shot `layoutstop` fit (80px padding); resetLayout uses
   the same pattern; band path unchanged. Post-fix initial zoom 0.526
   vs Fit 0.544 — correctly fitted. MOBILE SIDE EFFECT: the mobile
   openHub subgraph view is now fitted too (was equally broken). This
   is a bug fix, not a behavior change; mobile navigation semantics are
   untouched.
2. **Mobile label change (disclosed).** The trail opt-in button now
   reads "Show full graph (750 nodes)" on all viewports (previously
   "Show all"), because the trail now also serves the desktop default
   state. Mobile entry (hub list) and the mobile-bar "Show all"/"Hub
   list" toggle are unchanged.
3. **Transcription fixup.** Commit `4e9c2e5c` contained two hand-
   transcription slips in GraphView.jsx (a band maxCols term and a
   redundant Math.max nesting), caught immediately by the mandatory
   post-push hash verification and corrected in `524c3de2` before any
   further writes. Byte verification above covers the corrected tree.
4. **Design: synthetic focal crumb.** The desktop default focus is
   resolved by `src/lib/desktopFocus.js` (pure function, 6 unit tests):
   the focus stack always wins; only with an empty stack, desktop, and
   no full-graph opt-in does the synthetic top-hub crumb apply. It is
   never pushed onto the stack, so it renders as documentation
   ("Default focus: …") rather than a fake breadcrumb, and any real
   user focus replaces it cleanly.
