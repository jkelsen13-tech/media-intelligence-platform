# lineage-v1 — Graph projection view (20_IDEA capability 1, checkpoint 7a)

Created 2026-08-17. Brief Section 5 and the Section 7 acceptance item
"Read-only Graph projection view live, security_invoker confirmed,
shadow/unreviewed rows confirmed excluded via direct query test".

Migration: `supabase/migrations/20260817_lineage_graph_projection.sql`
Read path: `src/lib/lineageGraphReadPath.js`
Tests: `tests/golden/lineage_graph_projection.test.mjs` (11/11)

## Scope note — 7a only

Checkpoint 7 was split on the owner's instruction after a file-collision
check. Track B Step 2 item 5 (docked relationship panel) is mid-flight on
main and is actively writing `src/graph/GraphView.jsx`, `src/graph/theme.js`,
`src/App.jsx` and `src/graph/EdgeList.jsx` — every file the Graph lineage
MODE would need.

7a is therefore the database view, the read path and their tests. All three
files are NET-NEW; this checkpoint modifies no existing file, so it cannot
conflict with item 5. 7b (Graph rendering) is deferred until item 5's third
commit lands.

## The view

```sql
create or replace view public.article_lineage_graph
with (security_invoker = true) as
select
  l.id as assertion_id,
  l.child_article_id,
  l.parent_article_id,
  case when l.parent_article_id is null then 'origin_annotation' else 'edge' end
                       as projection_kind,
  l.relationship_class, l.relationship_type, l.origin_status,
  l.detection_method,   l.confidence_band,   l.evidence_basis,
  l.rule_version,       l.created_at,        l.reviewed_at
from public.article_lineage_assertions l
where l.review_status = 'verified'
  and l.is_current;
```

No physical duplication into `edges` — the storage decision's whole point.
Nothing in this migration writes anywhere.

`projection_kind` is a structural discriminator, not a judgment. An assertion
with a resolved parent is drawable as an EDGE; a parentless one is a statement
ABOUT a single article and has nothing to draw an edge to. Both must reach the
Graph, because Section 7 requires the `independent_origin_candidate` state to
render as deliberately as a `syndicated_from` edge — so they are projected
together and distinguished, rather than the parentless ones being silently
dropped.

## security_invoker confirmed (not assumed)

```
relname                reloptions                  security_invoker_confirmed
article_lineage_graph  {security_invoker=true}     true
```

Read directly from `pg_class.reloptions`. A plain `CREATE VIEW` would execute
as its owner (postgres) and bypass the base table's RLS entirely — the exact
defect fixed for `duplicate_actor_label_monitor` in
`20260813_secure_monitor_view_invoker`, not reintroduced here.

## Direct query test — shadow/unreviewed exclusion

Six probe rows inserted on real articles inside `BEGIN … ROLLBACK`, one per
review state, then the view queried after `set local role anon`.

**A. Base table, privileged role — all six rows exist:**

| probe_row | review_status | is_current |
|---|---|---|
| 1_verified_edge | verified | true |
| 2_verified_annotation | verified | true |
| 3_unreviewed | unreviewed | true |
| 4_shadow | shadow | true |
| 5_rejected | rejected | true |
| 6_verified_superseded | verified | **false** |

**B. The view, as role `anon` — only two survive:**

| querying_as | probe_row | projection_kind | relationship_type | origin_status | confidence_band |
|---|---|---|---|---|---|
| anon | 1_verified_edge | edge | syndicated_from | — | high |
| anon | 2_verified_annotation | origin_annotation | origin_undetermined | independent_origin_candidate | low |

Six in, two out. `unreviewed`, `shadow`, `rejected` and the superseded
`verified` history row are all absent. `rows_persisted` = 0 — the transaction
was rolled back and the table still holds 0 rows.

Note the superseded row: a `verified` assertion with `is_current = false` is
excluded too. Review status alone is not sufficient; a reviewed row that has
since been superseded is history, not current lineage.

## Two independent exclusion layers, deliberately

1. the view's `WHERE review_status = 'verified' AND is_current`
   (brief Section 5: "a WHERE clause, not a schema change");
2. the base table's RLS policy, which withholds `shadow` and `rejected` from
   public clients regardless of any view.

Neither is load-bearing alone. A caller querying the base table directly still
cannot reach shadow rows, and a future policy change still cannot leak them
through this view. The read path adds a third: it reads the VIEW and never the
base table, asserted by test 11.

