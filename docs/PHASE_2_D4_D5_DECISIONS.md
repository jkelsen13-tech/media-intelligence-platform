# Phase 2 (02B) — Owner Decisions D4 and D5

> **SECOND ERRATUM (2026-07-30): both remaining gaps CLOSED.**
> Gap (1) — D4 rejection-audit sink — closed by migration
> `20260730030709 d4_rejection_audit` (repo commit `8a0b080a`):
> `publication_rejection_audit` table + `publish_explanation(uuid, text)` wrapper;
> fixtures proved audit persistence after rejected publish attempts.
> Gap (2) — automatic source-side trigger for D5 — closed by migration
> `20260730150925 d5_article_source_trigger` (repo commit `c2e9cc1d`):
> `articles.source_status` marking fields and a BEFORE UPDATE trigger delegating to
> `mark_source_change`; owner decision Q1-a skips withdrawn explanations from
> mutation (never requeued) while recording them in the audit payload counts;
> 11/11 acceptance fixtures passed. The design record below remains the
> requirement source, retained verbatim.

> **SUPERSEDED STATUS (erratum 2026-07-30):** The "NOT IMPLEMENTED" status below was
> true when recorded (2026-07-29, pre-implementation) but is no longer current. D4
> Layer 1 and D5 were implemented later on 2026-07-29 via migration
> `20260806_d4_d5_enforcement` (DB ledger version
> `20260729023113_d4_d5_publication_guard_and_source_change_propagation`):
> trigger `explanations_publication_guard` on `public.explanations` (enabled),
> function `public.mark_source_change`, audit table `public.source_change_events`.
> D4 Layer 2 read-path exclusion exists separately in
> `src/lib/explanationEligibility.js` + `src/lib/explanationReadPath.js`;
> `pipeline_config.provenance_ui = true` is live and owner-accepted.
> Remaining gaps: (1) no audit sink for D4 rejections; (2) no automatic
> source-side trigger for D5 — propagation requires calling `mark_source_change`.
> The design record below is retained verbatim as the requirement source.

Status: **owner-approved, recorded 2026-07-29. NOT IMPLEMENTED.** This document is a
design/decision record only. No enforcement machinery has been built. `provenance_ui`
remains false, the read path remains disabled, active crons remain 0, and no
production data was changed in recording this document.

Context: discovered during the Phase 2 final acceptance fixture slice
(`verifier/runs/2026-07-29_acceptance_fixtures_run6.md`). The missing-provenance
fixture showed publication of an insufficient-evidence row is not blocked at the
database level; the corrected-source fixture could not run because no propagation
machinery exists.

---

## D4 — Blocked from factual presentation (owner decision, verbatim)

> "Blocked from factual presentation must be enforced at two layers. A database
> constraint or trigger must reject publication when required provenance is missing
> or the assertion is in an insufficient-evidence state. The read path must
> independently exclude any assertion that is not presentation-eligible. Vocabulary
> convention alone is insufficient. Do not expose an assertion as established fact
> unless the documented provenance and review requirements are satisfied."

### D4 design implications (design record, not implemented)

**Layer 1 — database enforcement (constraint or trigger):**
- Affected table: `public.explanations`.
- Rule sketch: reject any transition of `review_status` to `published` (and any
  equivalent presentation-eligible status) when any of:
  - `supporting_passage IS NULL` (and no structured primary evidence present);
  - `state = 'insufficient_evidence'`;
  - required provenance fields carry explicit missing states
    (`archived_sources->>'status' = 'missing'` where the value is required,
    `falsification_condition` starting with 'missing:').
- Implementation choice (constraint vs trigger) deferred to the implementing run;
  a trigger is likely required because the rule spans multiple columns and JSONB
  internals.
- State transitions concerned: `awaiting_review → published`,
  `reviewed → published`, `corrected → published`, `disputed → published`.

