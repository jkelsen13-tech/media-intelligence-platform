# verifier v4 — Doc 13 per-site pagination pushes

Created: 2026-08-11 (goal-mode internal verifier for the Doc 13 remaining-site run).

Measures, per site:
1. Read-path change is limited to the authorized call site(s); no algorithm/schema/UI changes.
2. Local fixture proof exercises >1000 rows and names specific rows beyond position 1000 present in the consumed result.
3. Full `npm test` suite is green in a symlink-capable temp copy (`/tmp`), because `/mnt/agents` does not support npm bin symlinks.
4. Push is byte-verified: local `git hash-object <file>` equals `git rev-parse origin/main:<file>` after fetch.
5. One commit per site; test files are committed in the final test commit after all source sites are banked.

Differs from v3: v3 measured Track B graph-band layout; v4 measures Doc 13 pagination correctness and push byte-identity for edge-function/frontend read paths.
