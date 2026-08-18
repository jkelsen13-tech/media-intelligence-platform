# verifier/pkg1-v1 — Package 1: Context and Semantic Integrity Repair

Criteria FIXED 2026-08-18 before the first run (goal-mode rule). Covers
22_NOTE_DEEP_READINESS_REVIEW Package 1 action items 1–4, implemented in
the owner-confirmed order 1 → 4 → 3 → 2.

Runs against a dev-server build at
http://localhost:5199/media-intelligence-platform/ (live Supabase corpus,
752 articles, max(fetched_at) 2026-08-10). Desktop viewport 1280x800.

## Criteria

- **C1 (item 1 — jump reset, Arc→Graph):** with a RelationshipPanel open
  in the Graph (node search → node panel → ⓘ edge-evidence button),
  navigating Arcs → arc → "Explore connections" lands on the Graph with
  NO `.relationship-panel` in the DOM (stale relationship panel /
  endpoint / excerpt / uncertainty cleared). Focus-stack reset itself is
  unit-pinned (tests/jumpReset.test.mjs).
- **C2 (item 2 — return-to-origin, News→Timeline):** expanding a News
  card that carries BOTH an Arc badge and a "◈ Causal Timeline →" chip,
  then clicking the chip, lands the Timeline on the ORIGINATING arc —
  `.ep-report-title` shows the arc title, NOT "All events — global
  corpus". (Three-Screen Review named finding.)
- **C3 (item 2 — declared fallback):** an article with a timeline key but
  no arc falls back to global scope. Unit-pinned
  (tests/navigationContract.test.mjs); the browser check records the
  outcome if a live arc-less fixture is found in the scanned cards, else
  records "unit-pinned, no live fixture".
- **C4 (item 3 — truthful labels):** the Timeline footer reads
  "Open Evidence (N article(s))" and "Open Connections (…)" — never
  "View … related articles" / "See … graph connections" — and clicking
  Open Evidence switches the in-place tab (role=tab aria-selected moves
  to Evidence) while remaining in the Timeline view.
- **C5 (item 4 — lineage-safe wording + screenshot evidence):** Source
  Comparison (More → Source Comparison) contains NO "Reported
  independently" string; claim meta reads "Also reported by:" with
  "(separate articles; lineage not verified)"; any E2 chip reads
  "E2 multi-outlet (lineage unverified)". Screenshot evidence saved to
  /mnt/agents/work/screenshots/pkg1-item4-sourcecomparison.png.

Screenshots (evidence): pkg1-item1-reset.png, pkg1-item2-return-to-origin.png,
pkg1-item3-footer-labels.png, pkg1-item4-sourcecomparison.png.

## Amendment A1 (2026-08-18, owner-directed mid-package scope expansion)

After the initial implementation passed C1–C5, the owner expanded item 2:
grouped mode extends to ARC scope — arc-scope Timeline landings
(return-to-origin) render the grouped view instead of the flat list, so
context preservation and the richer grouped-events display hold together.
Flat remains available where it already worked (additive, not replacement).
Criteria amended BEFORE the re-run covering the addition:

- **C6 (item 2 expansion — arc-scope grouped landing):** the C2 jump lands
  on the arc AND renders grouped mode at arc scope: `.timeline-grouped`
  present under the arc header, event cards carry per-event outlet counts
  ("N outlet(s) reporting", `.timeline-outlets`, ≥1 present on the landing
  arc), and the flat entry list is not the rendered layout. Flat stays
  reachable via the Flat chip at arc scope.
- **C7 (degradation):** small arcs (1–2 graph-resolved events) render
  gracefully in grouped mode — section header + 1–2 cards, no error
  notice, honest count line. Recorded with screenshot; an arc with zero
  graph-resolved events must show the honest empty notice, not a crash.
- Evidence: screenshots/pkg1-item2-arc-grouped.png,
  screenshots/pkg1-item2-arc-grouped-small.png.
