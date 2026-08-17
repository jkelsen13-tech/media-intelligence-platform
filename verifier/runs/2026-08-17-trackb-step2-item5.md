# Run log — 2026-08-17 — Track B Step 2 item 5 (docked relationship panel)

Criteria: `verifier/v16/docked-relationship-panel.md`. Script:
`verifier/v16/check_item5.py`.

## Commits (in order)

| Commit | Contents |
|---|---|
| `ac620d4b79ad842eba7184eb8779c926cd478f23` | src/lib/relationshipProvenance.js (new pure view-model seam), tests/relationshipProvenance.test.mjs (new, 11 tests) |
| `29bfbb03e8eb5c215186b74e51c4226c4a03d0d7` | src/lib/supabase.js (loadEdgeSources resolver + humanizeSourceName), src/panels/RelationshipPanel.jsx (new), src/panels/relationship-panel.css (new), src/App.jsx (panel wiring, Escape, panelOpen), src/graph/GraphView.jsx + EdgeList.jsx + theme.js (comments) |
| `f8226cd9a8dd00e5d42a5b781fa55b6090dd95c6` | delete src/graph/EdgeEvidence.jsx (floating popover retired) |
| `de2c7b3bea5973a09d4721e5223ce2b094752f7d` | fixup: restore the keyboard-zoom expression in GraphView.jsx verbatim — one transcription slip in 29bfbb03 (a duplicated Math.max wrapper, functionally identical) caught by post-push hash verification and corrected before any other work proceeded |

## Byte verification (post-push, codeload tarball of main @ de2c7b3b)

All blob SHAs match the local working copy exactly:

- `1c036aa3bf893949f9fe102df479a931a040fb53` src/lib/relationshipProvenance.js
- `7fec191513bff8a65e6d01d7762edf884c42f059` tests/relationshipProvenance.test.mjs
- `254b652997f1e1ae3ce79ee6849d5e22585f44b0` src/lib/supabase.js
- `524ab71eb6193fd862c3e020f8fc77df219de62a` src/panels/RelationshipPanel.jsx
- `af6defd09af85e5f8bc1604d302369810d0b0a83` src/panels/relationship-panel.css
- `fc7b47d812bb5a566cd0e17518f37a3aa9a7feb9` src/App.jsx
- `96f4a84bd3ec3a02c9f26f80a03af14929577b4e` src/graph/GraphView.jsx
- `0e22d0c367fd00764312e67e474f95b00ce7ccd9` src/graph/EdgeList.jsx
- `cfb9f8c1826e9ae73f1ffe1c9000d320f855ac59` src/graph/theme.js

src/graph/EdgeEvidence.jsx confirmed ABSENT. Full-tree `diff -r`
(remote tarball vs local working copy): empty.

## CI (api.github.com check-runs)

- `ac620d4b`: build success, test success x2, deploy success.
- `29bfbb03`: test success x2; build/deploy cancelled (normal
  supersession — f8226cd9 and de2c7b3b landed seconds later).
- `f8226cd9`: no runs (superseded by de2c7b3b immediately).
- `de2c7b3b` (tip): build success, test success x2, deploy success.

## Test / build (dev tree, item-5 working copy)

- `node --test tests/`: **264 pass, 0 fail** (253 prior + 11 new
  relationshipProvenance tests: sourced full render; authentication
  honestly not-archived; independence always unverified x3 scenarios;
  unsourced honest states; missing != contradicting; no-explanation
  degrade; flag-off withhold; sequence/causal meaning lines; unresolved
  source ids; empty input).
- `npm run build`: clean.

## Playwright (dev server on the item-5 tree, live data, desktop 1280x800 + mobile 390x844)

26 checks, **26 PASS, 0 FAIL** (item5-results.json):

- desktop/tap-sourced-edge, sourced-named-source ("Federal Register",
  "Promoting Employee Accountability"), sourced-reviewed-badge
  ("Reviewed — human confirmed"), sourced-grounding (blockquote),
  sourced-axis-values ("1 of 4 (1 = highest)", "documented"),
  sourced-falsification, sourced-corrections ("needs-source-first"),
  sourced-independence-unverified
- desktop/panel-docked-no-overlap (stage_right=960, panel_x=960,
  panel_w=320)
- desktop/no-floating-popover, desktop/escape-closes
- desktop/tap-unsourced-edge, unsourced-no-sources,
  unsourced-awaiting-review, unsourced-axes-honest-tones
  ("Not archived — authentication not yet available",
  tone_unavailable>=1, tone_unverified>=1),
  unsourced-independence-unverified, unsourced-meaning-in-words
  ("happened before — temporal order only, no causation claimed"),
  unsourced-raw-relation-kept ("sequence: after"),
  unsourced-no-false-falsification, unsourced-sections-intentional
  (empty_sections=0)
- desktop/tap-noexplanation-edge, noexplanation-honest
  ("No provenance recorded yet" + "not yet available")
- desktop/edge-list-opens-docked-panel
- mobile/tap-unsourced-edge, mobile/sheet-honest-states,
  mobile/sheet-is-bottom-sheet (position: fixed)

Screenshots: 2026-08-17-item5-desktop-sourced.png,
-item5-desktop-unsourced.png, -item5-desktop-noexplanation.png,
-item5-mobile-sheet.png.

## Regression suites on the item-5 tree

- v14/check_item3.py: PASS. v12/check_overlap.py: PASS.
  v13/check_item2.py: PASS.
- v15/check_item4.py: the six pre-popover checks PASS (canvas plain
  labels, no machine vocabulary, legend phrases, distinction note,
  grayscale survival); the run then times out waiting for the retired
  `.edge-evidence` popover — EXPECTED supersession: item 5 replaces
  the popover with the docked panel, and the popover's substance
  (meaning in words + raw Relation extraction row) is re-verified in
  the panel by this version's checks (unsourced-meaning-in-words,
  unsourced-raw-relation-kept). v15 is preserved unchanged as the
  historical record of its iteration.

## Fixes during verification (disclosed)

1. **Timing race.** The provenance fetch takes ~1.5-2s; the first
   checker revision used a fixed 1200ms wait and read the panel while
   it still showed "Loading provenance…", failing every provenance-
   gated check. Fixed with wait_provenance() (wait_for_function on
   the loading line's absence, 15s timeout), applied to the unsourced,
   no-explanation, and mobile sections. Panel code was correct; the
   checker was wrong.
2. **Wrong axis expectation.** The unsourced-axes check originally
   expected >=2 tone-unavailable axes, but the live unsourced edge has
   REAL reliability (4 of 4) and doc_strength (circumstantial) values
   — only authentication is unavailable. The panel was correct; the
   check was corrected to unsourced-axes-honest-tones (unavailable>=1
   AND unverified>=1 AND the not-archived text).
3. **Transcription slip.** Commit 29bfbb03 carried a duplicated
   Math.max wrapper in GraphView.jsx (functionally identical,
   byte-different). Caught by post-push hash verification; corrected
   in de2c7b3b before any further work.
