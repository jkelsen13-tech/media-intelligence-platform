# lineage-v1 — Section 7 acceptance (20_IDEA capability 1, checkpoint 8)

Closed 2026-08-17. Every item from the implementation brief's Section 7,
with where the evidence lives.

## Acceptance table

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | `article_lineage_assertions` migration applied, reversible, rollback tested | **PASS** | Dropped and re-applied against production; constraint fingerprint `73d564bc…` and index fingerprint `67b20d3b…` identical before and after; census unchanged. `lineage-schema-migration.md` §3 |
| 2 | Stage 1 (byline/wire) implemented and tested against known wire bylines in the live corpus | **PASS** | 752 articles scanned, 11 candidates, 1 `syndicated_from` assertion, 5 wire originals correctly skipped, 5 citations correctly suppressed. `stage1_live_corpus_run.mjs` |
| 3 | Stage 3 extracted from and replacing the ephemeral collapse — not a parallel reimplementation | **PASS** | `runPipeline` surfaces its own `plan.syndicates`; a test asserts it deep-equals a direct `detectSyndicates` call, so divergence fails the suite |
| 4 | Read-only Graph projection view live, `security_invoker` confirmed, shadow/unreviewed excluded via direct query | **PASS** | `reloptions = {security_invoker=true}` read from `pg_class`; six probe rows in, two out, as role `anon`. `graph-projection-view.md` |
| 5 | Thread (i) regression: the 3-URL wire story counts as one origin, not three | **PASS** | 1 origin / E4 through the real loader; pre-fix behavior pinned at 3 / E2 as a live test |
| 6 | No composite score anywhere — API responses and rendered UI | **PASS** | Per-stage assertions plus an element-level sweep rejecting any numeric or `*score*` field |
| 7 | `independent_origin_candidate` / `no_shared_origin_detected_within_corpus` in use; no bare `independent_origin` anywhere | **PASS** | Enforced by the DB CHECK allowlist, not only by code review; probe 1 of 8 confirms the insert is refused |
| 8 | Full test suite green, byte-verified pushes per Rule 5 | **PASS** | 343/343; every push verified local == remote with the suite re-run from a fresh archive of the pushed ref |
| 9 | Screenshot evidence of lineage mode rendering a `syndicated_from` edge and an `independent_origin_candidate` state | **PASS** | `screenshot-lineage-populated.png`, `screenshot-lineage-empty.png` (fixture-seeded, see below) |

## Item 9 — how the screenshots were produced

Owner instruction 2026-08-17: **fixture-seeded, not a live production run.**

`verifier/lineage-v1/harness/` renders the REAL `GraphView`, the REAL
`Legend` and the REAL `buildLineageElements` against seeded rows shaped
exactly like `article_lineage_graph` output. It is a dev-only Vite route,
confirmed absent from the production bundle.

**Production was not touched.** `article_lineage_assertions` still holds 0
rows, `lineage_graph_mode` is still `false`, and `source-comparison-run` was
not invoked. That run remains a separate, later, owner-authorized action with
its own dry-run-first sequence.

Rendering verified programmatically, not by eyeballing the image — the live
cytoscape instance was read via `_cyreg.cy`:

```
nodes: 3
edges: 1
edgeTypes:  ["syndicated_from"]
edgeLabels: ["syndicated from"]
nodeLabels: ["Billings Gazette — Wire report…", "BBC — Own reporting…", "Reuters — Wire report…"]
```

**State A — `syndicated_from` edge** (`screenshot-lineage-populated.png`):
Reuters (origin) → Billings Gazette (copy), edge drawn with its plain-language
label "syndicated from" on the canvas.

**State B — `independent_origin_candidate`** (same image, bottom right): the
BBC article carries a STATE, not an edge, reading
*"Independent origin candidate: 'no shared origin found — candidate, not
confirmed' · method corpus_scan · checked 752 articles as of 2026-08-17 ·
confidence low"* — detection method, corpus scope and check date all present
per locked guardrail 4.

**State C — honest empty** (`screenshot-lineage-empty.png`): "No verified
lineage yet", stating that unreviewed and shadow-mode rows are excluded on
purpose. Deliberate, not broken.

One note recorded honestly: edge labels are zoom-gated at ≥1.2 by GraphView's
existing `applyLabels` (Track B behavior, unchanged by this build), so the
populated capture zooms to 1.35 to make the label visible. Two Google Fonts
requests fail in the sandbox (no external network) — cosmetic, unrelated to
this capability.

## Stage 2 — finalized by owner ruling

| Ruling | Behavior |
|---|---|
| 1 | "first reported by X" stays **ambiguous** — never reclassified to `derived_from` |
| 2 | "after X reported" / "following a report by X" are **decided references** |
| 3 | Self-reference exclusion is **permanent** |
| 4 | Outlet-level mentions are **report-only** — no parentless `quotes` rows |

All four asserted in `tests/golden/lineage_stage2.test.mjs` (17/17) as
intended behavior rather than as pinned-provisional expectations.

One defect found while implementing ruling 2: a bare `/\bper\b/` citation
pattern matched "four **per** cent" and recorded it as the evidence phrase for
a correct classification. The classification was right and the evidence was
nonsense. Tightened to require a source (`per Reuters`), and the specific
sequence patterns were moved ahead of the loose ones so the recorded phrase is
the real one.

## Out of scope, confirmed not done

- Fuzzy/near-duplicate matching in presentation — shadow-mode only, not built.
- Coverage Deserts (03_BACKLOG Item 2) — untouched.
- Claim mutation genealogy (Doc 20 capability 6) — untouched.
- UI beyond the Source Comparison E2 fix and Graph lineage mode — untouched.

## Carried forward, owner-authorized decisions still open

1. **The live pipeline run.** The thread (i) fix is code-complete and
   correctly live-inert: with 0 persisted rows the read path behaves exactly
   as it did pre-fix. Dry-run-first is approved for when the key is supplied;
   the full run stays separately authorized.
2. **`lineage_graph_mode` flag flip** — still `false` (withhold posture).
3. **Schema-wide `anon` TRUNCATE posture** — flagged at checkpoint 2, tracked
   by the owner as its own item, deliberately not fixed here.
4. **Seven commit messages** on this branch still reference the pre-rename
   `verifier/v15` path; left intact because rewriting them now would mean
   replaying across a merge commit.
