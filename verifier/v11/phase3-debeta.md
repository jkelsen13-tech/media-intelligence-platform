# v11 — Legal & Policy in-page de-beta (2026-08-16)

Scope: presentational only. Same ruling as v10, applied to the Legal &
Policy (Phase 3) screen.

## Criteria
1. `src/views/Phase3View.jsx` h2 reads exactly "Legal & Policy".
2. No user-facing "beta" string remains on that screen (header, subtitle,
   disabled notice, error notice, tooltips, aria-labels). Code comments and
   identifiers naming the phase3_beta flag are not screen copy.
3. Diff limited to three copy strings; no logic/routing/data changes.
4. Full suite green; build clean; byte-verified push; CI green.
5. Live screenshots mobile (390px) and desktop with programmatic h2 check.

## Results
- h2: "Legal & Policy" (was "Legal & Policy — internal closed beta").
- Disabled notice: "Legal & Policy is currently unavailable." (was
  "Phase 3 is an internal closed beta… (phase3_beta flag off)").
- Error notice: "Legal & Policy view failed to load." (was "Phase 3 beta
  view failed to load.").
- Subtitle: no beta copy (unchanged). No title= tooltips or aria-labels
  exist in this view. Live body-text scan on both viewports: "beta" absent.
- Tests: 240/240 (rerun against the exact deployed file). Build clean.
- Commit fe4d0e7. Byte-verify: first comparison flagged a mismatch —
  transcription used `&` where I pushed `&amp;` (JSX entity, consistent
  with the file's own style; renders identically). Resolved by adopting
  the remote file as canonical; blob e0674b76 then MATCH, tests rerun green.
- CI on fe4d0e7: test x2, build, deploy — all success.
- Live: mobile 390px + desktop 1280px via More → Legal & Policy;
  .p3-banner h2 = "Legal & Policy" exactly on both. Screenshots:
  live-p3-header-mobile-390px.png, live-p3-header-desktop.png.
