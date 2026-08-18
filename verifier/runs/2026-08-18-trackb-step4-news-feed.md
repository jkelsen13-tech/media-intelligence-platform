# Run log — 2026-08-18 — Track B Step 4: News Feed (Screen 1)

Scope: rebuild News Feed to 04_ADDENDUM Screen 1 per owner authorization
2026-08-18. Documents attached: 00_INDEX + 04_TRACK_B_DESIGN +
04_ADDENDUM_SIX_SCREEN_REFERENCE_SPEC. Same acceptance discipline:
accent-removal test, full suite green, byte-verified pushes, CI green per
commit, checkpoint reporting.

## Tracked items carried in from the correction track (NOT in Step 4 scope)

Logged per owner instruction 2026-08-18; not folded into News Feed work:

1. **Canonical entity-level misclassifications (data-owner review):**
   Wildberries (a company), World Cup (an occurrence), Food and Drug
   Administration (a government body) all carry entity_type='other' in the
   canonical entities table. The node-level corrections applied in the
   mapping-fix track faithfully mirrored these canonical values; the
   canonical values themselves are the flagged defect. Awaiting data-owner
   disposition.
2. **46 institution nodes re-labeled by the corrected mapping:** under the
   old binary org/person cardTypeInfo mapping, all 46 institution actors
   rendered "Person" in Civil society; they now render "Institution",
   ungrouped. Same root defect class as the 12 corrected nodes; no action
   required, recorded so the visible graph change is explained.
3. **Ungrouped-enclosure geometry (informational):** convex region hulls can
   geometrically enclose ungrouped nodes (observed: Middle East, Red Sea
   inside the incidents hull). Recorded, not gated, per trackb2b-v3 T3.c';
   disambiguated by the node's own card label. Revisit only if a layout pass
   ever treats hull interior as membership.

## Gap analysis (pre-code checkpoint)

[Recorded below once delivered to owner — see session transcript;
data-availability probes 2026-08-18: articles 752 rows, no region column
(region available via outlets.country join), all source_status='active',
max(fetched_at)=2026-08-10T16:19:43Z (corpus static since), events +
event_articles live for grouping.]

## Implementation + verification run (2026-08-18)

