# MIP — Index and Governing Rules

> **Authoritative. Adopted by the owner 2026-07-29; fixture-run results folded in 2026-07-31 per Rule 14** as the Index amendment
> superseding the 2026-07-26 checkpoint. All governing rules, shared vocabulary,
> integration seams, and the execution contract are carried forward unchanged
> unless explicitly noted below.

Always attach this document. Attach exactly one active working document with it.

## Purpose and authority

*(Unchanged from the 2026-07-26 Index.)* This is the permanent constitution for the
Media Intelligence Platform build. The Index owns current status; if another document
disagrees with the Index, the Index wins. Working documents own requirements and
acceptance criteria for their scope. Working-document numbers are filenames, not
project phases.

## Working documents

| Document | Scope | Current use |
|---|---|---|
| 00_INDEX | Governing rules, shared vocabulary, integration seams, current checkpoint | Always attach |
| 01_PHASE_0_REPAIR | Correctness repair and regression protection | **Closed — verified** |
| 02A_PHASE_1_AMENDMENTS | Spec amendments only | **Closed — verified** |
| 02B_PHASE_2_PROVENANCE | Per-assertion provenance and explanation objects | **Closed — owner sign-off 2026-07-31** (read path live with provenance_ui=true; 567 rows awaiting human review as post-closure work) |
| 02C_PHASE_3_LEGAL_POLICY | Policy lifecycle and curated legal-case layer | Waiting |
| 03_BACKLOG | Later features and captured ideas | Waiting |
| 04_TRACK_B_DESIGN | Light, open public-knowledge visual system | Step 1 may run in parallel; all other steps gated |
| MIP_MASTER_PLAN | Consolidated owner reference | Archive, not an execution prompt |

## Governing rules

*(Unchanged: rules 1–12 carry forward verbatim — Phase 0 priority; one active scope
per run; combined shared-screen work; verify actual content; diagnose→fix→adversarial
gate pipeline; byte-verify every push; no success by absence; no silent connector
loops; failed calls may have side effects; every positive control is temporary; do
not advance while a gate is pending; byte and database state outrank progress
narration.)*

## Shared uncertainty vocabulary

*(Unchanged. Locked under G2 — see `docs/G2_DECISION_LOG.md` and
`docs/UNCERTAINTY_VOCABULARY.md`, owner-countersigned 2026-07-28. Six dimensions:
source reliability, evidence strength, authentication, relationship type, review
status, remaining uncertainty. Missing evidence is not contradicting evidence.)*

---

## Authoritative current checkpoint

Checkpoint supplied by the owner: **2026-07-29** (supersedes 2026-07-26 ET / 2026-07-27 database date).

### Phase 0 — verified-closed

All six items verified, including Tier 3 gate round 3 (independent adversarial gate
against the r5-amended r4 constraint — passed), Item 4 (timeline UX/dedup),
Item 5 (state/interaction bugs), and Item 6 (duplicate Iran actor node —
migration `20260728015537_tier6_iran_actor_dedup`; backups
`nodes_tier6_iran_backup_20260728`, `edges_tier6_iran_backup_20260728`).
Live constraint: `public.edges.edges_causal_evidence_guard` (r4 form + r5 amid fix),
`convalidated=true`. Golden regression suite G1: **47/47 PASS**.

### G2 — locked

Shared uncertainty vocabulary locked and owner-countersigned 2026-07-28
(`docs/G2_DECISION_LOG.md`, `docs/UNCERTAINTY_VOCABULARY.md`,
`docs/UNCERTAINTY_LEGACY_MAPPING.md`, fixture `tests/golden/fixtures/uncertainty_vocabulary.json`).

### Phase 1 (02A) — verified-closed

Closure record: `docs/PHASE_1_CLOSURE_RECORD.md` (closure commit `e3d28ad5`,
2026-07-28). Amendment A (no composite legal alignment percentage; six independent
dimensions) — APPROVED. Amendment B (Sky Verification → Probabilistic Location
Corroboration) — APPROVED. Spec HEAD `54b32f0c`, byte-verified, 10-file change set.
No production behavior change; golden suite 47/47.

### Phase 2 (02B) — CLOSED (owner sign-off 2026-07-31)

Completed steps:
- Schema migration `20260728142816_explanations_schema` (canonical explanation object;
  unique partial index `explanations_one_current_per_assertion`; CHECK-constrained
  enum vocabulary).
- D3 evidence capture: migration `20260728145132_evidence_capture_columns`; ingest-rss
  v22 deployed (7 scoped evidence-capture hunks; r5 guard inputs unchanged; HEAD
  `c23bb71a` byte-verified). Applies only to ingestion after 2026-07-28.
