# MIP Working Document 07 — Cross-Surface Ingestion Test

Case study: Louisiana v. Callais / VRA Section 2 redistricting fallout

Attach with 00_INDEX. This document deliberately spans News Feed, Knowledge Graph, Timeline, Story Arc, and Phase 3A — it is testing propagation across surfaces from one ingestion event, not four separate feature builds. Do not split it into per-surface runs; the point is observing whether the existing pipeline (Tier 1 arc membership, Phase 2 provenance, Tier 3 causal guard, Phase 3A lifecycle) handles a real, moderately large, topically coherent batch correctly and efficiently on its own, without hand-placement.

> **Repo record note (2026-08-10):** This file was first committed to the repository on 2026-08-10, transcribed from the owner-held canonical PDF, with the Stage C amendment below applied at the owner's direction. Prior to this commit the document existed only outside the repo.

## Execution contract

| Field | Value |
|---|---|
| Dependency | Phase 0-2 verified (unchanged). Phase 3A schema live per 02C. Tier 1 arc-membership, Tier 3 causal guard, and Phase 2 explanation objects all must be the live production versions — no test-only shortcuts. |
| Scope | Ingest a capped, real batch of news coverage of the April 29, 2026 Louisiana v. Callais ruling and its downstream state redistricting activity. Let the existing pipeline (not manual placement) determine arc membership, graph edges, and classification. Observe and record how each surface handles it. Produce an efficiency/pattern report as a deliverable in its own right. |
| Non-scope | No new features. No public exposure (`phase3_public` stays false — this is internal beta only). No composite score, no "who's right on redistricting" framing, no permanent change to the 300-article cap outside this test. No G9 methodology-page work. |
| Owner | Agent (K3) runs the ingestion and reports pipeline behavior as-is, including failures or messy clustering — do not clean up results before reporting. Owner reviews source-list scope, date range, and the pattern-report before this is called closed. |
| Starting state | Verify read-only: current article count (699 per 2026-08-07 checkpoint), current arc count, and confirm pg_cron crons remain off — this is a manual one-time batch, not a live cron. |
| Migration | Additive only. Standard backup-before-mutation rule applies given the volume involved. |
| Acceptance | See per-surface acceptance below, plus the pattern-report deliverable. |
| Evidence | Final article count and source breakdown; arc-membership result (however many arcs it actually formed); sampled graph edges with causal-vs-sequential justification; timeline screenshot at full volume; pattern report. |
| Rollback | Full batch is identifiable by ingestion-run tag; a single query can select and remove every row from this run without touching unrelated corpus data. |
| Status | Not started. |
| Release | Staging/manual batch first, spot-check, then let it stand in production internal view (not public). |

## Prerequisite gates — read-only, verify before any other stage

This run cannot claim to cover every surface until these are checked. Where a gate is blocked, record it as an explicit exclusion from this run's scope rather than proceeding around it silently.

1. Verify current article, arc, node, edge, explanation, and active-cron counts read-only — do not assume the 2026-08-07 checkpoint figures are still exact.
2. Confirm `phase3_beta=true` and `phase3_public=false`.
3. Confirm whether the `d08f8c06` Source Comparison CI question is resolved. (Per the 2026-08-07 Index, this was resolved — both previously-red runs now show completed/success. Re-verify rather than assume.)
4. Confirm whether Source Comparison Batch 3 UI exists and can currently populate the visible Comparison surface, and whether `SOURCE_COMPARISON_RUN_KEY` has been set — check presence/boolean only, never retrieve or expose the secret value.
5. Confirm G-ALG-1 production insert/reuse verification status — this remains incomplete per the Index; record as a known exclusion if still unresolved, don't block the whole run on it unless graph work depends on it directly.
6. Confirm an `ingestion_run_id` (or equivalent tag) can identify every row this test creates across every affected table, before any row is written.
7. Produce exact pre-run backup and rollback queries — write them, do not execute them yet.
8. Confirm the pipeline can enforce a hard 300-article ceiling scoped to this run only, without altering any permanent global cap.
9. Confirm pg_cron jobs remain off and this is a one-time manual run, not a live cron.

If any gate is blocked, stop and report it as an owner blocker rather than guessing or working around it.

## Owner decisions needed before handoff (defaults set, flag if wrong)

