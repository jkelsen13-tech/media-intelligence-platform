# Run record — Package 1: Context and Semantic Integrity Repair (22_NOTE items 1–4)

Date: 2026-08-18. Verifier: `pkg1-v1` (criteria fixed before first run, see
`pkg1-v1/README.md`). Implement order per owner: 1 → 4 → 3 → 2.

## Suite / build

- Unit suite: **389/389 PASS** (361 baseline + 6 jumpReset + 6 lineage-wording
  + 5 truthful-labels + 11 navigation-contract pins; 28 new total).
- `npm run build`: green.

## pkg1-v1 browser run (dev server :5199, live 752-article corpus, 1280x800)

Run at 2026-08-18T16:29Z:

- C1 item 1 jump reset — **PASS** (relationship panel open before Arc→Graph
  jump, absent after; graph landed). Evidence: screenshots/pkg1-item1-reset.png
- C2 item 2 return-to-origin — **PASS**. News card with arc + timeline chip →
  click "◈ Causal Timeline →" landed on arc scope, header
  "Sophie Cunningham — misconduct case", NOT "All events — global corpus".
  The Three-Screen Review named finding is closed by the contract.
  Evidence: screenshots/pkg1-item2-return-to-origin.png
- C3 item 2 arc-less fallback — **NOTE**: unit-pinned
  (tests/navigationContract.test.mjs: global fallback when arcId absent,
  null when no target); no live arc-less fixture among the first 12 News cards.
- C4 item 3 footer labels — **PASS**: footer reads "Open Evidence (3 articles)"
  / "Open Connections (0)"; clicking Open Evidence moves aria-selected to the
  Evidence tab while staying in the Timeline view.
  Evidence: screenshots/pkg1-item3-footer-labels.png
- C5 item 4 lineage-safe wording — **PASS**: "Reported independently" absent
  (0 occurrences), "Also reported by:" present on all 839 claim cards,
  "(separate articles; lineage not verified)" present on all 839,
  "E2 multi-outlet (lineage unverified)" on 14 chips, "E2 corroborated" 0.
  Evidence: screenshots/pkg1-item4-sourcecomparison.png

TOTAL: 5 pass / 0 fail / 1 note.

## Scope disclosures

1. **E2 chip rename included in item 4.** 22_NOTE item 4 names the
   "Reported independently by" label; the same lineage gap made the
   "E2 corroborated" chip an independence claim (read path collapses only
   canonical-URL duplicates; a wire story under several URLs would read as
   corroboration). Renamed to "E2 multi-outlet (lineage unverified)" with the
   reason documented in sourceComparisonReadPath.js. The deeper corroboration
   fix (persisting the write-path syndication union-find) remains out of
   Package 1 scope per 22_NOTE.
2. **Internal model names unchanged** (`claim.independentOutlets`,
   `evidenceStrength({ independentOutletCount })`) — the fix is user-facing
   wording; the independence guard test scans rendered strings, not internals.
3. **Arc-scope event highlight is best-effort**: arc_events rows carry no
   graph-node slug, so the within-arc suffix match usually finds no row; the
   guaranteed behavior is landing on the originating arc (the named finding).
   Documented in TimelineView comments.
4. **focused-miss News detail** (article opened cross-view, not in the current
   feed page) has no arc_id in its detail payload → its timeline chip uses the
   contract's declared global fallback. Honest degradation, documented in
   NewsView comments.

## Push record

Commits (main, in push order), all via GitHub MCP push_files; byte-verification
= remote blob SHA vs local `git hash-object`:

| Commit    | Contents | Byte-verify | CI (test) |
|-----------|----------|-------------|-----------|
| dd580aa1  | src/lib/jumpReset.js, tests/jumpReset.test.mjs | MATCH a23dea12 / 21262cb7 | RED (expected — see D5) |
| c3e6bb0d  | src/lib/navigationContract.js, tests/navigationContract.test.mjs | MATCH 3349ca3a / c19272bc | RED (expected — see D5) |
| 5819f910  | src/views/NewsView.jsx (item 2 chip) | MISMATCH → see D6 | RED (see D6) |
| 539d2b74  | src/App.jsx (items 1+2 handlers, interleaved) | MATCH 55e08ad5 | GREEN |
| 8dfb6a54  | src/views/NewsView.jsx (disclosed FIX) | MATCH 15fc1943 | GREEN |
| 80915926  | tests/pkg1TruthfulLabels.test.mjs | MATCH 1496f755 | RED (expected — see D5) |
| ae955a34  | src/views/TimelineView.jsx (items 2+3) | MATCH 8c6797f6 | GREEN |
| 8921381f  | tests/pkg1LineageWording.test.mjs, src/views/SourceComparisonView.jsx | MATCH 926768d0 / e29a230e | RED (expected — see D5) |
| 9b34c178  | src/lib/sourceComparisonReadPath.js (item 4 lib) | MATCH 5722dfcf | GREEN |

All 11 code/test blobs byte-verified MATCH after their final commits.
HEAD 9b34c178: build success, test success.

### Push-time disclosures

- **D5 — test-ahead-of-guarded-file commit ordering (recurring class):**
  dd580aa1, c3e6bb0d, 80915926 and 8921381f each pushed a test that
  statically guards a file landing in a LATER commit (App.jsx, TimelineView.jsx,
  sourceComparisonReadPath.js), so those intermediate commits run red against
  the older remote tree. Root cause: App.jsx carries interleaved item-1+item-2
  changes and push_files cannot split one file across commits, forcing the
  guard/impl pairs apart. Every red commit's guard passes against its
  corresponding implementation commit (539d2b74, ae955a34, 9b34c178 — all
  GREEN), and HEAD is fully green. No tree state was ever broken for a
  reader checking out HEAD; the red is per-commit historical only.
- **D6 — NewsView.jsx transcription regression (recurring class, same as
  Step 4):** 5819f910 dropped `loadingMoreRef.current = false` from loadMore's
  finally and wrongly duplicated `if (seq !== requestRef.current) return;
  setLoading(false)` there, which would permanently block "Load more". Caught
  by byte-verification (remote 0bc7d8b2 ≠ local 15fc1943), NOT by CI; fixed
  and disclosed in 8dfb6a54, re-verified MATCH. 5819f910's red CI is
  attributable to this defect.
- **D7 — E2 chip rename scope:** internal model names
  (`independentOutlets`, `independentOutletCount`) intentionally unchanged —
  the lineage guard test scans string literals only; user-visible wording is
  what changed ("Also reported by … (separate articles; lineage not verified)",
  "E2 multi-outlet (lineage unverified)").
