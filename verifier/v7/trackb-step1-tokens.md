# v7 — 04_TRACK_B Step 1: Shared light-theme tokens

Created 2026-08-15. Scope per owner authorization 2026-08-15 (implementation
of the 2026-08-15 investigation items 5–9, with one owner adjustment).

## Scope

1. Migration: `pipeline_config.track_b_light_theme` flag, default `false`,
   withhold posture (false/missing/unreadable/any non-true => dark).
   File: `supabase/migrations/20260815_track_b_light_theme_flag.sql`.
2. Light token block under `[data-theme='light']` in `src/styles/tokens.css`;
   dark `:root` block left untouched as default. Values per Doc 04 Step 1
   locked mockups: canvas #F7F7F4, white reading surfaces, locked structural
   blue #156EBF, green/amber/red semantic status, purple+dashed for
   inferred, 1px neutral borders.
3. Flag reader: `src/lib/themeFlag.js` (`resolveTheme` / `applyTheme` /
   `applyThemeFlag`), called in `src/main.jsx` before first paint so there is
   no dark->light flash; any flag-read failure renders dark.
4. Hardcoded-hex audit and fix: all view CSS (`timeline.css`, `phase3.css`,
   `sourcecomparison.css`, `panels/review-status.css`, `styles/auth.css`),
   JS fallbacks (`src/graph/theme.js` upcoming topic/policy node types), and
   JSX inline-style fallbacks (`TimelineView.jsx`, `GroupedTimelineView.jsx`,
   `ArticlePanel.jsx`, `PolicyPanel.jsx`). New dark tokens added
   pixel-identical to the hexes they replace (no visual change in dark).
5. New `--cat-inferred` token (dark #6c71c4, light #7c3aed), paired with
   dashed borders for hypothesis/absence markers.

## Owner adjustment (2026-08-15)

The 13px -> 16–18px body-text change is HELD OUT of this pass. Rationale
(owner): font size affects layout/density, not just color; shipping it here
would muddy the before/after proof for the token rollout. Logged as its own
open item for a future decision (possibly folded into Step 4 News Feed work,
possibly standalone). See "Open items" below.

## Acceptance criteria (owner-specified, all five)

1. **Flag withhold unit test** — `tests/themeFlag.test.mjs`, 4 tests:
   exactly-true -> light; [false,null,undefined,'true',1,0,{},[],'light']
   all -> dark; applyTheme sets/removes `data-theme`; unknown theme never
   sets the attribute.
2. **Before/after screenshots** — header + all four tabs (News, Graph,
   Timeline, Arcs) in both themes against live data (752 articles).
   Programmatic check: body background rgb(11,11,10) dark / rgb(247,247,244)
   = #F7F7F4 light on every tab. Cytoscape canvas follows the theme because
   colors resolve via getComputedStyle at draw time.
3. **Accent-removal test** — Header and News Feed legible with accent color
   removed: hierarchy carried by typography/layout; status labels are text,
   never color-only.
4. **Contrast/focus checks** — WCAG AA 4.5:1 (relative luminance) on every
   light-theme text/background pair: 22/22 pairs >= 4.5:1. Three marginal
   values found and fixed during verification: --text-muted #73736a ->
   #6e6e65 (4.79), --status-green-text #1e7f43 -> #1a6f3a (5.43 on its bg),
   --status-blue-text #156ebf -> #1259a6 (5.94 on its bg). Locked accent
   #156EBF kept at 5.23:1 on white. Focus rings on `--focus-ring` /
   `--accent` in both themes.
5. **Live rollback drill** — flag true, confirm live light; flag false,
   confirm instant revert to dark (no redeploy; flag read happens at page
   load). Results recorded in the run log.

## Open items

- **Body text 13px -> 16–18px** (Doc 04 Step 1 spec): held out of this pass
  per owner 2026-08-15. Future decision: fold into Step 4 News Feed work or
  ship standalone. `--fs-body: 13px` remains unchanged in both themes.
- Three translucent rgba() overlays intentionally left as literals in
  phase3.css (rgba(181,137,0,.08), rgba(255,255,255,.02),
  rgba(108,113,196,.06)) — translucent overlays acceptable in both themes.

## Results summary

- Unit suite: 232/232 green (228 prior + 4 new themeFlag tests).
- Build: `vite build` green (pre-existing chunk-size warning unchanged).
- Contrast: 22/22 pairs AA-pass after the three fixes above.
- Screenshots: 8 PNGs (dark/light x news/graph/timeline/arcs), visually
  verified + programmatic body-background assertion.
- Pushes (all via GitHub API, blob SHA byte-verified):
  - c2122679 core: tokens.css (74e63586), themeFlag.js (4b266eb9),
    main.jsx (78b8896d), migration (c6534729), tests (a393ba8a)
  - 958a8212 hex-audit 1/3: theme.js (4a20aeb0), review-status.css
    (90a3c6f4), auth.css (ee3c7459)
  - ac4f2507 hex-audit 2/3: timeline.css (f10e0541), phase3.css (e8bbb05f),
    sourcecomparison.css (cedbf804)
  - e16c628c hex-audit 3/3: TimelineView.jsx (89b67dab),
    GroupedTimelineView.jsx (d67dda8e), ArticlePanel.jsx (fd3d9f7e),
    PolicyPanel.jsx (73d0ec6e)

Note: the sandbox /tmp working copy was wiped mid-session; the four JSX
blobs and all CSS/JS blobs were re-verified against remotely returned blob
SHAs (all matched the pre-wipe local SHAs where recorded; main.jsx,
migration, test, tokens.css verified by full-content download + assertion).
