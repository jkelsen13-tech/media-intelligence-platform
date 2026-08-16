# Run log — 2026-08-16 — Legal & Policy in-page de-beta (v11)

- Edit: 3 copy strings in src/views/Phase3View.jsx (h2, disabled notice,
  error notice). No other diff.
- `npm test`: 240/240. `npm run build`: clean.
- Push: commit fe4d0e7eed87a02c40330b0ca3f85c539c6399a9.
- Byte-verify: initial local hash a6a5591a vs remote e0674b76 — MISMATCH.
  Diff showed only `&` vs `&amp;` in the two rewritten notices (entity
  escaping; identical render). Adopted remote as canonical, local hash then
  e0674b76 MATCH; tests rerun against deployed file: 240/240.
- CI on fe4d0e7: test (x2) success, build success, deploy success.
- Live verification (Playwright chromium, production):
  - mobile 390px: More → Legal & Policy; .p3-banner h2 = "Legal & Policy";
    no "beta" in body text. Screenshot: live-p3-header-mobile-390px.png.
  - desktop 1280px: same result. Screenshot: live-p3-header-desktop.png.
