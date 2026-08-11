# Run log — 2026-08-12 — 00_INDEX Doc 13 checkpoint + token scrub

## Live census (criterion 2)
- command: `curl -X HEAD ... /rest/v1/{entities,nodes,edges,articles}?select=id` with Prefer: count=exact, publishable key
- exit: 0
- values: entities 963, nodes 750, edges 411, articles 752 (content-range totals). Zero-delta vs 2026-08-10 20:03 UTC census — expected (sites 6–9 read-path-only; crons active=false).

## Token scrub (criterion 4)
- command: DELETE /applications/{client_id}/grant (programmatic revoke attempt)
- exit: HTTP 401 — OAuth grant revocation requires the app client_secret, not available in sandbox; server-side revoke flagged to owner (GitHub Settings → Applications).
- command: rm token/device-flow files; `git config --unset credential.helper`; `GIT_TERMINAL_PROMPT=0 git push --dry-run`
- exit: push fails `could not read Username` — no usable credentials remain in sandbox. CONFIRMED locally.

## Edit checks (criteria 1, 3)
- values: docs/00_INDEX.md — header fold-in sentence added; working-documents table gains 04_ADDENDUM_STEP3_ARC_GROUPED_TIMELINE (CLOSED 2026-08-10), 05_CROSS_WINDOW_NAVIGATION (shipped/CLOSED), 13_SCALING_PAGINATION_CEILING (CLOSED 2026-08-12, final commit 8d6f8ef); 07 row already correct (ingestion complete / extraction held) — annotated, text unchanged in substance; new "Doc 13 — CLOSED 2026-08-12" checkpoint section with full site ledger + fresh census; checklist gains three entries.
- command: `git diff --stat` pre-commit
- exit: 0 — single file docs/00_INDEX.md modified, insertions only (no deletions of prior content).
