# v15 — Plain-language edge labels (Track B Step 2 item 4)

Created 2026-08-17. Verifies that every place an edge relationship is
named — canvas, legend, evidence popover, relationship list, both
timelines, article panel — uses a plain-language phrase that carries the
meaning on its own, and that the causal-vs-sequence distinction reads
correctly in words without relying on line style or color alone.

## Acceptance gate (owner, verbatim)

"confirm the causal-vs-sequence distinction reads correctly without
relying on line style alone (per the original Step 2 acceptance
criteria) — labels need to carry the meaning on their own, not just
reinforce a visual cue."

## Criteria

1. **Canvas labels are plain language.** At zoom >= 1.2, labeled edges
   show the plain phrase: sequence edges read "happened before" (never
   the raw DB label "sequence: after"/"sequence: amid"), and no canvas
   edge label contains machine vocabulary ("<type>: ...").
2. **The legend carries the meaning in words.** Every edge-type row
   shows `Label — "phrase"` (e.g. Causal — "led to", Sequence —
   "happened before", Actor — "involves"), and the distinction is
   stated explicitly: "Causal claims one event led to another. Sequence
   claims only that one happened before the other — no causation is
   claimed."
3. **Meaning survives accent removal.** Under `filter: grayscale(1)`
   (no color, and line style reduced to a tone difference), the legend
   phrases and the distinction note are still fully present — words,
   not styling, carry the meaning.
4. **Evidence popover states meaning in words.** On a sequence edge,
   EdgeEvidence shows Type "Sequence" plus Meaning "happened before —
   temporal order only, no causation claimed"; a causal edge reads
   "led to — a causation claim". The raw DB label is retained below as
   extraction detail ("Relation: sequence: ...") — plain language does
   not erase provenance.
5. **Relationship list is plain.** The Relationship column shows
   "happened before", never "sequence: ...".
6. **Timelines are plain.** Causal Timeline (flat) sequence links read
   "(happened before)", never "(sequence: ...)"; the grouped timeline
   uses the same helper.
7. **Unknown types degrade honestly.** `edgePlainLabel` humanizes an
   unknown type's raw label (stripping a "type: " prefix) rather than
   rendering machine vocabulary; last resort is the type key. Empty
   input is safe (returns '').
8. **Regression floor.** Full unit suite 253/253 green (246 prior + 7
   new edgePlainLabel tests); v14, v12, v13 suites re-run green on the
   item-4 tree; clean build; byte-verified pushes; CI green on every
   item-4 commit.

## Method

- Playwright script: `v15/check_item4.py` (criteria 1-6 live; desktop
  1280x800 + mobile 390x844; cytoscape instance read via the
  container's `_cyreg.cy` registry — no debug globals). Writes
  timestamped screenshots to the local evidence folder.
- Unit seam: `tests/edgePlainLabel.test.mjs` (criterion 7 plus the
  phrase table, live vocabulary, and the "sequence never implies
  causation" wording guard).
- Byte verification: fresh codeload tarball of `main` after the final
  code push; `git hash-object` on all nine item-4 files must equal the
  local working-copy blob SHAs; full-tree `diff -r` must be empty.
- CI: check-runs endpoint on each commit (test x2, build, deploy).

Differs from prior version: first language/semantics criterion set;
asserts meaning carried by words under accent removal (grayscale)
rather than by color or line style, and adds the first cytoscape
stylesheet-ordering defect (found and fixed during implementation,
documented in the run log).