- **D2 = 3a sample backfill (2026-07-29): 15 explanation rows — 5 edges,
  5 arc assignments, 5 classifications, `rule_version='d2-3a-sample-backfill-r1'`,
  machine / awaiting_review, explicit missing states, idempotent (verified re-run = 0
  inserts). Owner-accepted as a bounded owner-review artifact only.**
  Full scope, field mappings, enum vocabulary, and verification evidence:
  `verifier/v1/D2_SAMPLE_SCOPE_AND_RULES.md` and `verifier/runs/2026-07-29_*.md`.
- **Full D2 explanations backfill (owner-authorized 2026-07-29): complete and
  verified — 579 explanation rows, 0 duplicate current assertion_ids, all
  machine / awaiting_review with explicit missing states.**
- **D4/D5 database enforcement (2026-07-29): migration
  `20260806_d4_d5_enforcement` — publication-guard trigger on
  `public.explanations` (D4 layer 1), `public.source_change_events` audit table,
  and `mark_source_change` propagation function (D5). Applied; fixtures passed;
  no production data change. Migration-timestamp reconciliation completed.**
- **Read-path eligibility layer (2026-07-29): `src/lib/explanationEligibility.js`
  (D4 layer 2 predicate, commit `cdfe8ec1`) and integration read path
  `src/lib/explanationReadPath.js` (commit `0eb526ed`), each byte-verified.
  Test suite 63/63; build green.**
- **Read-path enablement (owner-authorized and verified 2026-07-29):
  `provenance_ui` flipped false → true (only mutation). Post-enable smoke tests
  passed 14/14 through the real read path against the live database. Owner
  reviewed the live site with `provenance_ui=true` and accepted the behavior.
  No rollback required. All 579 explanations remain excluded pending human
  review: 543 rows have state=insufficient_evidence, 36 have state=ok, all 579
  have review_status=awaiting_review, 0 are published, and all 579 remain
  blocked by an explicit `missing:` falsification condition (corrected
  2026-07-29; previously misreported as "36 under_review").**
  Evidence: `verifier/runs/2026-07-29_flag_enable_run1.md`,
  `verifier/runs/2026-07-29_read_path_integration_run1.md`,
  `verifier/runs/2026-07-29_scope_reconciliation_0eb526ed.md`.
- **D4/D5 enforcement erratum and gap record (2026-07-30):** read-only verification
  confirmed D4 Layer 1 (trigger `explanations_publication_guard`, enabled) and D5
  (`mark_source_change` + `source_change_events`, 0 invocations) are live; D4 Layer 2
  read-path exclusion confirmed in code; counts re-verified identical pre/post.
  Both recorded gaps are now CLOSED (see the two bullets below). See
  `docs/PASS2_CLOSURE_ERRATUM_2026-07-30.md`.
- **D4 rejection-audit (2026-07-30): CLOSED.** Migration
  `20260730030709 d4_rejection_audit` — `publication_rejection_audit` table and
  `publish_explanation(uuid, text)` SECURITY DEFINER wrapper; fixtures proved audit
  persistence after rejected publish attempts. Repo commit `8a0b080a`, byte-verified.
- **D5 automatic source-side trigger (2026-07-30): CLOSED.** Migration
  `20260730150925 d5_article_source_trigger` — `articles.source_status` marking
  fields (active/corrected/withdrawn, plus changed-at and note columns) and a
  BEFORE UPDATE trigger that fires only on transitions into corrected/withdrawn and
  delegates to `mark_source_change`. Owner decision Q1-a: explanations whose
  review_status is withdrawn are skipped from mutation (never requeued) but are
  recorded in the audit payload (linked / mutated / skipped-withdrawn ids and
  counts). 11/11 acceptance fixtures passed, including withdrawn-row preservation,
  no-auto-republish composition with the D4 guard, atomicity, and zero-residue
  cleanup. Repo commit `c2e9cc1d`, byte-verified. New pre-migration backup
  `articles_pre_d5_backup_20260730` (572 rows) retained — do not drop.
- **CI repair (2026-07-30):** commit `6838e7f6` — golden vocabulary-drift false
  positive (a Pass 2 fixture identifier read as a vocabulary level token) fixed by
  minimal documentation rewording; golden suite 63/63 locally; GitHub Actions green
  at HEAD.
