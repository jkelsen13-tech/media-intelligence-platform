# trackb3-v1 — Track B Step 3 item 1: shared epistemic component kit

Created 2026-08-18. Namespace: `trackb3-vN` (prefixed, per the 2026-08-17
namespace fix — flat integers collided across tracks; this prefix is
sequential within Track B Step 3 and cannot collide with `lineage-vN`).

## What this item is

The addendum (04_ADDENDUM_SIX_SCREEN_REFERENCE_SPEC, "System conventions
shared across all seven screens") directs that the cross-screen epistemic
elements be implemented ONCE as shared components. Investigation at baseline
(HEAD e3fafd5d) found them present only as vocabulary/patterns
(`reviewStatusBadge` tones, RelationshipPanel honest tones, per-view chip
CSS), not as reusable components. Item 1 extracts them into
`src/components/` + `src/lib/epistemicModel.js` (pure seam), so Screens 4
and 5 consume one implementation.

## Acceptance criteria

1. **Badge system matches the addendum exactly.** Three states — Confirmed
   (green, check icon), Contested (orange, question icon), Inferred (purple,
   question icon, DASHED treatment). Icon + color + text, never color alone.
   The dashed treatment on Inferred is load-bearing and marked in CSS.
2. **Grayscale legibility by construction.** The three states differ in
   icon (check vs question), border style (solid vs dashed), and text label
   — three redundant non-color channels. Pinned by unit test.
3. **Evidence-state bar cannot be summed.** `EvidenceStateBar` takes exactly
   three counts (supporting/contested/missing); its source contains no
   addition operator and no "total" label (static drift-guard test, same
   style as tests/atomicAttach15A.test.mjs). Sublabels: "Confirmed reports"
   / "Open or disputed" / "Not yet reported".
4. **Guardrail 4 is structural, not copy.** When missing > 0, a scope string
   is required; absent scope renders an explicit "scope not recorded" state,
   never silence. Pinned by unit test on the pure seam.
5. **Unknown inputs degrade honestly.** Unknown badge state → no badge (the
   ArcsView "no derivable status => no dot" precedent). Unknown type pill →
   humanized label, never raw machine vocabulary (v15 precedent).
   `confidenceToBadgeState` NEVER maps any confidence value to 'contested' —
   contested requires an explicit dispute signal, never absence/low
   confidence.
6. **Token-driven only.** No hardcoded hex in the new files (same bar as
   the Step 1 hex audit); both themes render from existing tokens.
7. **Suite stays green** (270 baseline + new tests) and `vite build` clean.
8. **Byte-verified push, CI green** on the commit.

## Checker

Static/unit: `node --test tests/epistemicComponents.test.mjs` plus the full
suite. Hex audit: grep of new files for `#[0-9a-fA-F]{3,8}` must be empty.

## Run log

`verifier/runs/2026-08-18-trackb-step3-item1.md`
