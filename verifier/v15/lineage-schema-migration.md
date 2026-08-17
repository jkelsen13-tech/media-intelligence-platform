# v15 — article_lineage_assertions migration (20_IDEA capability 1, checkpoint 2)

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
Live run: `verifier/v15/stage1_live_corpus_run.mjs`

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

---

# RLS policy correction (owner-approved 2026-08-17)

Migration: `supabase/migrations/20260817_article_lineage_assertions_rls_correction.sql`

## The defect

The policy shipped at checkpoint 2 was `review_status = 'verified' and
is_current`. It conflated brief Section 5 (the **Graph projection view** is
filtered to `verified`) with Section 6 (**shadow-mode** assertions never
surface in the Graph projection or Source Comparison counts). Section 6 names
shadow, not unreviewed.

Stage 1-3 assertions are born `unreviewed`; promoting them to `verified`
automatically is the exact move reversed on 2026-08-07 and was not
reintroduced. So every assertion was invisible to the anon client serving
Source Comparison, and the thread (i) fix would have counted zero origin
clusters — silently changing nothing in production while its unit tests
passed. Rule 7, "no success by absence".

## Proof of effect — the same row, before and after

Probe rows are the real Stage 1 detector output for
`2e4fd9b8-…` (outlet Reuters, host `billingsgazette.com`), inserted inside a
transaction, queried after `set local role anon`, then rolled back.

| State | Querying as | Reuters assertion visible |
|---|---|---|
| Before correction | `anon` | **0** |
| After correction | `anon` | **1** |
| After rollback drill | `anon` | **0** |
| After re-apply | `anon` | **1** |

The "after correction" probe inserted **three** rows on the same article —
`unreviewed`, `shadow`, `rejected` — and `anon` returned exactly one:

```
querying_as       anon
review_status     unreviewed
detection_method  byline_attribution
relationship_type syndicated_from
confidence_band   high
wire_service      Reuters
published_host    billingsgazette.com
```

Shadow and rejected stayed invisible. Guardrail 6 holds at the row level,
independent of any WHERE clause a caller may forget.

## Rollback drill

| Fingerprint | Before | After |
|---|---|---|
| Policy | `a7083c4eb4a317afb58639a754676f35` | `a7083c4eb4a317afb58639a754676f35` |
| Constraints | `73d564bc44b1ba67c740b6f7cf8b73e8` | `73d564bc44b1ba67c740b6f7cf8b73e8` |
| Indexes | `67b20d3b5d8918c94260e5417dbd5f11` | `67b20d3b5d8918c94260e5417dbd5f11` |

`rows_persisted` = 0 (every probe transaction rolled back). `anon` grants:
`SELECT` only. Core census unchanged: articles 752, nodes 750, edges 411,
explanations 1892.

---

# Stage 3 — exact-text hashing, and the thread (i) regression (checkpoint 4)

Tests: `tests/golden/lineage_stage3_thread_i.test.mjs` (14/14)
Fixture: `tests/golden/fixtures/source_comparison.json`

## Extraction, not reimplementation — the seam

The collapse logic in `lib.js detectSyndicates` (canonical URL + normalized
body hash + union-find) has been correct since 2026-08-06. Its only defect
was having exactly ONE consumer — `computeComparison` — so its result died
with the HTTP response in `stats.comparisons`.

The change is one line of extraction plus a persistence consumer:

| Before | After |
|---|---|
| `runPipeline` computes `syndicates`, passes it to `computeComparison`, discards it | `runPipeline` also surfaces it as `plan.syndicates` |
| — | `buildStage3Assertions(articles, plan.syndicates, …)` turns each group into rows |

`detectSyndicates` is **not called a second time** and its grouping rule is
**not restated**. A test pins this: `plan.syndicates` is asserted deep-equal
to a direct `detectSyndicates` call, so a future divergence fails the suite.
The only logic computed locally is evidence annotation — which of the two
keys a member shares with its origin — so `evidence_basis` can name the
matched value instead of asserting an unexplained match.

## Confidence band — FLAGGED for owner review

The brief says "confidence_band scaled to match percentage", but v1 matching
is EXACT only (fuzzy is shadow-mode and excluded), so match percentage has
two values, not a range:

| Match basis | match_percent | Band |
|---|---|---|
| `exact_text_hash` — normalized bodies byte-identical | 100 | high |
| `canonical_url` — same document URL, text NOT proven identical | null | medium |

Reading "scaled" as a real similarity percentage would require the fuzzy
matching this build is forbidden from putting into presentation.
`match_percent` lives in `evidence_basis` only — never in an API response or
UI as a score.

## Origin selection — what it does and does not claim

