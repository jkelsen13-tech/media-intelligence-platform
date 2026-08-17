# v16 — Docked relationship panel with honest empty states (Track B Step 2 item 5)

Created 2026-08-17. Verifies that the floating edge-evidence popover is
replaced by a docked relationship panel that shows what is actually
recorded for the selected relationship — named sources, grounding
excerpt, all six G2 axes — and that every missing datum renders as an
explicit, intentional empty state ("unverified" / "not yet available"),
never as blank space or fabricated confidence.

## Acceptance gate (owner, verbatim)

"confirm it renders correctly for both edges WITH real source/grounding
data (the 3 that exist) and edges WITHOUT it (the other 408) — both
states need to look intentional, not broken."

## Live-data census (2026-08-17, read at verification time)

411 graph edges. explanations (is_current=true) edge rows: 372 total —
3 reviewed/state=ok WITH source_ids (the edges with real sourcing),
368 awaiting_review (367 insufficient_evidence + 2 source_unavailable…
precisely 367 insufficient_evidence, 2 source_unavailable, 3 ok,
1 withdrawn — 372 in all), 39 graph edges with NO explanation row.
Representative ids used by the checker: sourced
a209ab4f-3345-4c9c-9f3e-845c51d3ae77; unsourced
d27247b2-09a3-4b69-8c79-0991872910d0; no-explanation
0200bd0e-c0b5-4530-9459-3bbe93412bba.

## Criteria

1. **Sourced edge renders real data.** On the sourced edge the panel
   shows a NAMED source list ("Federal Register" + linked title), the
   recorded grounding excerpt as a blockquote, the "Reviewed — human
   confirmed" badge, real axis values (source reliability "1 of 4
   (1 = highest)", evidence strength "documented"), the falsification
   condition, and the correction history.
2. **Unsourced edge renders honest states.** "No sources documented
   yet for this relationship.", "Awaiting review" badge, at least one
   axis styled tone-unavailable ("Not archived — authentication not
   yet available") and at least one tone-unverified; independence is
   always "Unverified — source lineage not yet tracked". A 'missing:'
   falsification placeholder is never rendered as a real condition.
3. **No-explanation edge degrades honestly.** "No provenance recorded
   yet"; grounding "not yet available"; extraction detail (raw
   Relation, signal source) still shown from the edge itself.
4. **Both states look intentional.** Every panel section carries
   visible content (no section under 12 chars); unverified/unavailable
   tones are visually distinct from recorded values (CSS tones), not
   blank space.
5. **Docked layout, no overlap.** Desktop: the panel is a flex sibling
   of the graph stage (stage right edge <= panel left edge; panel
   width 320px) — the canvas shrinks beside it and is never covered.
   Mobile: fixed 60vh bottom sheet (position: fixed) with the same
   honest states.
6. **Popover retired.** No `.edge-evidence` element ever appears; the
   relationship-list Evidence button opens the same docked panel;
   Escape closes the panel.
7. **Item-4 substance preserved in the panel.** The meaning line
   carries the causal-vs-sequence distinction in words ("happened
   before — temporal order only, no causation claimed"); the raw DB
   label stays as the "Relation (raw)" extraction row.
8. **Locked corrections hold in the pure seam.** Source count is never
   a strength signal (panel shows named sources plus the note "The
   number of sources is not a measure of evidence strength.");
   independence is never asserted without lineage; missing
   contradicting evidence renders "Not checked", never "none exist".
9. **Regression floor.** Full unit suite 264/264 green (253 prior +
   11 new relationshipProvenance tests); v14/v13/v12 suites re-run
   green on the item-5 tree; v15's six pre-popover checks still pass
   (popover-era checks superseded by this version — see the run log);
   clean build; byte-verified pushes; CI green on the item-5 tips.

## Method

- Playwright script: `v16/check_item5.py` (criteria 1-7 live; desktop
  1280x800 + mobile 390x844; cytoscape instance read via the
  container's `_cyreg.cy` registry — no debug globals; async
  provenance fetch awaited via a loading-line watch, 15s timeout).
  Writes timestamped screenshots to the local evidence folder.
- Unit seam: `tests/relationshipProvenance.test.mjs` (criterion 8 plus
  sourced/unsourced/no-explanation/flag-off/meaning/unresolved-id/empty
  scenarios mirroring the live rows).
