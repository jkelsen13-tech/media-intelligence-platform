# MIP — Index and Governing Rules

> **Authoritative. Adopted by the owner 2026-07-29; fixture-run results folded in 2026-07-31 per Rule 14. Phase 3 authorization and sequencing resolution folded in 2026-08-04. Graph Analysis Layer (G-ALG) status and CI regression folded in 2026-08-05. Source Comparison View (06C) build and auto-promotion reversal folded in 2026-08-07. Document 07 cross-surface ingestion canary folded in 2026-08-08. 06C functional closure (live full-corpus write, three surfaced write-path repairs, key rotation) folded in 2026-08-09. Manual pre-demo ingest-rss runs (0801Z/0804Z) folded in 2026-08-09; core-table census verified live 2026-08-10. r5 live-form correction, golden-fixture staleness finding, and accepted known drift folded in 2026-08-10. All governing rules, shared vocabulary, integration seams, and the execution contract are carried forward unchanged unless explicitly noted below.**

Always attach this document. Attach exactly one active working document with it.

## Purpose and authority

*(Unchanged.)* This is the permanent constitution for the Media Intelligence Platform build. The Index owns current status; if another document disagrees with the Index, the Index wins. Working documents own requirements and acceptance criteria for their scope. Working-document numbers are filenames, not project phases.

## Working documents

| Document | Scope | Current use |
|---|---|---|
| 00_INDEX | Governing rules, shared vocabulary, integration seams, current checkpoint | Always attach |
| 01_PHASE_0_REPAIR | Correctness repair and regression protection | **Closed — verified** |
| 02A_PHASE_1_AMENDMENTS | Spec amendments only | **Closed — verified** |
| 02B_PHASE_2_PROVENANCE | Per-assertion provenance and explanation objects | **Closed — owner sign-off 2026-07-31** (read path live; 561 rows structurally blocked, see below) |
| 02C_PHASE_3_LEGAL_POLICY | Policy lifecycle and curated legal-case layer | **Internal closed beta LIVE since 2026-08-05. Public release blocked pending existing gate.** |
| 03_BACKLOG | Later features and captured ideas | Item 1 (Source Comparison View) — **CLOSED 2026-08-09** (see 06C). Item 2 (Silence Detection Dashboard) — not started. |
| 04_TRACK_B_DESIGN | Light, open public-knowledge visual system | Step 1 authorized to run in parallel — deployment status still unconfirmed |
| 07_DOC07_CALLAIS_CANARY | Cross-surface ingestion test corpus (Louisiana v. Callais) | **Canary ingestion COMPLETE 2026-08-08 (see 06D below). Extraction NOT authorized — separate checkpoint.** |
| MIP_MASTER_PLAN | Consolidated owner reference | Archive, not an execution prompt |

## Governing rules

*(Unchanged: rules 1–14 carry forward verbatim — Phase 0 priority; one active scope per run; combined shared-screen work; verify actual content; diagnose→fix→adversarial gate pipeline; byte-verify every push; no success by absence; no silent connector loops; failed calls may have side effects; every positive control is temporary; do not advance while a gate is pending; byte and database state outrank progress narration; legacy write-path caution (Rule 13); Index reconciliation discipline (Rule 14).)*

## Shared uncertainty vocabulary

*(Unchanged. Locked under G2 — owner-countersigned 2026-07-28. Six dimensions: source reliability, evidence strength, authentication, relationship type, review status, remaining uncertainty. Missing evidence is not contradicting evidence.)*

---

## Authoritative current checkpoint

Checkpoint supplied by the owner: **2026-08-09** (supersedes 2026-08-08 checkpoint). Source Comparison View functional status and auto-promotion reversal added 2026-08-07. Document 07 canary completion added 2026-08-08. 06C functional closure added 2026-08-09 (see 06C section). Manual pre-demo ingest-rss runs (0801Z/0804Z) folded in 2026-08-09 (see census note below); census verified live 2026-08-10.

### Phase 0 — verified-closed

*(Unchanged. All six items verified. G1 golden suite: 47/47 PASS at time of Phase 0 closure — historical figure only; do not assume still true without a fresh run.)*