1. **Source universe.** Real coverage of this story spans two different kinds of publishers: wire/mainstream news (AP, Reuters, AJP, The Hill, Votebeat) and advocacy/legal-analysis orgs (Brennan Center, Campaign Legal Center, Alliance for Justice, League of Women Voters, Common Cause, Ballotpedia). These carry different reliability profiles under G2's source-reliability axis. Default: include both, but tag advocacy/legal-analysis sources with an explicit source-type flag distinct from `news_wire`, so Source Comparison's outlet-quality dimension stays meaningful rather than silently blending an ACLU-adjacent brief in with an AP wire story. Flag if you'd rather scope to news-only for this test.
2. **Date range.** Default: corpus starts at the ruling itself (April 29, 2026) through ingestion date, capped at 300. The 2022-2024 lower-court history (Robinson v. Ardoin, the original SB8 fight) is real context but predates "the initial legislation changed" as you framed it — default is to exclude it from the 300-cap batch and let it exist only as prior-context citations inside the Phase 3A lifecycle entry if the pipeline naturally pulls it in, not as counted articles. Flag if you want a small separate pre-ruling context set.
3. **Arc structure.** Real coverage naturally splits by state (Louisiana ruling itself, then Florida's map, Tennessee's, Alabama's, Georgia's special session, the slower blue-state response). Default: do not pre-assign one arc. Let Tier 1's existing threshold (cosine ≥0.78, two-informative-entity rule, hub-entity filtering) decide whether this becomes one arc or several related ones, and report the actual result. Forcing one arc would defeat the point of using this as a real test.

## Cap and ordering

Hard ceiling: 300 articles for this run, inclusive of both the legal/policy track and the Adjacent Bias/Hate-Incident Track below (they share one ceiling, not 300 each). If real available coverage is under 300, use the real count — do not pad to hit the number.

If available coverage exceeds 300, prioritize by: primary/original reporting over syndicated copies (reuse the hash/URL syndication detection just shipped for Source Comparison — this is a natural second use of that logic), then source reliability tier, then chronological spread (don't let volume cluster entirely in the first week and starve later developments).

Timeline placement: strict chronological order by publish date, each entry tagged with outlet, with a visible running count (e.g., "50 articles as of May 4" growing to whatever the final total is) so the timeline itself shows ingestion velocity, not just final state.

## Staged release

Do not go straight from planning to a full 300-article write. Six stages, each gated on the prior one:

- **A. Read-only source manifest.** List candidate sources and article counts per source, tagged by type (`news_wire` vs. advocacy/legal-analysis — see decision 1 below). No ingestion yet.
- **B. Dry-run classification and deduplication.** Run the pipeline's classification and syndication-detection logic against the manifest without writing rows. Report what it would do.
- **C. Canary batch — 25 initial articles, under one `ingestion_run_id`, actually written.** 4 additional holdback rows (AL-07, AL-08, NW-03, AL-10) were inserted as a second chunk under the same run tag following explicit owner review and authorization of the initial 25's results (`allow_append: true`) — **total canary: 29 rows**. See 00_INDEX 06D for the full record. *(Amended 2026-08-10 at owner direction; original line read "Canary batch — no more than 25 articles, under one ingestion_run_id, actually written.")* This is the first real test of arc-membership, causal-vs-sequential classification, and (if any qualifying incidents exist) the Adjacent Bias/Hate-Incident Track's status classification, at small scale.
- **D. Owner review.** Source scope, arc clustering result, causal/sequential decisions on the canary, and rollback proof (a working query that removes exactly the canary's rows and nothing else) — all reviewed before anything scales up.
- **E. Expansion to the real count, up to 300** — only after separate, explicit owner authorization following stage D. Not automatic.
- **F. Cross-surface verification and the pattern report** (see below).

The canary and the full batch both use the existing pipeline as-is — no manual arc placement, no hand-cleaning results before reporting them. Messy clustering or classification failures at either stage get reported honestly, not smoothed over.

## Per-surface requirements

**News Feed.** Standard ingestion path — sanitization, provenance extraction, byline resolution. Every article gets a Phase 2 explanation object same as any other ingested content. No special-casing.

**Knowledge Graph.** Articles do not each become a graph node. At 300 articles that would make the graph unreadable and defeats the "focused subgraph" design in Track B Step 2. Nodes are limited to: the ruling itself as an event, the Court as decision-maker, each state actively redistricting as an actor, relevant officials only where they're directly quoted/attributed (no inference), and — if the Adjacent Bias/Hate-Incident Track below produces any officially-linked incidents — those incidents as their own nodes. Articles attach to these nodes as evidence (via the normal Phase 2 explanation object), reachable by drill-down, not as independent graph entries. Edges: causal only where evidence explicitly supports it (state officials citing Callais directly as their stated basis — this case actually has strong positive-control material for the causal-vs-sequential guard, unlike synthetic fixtures) — sequential everywhere the connection is temporal correlation without a stated causal link.

Expected shape:

```
Louisiana v. Callais
├── directly cited by → Florida map action
├── directly cited by → Tennessee proposal
├── remand affected → Alabama litigation
└── followed in time by → other state activity (sequential, not causal)
```

This is a real-world test of Tier 3's guard against turning "after Callais" into a fabricated causal edge.

**Timeline.** Per ordering rules above. All articles remain chronologically accessible, but default display groups by day/week with running counts rather than listing 300 individual rows — consistent with Tier 4's pagination/virtualization requirement. Must correctly distinguish "state cited Callais as direct cause" from "state redistricting activity that predates or runs parallel to Callais" (Missouri/Texas/North Carolina redrew before the ruling, at Trump's urging — different causal chain, must not be flattened into the same bucket).

**Story Arc.** Whatever arc(s) the pipeline actually produces (see decision 3). Milestones as an audit record — ruling date, each state's map action, litigation status per state (Alabama's is still contested, not resolved) — plus source breakdown and article drill-down per arc.

