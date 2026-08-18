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

## Amendment A1 run — owner-directed mid-package scope expansion (2026-08-18, post-initial-implementation)

**Disclosure (explicit, per owner instruction):** AFTER items 1–4 were
implemented, verified (5 pass), and pushed, the owner expanded item 2's
scope: grouped mode now works at ARC scope, and arc-scope Timeline landings
(return-to-origin) render the grouped view — event cards with per-event
outlet counts — instead of the flat list. This is an owner decision made
post-initial-implementation; it is recorded here as a scope expansion, NOT
folded into the original item 2 description. pkg1-v1 criteria were amended
(Amendment A1: C6, C7) BEFORE the covering re-run, per the fixed-criteria
rule. The in-flight verifier commit (94b4e096, 4 blobs) was fully pushed
and byte-verified BEFORE any work on this addition began; nothing already
pushed was amended.

Implementation (additive; flat untouched and reachable via the Flat chip at
both scopes):
- `arcGroupedTimeline.js`: new pure seams `buildEventOutletIndex` (eventId →
  distinct sorted outlets from the events/event_articles store, the same
  join News Feed grouping uses) and `attachEventOutlets` (via each canonical
  event's Doc 05 article join; unresolved → null, the card withholds the
  line rather than fabricating); loader read set extended (articles +
  outlet; event_articles via keysetAllComposite — 8 reads).
- `GroupedTimelineView.jsx`: new `arcId` prop restricts to one arc section
  (no section pager / Unclassified / category filter; honest empty notice
  for arcs with no graph-resolved events); event cards render
  "N outlet(s) reporting" when resolved. Global behavior unchanged.
- `TimelineView.jsx`: Flat/Grouped chips render at BOTH scopes; arc-scope
  landing effect sets grouped mode when the flag is on; grouped render no
  longer gated on global scope.
- Unit pins: tests/pkg1ArcGroupedMode.test.mjs (11 tests: 6 pure-seam +
  5 static guards). The Doc 13 pagination guard
  (tests/arcGroupedTimelinePagination.test.mjs) was updated to the new
  8-read set — it tripped on the articles-column extension, doing its job;
  guard and guarded file ride the SAME commit.

Suite: **400/400 PASS** (389 + 11 new). `npm run build`: green.

Verifier re-run at 2026-08-18T18:05Z (criteria amended first):

- C6 arc-scope grouped landing — **PASS**: the C2 jump (Sophie Cunningham —
  misconduct case) renders `.timeline-grouped` at arc scope, 1 section, 3
  event cards, 2 outlet-count lines (the third card's article join does not
  resolve to an events-table membership — line honestly withheld, not
  fabricated). Evidence: screenshots/pkg1-item2-arc-grouped.png
- C7 small-arc degradation — **PASS**: scanned 6 arcs (2–4 events each);
  smallest (Nolan Smith — criminal prosecution, 2 events) renders section
  header + meta + 2 full cards with sequence links, no error notice.
  Graceful, not sparse/broken. Evidence:
  screenshots/pkg1-item2-arc-grouped-small.png
- C1, C2, C4, C5 re-run unchanged — all **PASS** (C3 remains the unit-pinned
  NOTE).

TOTAL after amendment: 7 pass / 0 fail / 1 note.

Side effect disclosed: arc-scope event focus now resolves MORE often —
the grouped view's events are graph nodes with slugs, so the 8-hex suffix
focus match works there (flat arc scope matches arc_events rows, which
carry no slug; scope-disclosure 3 above still applies to Flat mode).

## Amendment A2 run — owner-directed C3 live-closure requirement (2026-08-18)

**Disclosure (explicit, per owner instruction):** the owner ruled C3 may not
close Package 1 on a unit pin alone; it required live proof against a real
corpus fixture, or a disclosed constructed fixture if none existed. None
needed construction: a read-only PostgREST sweep found 563 arc-less
articles, 266 with event_articles membership, and 8+ whose id prefix also
matches an event-node slug suffix. Fixture chosen from those: id prefix
`026b222c` — "Israel releases 35 detainees from Gaza" (Al Jazeera),
`articles.arc_id IS NULL`, event node `…026b222c` confirmed. REAL existing
data; no synthetic or fabricated data introduced. Criteria amended
(Amendment A2: C3 upgraded to a required live exercise; C6 fixture rule
clarified) BEFORE this re-run.

Re-run at 2026-08-18T~19:30Z (criteria amended first):

