# Pass 2 Closure Note — Erratum (2026-07-30)

Authority: owner-accepted verification run 2026-07-30 (read-only). This document
corrects the uploaded Pass 2 closure note (`PASS2_CLOSURE_NOTE_2026-07-30.md`,
owner-held file, not committed to this repo).

## Corrections

1. **Closure note §4 risk 5 is struck.** It stated D4/D5 enforcement machinery was
   "still not built" and that no trigger prevents publishing an
   insufficient-evidence row. False. Verified live 2026-07-30:
   - D4 Layer 1: trigger `explanations_publication_guard` (BEFORE INSERT OR UPDATE,
     enabled) on `public.explanations`; function rejects review_status='published'
     unless state='ok', supporting_passage non-empty, falsification_condition
     present and not 'missing:%'. Migration ledger version
     `20260729023113_d4_d5_publication_guard_and_source_change_propagation`
     (repo file `supabase/migrations/20260806_d4_d5_enforcement.sql`).
   - D5: `public.mark_source_change(uuid, text, text, text)` +
     `public.source_change_events` audit table (0 rows — never invoked).
   - D4 Layer 2: read-path exclusion in `src/lib/explanationEligibility.js` +
     `src/lib/explanationReadPath.js`; `pipeline_config.provenance_ui = true` live.
2. **Closure note §5 recommendation is struck.** "Implement D4 Layer 1" is no
   longer the next task — it already exists. Do not re-implement.
3. **`docs/PHASE_2_D4_D5_DECISIONS.md` status header superseded** (see its erratum
   block). The design record body remains the requirement source.

## Remaining real gaps (carried forward as the open D4/D5 work)

1. D4 rejection-audit recording missing — guard raises an exception but persists
   no audit record (design record requires: assertion_id, attempted transition,
   rejecting rule, timestamp).
2. D5 has no automatic source-side trigger — propagation requires an explicit call
   to `mark_source_change`; the source-marking mechanism itself is undefined.

## State confirmation (verified pre- and post-inspection, identical)

581 total / 579 current explanations; ok 42; insufficient_evidence 533;
source_unavailable 4; reviewed 10; withdrawn 2; awaiting_review 567; published 0;
edges 372; provenance_ui=true; active crons 0; duplicate current assertion_ids 0;
backups explanations_pass2_backup_20260730=579, edges_pass2_a2_backup_20260730=1.
No rows, code, flags, crons, publications, or backups were changed by the
verification run or by this erratum.

## Closing addendum (2026-07-30, documentation-only sync)

Both remaining real gaps listed above are now CLOSED:

1. **D4 rejection-audit recording** — closed by migration
   `20260730030709 d4_rejection_audit` (repo commit `8a0b080a`):
   `publication_rejection_audit` table + `publish_explanation(uuid, text)` wrapper;
   fixtures proved audit persistence after rejected publish attempts.
2. **D5 automatic source-side trigger** — closed by migration
   `20260730150925 d5_article_source_trigger` (repo commit `c2e9cc1d`):
   `articles.source_status` marking fields + automatic BEFORE UPDATE trigger;
   owner decision Q1-a skips withdrawn explanations from mutation while recording
   them in the audit payload; 11/11 acceptance fixtures passed.

No database rows, code, flags, crons, publications, or backups were changed by this
addendum.
