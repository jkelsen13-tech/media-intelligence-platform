# Verifier v6 — Doc 15A: Atomic centroid and idempotent attach

Created 2026-08-12. Owner-approved shape (Step 1, two review rounds).

## Measures

- **Four required tests, before-state first, against the live DB with scratch
  arc/articles** (recorded statement-by-statement in
  `runs/2026-08-12-doc15a-atomic-attach.md`):
  1. Concurrent distinct articles, same arc — before: A's contribution lost
     (0.045 vs correct 0.06). After: 0.06 exact, both present.
  2. Concurrent duplicate article — after: one `attached`, one
     `already_attached`, centroid counted once (0.03 exact).
  3. Sequential duplicate — before: double-count (0.035 vs 0.03). After:
     idempotent no-op, 0.03 unchanged.
  4. Partial-failure atomicity — before: orphaned attachment (membership
     landed, centroid never updated). After: forced intra-function failure
     rolls back the membership write; no orphan either direction.
- **Test 1 before-state failure is the premise proof** — reproduced
  deterministically by driving the current JS statement sequence interleaved
  at the read→write race window.
- **Cleanup zero-delta**: scratch rows deleted; post-run census equals the
  pre-run census (articles 752, story_arcs 49, attached 189).
- **Full unit suite green** in a /tmp copy (204 baseline + new 15A drift-guard
  tests), CI green, one byte-verified commit.

## Documented, inherited, out-of-scope limitation (owner instruction 2026-08-12)

A RE-PARENTED article (moved from arc A to arc B — not a duplicate attach)
folds into arc B's centroid, but arc A's centroid is never decremented: arc A
keeps the stale contribution indefinitely. This is IDENTICAL to the pre-15A
JS behavior (the old write sequence also never touched the old arc). Not
fixed under 15A — recorded so it is not undocumented.

## Implementation note discovered during testing

The owner-approved body used vector subscripting (`v_old[v_i]`); this pgvector
build rejects it (42804 — error surfaced by the first live test call, and the
atomicity property was incidentally proven by the clean rollback). Step 6
converts vectors to float8[] via text round-trip and loops over arrays
instead. Formula unchanged.

## Differs from v5

First concurrency/atomicity verification (vs doc/checkpoint verification in
v5); adds before/after live-DB race reproduction and a static drift-guard
test guarding the write path against regression to the JS read-modify-write
sequence.
