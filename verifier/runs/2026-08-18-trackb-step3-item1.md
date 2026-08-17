# Run log — Track B Step 3 item 1 (shared epistemic component kit)

Date: 2026-08-18. Verifier: trackb3-v1. Baseline HEAD: e3fafd5d.

## Environment note
The persistent mount blocks exec bits, so dependency install + test/build
runs execute in a `/tmp` copy (established pattern, verifier v4). Master
working copy: `/mnt/agents/work/media-intelligence-platform` (git-clean,
synced via rsync for each run).

## Baseline
- `node --test tests/` at e3fafd5d: 270/270 PASS — matches the Index
  figure recorded at the sky-flag closure.

## Item 1 results
1. Badge vocabulary/icon/dash/label invariants — PASS (unit).
2. Unknown badge state => null (no badge) — PASS (unit).
3. `confidenceToBadgeState`: confirmed/corroborated=>confirmed,
   inferred=>inferred, unknown=>null; 11-probe sweep shows NO value maps to
   contested — PASS (unit).
4. Type pills: seven locked labels verbatim; humanized fallback
   ('court_order' => 'Court order'); unrenderable => null — PASS (unit).
5. `validateEvidenceCounts`: exactly three frozen keys; rejects negative /
   fractional / string / missing / null — PASS (unit).
6. Guardrail 4: `missingScopeRequired` true exactly when missing > 0;
   fallback string "Scope of “not yet reported” not recorded" — PASS (unit).
7. `reviewedLine`: passes real dates through as "Reviewed …"; null/blank =>
   null (line omitted, never fabricated) — PASS (unit).
8. Static drift guard: EvidenceStateBar.jsx (comments stripped) contains no
   addition operator and no aggregate label — PASS.
9. Hex audit: no `#[0-9a-f]{3,8}` in any of the 8 new kit files — PASS
   (unit-pinned, repeats every run).
10. Full suite: 284/284 PASS (270 baseline + 14 new).
11. `vite build`: clean, 6.96s. (Pre-existing >500kB chunk-size warning
    unchanged; the kit is not yet imported by any screen, so it is correctly
    absent from the shipped bundle until item 2 consumes it.)

## Push record
Commit 1 (code + tests): d1e1abaa9ba56f0114e706310788f6efd59505e0.
Byte verification: all 10 remote blob SHAs match locally computed
`git hash-object` values —
- src/lib/epistemicModel.js 783abb3f8cea4b3fe208efee52005ba0f641eaa9 MATCH
- src/components/StatusBadge.jsx 46a37a66fcaf28cc5e64f99a22fac904e1830c7f MATCH
- src/components/EpistemicBanner.jsx 51ccdc25ac07b072913ad9da008b5f3d0c9f5134 MATCH
- src/components/EvidenceStateBar.jsx 9f7b6fb83e60e2fa898ede7d4b17c33b214f31fb MATCH
- src/components/TrustFooter.jsx 0966b7f7787055d5cab9c4acbce2525ed23684d8 MATCH
- src/components/RemainingUncertaintyBlock.jsx 8882a8efae1e6be4cada2210567649b6761c80bd MATCH
- src/components/TypePill.jsx 2b3afc0ec146c29a8d3f4b913db9d5ace4f1f1fa MATCH
- src/components/SourceAttributionLine.jsx 9bed36951940769ddc3589b15fb656a4b022f97d MATCH
- src/components/epistemic.css 89df8a91a1f1d1f5bd03b4446260736aa85d9392 MATCH
- tests/epistemicComponents.test.mjs f4b30364f97a6a0d80f78cb837c69fc3d51220ea MATCH
Commit 2 (verifier docs): this file + trackb3-v1 criteria + README index
entry. Blob SHAs and CI verdicts appended after landing.
