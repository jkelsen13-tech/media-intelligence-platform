# Verifier v5 — 00_INDEX Doc 13 checkpoint update (2026-08-12)

Criteria:
1. Doc 13 status recorded CLOSED with final commit 8d6f8ef and the full
   nine-site ledger with commits/proofs as reported to the owner.
2. Post-close core-table census (entities, nodes, edges, articles) read FRESH
   from live PostgREST at edit time — not copied from the 2026-08-10 census.
3. Three stale working-document status fields corrected (04 addendum Step 3,
   05 cross-window navigation, 07 Callais canary) — text-only changes; no
   other content altered (Rule 14 reconciliation discipline).
4. Session git token destroyed locally (file + credential helper removed;
   git write confirmed unauthenticated). Server-side OAuth grant revoke is
   owner-side (GitHub settings) — recorded honestly in the session report.
5. Push byte-verified: local `git hash-object` == remote blob sha for every
   committed file.