- **Phase 2 final acceptance fixtures (owner-authorized 2026-07-31, Item 6): ALL
  FOUR PASS.**
  1. Missing-provenance block: fixture row (state=insufficient_evidence, no
     supporting_passage / falsification_condition) rejected by the live
     `explanations_publication_guard` trigger on both UPDATE-to-published and
     INSERT-as-published paths (exact D4 exception). Zero-count cleanup proven.
  2. Corrected-source propagation (D5 end-to-end): ordinary UPDATE of a fixture
     article to source_status='corrected' fired the live automatic
     `articles_source_status_d5_propagate` trigger (no manual mark_source_change
     call); linked explanation moved to awaiting_review / source_corrected with
     correction-history entry, control untouched, `source_change_events` audit row
     recorded actor='system:auto-trigger' (linked=1, mutated=1, skipped=0).
     Fixture rows and audit record deleted; zero-count cleanup proven
     (581 explanations / 580 articles / 0 events restored).
  3. Accessibility alternative: did not exist; BUILT — `src/graph/EdgeList.jsx`
     (keyboard/screen-reader relationship table mirroring canvas filters, opening
     the same EdgeEvidence dialog) + `src/graph/edge-list.css` + App.jsx toggle
     wiring. HEAD `360f0484`, byte-verified (index.css restored byte-exact to
     pre-run original after a same-day self-corrected placeholder-push incident);
     clean npm install + build PASS. Website version 79c1bd1.
  4. Feature-flag rollback test (live flip, owner-authorized): pre-check
     confirmed both crons active=false and no autonomous edge-function
     invocation path; provenance_ui flipped true -> false -> true (~2 min
     window). While disabled: explanations counts identical (581/579/42/0
     published) — legacy read posture restored (read path skips fetch when
     flag != true), zero provenance data loss; flag safely restored to true.
  Evidence: `verifier/runs/2026-07-31_item6_fixtures_1_to_3.md`,
  `verifier/runs/2026-07-31_item6_fixture4_rollback_test.md`.
  The manual 5/5/5 review was already CLOSED by Pass 2 (2026-07-30) and was not
  re-run.

Current flags and runtime state:
- `pipeline_config.provenance_ui = true` — **owner-authorized 2026-07-29, verified,
  live-site review accepted.** Rollback on record: set value back to `false`.
- Explanation read path: implemented, integrated, and live; serves only
  presentation-eligible explanations (currently none — 0 published rows).
- pg_cron: `mip-ingest-rss-daily` and `mip-backfill-legacy` both `active=false`;
  active crons = 0.
- Core-table counts at checkpoint: articles 572, edges 372, story_arcs 40,
  nodes 703, arc_entities 49; explanations 581 total / 579 current.
  Pass 2 closure checkpoint (owner-accepted 2026-07-30): state ok=42,
  insufficient_evidence=533, source_unavailable=4; review_status reviewed=10,
  withdrawn=2, awaiting_review=567; published=0; duplicate current
  assertion_ids=0; backups `explanations_pass2_backup_20260730` (579 rows),
  `edges_pass2_a2_backup_20260730` (1 row), and
  `articles_pre_d5_backup_20260730` (572 rows) retained — do not drop.
  Convention: the withdrawn Pass 2 row (assertion
  `edge:53c4b62b-f10c-4fdb-86fc-7d5d06a40bb3`) retains state=source_unavailable
  (source_unavailable=4 is correct, not 3).

### Phase 2 — gated items (require explicit owner authorization)

1. ~~Phase 2 final acceptance fixtures~~ — CLOSED 2026-07-31: all four remaining
   fixtures PASS (missing-provenance block, corrected-source propagation,
   accessibility alternative, feature-flag rollback test); the manual 5/5/5
   review closed earlier via Pass 2 (2026-07-30). OWNER SIGN-OFF GIVEN
   2026-07-31: Phase 2 is formally CLOSED.
2. Human review of the 567 awaiting_review explanation rows (substantive remaining
   Phase 2 work; owner-in-the-loop).
3. Open observations (non-blocking): 40 of 209 distinct explanation source_ids
   resolve to no live source row (orphaned references; content retained in
   archived_sources) — provenance-hygiene item; backup-table RLS posture decision
   deferred by the owner (do not drop or secure backups yet).
4. Phase 3 (02C) legal/policy work — not started; deferred owner decision on
   SourceComparison/SilenceDetection sequencing still open.

### Next authorized action

Phase 2 formally CLOSED by owner sign-off 2026-07-31. Next scope awaits owner
selection among: (a) human review of the 567 awaiting_review explanation rows,
(b) one of the three needs-source-first rows (A1/B5/C5), or (c) Phase 3 (02C).
No further database mutations, ingestion, cron activation, UI work, or Phase 3
work without explicit owner authorization.