**Correction and amendment, 2026-08-10 (incident session, owner-authorized):**
- **Live form of `edges_causal_evidence_guard` (public.edges) is r5** — migration `20260803_tier3_causal_edge_guard_r5_amid_fix.sql`, `convalidated=true`, verified live via `pg_get_constraintdef` 2026-08-10. r4→r5 diff: temporal alternation `'amidst?'` → `'amid(st)?'` in BOTH the evidence and label arms, so bare `'amid'` is now rejected (gate-round-3 finding, 2026-07-27). The r4 migration (`20260802_tier3_causal_edge_guard.sql`) remains untouched as applied history; its header's "r4 is the live one" line is historical, not current.
- **Golden-fixture staleness finding:** `tests/golden/fixtures/r5_constraint.sql` does NOT match the live constraint — its CHECK body references a bare `evidence` column (no such column on `edges`), uses `~*` + `\b`, and carries a temporal alternation matching neither r4 nor r5 as deployed; its header ("captured verbatim 2026-07-28", citing migration `20260803…`) is internally impossible. The suite does not consume the fixture semantically (it is documentation-only; no test executes it), and the one drift guard on it checks only the `amid(st)?` marker — so CI stays green against the wrong reference. Separately, `tests/golden/harness/causal.mjs`'s r4/r5 `TEMPORAL_LEAD` alternations diverge from the deployed forms (`on the back of` / `in the aftermath of` missing; `in the (days|weeks|months) …` / `weeks after` / `months after` / plural-only `hours after|days after` extra); all 8 guardCases produce identical verdicts under both formulations, so this divergence is currently untested either direction. Full analysis: Priority 3 staleness report, 2026-08-10 incident session. Fixture/harness repair is a privileged golden-set change (owner review in PR) — NOT yet executed.
- **Known drift accepted (owner decision, 2026-08-10):** arc `317eb508`'s centroid embedding, title/category, `title_article_count`, and `last_update_at`, plus all 38 arcs' `last_assignment_run`, carry 2026-08-09 sweep-mutated values with no prior values stored anywhere — not cleanly reversible, accepted as known drift. These fields recompute from member text on the next authorized assignment cycle (self-healing). Pre-rollback state of arcs `317eb508` and `18db1b9f` preserved in `story_arcs_canary_sweep_backup_20260809`.

### G2 — locked

*(Unchanged. Shared uncertainty vocabulary locked and owner-countersigned 2026-07-28.)*

### Phase 1 (02A) — verified-closed

*(Unchanged. Closure commit `e3d28ad5`, 2026-07-28.)*

### Phase 2 (02B) — CLOSED (owner sign-off 2026-07-31)

*(Unchanged core build. See reversal below for the one live-state change.)*

**Post-closure update — REVERSED 2026-08-07.** The 2026-08-03 auto-promotion pass (8 of 579 explanation rows promoted to `auto_verified` at evidence_strength ≥ 0.75) was reversed on 2026-08-07 on the owner's explicit direction. All 8 rows demoted back to `awaiting_review`. Current live state: **0 rows auto_verified.** Manual review is still not the chosen path either. Reversal rationale was not recorded in the 2026-08-07 session — carry forward from the 2026-08-06 session record if the specific rationale is needed later.

Article count discrepancy note superseded: count grew from 580 → 699 via a manual backfill the owner ran directly (erratum, not an unexplained discrepancy — the earlier "cause UNKNOWN" note is resolved).

**Current flags and runtime state (updated 2026-08-09 post ingest-rss runs; census verified live 2026-08-10):**
- `pipeline_config.provenance_ui = true` — unchanged.
- Explanation read path: implemented, integrated, live.
- pg_cron: `mip-ingest-rss-daily` and `mip-backfill-legacy` both `active=false`.
- Cron status (2026-08-09): both jobs remain `active=false` — confirmed unchanged by the 06C source-comparison work (dry-run/full-corpus test made zero cron mutations). Re-enabling `mip-ingest-rss-daily` is tracked as open thread (f) and requires explicit owner authorization before any `active=true` flip.
- Core-table counts as of Document 07 canary close (2026-08-08): articles 728 (was 699 pre-canary; +29 from Doc 07 canary), edges 398, story_arcs 48, nodes 737, arc_entities 57, arc_events 67, arc_milestones 31, sources 336, citations 36, entities 924, article_entities 1490, explanations 581, bias_incidents 0. All non-articles counts confirmed unchanged by the canary's after-count discipline — the 29 new rows are inert pending extraction (see 06D). **06C closure (2026-08-09) added 347 events / 839 claims / 898 article_claims / 413 event_articles and moved explanations 581 → 1892 (+1,311 sc-v1 rows, planned carve-out); the 12 core tables above verified zero-delta.** **Two manual ingest-rss invocations (2026-08-09, pre-demo; 0801Z and 0804Z runs) moved articles 728 → 736 → 744 (+16), with the associated graph-layer deltas itemized in those two runs' verifier records: nodes 737 → 800, edges 398 → 450, story_arcs 48 → 50, arc_entities 57 → 69, arc_events 67 → 75, arc_milestones 31 → 39, sources 336 → 365, citations 36 → 37, entities 924 → 1011, article_entities 1490 → 1650; bias_incidents 0 (unchanged). Current census (verified live 2026-08-10): articles 744, nodes 800, edges 450, story_arcs 50, arc_entities 69, arc_events 75, arc_milestones 39, sources 365, citations 37, entities 1011, article_entities 1650, explanations 1892, bias_incidents 0.** **Doc 07 extraction remains NOT authorized and did not run: every post-2026-08-08 movement in nodes/edges/arc-layer counts traces to the two manual ingest-rss runs above and to the 06C source-comparison run — not to Doc 07 scoped extraction. The 06D authorization status is unchanged.**

