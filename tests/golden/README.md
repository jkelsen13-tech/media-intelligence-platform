# G1 — Golden regression suite

Permanent golden set for the media-intelligence pipeline. Protects the Phase 0
repairs against regressions in six known failure classes: **classification,
sanitization, causal-edge, duplicate, fallback, cleanup.**

## Run

```bash
npm test            # node --test tests/  (no npm install required)
```

## Layout

- `fixtures/` — versioned golden data: correctly classified articles/arcs,
  canonical actors (incl. hub-entity hard cases Trump/China/Iran/AI), golden
  causal + sequence relationships, and **negative relationships that must
  never be recreated**. `r6_constraint.sql` is the live production constraint (r5 kept as history)
  captured verbatim (pg_get_constraintdef, regenerated 2026-08-10 after the
  prior synthetic version was found stale in the incident session).
- `harness/` — JS ports of the shipped pipeline logic (transcribed from
  `supabase/functions/ingest-rss/index.ts @ 445503ee`) with switchable
  **known-bug variants** for mutation proof. Frontend rules are imported
  directly from app source (`src/lib/timelineDedup.js`, `src/data/demoData.js`).
- `*.test.mjs` — the suites. Each has: golden cases pass against repaired
  logic + mutation proofs that known-bug variants fail.
- `drift.test.mjs` — guards that shipped artifacts still carry the repaired
  markers, so harness ports cannot silently diverge from production.

## Changing the golden set (review required)

Golden-set changes are privileged: they define what "correct" means.

1. Any change to `fixtures/` or `harness/` requires owner review in PR.
2. Every change appends an entry to `CHANGELOG.md` (date, what, why, who).
3. If a drift guard fails, do NOT delete the guard — sync the harness to the
   new shipped logic in the same PR and record it in the changelog.
4. Bug variants (`variant:` options) must never be removed; new known bugs
   get new variants, never edits to old ones.