Earliest `published_at`, then lexical id. This picks a deterministic
REPRESENTATIVE, not a proven source: the corpus may not contain the true
original at all. The claim a collapsed group supports is "these N articles
share ONE origin, so they are one corroborating source, not N" — which is
all E2 needs. It is not "article X is where this story came from".

## The thread (i) regression

Fixture case: one verbatim wire story under **three DISTINCT canonical URLs**
across three outlets (`o2`, `o2wire2`, `o2wire3`), joined only by the
normalized body hash. `a2w` remains separately as `a2`'s tracking-param
duplicate, preserving the existing canonical-URL collapse coverage.

The fixture was corrected mid-checkpoint: the first version had two of the
three sharing a canonical URL, so the pre-fix path yielded 2 — which would
have made the "not three" assertion pass trivially without reproducing the
defect thread (i) actually describes.

| Path | Independent outlets | Evidence strength |
|---|---|---|
| Pre-fix (canonical URL recomputed at read time) | **3** | E2 "corroborated" |
| Persisted origin clusters | **1** | E4 asserted |

Both directions are pinned. The pre-fix behavior is a live test, so the
defect cannot silently return.

Guard tests, all passing: citation (`quotes`) assertions never collapse a
cluster; shadow and rejected never collapse; superseded (`is_current false`)
rows are inert; parentless Stage 1 rows never merge anything; chains
A->B->C collapse to one cluster; genuinely independent articles (`a1`, `a3`)
stay independent — the fix does not over-collapse.

## Write path

`index.ts` persists Stage 1 + Stage 3 rows after the explanations insert.
Rebuild semantics mirror the sc-v1 namespace but spare reviewed rows: the
cleanup deletes only `rule_version = 'lineage-v1' AND review_status =
'unreviewed'`, so a re-run never discards a human verify/reject decision.
The function header comment was updated — it previously claimed the function
writes to no table beyond the Item 1 set, which this change made untrue.

**Not yet executed against production.** The edge function is manually
invoked and requires `SOURCE_COMPARISON_RUN_KEY`; no live run was performed
this checkpoint, so `article_lineage_assertions` still holds 0 rows.

---

# Thread (i) fix at its landing point — loadSourceComparisonView (checkpoint 5)

Tests: `tests/golden/lineage_readpath_wiring.test.mjs` (7/7)

## The switch

| | Before | After |
|---|---|---|
| Source | `collapseBySyndication(memberArticles)` — canonical URL only | `collapseByPersistedLineage(lineageAssertions)` |
| Scope | recomputed per event, from that event's member articles | computed once over the persisted corpus-wide clusters |
| Keys | canonical URL | canonical URL **+ normalized body hash + union-find**, as persisted |

`collapseBySyndication` is retained but has **zero call sites in the read
path** — it survives only so the regression test can exercise the ACTUAL
pre-fix code rather than a fresh simulation of it.

## End-to-end result, through the real async loader

The loader runs against a PostgREST-shaped stub over the fixture corpus. The
3-URL wire story is the event's membership.

| Scenario | Independent outlets | Evidence strength |
|---|---|---|
| Persisted lineage present | **1** | **E4** asserted |
| **Control:** lineage table empty | 3 | E2 "corroborated" |
| Lineage rows marked `shadow` | 3 | E2 |
| Lineage rows marked `rejected` | 3 | E2 |
| Lineage rows `is_current = false` | 3 | E2 |
| Lineage rows reclassified `reference`/`quotes` | 3 | E2 |

The control row is the one that makes the headline result meaningful: the
same corpus through the same loader returns 3 when the lineage table is
empty, so the 1 is produced by the persisted clusters and not by some other
property of the fixture.

The shadow row is guardrail 6 enforced at a second layer — RLS already
withholds shadow rows from this client, and the read path independently
refuses to collapse on them, so the guarantee does not rest on a policy a
caller might query around.

## Static drift guard

Following the 15A precedent (a static test forbidding the old read-then-write
pattern from returning), `DRIFT GUARD` asserts against the source of
`loadSourceComparisonView`:
- it must NOT call `collapseBySyndication`;
- it MUST call `collapseByPersistedLineage`;
- exactly one `collapseBySyndication(` call site exists in the whole file (its
  own definition), so no new caller can appear unnoticed.

## Honest degradation

An empty `article_lineage_assertions` table yields an empty cluster map, so
every article counts as its own source and the view loads normally with no
error. With no lineage recorded we cannot claim a shared origin and must not
invent one — the same posture as G2's "missing evidence is not contradicting
evidence".

Note this direction of failure: before any live pipeline run, the read path
now behaves EXACTLY as it did pre-fix (3 outlets for the wire story), because
there are no persisted clusters to count. The fix changes nothing in
production until the write path has run. See the live-run decision below.
