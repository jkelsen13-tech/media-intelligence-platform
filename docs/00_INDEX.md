# MIP — Index and Governing Rules

> **Authoritative. Adopted by the owner 2026-07-29** as the Index amendment
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
| 02B_PHASE_2_PROVENANCE | Per-assertion provenance and explanation objects | **Active** (D2 sample under owner review) |
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

### Phase 2 (02B) — in progress

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

Current flags and runtime state:
- `pipeline_config.provenance_ui = false` — **must remain false until the owner
  explicitly authorizes read-path enablement.**
- Explanation read path: not implemented/deployed; remains disabled.
- pg_cron: `mip-ingest-rss-daily` and `mip-backfill-legacy` both `active=false`;
  active crons = 0.
- Core-table counts at checkpoint: articles 572, edges 372, story_arcs 40,
  nodes 703, arc_entities 49; explanations 15 (sample only).

### Phase 2 — gated items (require explicit owner authorization)

1. **Full D2 explanations backfill** — remains gated on owner review of the 15-row
   sample. Not authorized.
2. Read-path enablement (`provenance_ui = true`, explanation reads in the app).
3. Phase 2 final acceptance fixtures (missing-provenance block, corrected-source
   propagation, manual review of 5 edges / 5 arc assignments / 5 classifications,
   accessibility alternative, feature-flag rollback test).
4. Phase 3 (02C) legal/policy work — not started; deferred owner decision on
   SourceComparison/SilenceDetection sequencing still open.

### Next authorized action

Owner review of the D2 sample artifact. No further database mutations, backfill
expansion, read-path enablement, ingestion, cron activation, UI work, or Phase 3
work without explicit owner authorization.