- **C3 arc-less fallback (live) — PASS.** Feed search located the fixture;
  its card shows the "◈ Causal Timeline →" chip with NO arc badge; clicking
  it lands the Timeline on the declared global fallback ("All events —
  global corpus") with the event focus resolving (event label visible on
  the page). Evidence: screenshots/pkg1-item2-arcless-fallback.png.
  C3 status upgraded NOTE → PASS on this live proof.
- C1, C2, C4, C5, C6, C7 re-run — all **PASS** (C6: one landing, Sophie
  Cunningham — 3 cards / 2 outlet lines, third withheld honestly).

TOTAL after Amendment A2: **8 pass / 0 fail / 0 note.**

Checker-side fixes during this run (disclosed, v16 precedent — checker
defects, not app defects):
1. C3's first version sampled for the chip at a fixed 3s after expand; the
   chip is async (loadArticleTimelineKey join) and appeared at ~4s —
   false FAIL "chip did not render". Fixed to a 30s wait_for_selector.
2. Second run then showed a REAL-looking landing failure ("NOT global") —
   investigated with a standalone probe: the arc-less jump DOES land global
   with the event visible, but only after the full global-timeline load
   triggered from arc scope (~45s on the dev server). Fixed to poll the
   title up to 150s. No app change; the contract behavior was correct.
3. C5 timed out at 120s twice in the post-C3 session position (the C3
   global load slows the subsequent Source Comparison join); standalone
   probe: 63s, 839 claims — no app regression. Timeout raised to 240s.
4. C6 fixture variance: one re-run's C2 landed on Gary Cordery —
   military escalation (feed-order dependent), whose 3 events honestly
   resolve ZERO outlet lines (withheld, correct posture). C6's fixture
   rule clarified in the criteria (Amendment A2): up to 3 further
   arc-bearing landings may be scanned for one with resolvable outlet
   coverage; zero-line landings are recorded, not failed.
5. C3 fixture search raced the debounced reload once ("fixture not
   found"); fixed to poll up to 60s.

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
| ac0a633c  | src/lib/arcGroupedTimeline.js, tests/pkg1ArcGroupedMode.test.mjs (Amendment A1, 2 of 6 intended files — see D8) | lib MISMATCH → fixed in 0dda6d3e (see D9); test MATCH 0ae5b7d1 | RED (expected — see D8) |
| 20dd1a48  | src/views/GroupedTimelineView.jsx, src/styles/timeline.css, tests/arcGroupedTimelinePagination.test.mjs (disclosed FIX, D8) | MATCH 38c6c8f8 / b9f49f86 / 7aca16ee | RED (expected — see D8) |
| d2687863  | src/views/TimelineView.jsx (disclosed FIX completing the set, D8) | MATCH ba0bf90b | GREEN (expected) |
| 0dda6d3e  | src/lib/arcGroupedTimeline.js (disclosed comment-transcription FIX, D9) | MATCH 36aa1d6f | GREEN (expected) |

All 11 code/test blobs byte-verified MATCH after their final commits.
HEAD 9b34c178: build success, test success.

Amendment A1 addition: all 6 addition blobs byte-verified MATCH after their
final commits (ac0a633c's lib blob only after the 0dda6d3e correction — D9).
HEAD 0dda6d3e tree = the tree the 400/400 suite, the green build, and the
7 pass / 0 fail / 1 note verifier re-run were executed against.

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
- **D8 — split-push of the intended single Amendment A1 commit (recurring
  class, same as D5 / trackb3-v4):** the item-2 arc-scope expansion was meant
  to land as ONE commit of six files; ac0a633c carried only 2
  (arcGroupedTimeline.js + pkg1ArcGroupedMode.test.mjs) despite a commit
  message describing all six. The pins test statically guards
  TimelineView.jsx / GroupedTimelineView.jsx, so ac0a633c ran RED; the
  disclosed FIX 20dd1a48 (3 more files) still lacked TimelineView.jsx and ran
  RED too; the second disclosed FIX d2687863 landed the sixth file and its
  tree is the verified one. Per-commit historical red only; HEAD green.
- **D9 — comment-transcription slip in ac0a633c's arcGroupedTimeline.js
  blob (recurring class, same as D6):** byte-verification caught remote line
  14 reading "its own internal 25-event internal pager" where the verified
  local file reads "its own internal 25-event pager" (one duplicated word,
  comment-only, no code/behavior change). Corrected to the verified local
  bytes in 0dda6d3e and re-verified MATCH 36aa1d6f. Caught by
  byte-verification, not CI — same detection channel as D6.
