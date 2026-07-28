# Phase 1 (02A) Closure Record

Status: **verified — closed.** Both owner decisions were approved by the owner
on 2026-07-28, as documented in this record.

## Owner decisions

- Amendment A (no composite legal alignment percentage; six independent
  dimensions): **APPROVED** — the six dimensions remain independent (never
  averaged into a master score), and the no-guilt/innocence limitation is
  retained as binding.
- Amendment B (Sky Verification → Probabilistic Location Corroboration):
  **APPROVED** — the feature is named "Probabilistic Location Corroboration."

## Specification commit

- Base: `4ef8e9ffe7e0047ba805f6964425e84d19a844c0`.
- Specification HEAD: `54b32f0cd1eb685391930139a869aff2ec2d4cde`
  (byte-verified against base: change set = exactly the 10 intended files).

## Changed files

- `docs/LEGAL_METHODOLOGY_PLAN.md` (new — Amendment A)
- `docs/LOCATION_CORROBORATION.md` (new — Amendment B)
- `docs/PHASE_1_CLOSURE_RECORD.md` (this record)
- `sky-verification-ios/README.md` (deprecation note)
- `src/index.css` (comment terminology)
- `src/lib/sky.js` (comment terminology; identifiers unchanged)
- `src/lib/supabase.js` (comment terminology; identifiers unchanged)
- `src/panels/ArticlePanel.jsx` (user-facing label → "location-corroborated")
- `src/panels/SkyBadge.jsx` (user-facing label → "Location corroboration")
- `src/views/NewsView.jsx` (user-facing label + companion hint)

## Files searched for obsolete terminology

- All `*.md`, `*.jsx`, `*.js`, `*.sql` in the repository (excluding
  `node_modules`): searched for `sky verification`, `sky-verified`,
  `verdict-evidence alignment`, `alignment %`, composite legal/guilt/innocence
  score terms.

## Remaining deliberate references (deprecated, clearly marked)

- `public.sky_verifications` table, `edges.sky_verified` column — schema
  identifiers; rename requires a separate migration plan (out of 02A scope).
- `supabase/migrations/20260729_sky_verification.sql` — historical migration
  record, not edited.
- `sky-verification-ios/` folder and Swift type names — historical prototype;
  deprecation note added to its README.
- Code identifiers (`sky.js`, `SkyBadge.jsx`, `sky*` CSS classes,
  `loadSkyVerification*`) — internal identifiers, not user-facing labels;
  deprecation noted in `docs/LOCATION_CORROBORATION.md`.
- `docs/UNCERTAINTY_VOCABULARY.md`, `docs/UNCERTAINTY_LEGACY_MAPPING.md`,
  `docs/G2_DECISION_LOG.md` — locked G2 records referencing `sky_verified` as
  a data-model fact; not amended (G2 is locked and out of scope).

## No production behavior change

- No database migration added or modified; no production mutation performed.
- No edge function, cron, or deployment change.
- Changes are specification documents, comments, and user-facing label strings
  in the repository only. Golden suite: 47/47. `vite build`: pass.