## Rollback drill

| Fingerprint | Before | After |
|---|---|---|
| `pg_get_viewdef` md5 | `11e083868549e707712cd4bf577fdb63` | `11e083868549e707712cd4bf577fdb63` |

Dropped verbatim per the migration header (`drop view if exists
public.article_lineage_graph;`), confirmed absent (0), base table and census
untouched — articles 752, nodes 750, edges 411, explanations 1892 — then
re-applied. `security_invoker` true, `anon` grants `SELECT` only.

## One tidy-up, honestly scoped

Post-apply grant inspection showed `anon` holding `TRUNCATE`, `REFERENCES` and
`TRIGGER` on the view from Supabase defaults, the same shape found on the base
table at checkpoint 2. Revoked for consistency — but unlike the table case
**this closed no live hole**: `TRUNCATE` applies to tables only and is inert
on a view. Recorded as tidy-up, not as a security fix.

## Read path

`loadLineageGraph` is gated on `pipeline_config.lineage_graph_mode` being
exactly boolean `true` (withhold posture, currently `false`). Test 1 asserts
the gate PREVENTS the read rather than filtering its result — the stub records
every table touched, and the view must not appear.

Doc 13 keyset pagination on `assertion_id`: an unranged PostgREST select
truncates at 1000 rows without erroring, which would drop lineage silently.

`originScopeLine` returns `null` when corpus scope or check date is missing,
so an origin finding that cannot state its own scope renders nothing rather
than an unfalsifiable claim (locked guardrail 4).

---

# 7b — Graph lineage-mode rendering (data + element layer)

Built after the rebase onto the finished Track B item 5, not against a moving
target. Tests: `tests/golden/lineage_graph_elements.test.mjs` (13/13).

## The finding that shaped this

The live `nodes` population is event/actor/policy only — there are NO article
nodes. That is the same fact that made `edges` structurally invalid as a
lineage store (brief Section 1), and it has a rendering consequence the brief
does not spell out: article-to-article lineage has nothing on the existing
canvas to attach to.

So lineage mode cannot overlay onto the current graph. It builds its OWN
article nodes from the projection and renders them through the same GraphView
with the same conventions. Nothing is written to `nodes` or `edges`.

## Vocabulary — a separate registry, deliberately

`Legend` renders every `EDGE_TYPES` entry unconditionally. Folding the four
lineage types into it would add four permanent rows to the DEFAULT graph's
legend for relationships that only ever appear in lineage mode. They live in
`LINEAGE_EDGE_TYPES` instead — identical shape (token color + label + plain
verb phrase), same rendering path. A new vocabulary, not a new visual system.

A test asserts `EDGE_TYPES` is unchanged (exactly the seven existing keys) and
that no lineage key leaks into it.

| Type | Plain phrase |
|---|---|
| `syndicated_from` | "syndicated from" |
| `derived_from` | "derived from" |
| `quotes` | "quotes" |
| `press_release_origin` | "originates in press release" |

Every phrase is distinct, so meaning survives the v7 accent-removal bar
without color.

## Origin states are node states, never edges

A parentless assertion has nothing to draw an edge to. `ORIGIN_STATUS_LABELS`
gives each a hedged phrase — "no shared origin found — candidate, not
confirmed" — and a test asserts no phrase claims the article IS independently
reported.

Guardrail 4 is enforced structurally: an origin state whose evidence lacks
`corpus_scope.articles_scanned` or `checked_at` renders NO claim at all. The
node still appears; it simply carries nothing unfalsifiable. Method, corpus
size and check date are exposed as separate fields, never combined.

An unknown `origin_status` also produces no claim rather than a guess.

## Honest degradation

An article referenced by lineage but missing from metadata still renders, as
"Article 2e4fd9b8". Dropping it would silently delete one end of a real
relationship; a degraded label keeps both the relationship visible and the gap
obvious. `hydrateLineageArticles` treats a failed lookup the same way — no
thrown render.

`lineageEmptyState` returns copy that says WHY the view is empty, naming both
the verified requirement and the deliberate shadow exclusion, so an empty
lineage mode reads as intentional (same discipline as Track B's relationship
panel).

## Remaining for 7b

The canvas wiring — an App-level mode toggle and a lineage section in the
Legend — is NOT in this commit. The data and element layers are complete and
tested; the wiring touches `src/App.jsx` and `src/graph/Legend.jsx`, both
heavily K3-owned, and is kept as its own focused change rather than bundled
here.
