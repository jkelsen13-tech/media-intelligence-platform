# verifier/v8 — Track B card-radius 20px change

Created: 2026-08-15. Scope: owner-approved change of `--card-radius` 8px → 20px
(deliberate departure from the original 4–8px Track B spec), applied uniformly
to rectangular content cards; pills/badges and small controls keep their own radii.

## Criteria checked
1. Token value: `--card-radius: 20px` in src/styles/tokens.css `:root`.
2. Radius audit: every rectangular content-card class resolves through the
   token — 23 previously hardcoded card radii (6px/8px/10px) moved to
   `var(--card-radius)` across 7 stylesheets (index.css, edge-list.css,
   phase3.css, sourcecomparison.css, timeline.css, news.css, review-status.css).
3. Out of scope, confirmed untouched: pills/badges (999px/50%), small
   controls (2–6px), buttons (6–8px), mobile sheet tops (14px 14px 0 0),
   focus-outline radius (4px), border widths, spacing, all other tokens.
4. Full test suite green (233/233) and `vite build` green.
5. Byte-verified push: local git-blob SHA1 == GitHub API blob SHA for all
   8 modified files.
6. Visual: all 6 tabs (News, Graph, Timeline, Arcs, Source Comparison,
   Legal & Policy) screenshotted at 20px in light theme; no bubble-like
   small cards; pills proportionate next to larger card radius.
7. CI green at the new HEAD (Golden regression + Pages deploy).
8. Live production bundle serves `--card-radius: 20px` (only declaration).

## Results
- 1: PASS — tokens.css blob c1358e77.
- 2: PASS — audit table below; blob SHAs in run log.
- 3: PASS — confirmed by reading every border-radius declaration in the
  changed files post-edit.
- 4: PASS — 233/233 tests; build 6.87s (pre-existing chunk-size warning).
- 5: PASS — 8/8 SHAs match (commits c123cd83 + 04ebb359).
- 6: PASS — 6 screenshots reviewed (r20-*.png); .timeline-toggle (32px
  square at 20px) reads as a round button, not a bubble; review pills and
  status chips unchanged and proportionate.
- 7: PASS — both workflows success at 04ebb359 (and c123cd83).
- 8: PASS — live asset assets/index-1ugBINzW.css contains only
  `--card-radius: 20px`.

## Radius audit (hardcoded card radii moved to token)
- index.css: .legend (8), .legend-collapsed (8), .graph-controls (8),
  .focus-trail (8)
- graph/edge-list.css: .edge-list (8)
- views/phase3.css: .p3-banner (6), .p3-case (8), .p3-privacy-banner (6),
  .p3-open-banner (6), .p3-verdict (6), .p3-ev (6), .p3-segment (6)
- views/sourcecomparison.css: .sc-banner (8), .sc-event (8), .sc-claim (6),
  .sc-empty/.sc-single-source (6), .sc-surface (6)
- styles/timeline.css: .timeline-range-filters select/input (6)
- styles/news.css: .news-search (8), .graph-search input (8),
  .graph-search-results (8)
- panels/review-status.css: .review-status (10)

Already on the token before this change (auto-inherit 20px): .news-card,
.news-detail, .timeline-card, .timeline-search, .timeline-toggle,
.arc-list-item, .arc-status-panel, .arc-coverage-gap, .arc-empty,
.arc-milestone, .hub-item, .gap-bar, .edge-evidence, .sky-badge, .pp-center.

## Note on delivery
The first push_files call returned "Service temporarily unavailable"; a
read-only state check (Rule 9) confirmed nothing had landed (HEAD still at
773c7ac6, all 8 remote blobs at pre-push SHAs) before the retry. The retry
was split into two commits (7 small files c123cd83, then index.css
04ebb359) — no partial or duplicate application.
