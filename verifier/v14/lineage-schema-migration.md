# v14 — article_lineage_assertions migration (20_IDEA capability 1, checkpoint 2)

Created 2026-08-17. Records the schema validation, guardrail probes, and the
live rollback drill for 20_IDEA capability 1's storage artifact, per the
2026-08-17 implementation brief Sections 1-2 and acceptance item
"migration applied, reversible, rollback tested".

Project: `niejaejtbxgakyrsntxm`, PostgreSQL 17.6.

## 1. Schema validation against live (checkpoint 1, pre-migration)

Read-only. Findings reported to the owner before any DDL ran; three
adjustments approved 2026-08-17.

| Check | Result |
|---|---|
| `article_lineage_assertions` already present | No — no collision |
| View-name collision | No — only `duplicate_actor_label_monitor`, `feed_posts` exist |
| `articles.id` type / default | `uuid`, `gen_random_uuid()` — both brief FKs valid |
| `edges` storage decision re-confirmed | `edges.source_id/target_id → nodes(id)`; `public read edges USING (true)` — K3's 2026-08-16 finding holds |
| Core census unchanged from 2026-08-10 | articles 752, nodes 750, edges 411, explanations 1892 |

**Adjustment 1 (approved) — RLS.** The brief's DDL had none. Every comparable
table here (articles, events, claims, article_claims, explanations, edges)
enables RLS; without it the table is served unrestricted to `anon` through
PostgREST. The policy is deliberately NOT the `using (true)` those tables
carry — that is the exact read posture that disqualified `edges` as a lineage
store. Shadow/unreviewed exclusion is therefore enforced at the row level in
addition to the projection view's WHERE clause.

**Adjustment 2 (approved) — `version` column.** The brief names the audit
pattern as "version / is_current / review_status / rule_version" but omitted
`version` from its DDL block. Added as `int not null default 1`, matching
live `explanations`.

**Adjustment 3 (approved) — `reviewer_id` left FK-less.** Human identity is
`mip_profiles(id) → auth.users`; pointing public evidence data at the auth
schema is a coupling this build does not need. Recorded, not changed.

**Gap found in the brief's vocabulary, resolved in the DDL.** Section 3's
no-match outcome (`parent_article_id = NULL` + an `origin_status`) has no
`relationship_type` to carry, but the column is `NOT NULL` and the brief's
`origin_classification` list contains only `press_release_origin`. Resolved
with `origin_undetermined` — an honest "no parent resolved" type, never an
independence claim. The allowlist has no `independent_origin` member, so
guardrail 2 is enforced by the database rather than by code review alone.

## 2. Guardrail probes (transaction-scoped, rolled back)

Eight inserts attempted inside `BEGIN … ROLLBACK`; zero rows persisted
(`count(*) = 0` confirmed after). Each probe asserts the schema itself
refuses the thing the guardrails forbid.

| Probe | Expected | Actual | Result |
|---|---|---|---|
| `relationship_type = 'independent_origin'` | reject | reject | PASS |
| `origin_status` set alongside a resolved parent | reject | reject | PASS |
| `origin_undetermined` with null `origin_status` | reject | reject | PASS |
| article derived from itself | reject | reject | PASS |
| `quotes` smuggled in as `relationship_class = 'derivation'` | reject | reject | PASS |
| legitimate `syndicated_from` with parent | accept | accept | PASS |
| legitimate parentless `no_shared_origin_detected_within_corpus` | accept | accept | PASS |
| identical current assertion inserted twice (idempotency) | reject | reject | PASS |

8/8. The last one exercises `alas_current_assertion_idx`
(`NULLS NOT DISTINCT … WHERE is_current`): re-runs of the detection pipeline
cannot duplicate a current assertion, while superseded rows
(`is_current = false`) stay in the table as history. This is deliberately
NOT the unconditional `UNIQUE(source_id, target_id, type)` that helped
disqualify `edges` — that one destroys history; this one is partial.

## 3. Live rollback drill (executed against production, not simulated)

Same discipline as Track B Step 1's rollback drill.

1. **Fingerprint before:** constraints `73d564bc44b1ba67c740b6f7cf8b73e8`,
   indexes `67b20d3b5d8918c94260e5417dbd5f11`.
2. **Rollback executed verbatim** as documented in the migration header:
   `drop table if exists public.article_lineage_assertions cascade;`
   `delete from public.pipeline_config where key = 'lineage_graph_mode';`
3. **Post-rollback:** table absent (0), flag absent (0), and the core census
   unchanged — articles 752, nodes 750, edges 411, explanations 1892,
   events 347. The table is additive and unreferenced, so `cascade` dropped
   nothing else.