Owner rulings received on the gap list; citations-schema check (#6) found the
discriminator EXISTS (citations.cited_type: court_doc/agency_release = primary
filings) → no scope change, no extra pre-push checkpoint required.

### Code
- `src/lib/newsFeedModel.js` (NEW) — pure seam: provenanceBasis/
  PROVENANCE_LABELS (PRIMARY_CITATION_TYPES = {court_doc, agency_release}),
  freshnessLabel (relative <24h, absolute ≥24h — static corpus never reads
  "min ago"), liveCorpusLabel (null when count unknown), groupArticlesByEvent
  (multi-article events → one group card; singles flat; order preserved),
  isNewSince, readThenAdvanceLastVisit (browser-local, ruling #1; storage
  failure degrades to null honestly).
- `tests/newsFeedModel.test.mjs` (NEW, same commit as the file it guards) —
  9 pins, all pass. Suite: 361/361 green (352 baseline + 9 new).
- `src/lib/supabase.js` — five read-path loaders: loadCorpusMeta (exact head
  count + max fetched_at), loadNewSinceCount (head-only exact count),
  loadArticleCitationMap (cited_type + firstNodeId per article; keyset),
  loadEventGrouping (event_articles composite keyset + events titles),
  loadOutletRegions (outlets.country join — articles carry no region column).
- `src/views/NewsView.jsx` — title block ("News" + blue dot + "New since your
  last visit on this device · N", count line omitted on first visit/private
  mode), EpistemicBanner ("Missing evidence is recorded, not treated as
  contradiction."), inert Region/Evidence/Topic pills (disabled + honest
  tooltip, ruling #2) alongside the still-wired outlet/status chips,
  restructured cards (blue date leading, ink headline, SourceAttributionLine
  with region, 3-line summary clamp, Arc/Graph chips only when the link
  exists, per-card provenance footer from the real discriminator), event
  group cards ("N outlets reporting"), status badges confined to expanded
  detail (ruling #9).
- `src/styles/news.css` — token-only additions (no hardcoded hex): title
  block, inert pills (dashed + 0.45 opacity + not-allowed), blue date,
  provenance footer, group card.
- `src/App.jsx` — header "data: supabase" replaced with liveCorpusLabel
  output ("Live corpus — 752 articles — updated Aug 1x, 2026"); falls back
  to the honest source label only while the count is unknown.

### Verifier: trackb4-v1 (25/25 PASS)
Playwright harness `verifier/trackb4-v1/check_step4.py` against dev server,
light theme live via theme flag. All 13 criterion groups pass, including:
- last-visit line "· 752" with pre-seeded marker (deterministic);
- inert pills disabled with tooltips; wired chips still filter (752 → 134);
- blue date == active theme --accent-soft (no hardcoded hex expectation);
- provenance: page-1 vocabulary = {"Source-linked summary"} only; "Primary
  filing linked" verified deterministically via headline search of a
  court_doc-cited article ("College football is finally back…");
- event grouping found by paging ("2 outlets reporting", 2 member cards);
- zero status badges on card faces;
- header shows absolute date, never "min ago" (static corpus honest);
- grayscale: all meaning survives;
- AA contrast on 7 touched pairs, 4.79–16.25:1 (min: corpus footer 4.79);
- mobile 390px smoke pass.

Screenshots: /mnt/agents/work/screenshots/2026-08-18-step4-desktop.png,
…-desktop-grayscale.png, …-mobile390.png.

### Harness fixes during the run (recorded, not hidden)
- First run: 18/24. Causes: (a) verifier expected dark-theme accent-soft —
  the live theme flag is LIGHT; fixed to assert against the active theme's
  token; (b) contrast helper measured against transparent element
  backgrounds — fixed with an ancestor walk to effective background; (c)
  "Primary filing linked" is not on feed page 1 by recency — replaced with
  the deterministic search probe; (d) header date expectation Aug 10 →
  Aug 1[01] (local-tz rendering of 2026-08-10T16:19Z). No application code
  was changed to make checks pass.

## Push record + disclosures (2026-08-18)

All pushes via GitHub MCP push_files (git push unavailable); every blob
byte-verified by comparing the remote blob SHA against local
`git hash-object`.

| Commit | Files | Byte-verification |
|---|---|---|
| c8be8bf2 | src/lib/newsFeedModel.js, tests/newsFeedModel.test.mjs | MATCH (3122a59c, 2485165b) |
| f59ea439 | src/lib/supabase.js | MISMATCH → corrected |
| 1d65ec61 | src/lib/supabase.js | MISMATCH → corrected |
| 0aafeacd | src/lib/supabase.js | MATCH (679be8da) |
| 446c2dc4 | src/views/NewsView.jsx, src/styles/news.css, src/App.jsx | NewsView MATCH (b78065f0), news.css MATCH (932c3274), App.jsx MISMATCH → corrected |
| 98d90ac6 | src/App.jsx | MATCH (1f86d822) |

### Disclosure 1 — c8be8bf2 commit-message/file-list mismatch (recurrence)
The commit message described the five supabase.js loaders as riding in the
commit, but the push carried only newsFeedModel.js + its test. supabase.js
was pushed separately as f59ea439 with an accurate DISCLOSURE message. Same
violation class as the correction-track split push; logged here per the
disclosure-1 rule.

### Disclosure 2 — transcription regressions caught by byte-verification
Three regressions were introduced while hand-retyping file contents into
push payloads (no local git push path exists). Each was caught immediately
by remote-blob-SHA vs local-hash comparison, diffed remote-vs-local to
confirm the ONLY differing line(s), and fixed in a follow-up commit with a
disclosed message:

1. f59ea439 (supabase.js): `.in('article_id', [...ids])` in
   loadSkyVerificationForNode was pushed as `.in('id', [...ids])` — would
   silently return no node-level corroboration. Fixed in 1d65ec61.
2. 1d65ec61 (supabase.js): `titleByEvent.get(m.eventId)` pushed where local
   has `m.event_id` — camelCase key never matches; group cards would lose
   canonical event titles. Fixed in 0aafeacd.
3. 446c2dc4 (App.jsx): two pre-existing helper lines mis-transcribed —
   `frontier = next` placement in localSubgraph, and `seen.has(...)` where
   local has `keep.has(...)` in topicSubgraph (undefined identifier in that
   scope; would throw on topic drill-down). Fixed in 98d90ac6.

Process lesson now applied: every file is re-read verbatim from disk
immediately before its push payload is composed; verification diffs confirm
single-line deltas before any fix commit is written.
