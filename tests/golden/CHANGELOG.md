# Golden set revision history

| Date | Change | Why | Author |
|------|--------|-----|--------|
| 2026-07-28 | Initial golden set: sanitization (14), classification (6 category + 5 process + 2 title), relationships (8 pipeline + 8 guard), actors/duplicates, cleanup; harness ports of ingest-rss @ 445503ee with bug variants; drift guards; r5 constraint artifact | G1 creation after Phase 0 items 1–6 verified | Phase 0 repair run (owner-authorized G1) |
| 2026-07-28 | Added `fixtures/uncertainty_vocabulary.json`: machine-checkable encoding of the locked G2 shared uncertainty vocabulary (6 axes, level sets, precedence rules, 33-row legacy mapping, 3 disagreement cases). Fixture only — drift-guard tests deferred to owner approval per `docs/G2_FIXTURE_EXTENSION_PROPOSAL.md`. No suite behavior change. | G2 vocabulary lock (single-source requirement, machine-checkable requirement) | G2 vocabulary run (owner-authorized) |
| 2026-07-28 | Drift-guard implementation after owner countersign: `harness/vocabulary.mjs` (canonical P1–P5 + legacy-mapping functions), `vocabulary_drift.test.mjs` (13 tests: fixture integrity, doc/fixture sync, 34 mapping cases, 4 precedence cases, no-rival-definition, retired-signal, tamper mutation proof), `fixtures/uncertainty_mapping_cases.json`. Suite 34 → 47 tests, all green. | G2 spec locking requirement 5 (machine-checkable) + deliverable 3, owner-approved | G2 drift-guard run (owner-approved) |
| 2026-08-06 | Source Comparison (Item 1, Batch 2): `fixtures/source_comparison.json` (sc-fixture-v1, synthetic 3-outlet event + wire syndicate), `source_comparison.test.mjs` (12 tests: shared-fact exact outlet sets, distinct-fact non-merge, syndication collapse, omission vs coverage_unknown, floor gating, single-source state, no-composite-score, loaded-language spans, explanation-row provenance, URL canonicalization, paraphrase threshold), `supabase/functions/source-comparison-run/loadedLanguageLexicon.json` (ll-v1, 19 terms, 5 categories). Suite 47 → 59 tests. | Owner-authorized Item 1 implementation run, decisions locked 2026-08-06 | Item 1 Batch 2 run (owner-authorized) |

<!-- CI note 2026-08-06: commit 57c59e4d workflows were cancelled by runner-queue
     starvation (test job never assigned a runner; no steps executed). This line
     re-triggers CI on identical code. -->