4. **Re-applied** from this repo's migration file.
5. **Fingerprint after:** constraints `73d564bc44b1ba67c740b6f7cf8b73e8`,
   indexes `67b20d3b5d8918c94260e5417dbd5f11` — identical to step 1.
   RLS on, policy `((review_status = 'verified') AND is_current)`,
   flag `false`, census unchanged.

Reversibility is therefore proven by execution, not asserted.

## 4. One defect found and fixed in this migration

The initial revoke covered `insert, update, delete` (following the
`20260813_secure_monitor_view_invoker` precedent, which targets a view).
Post-apply grant inspection showed `anon` and `authenticated` still held
`TRUNCATE`, `REFERENCES` and `TRIGGER` from Supabase's defaults —
**and TRUNCATE bypasses row level security entirely**, so the policy above
would not have stopped it. Closed by
`article_lineage_assertions_revoke_truncate`; `anon` now holds `SELECT`
only. The repo migration file carries the complete revoke so a fresh apply
reaches the same end state in one step.

Noted, not changed (pre-existing, out of this build's scope): `articles`,
`events`, `claims` and their peers still grant `anon` full
`INSERT/UPDATE/DELETE/TRUNCATE`, relying on RLS alone. Worth its own scoped
pass; flagged to the owner rather than fixed here.

## 5. Applied history

| Version name | Purpose |
|---|---|
| `article_lineage_assertions` | Initial table, indexes, RLS, flag |
| `article_lineage_assertions_revoke_truncate` | Grant hole closed (section 4) |
| `article_lineage_assertions_reapply_after_rollback_drill` | Re-apply after the section 3 drill |

Repo file: `supabase/migrations/20260817_article_lineage_assertions.sql`
(sha256 `8dd918f3e79c5652dcf73811583c846a183d547b22d0b598c70b5139e3e80e6a`
at the time of the drill; the file is the single source of truth for a
fresh environment).

---

# Stage 1 — byline/wire-service attribution (checkpoint 3)

Module: `supabase/functions/source-comparison-run/lineage.js`
Tests: `tests/golden/lineage_stage1.test.mjs` (15/15)
Live run: `verifier/v14/stage1_live_corpus_run.mjs`

## Live corpus result (752 articles, 2026-08-17)

Candidate set built by a deliberately broad SQL prefilter (any wire token in
outlet, author name, body lead or summary) that is a strict SUPERSET of what
the detector can match: **11 candidates, 741 articles with no wire token at
all**.

| Outcome | Count | Detail |
|---|---|---|
| `syndicated_from` asserted | **1** | Reuters analysis published on `billingsgazette.com` |
| Wire original — no assertion | 5 | AP articles on `apnews.com` |
| Correctly suppressed | 5 | Guardian ×3, SCMP ×2 — wire cited as a source of fact |

The single assertion:

```
child           2e4fd9b8-…  (outlet Reuters, host billingsgazette.com)
parent          NULL
class/type      derivation / syndicated_from
origin_status   resolved_origin_found
confidence      high
evidence_basis  wire_service Reuters, signal outlet_field,
                published_host billingsgazette.com,
                corpus_scope {752 scanned, 11 candidates}, checked_at …
```

## Two findings from the live run

**1. A wire's own article is an origin, not a copy of itself.** Five AP
articles carry `outlet = 'Associated Press'` on `apnews.com`. A naive outlet
match would have written `syndicated_from` over all five, asserting that AP
syndicated AP. The detector checks the publishing host against the service's
own domains and emits NO assertion for a wire original. They are returned
separately as `wireOriginals` so the fact is visible rather than dropped.

**2. Every single wire-mention candidate in the live corpus is a CITATION,
not a byline.** All five non-wire-outlet candidates are of the form
"Reuters reported", "AFP reports", "state news agency Xinhua reported",
"told Reuters" — Guardian and SCMP original reporting that cites a wire.
Without a guard the detector would have asserted syndication over five
articles that are nothing of the kind, and then collapsed those independent
outlets into a wire origin cluster, UNDERCOUNTING corroboration in E2 — the
mirror image of the bug this capability exists to fix. `isCitationUse`
suppresses them; all five are locked into the test suite as live-derived
regression cases. They are Stage 2 material (`reference` / `quotes`), never
Stage 1 derivation.

## Not yet persisted

This run is detection evidence only — no rows were written to
`article_lineage_assertions`. Persistence happens through the
source-comparison-run write path (checkpoints 4-5) and is reported there.
