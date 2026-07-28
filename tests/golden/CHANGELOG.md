# Golden set revision history

| Date | Change | Why | Author |
|------|--------|-----|--------|
| 2026-07-28 | Initial golden set: sanitization (14), classification (6 category + 5 process + 2 title), relationships (8 pipeline + 8 guard), actors/duplicates, cleanup; harness ports of ingest-rss @ 445503ee with bug variants; drift guards; r5 constraint artifact | G1 creation after Phase 0 items 1–6 verified | Phase 0 repair run (owner-authorized G1) |
| 2026-07-28 | Added `fixtures/uncertainty_vocabulary.json`: machine-checkable encoding of the locked G2 shared uncertainty vocabulary (6 axes, level sets, precedence rules, 33-row legacy mapping, 3 disagreement cases). Fixture only — drift-guard tests deferred to owner approval per `docs/G2_FIXTURE_EXTENSION_PROPOSAL.md`. No suite behavior change. | G2 vocabulary lock (single-source requirement, machine-checkable requirement) | G2 vocabulary run (owner-authorized) |
