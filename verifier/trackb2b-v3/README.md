# trackb2b-v3 — entity_type mapping correction re-confirmation (2026-08-18)

Created 2026-08-18, after the owner-ruled correction track: 12 nodes whose
stored metadata.entity_type='person' contradicted their canonical entity
records ('other') were corrected in live data, and cardTypeInfo/regionOf were
fixed to read entity_type honestly — institution -> "Institution", other ->
"Other", both UNGROUPED (regionOf null) instead of force-fit into Civil
society.

## Why a new version

v2's T3.c purity criterion ("no hull encloses a foreign node center") was
written when EVERY node had a region. With ungrouped nodes the criterion
splits: a hull enclosing a DIFFERENT REGION's member still asserts a false
grouping (hard gate, must be 0); a hull enclosing an UNGROUPED node is
convex-hull geometry, not a grouping claim (ungrouped = no-membership), and
is disambiguated by the node's own card label. Recorded, not gated.

## Pass criteria (fixed before running)

M1 unit pins (tests/cardRegions.test.mjs): institution -> Institution/octagon/
  ungrouped; other -> Other/circle/ungrouped; person/org/missing unchanged.
M2 v2 checks T1–T3 re-run against live data with the corrected modules; all
  pass except T3.c which is replaced by:
  T3.c' foreign-REGION hull violations == 0 (hard gate);
  ungrouped enclosures recorded with node labels (informational).
M3 browser smoke (built bundle): Middle East card reads "Other" and renders
  ungrouped; an institution node (search-focused) reads "Institution" and
  renders ungrouped; no Civil society boundary contains either; grayscale
  screenshot legibility (accent-removal bar carried from v2).

Harness: `measure-mapping.mjs`. Smoke: `/tmp/mip2/smoke-mapping.mjs`
(scratch, recorded in the run log). Run log:
`../runs/2026-08-18-trackb-step2b-mapping-fix.md`.
Differs from v2: v2 verified the Step 2b build as shipped; v3 verifies the
post-correction mapping against corrected live data, and re-frames T3.c for
the ungrouped-node regime the owner ruled into existence.