**Layer 2 — read path (independent exclusion):**
- Affected code: future explanation read path (not yet built; gated on owner
  authorization of read-path enablement).
- Rule sketch: presentation-eligibility predicate evaluated at read time,
  independent of layer 1; anything not eligible is rendered via the 02B failure
  states (explanation_pending / insufficient_evidence / …), never as fact.
- Eligibility (design): `review_status = 'published'` AND `state = 'ok'` AND no
  required-field missing states.

**Audit requirements (D4):**
- Every rejected publication attempt should be recordable (table or log) with
  assertion_id, attempted transition, rejecting rule, and timestamp. Exact
  mechanism deferred to the implementing run.

**Acceptance tests (D4):**
1. Re-run fixture `edge:fixture-missing-provenance-*`: `UPDATE … review_status='published'`
   must be REJECTED by layer 1; fixture deleted afterward with zero-count proof.
2. A well-formed explanation (state ok, provenance populated) CAN transition
   through review to published (positive control; temporary, cleaned up).
3. Read-path predicate test (once read path is authorized): a published-flagged but
   ineligible row is still excluded at read time (defense in depth).

---

## D5 — Corrected/withdrawn source propagation (owner decision, verbatim)

> "When a source is corrected or withdrawn, every linked current assertion must be
> marked for renewed human review, removed from factual presentation until that
> review is complete, and linked to an audit record identifying the source change.
> Prior explanation versions and history must be preserved. The system must not
> automatically rewrite the truth of an assertion or republish it. Use the existing
> review vocabulary where possible; do not invent a new status without a separate
> schema decision."

### D5 design implications (design record, not implemented)

**Trigger event:** a source record (article/source row) is marked corrected or
withdrawn. The marking mechanism itself is part of the implementing run's scope.

**Propagation rule (design sketch):**
- Find every `public.explanations` row with `is_current = true` whose
  `source_ids` contains the corrected/withdrawn source id.
- For each: `review_status → 'awaiting_review'` (renewed human review) and
  `state → 'source_corrected'` or `state → 'source_withdrawn'` as applicable
  (both exist in the live enum — no new status invented).
- Removal from factual presentation follows from D4: these states are not
  presentation-eligible.
- **No automatic rewrite or republication**: after human review, transitions follow
  the normal review path; nothing auto-publishes.

**Versioning / history preservation:**
- Prior explanation rows are never updated in place for history-bearing fields;
  corrections create new versions (`version + 1`, `is_current` moved), and
  `correction_history` (JSONB) records who/what changed it, why, and when —
  per 02B review-and-correction behavior. Whether propagation itself creates a new
  version or updates the current row's review fields is an implementation detail
  to be decided in the implementing run; history must be preserved either way.

**Audit requirements (D5):**
- Each propagation event writes an audit record: source id, nature of change
  (corrected vs withdrawn), affected assertion_ids, timestamp, actor/mechanism.
- Affected table candidates: a new audit table (e.g. `source_change_events` /
  `propagation_audit`) — exact schema deferred to the implementing run; creating it
  is a migration requiring owner authorization.
- Dependent assertions must be linkable back to the source-change audit record.

**Acceptance tests (D5):**
1. Corrected-source fixture: mark a fixture source corrected; verify every linked
   current explanation moves to `awaiting_review` + `state='source_corrected'`,
   an audit record exists, prior versions/history intact. Cleanup with zero-count
   proof.
2. Withdrawn-source fixture: same with `state='source_withdrawn'`.
3. Negative control: an assertion NOT linked to the changed source is untouched.
4. No auto-republish: propagated rows cannot return to presentation without passing
   the review path (composes with D4 layer 1).

---

## Recording constraints honored

Documentation only. No migration, no trigger, no constraint, no flag change,
`provenance_ui=false`, read path disabled, active crons = 0, production data
unchanged (579 explanation rows, verified pre/post). Implementation of D4/D5
requires a separate authorized run.