**Phase 3A (policy lifecycle).** The ruling is the transition event. Stated-objective track: the majority's stated rationale (race-neutral standard, no compelling interest required). Actual-outcome track: each state's map action as a dated, sourced transition — Florida enacted, Tennessee in progress, Alabama contested/blocked-then-appealed, Georgia deferred to 2028, blue-state response labeled missing/structurally-blocked (constitutional-amendment requirement) rather than silent, per the asymmetric-response point already discussed. No composite "fair or not" score anywhere in this track — dimensions stay separate per Amendment A.

**Source Comparison.** Conditional — only if prerequisite gate 4 confirms the Batch 3 UI is live and can populate. If confirmed, articles become event memberships and claim groups through the existing `sc-v1` pipeline same as any other ingestion. If not yet ready, this surface is explicitly excluded from this run's coverage claim, not silently skipped.

## Adjacent Bias/Hate-Incident Track

A separate track from the legal-policy outcome track above — not an automatic "outcome" of the ruling. Included in this run at the owner's direction.

**Scope discipline.** This track exists to record, not to presume. A redistricting fight generating zero qualifying incidents is a valid, expected result. No quota requires finding any.

**Ceiling.** Shares the single 300-article ceiling with the legal/policy track — not an additional 300.

**Status taxonomy** (distinguishes allegation from investigation from adjudication, per DOJ's noncriminal-bias-incident vs. hate-crime distinction and FBI UCR reporting standards, which require law-enforcement-identified objective facts, not public speculation):

- `reported_incident`
- `bias_incident_not_established_as_crime`
- `investigated_as_possible_hate_crime`
- `law_enforcement_reported_hate_crime`
- `hate_crime_charge_filed`
- `hate_crime_adjudicated`
- `status_unknown`

**Relationship-to-Callais taxonomy** (separate axis from status above):

- `same_time_period`
- `same_jurisdiction`
- `same_affected_population`
- `publicly_attributed_to_policy_change`
- `officially_linked`
- `no_causal_link_established`

**Causal-edge rule.** Only `officially_linked` and, where the attribution is itself from an identified, attributable source (not "widely believed to be related"), `publicly_attributed_to_policy_change` may produce anything resembling a causal graph connection. `same_time_period`, `same_jurisdiction`, and `same_affected_population` alone get a sequence/context connection at most — temporal or geographic adjacency never creates a causal edge on their own, mirroring Tier 3's existing guard against temporal-opener causal claims.

**Sourcing.** DOJ/FBI/court/law-enforcement records are the primary status source where available. Advocacy-org characterization of an incident is citable as a claim with its own provenance, but does not by itself move an incident's status forward (e.g., an advocacy group calling something a hate crime does not make it `law_enforcement_reported_hate_crime`).

**Privacy.** Standard MIP privacy protections for minors and private individuals apply in full — same posture as the Wells fixture in Phase 3B. No private-person accusation derived from model inference, ever.

**Absence handling.** Missing qualifying incidents is recorded as absence (`status_unknown` or simply no rows), never presented as proof that no incidents occurred. This is the same missing-evidence-is-not-contradicting-evidence rule that governs the rest of the platform.

## Pattern-report deliverable (the actual point of this test)

Separate from the ingestion itself, K3 produces a short report answering:

- Did Tier 1 arc-membership cluster this sanely at ~300-article volume, or did it need intervention?
- Did the causal-vs-sequential guard correctly separate the multi-state activity, including the pre-Callais states (Missouri/Texas/NC) from the post-Callais ones?
- Did syndication detection reduce duplicate-source noise as expected?
- Timeline/UI performance at this volume — did Tier 4's pagination/virtualization requirements hold, or did anything need to change?
- What would need to change in the pipeline to handle a 1,000+ article ingestion instead of 300, based on what broke or strained at this scale?

This report is the reusable artifact — it's what future large-ingestion runs get evaluated against.
