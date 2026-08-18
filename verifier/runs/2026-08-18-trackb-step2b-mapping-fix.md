# Run log — 2026-08-18 — entity_type mapping correction (data + rendering)

Scope: owner-ruled correction track after Step 2b closure. (1) Live data:
12 nodes whose stored metadata.entity_type='person' contradicted their
canonical entity records ('other') corrected. (2) Rendering: cardTypeInfo/
regionOf read entity_type honestly; institution/other actors ungrouped.
Verifier version: `verifier/trackb2b-v3/`.

## Data corrections (Supabase, live writes)

| # | Operation | Result |
|---|-----------|--------|
| 1 | Pre-state read: node eef42b0b (Middle East) | type=actor, metadata.entity_type='person'; canonical entity 15369270 entity_type='other' — contradiction confirmed |
| 2 | Taxonomy check: entities + nodes entity_type vocabulary | person/institution/organization/other only; ALL geographic entities (Iran, Israel, Gaza, Yemen, Red Sea, Tehran, United States, Middle East) are 'other' in the canonical entities table |
| 3 | Defect-class sweep: node metadata.entity_type vs canonical entity | 12 mismatches, all node='person'/entity='other' (Middle East, Taiwan, Wildberries, Iran, World Cup, South Korea, Wisconsin, Red Sea, United States, Nigeria, Gaza, Beijing) |
| 4 | Guarded UPDATE Middle East (WHERE id AND entity_type='person') | 1 row, entity_type='other' |
| 5 | No-other-rows check | nodes 750 unchanged; actor/person 272→271; actor/other 1→2; mismatches 12→11 |
| 6 | Rollback drill Middle East | other→person verified; re-applied person→other verified; final 'other' |
| 7 | Guarded UPDATE 11 flagged nodes (same pattern, owner-ruled) | 11 rows returned, all person→other |
| 8 | Census after | nodes 750; actor/person 260; actor/other 13; mismatches 0 |
| 9 | Rollback drill 11 nodes | other→person (11 rows) verified; re-applied (11 rows) verified; final census re-confirmed: 750 / 260 / 13 / 0 |

## Rendering fix

10. Root-cause finding beyond the approved mapping change: the app's nodes
    select in loadGraph (src/lib/supabase.js) did NOT include metadata — every
    actor hit the missing-metadata default in the running app regardless of the
    stored value. metadata added to the select (read-path only, same pattern as
    the existing edge-metadata column). Without this, the approved mapping fix
    was unreachable by real data.
11. Code: cardRegions.js — cardTypeInfo actor branch: organization→Organization,
    institution→Institution, other→Other, person/missing→Person; regionOf actor
    branch: organization→reporting, person/missing→civil_society, institution/
    other→null (ungrouped). Tests: 2 new pins in cardRegions.test.mjs.
12. `npm test`: 352/352 PASS (350 + 2 new pins).
13. `npm run build`: clean, exit 0, 7.58s.
14. `node verifier/trackb2b-v3/measure-mapping.mjs`: ALL PASS (11 checks).
    T3.c re-framed per v3 README: 0 foreign-region hull violations (hard gate);
    ungrouped enclosures recorded: Middle East + Red Sea inside the incidents
    hull — convex-hull geometry over no-membership nodes, disambiguated by
    their card labels ("Other").
15. Browser smoke (built bundle, headless Chromium, live data):
    - desktop focused default, zoomed: Middle East card reads "Other" (circle
      icon); regions [Incidents] only, badge +365; NO Civil society boundary.
    - search-focused "Supreme Court": card reads "Institution" (octagon icon);
      regions [Incidents] +381; node outside the boundary; zero "Person" cards.
    - grayscale screenshot (desktop zoomed) visually reviewed: card structure,
      icons, labels, dashed boundary all legible without hue. Accent-removal
      PASS.
    Screenshots: /tmp/smoke/mapping-desktop-zoomed.png,
    mapping-desktop-zoomed-grayscale.png, mapping-supreme-court.png.

## Flagged observations (non-scope)
- Entity-level misclassifications behind three 'other' nodes: Wildberries
  (company), World Cup (occurrence), Food and Drug Administration (government
  body) — canonical entities say 'other'; for data-owner review.
- 46 institution nodes previously rendered "Person"/Civil society under the
  old binary mapping; now render Institution/ungrouped. Same defect class,
  fixed by the same mapping.

## Push record + disclosure
- Commit 308faa30: cardRegions.js + cardRegions.test.mjs (blobs 85b28a52,
  5dbb595f — byte-verified MATCH). DISCLOSED: its message described the
  loadGraph select change as part of the same commit, but the push carried
  only the two files (split-push transcription error, same class as trackb3
  disclosure-1 — message not re-read against the actual file list).
- Commit 6089fd2e: src/lib/supabase.js (blob 76c8b0bd — byte-verified MATCH)
  with an accurate single-file message recording the disclosure. The combined
  tree at 6089fd2e is exactly the verified local tree; CI green per commit
  confirmed via check-runs.