### Phase 2 — gated items (require explicit owner authorization)

1. Phase 2 final acceptance fixtures — CLOSED 2026-07-31.
2. Human review of the 567 awaiting_review explanation rows — SUPERSEDED 2026-08-03, then that supersession itself REVERSED 2026-08-07 (see above). Current live state: 0 rows auto-promoted; manual review still not chosen. 561 rows remain structurally blocked pending a future provenance-completeness backfill (not yet scoped).
3. Open observations (non-blocking): unchanged — 40 of 209 distinct explanation source_ids resolve to no live source row; backup-table RLS posture decision still deferred.
4. Phase 3 (02C) legal/policy work — RESOLVED 2026-08-04 (unchanged).

### 02C Phase 3 — internal beta, LIVE

*(Unchanged from 2026-08-05. `phase3_beta=true`, both fixtures verified live, `phase3_public` confirmed false. Public release remains blocked pending the existing public-release gate — independent legal review, privacy/minor-protection review, owner signoff.)*

### 06A — Extraction microservice Step 0

*(Unchanged — COMPLETE 2026-08-04, deployed and verified.)*

### 06B — Graph Analysis Layer (G-ALG) and CI regression

*(Unchanged from 2026-08-05. CI regression CLOSED, both Golden regression suite and Deploy to GitHub Pages green on `b8a14a59`, byte-verified. G-ALG-0 and G-ALG-1 shipped and CI-confirmed. G-ALG-1's full functional verification — insert/reuse row check against production hashes using the live GRAPH_ANALYSIS_RUN_KEY — remains incomplete. Still requires the owner to invoke the function directly and hand K3 the resulting JSON. Not the same thing as CI passing.)*

### 06C — Backlog Item 1: Source Comparison View — CLOSED 2026-08-09

Batches 1 (schema), 2 (pipeline), and 3 (UI) code-complete and CI-verified 2026-08-07. Functional closure completed 2026-08-09: key set, full-corpus live write succeeded, populated UI owner-checked.

Live closure write (source-comparison-run v12, ezbr `85fee3d9…`, HTTP 200 in 59s): events 347 (19 multi-outlet), claims 839, article_claims 898, event_articles 413; explanations 581 → 1,892 (+1,311 sc-v1 rows: 413 event_membership + 898 claim_grouping — the planned carve-out). Zero-delta verified on the other 12 core tables. Sanity pulls passed, including a dedupe-winner spot check. CPU remediation shipped same day: tokenize hoist + Date cache in lib.js (behavior-preservation proven by byte-identical full-corpus output diff, sha256 `4de7046a…` both runs; 5.8× faster), which also retired the chunk-probe question — no worker ceiling remains at current corpus scale.

Three latent write-path bugs surfaced and repaired during closure — all invisible until the first production-scale write because dry-runs never insert and CI never exercises the write path:
1. article_claims unique-constraint violation — one article can legitimately contribute multiple distinct surface texts to one claim group. Fixed by insert-time dedupe in index.ts (Option A: highest extraction_confidence, tiebreak longer surface_text then lexical; explanations deduped with the identical winner set). lib.js untouched. Counts: article_claims 974→898, explanations 1,387→1,311.
2. Rebuild cleanup `.in()` with hundreds of UUIDs exceeds the PostgREST URL ceiling — fixed by chunking all cleanup deletes/selects at 100 ids (commit `68c5ddfc`).
3. `explanations_assertion_type_check` never extended for the 06C vocabulary — fixed by migration `20260809_extend_explanations_assertion_type_check` (commit `eca00157`, byte-verified, rollback documented in-file).

**Process observation (standing):** staging/CI never exercises the production-scale write path; full-corpus dry-run plus at least one real write against a throwaway namespace is the only way this class of bug surfaces. Also on record: `syndicated_articles = 0` on the current corpus (verified two ways) — the syndication-collapse UI path is live but unfired; `syndicated_single_source` flags (57 claims) mean "single independent outlet," not wire collapse. `SOURCE_COMPARISON_RUN_KEY` rotated post-closure. Repair commits: `3991aea` (tokenize hoist; supersedes `cf32f75` which carried a transcription error caught by byte-verify before any deploy), `0d3c93ea` (dedupe), `68c5ddfc` (cleanup chunking), `eca00157` (constraint migration).

### 06D — Document 07: Callais Cross-Surface Ingestion Canary — NEW SECTION, 2026-08-08

Not previously tracked in the Index (Document 07 postdates the 2026-08-05 version). Cross-surface ingestion test using real coverage of the Louisiana v. Callais Supreme Court ruling (April 29, 2026) and downstream redistricting effects, capped at 300 articles shared across all tracks.

Infrastructure (completed same session):
- Migration `add_pre_ruling_tag_columns_to_articles` applied: `is_pre_ruling` + `different_causal_chain`, both boolean not null default false, zero backfill writes to existing 699 rows. Byte-hashed, rollback documented pre-apply, verified live in information_schema.
- batch-intake v2 deployed (commit `c5b39e69`) — schema accepts both flags; byte-verified remote vs. local; redeployed as version 3, ACTIVE, independently read back and matching.
- Canary manifest: 29 rows finalized — 8 pre-ruling / 21 post-ruling, 14 news_wire / 16 advocacy_legal. Every URL confirmed. A livestream excluded as non-ingestible (not counted in the 29). Two additional approving sources (PILF, HEP/ALEC) added via a manifest-only balance pass, explicitly not a standing universe change. Date floor extended to 2025-10-14 (oral reargument day). `BATCH_INTAKE_RUN_KEY` set directly in Supabase by the owner, value never shared in chat — confirmed only via the 503→401 gate flip. Rotation recommended since the raw curl command (with key placeholder) did pass through chat text; the key value itself never appeared in any artifact.

Ingestion — COMPLETE 2026-08-08:
- Attempt 1 (full 25-item payload, i.e. non-holdback rows): hit WORKER_RESOURCE_LIMIT mid-loop (sequential embedding computation). 13 rows had already committed (all 8 PRE + 5 post) before the crash — confirmed via read-only check before any retry. Recovery via `allow_append: true` on the same run tag, two batches of 6: 13 → 19 → 25. Zero invalid/duplicate/error rows.
- Lesson recorded and binding for future manifests: batch-intake's sequential embedding loop has a practical ceiling of ~13 articles per invocation. Chunk all future manifests at ≤10 per call.
- 4 holdbacks (AL-07, AL-08, NW-03, AL-10) held pending owner review of the 25-row results — reviewed and authorized. Fresh live-table pre-check confirmed 0 of 4 present before insert. Inserted as one chunk of 4 (`allow_append: true`, same tag). 200, inserted: 4, zero errors.

Verification (full row-level, not aggregate-only, both passes):
- 29/29 rows present; outlet, published_at, flags cross-checked field-by-field against the manifest payload — zero mismatches.
- 8 pre-ruling rows: is_pre_ruling=true AND different_causal_chain=true, all 8. 21 post-ruling rows: both false, all 21. Zero flag leakage either direction — including specifically checked on the 4 holdbacks, which sit adjacent to the tagged PRE rows.
- 29/29 have embeddings and body_text — the mid-crash partial write left no half-formed rows.
- After-count vs. pre-canary baseline: articles 699→728 (+29) ✓; tagged 0→29 (single run tag `doc07-canary-2026-08-08`) ✓; is_pre_ruling=true exactly 8 ✓; different_causal_chain=true exactly 8 ✓. All downstream counts unchanged: story_arcs 48, nodes 737, edges 398, sources 336, citations 36, entities 924, article_entities 1490, arc_entities 57, arc_events 67, arc_milestones 31, explanations 581, bias_incidents 0.

Disclosures on record: 4 rows carry headline-derived summaries (NW-08, NW-09, PRE-NW-04, PRE-AL-02 — retrieval failures, disclosed); one mid-May placeholder date resolved to 2026-05-15; outlet reference table gained new resolve-or-create rows (PILF, HEP/ALEC, Common Cause, CLC, WAFB, NOLA, etc.) — designed ingest-rss behavior, not a baseline deviation.

Current live state: All 29 rows are RAW/INERT. They are visible in the News feed (default "All" view queries articles directly, no arc/extraction filter) as bare articles — outlet chip, date, headline, summary, full-text search. Expanding one shows "None extracted," "No citations extracted," no arc badge. Invisible everywhere else — Arcs, Graph, Timeline, node panels all read story_arcs / nodes / edges / citations, confirmed untouched by the after-count. Live DB check: 0 of 29 have arc_id, entities_extracted_at, claims, or citations.

Extraction — deliberately NOT authorized. Would run as backfill-legacy's scoped mode (`?run=doc07-canary-2026-08-08`): entity extraction → claims/citation extraction → Tier-1 cosine arc assignment (existing-arc attachment or new-arc origination, with hub-entity exclusion / min-shared-entity / similarity floor / anti-snowball gates). This is the step that would move nodes/edges/sources/citations/entities/arc_* counts and make the Callais material appear in Arcs/Graph/Timeline. Explicitly held as its own separate checkpoint/session, not bundled into ingestion. Caution on record: scoped mode is the safe path; the `?reset=1` path wipes the entire arc layer and is not part of any proposal.

### Next authorized action

Five open threads:
- (b) G-ALG-1 full functional verification — insert/reuse row check against production hashes using the live GRAPH_ANALYSIS_RUN_KEY. Requires the owner to invoke the function directly (not paste the key into chat) and hand K3 the resulting JSON for verification. Unchanged from 2026-08-05.
- (c) Document 07 extraction (06D) — attach 00_INDEX + 07_DOC07_CALLAIS_CANARY as its own dedicated session/checkpoint. Authorizes backfill-legacy scoped mode against `doc07-canary-2026-08-08` only. Do not bundle with other scope.
- (d) Phase 3 (02C) continued build — attach 00_INDEX + 02C_PHASE_3_LEGAL_POLICY for any further Phase 3 work beyond what's already shipped and live internally. Unchanged.
- (e) Track B Step 1 — deployment status still unconfirmed; needs verification before any token values are treated as deployed.
- (f) ingest-rss cron re-enable — `mip-ingest-rss-daily` has been `active=false` since containment; re-enabling it is its own scoped action requiring explicit owner authorization (schedule confirmation, then post-enable first-run verification against the after-count discipline). Not bundled with any other thread; `mip-backfill-legacy` stays `active=false` under Rule 13 regardless.

No further database mutations, ingestion, cron activation, UI work, or scope expansion beyond the selected item/document without explicit owner authorization.

### Completed-work checklist (as of 2026-08-09)

- Phase 0 (01) — all six tiers verified-closed, G1 golden suite passed at closure (47/47)
- G2 shared uncertainty vocabulary — locked, owner-countersigned 2026-07-28
- Phase 1 (02A) — spec amendments approved, closure commit `e3d28ad5`
- Phase 2 (02B) — provenance/explanation object built, owner sign-off 2026-07-31
- Phase 2 post-closure — auto-promotion executed 2026-08-03, then reversed 2026-08-07 (0 rows currently auto_verified)
- 06A — Cloud Run extraction microservice Step 0, deployed and verified
- 02C Phase 3 — internal beta authorized, read path + beta UI shipped, CI-confirmed green, LIVE 2026-08-05
- G-ALG-0 / G-ALG-1 — shipped, CI-confirmed green as of `b8a14a59`; functional verification (insert/reuse check) still pending owner action
- CI regression fix — CLOSED 2026-08-05 (missing dependency + poisoned mirror registry + stale workflow assumption, all three root-caused and fixed)
- 06C Source Comparison View — CLOSED 2026-08-09: live full-corpus write verified (347 events / 839 claims / 898 article_claims / 413 event_articles / +1,311 explanations), zero-delta on other 12 core tables, owner UI check passed, key rotated; three latent write-path bugs surfaced and repaired same day (dedupe Option A, cleanup chunking, assertion_type CHECK extension)
- 06D Document 07 Callais canary — ingestion COMPLETE 2026-08-08, 29/29 rows verified row-level and count-matched; extraction deliberately held as separate checkpoint
- Manual pre-demo ingest-rss runs (2026-08-09, 0801Z/0804Z) — articles 728 → 744 and graph-layer deltas itemized in the two runs' verifier records; folded into the census above
- 561 awaiting_review rows — structurally blocked on provenance-completeness backfill, not yet scoped
- Backlog Item 2 (Silence Detection Dashboard) — not started
- Track B (04) — Step 1 authorized to run in parallel, deployment still not confirmed
