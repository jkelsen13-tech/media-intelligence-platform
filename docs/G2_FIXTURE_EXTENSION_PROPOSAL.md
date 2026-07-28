# G2 — Golden-Fixture Extension Proposal (wiring the lock into the G1 suite)

**Status:** proposal. Per G2 spec deliverable 3, the drift-guard *tests* below are implemented
only after the owner approves the locked vocabulary. The vocabulary JSON fixture itself
(`tests/golden/fixtures/uncertainty_vocabulary.json`) ships with the lock as the
machine-checkable encoding of the vocabulary (Decision D-12).

## What ships now (with the lock)

- `tests/golden/fixtures/uncertainty_vocabulary.json` — canonical encoding of all six axes:
  level sets, ordering, precedence rules, legacy mappings, worked-example row ids, and the
  three acceptance disagreement cases. Any later code or doc change that silently alters a
  level meaning must diverge from this file.

## What is proposed (post-approval, next authorized run)

1. **`tests/golden/vocabulary_drift.test.mjs`** — drift guards:
   - Parse `docs/UNCERTAINTY_VOCABULARY.md`; assert every level name in the JSON fixture
     appears in the doc with unchanged spelling and ordering (single-source guard).
   - Assert no rival definition: grep `src/`, `supabase/`, and `docs/` (excluding the
     vocabulary doc itself and this proposal) for level names used with a different
     definition pattern, and for retired display terms (`heavy`, `medium`, `light`,
     `% documented`, `MIP-hypothesis`, raw `reliability` numerals) in user-facing copy.
   - Assert the JSON's worked-example ids still match their stated live state where a
     read-only DB check is configured (skipped without credentials, mirroring the existing
     harness pattern).
2. **Mapping fixtures** — `tests/golden/fixtures/uncertainty_mapping_cases.json`: the 33-row
   legacy mapping table as input→expected-level pairs, so any future ingestion/classification
   change that alters a mapping path fails CI.
3. **Disagreement-case fixtures** — the three cases from the vocabulary doc (reliable/weak,
   causal/contested, reviewed/high-U) as precedence-rule unit tests against a pure
   `resolvePresentation(axes)` helper to be introduced by the phase that adopts the
   vocabulary in code.
4. **Changelog discipline** — all of the above land with entries in `tests/golden/CHANGELOG.md`
   under golden-set-class review, same rules as the G1 suite.

## Non-goals (this proposal)

No implementation of the tests above, no schema columns (F-01/F-02/F-03), no UI changes
(F-04), no production mutations.
