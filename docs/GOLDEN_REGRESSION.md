# Golden regression & monitors — operating doc (G1, Phase 0)

Created 2026-07-28. Owner-authorized scope: G1 only.
Suite: `tests/golden/` (run `npm test`). Monitors: `supabase/monitors/golden_monitors.sql`.
CI gate (**PENDING installation**): `.github/workflows/golden.yml` (push/PR/manual) and a `test` job gating Pages deploy in `blank.yml` were prepared on 2026-07-28 but could not be pushed by API — the GitHub App token used for G1 lacks the `workflow` scope, which GitHub requires for any write under `.github/workflows/`. Install manually (full contents recorded in `verifier/runs/2026-07-28_g1_golden_suite.md`) or re-push with a workflow-scoped token. Until then the suite runs locally via `npm test`; the monitors are unaffected.

## What the suite proves

- Golden fixtures (correctly classified articles, arcs, actors, causal/sequence
  relationships, negative relationships — incl. hub-entity hard cases
  Trump/China/Iran/AI) **pass** against the repaired logic.
- Deliberately reintroduced known bugs **fail**: entity deletion instead of
  decode, single-pass decode, no half-strip repair, bare-'strike' military
  hijack, 'developments' fallback arcs, no category floor, r4 'amidst?' guard,
  missing evt/art mirror rule, missing type-agreement guard, bare-probe
  cleanup regex. Each suite contains the mutation proof.
- Drift guards fail first if shipped logic changes without a harness sync.

## Automated monitors (read-only SQL) — thresholds and baselines

Baselines captured 2026-07-28 from live production (articles 572, arcs 40,
edges 372 = 304 actor / 67 sequence / 1 constrained_by / 0 causal).

| Monitor | Baseline | Threshold | On ALERT |
|---|---|---|---|
| duplicate_actor_labels | 0 | expect 0 | Entity-hygiene regression — review new nodes, run Tier 6 dedup pattern |
| duplicate_arc_titles | 0 | expect 0 | Merge duplicate arcs per Item 1 pattern |
| unattached_article_pct | 70.8% (405/572) | ALERT > 85% | Classification/attachment regression — investigate before next ingest |
| category_fallback_pct | 0.0% (0/40) | ALERT > 25% | Rubric/floor regression |
| arc_max_articles | 36 | ALERT > 72 (2×) | Runaway arc — check arc-splitting |
| html_encoding_artifacts | 0 | expect 0 | Sanitization regression in ingest |
| unsupported_causal_edges | 0 | expect 0 | Causal guard bypass — investigate immediately |
| sequence_edges_zero | 67 | ALERT if 0 | Relationship-class dropped to zero |
| actor_edges_zero | 304 | ALERT if 0 | Relationship-class dropped to zero |
| cleanup_probe_rows | 0 | expect 0 | Probe/fixture rows leaked to production — clean per gate protocol |

Threshold rationale: exact-zero monitors cover invariants the repairs made
absolute; rate monitors use baseline + headroom (unattached +14pp, fallback
25% ceiling, arc size 2×) so ordinary pipeline growth does not page anyone.

## How to run the monitors

Manually (crons stay OFF by owner directive):

```bash
psql "$DATABASE_URL" -f supabase/monitors/golden_monitors.sql
```

or paste into the Supabase SQL editor. Run: before and after every ingestion
or classification change, and on a weekly owner review cadence.

## Ownership & alert destinations

- **Owner:** Joseph (repo owner, jkelsen13-tech) — owns golden-set review,
  monitor review, and remediation decisions.
- **Suite alerts (once the pending CI gate is installed):** CI failure on
  push/PR → GitHub Actions notification to the repo owner; failed deploy gate
  blocks Pages deploy automatically.
- **Monitor alerts:** any ALERT row → owner opens a GitHub issue titled
  `G1 monitor ALERT: <monitor>` and remediates before the next ingestion run.
- **Escalation:** repeated ALERT on the same monitor twice in a row → pause
  ingestion (keep crons off) until repaired.

## Rollback

- The suite, monitors, docs, and CI gate are **additive files only** — no
  production data or schema was mutated. Rollback = revert the G1 commit(s):
  `git revert <g1-commits> && git push`. The Pages deploy gate releases on
  revert; monitors are read-only and leave no residue.
- The one pre-existing production object used by monitors,
  `duplicate_actor_label_monitor` (Tier 6), is untouched by G1.

## Explicit non-goals (this run)

No G2+ work, no arc-title observation investigation, no cron reactivation,
no production mutations of any kind.
