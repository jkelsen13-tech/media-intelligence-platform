# trackb3-v4 — Track B Step 3, Item 4: Timeline screen (Screen 5)

Date: 2026-08-18. Namespace: trackb3-v4. Branch: main.
Reference: 04_ADDENDUM_SIX_SCREEN_REFERENCE_SPEC (2026-08-17), Screen 5
(Timeline) + reference screenshot IMG_2994 — the locked reference. Blue
background in the reference is placeholder only; light-theme tokens govern.

## Scope

Rebuild `src/views/TimelineView.jsx` as the addendum's Screen 5, consuming
the item-1 kit and the item-3 engine, arc-scoped by default (owner
delegation 2026-08-18: "arc-scoped Timeline with global views behind an
explicit 'All events' opt-in"). Files:

1. `src/lib/timelineScreenModel.js` — NEW pure seam: locked Screen 5 copy
   constants, entry normalization (arc_events + node events → one entry
   shape), filter-option derivation and filtering, default-arc selection,
   footer counts.
2. `src/components/ArcTimeline.jsx` — NEW shared vertical-timeline
   renderer (date axis, spine, type icon, pill, badge, source line,
   chevron/caret expansion into TimelineEntryDetail, connector between
   EVERY adjacent pair from the item-3 engine). Consumed by Screen 5 now
   and by the ArcsView Timeline tab in item 5.
3. `src/components/ArcEvidencePanel.jsx` — NEW, extracted verbatim from
   ArcsView's Evidence tab (arc-age bar, CoverageGapBar, coverage-gap
   warning, milestone checklist, attached articles) so Screen 5's Evidence
   tab reuses it instead of rebuilding (non-negotiable: reuse, not
   rebuild). ArcsView refactored to consume it.
4. `src/views/TimelineView.jsx` — REWRITTEN shell: eyebrow/title/subtitle,
   arc selector + explicit "All events" opt-in, tabs
   Timeline/Connections/Evidence, date-range + event-type filter pills,
   epistemic banner, ArcTimeline, footer links with live counts, closing
   footnote + trust footer. Global scope retains the pre-existing flat
   view (search, link filters, pagination, focusEventKey cross-jump) and
   the grouped view behind its existing beta flag.
5. `src/lib/supabase.js` — read-path additions ONLY: doc_strength added to
   the edge selects in loadTimeline + loadArcGroupedTimeline (the item-3
   connector engine cannot see strength otherwise); new loadArcConnections
   (edges touching the arc's nodes) and loadArticleExcerpt (on-demand
   expansion excerpt). No writes, no schema change.
6. `src/App.jsx` — the Flat/Grouped chip row and timelineMode state move
   into TimelineView's global scope (they only make sense there); App
   keeps passing onOpenArc/onOpenArticle/focusEventKey unchanged.
7. `src/components/epistemic.css` — appended ep-tl-* styles, var()-only.
8. `tests/timelineScreenModel.test.mjs` — unit pins + static drift guards.

## Design decisions (locked)

D1. Scope: default arc = first arc with derived_status 'active' in
    loadArcs order (already last_update_at desc), else first arc. Arc
    selector lists every arc; "All events" is an explicit opt-in control
    that switches to the global corpus, with an explicit return.
D2. Arc-scope entries = arc_events via loadArcDetail — the SAME source as
    Screen 4's Key developments, so Screen 4 and Screen 5 can never
    disagree about an arc's chronology. Consequence (item-3 finding):
    arc_events are not nodes, so every arc-scope connector renders
    "Sequence only" — the honest state of the record, asserted in tests.
D3. Eyebrow "POLICY CHANGE OVER TIME" and subtitle "Legislation, rulings,
    incidents, and reporting in one auditable sequence." are verbatim
    screen-level constants (the eyebrow names the SCREEN, the title names
    the arc). Banner copy verbatim: "Missing evidence is recorded, not
    treated as contradiction."
D4. Entry anatomy per IMG_2994: date at far left on its own axis;
    circular type icon on the spine (neutral marker for unmapped live
    categories — never an icon that asserts a type the record lacks);
    type pill; bold title; description; source line ONLY when a real
    outlet resolved (arc_events carry no outlet — line omitted, never
    "unknown outlet" wallpaper); status badge via confidenceToBadgeState
    (numeric node confidence is not the badge vocabulary → no badge);
    chevron-right collapsed, caret-up expanded.
D5. Filter pills are real selects styled as pills: date range = "All
    dates" + year-month buckets derived from the entries ("May 2026"…);
    event type = "All event types" + distinct entry types via
    typePillLabel. Undated entries cannot match an active date filter;
    the count line reports the remainder (eventMatches precedent).
D6. Footer links carry LIVE counts: "View N related articles"
    (loadArcArticles count) and "See N graph connections"
    (loadArcConnections count); both navigate to the tab where the data
    lives (Evidence / Connections). Zero is rendered as a live 0 and
    still navigates to an explicit empty state. Global scope: articles =
    entries with a resolved article_id; connections = relationEdges
    count. Never literals.
D7. Closing footnote is the item-3 TIMELINE_CLOSING_FOOTNOTE constant,
    imported — never re-typed. TrustFooter reviewedAt={null} (no
    fabricated review date).
D8. Connectors: buildConnectors(entries, edges) between EVERY adjacent
    pair, rendered by the item-3 TimelineConnector — never dropped for
    density. Arc scope passes edges=[] by construction (D2); global scope
    passes the remapped edges WITH doc_strength so the causal branch can
    fire when the record supports it.
D9. Expansion loads the article excerpt on demand (loadArticleExcerpt)
    only when the entry carries a resolved article_id (global scope);
    TimelineEntryDetail renders the explicit unavailable states otherwise.
D10. Connections tab: real edges touching the arc's nodes (all types,
     doc_strength shown as plain text when present), plain-language labels
     via edgePlainLabel; explicit empty state when none. Evidence tab:
     EvidenceStateBar + guardrail-4 missing scope + ArcEvidencePanel —
     the same components Screen 4 uses.
D11. Global mode preserves legacy behavior: search, link-type filters,
     pagination, focusEventKey cross-window jump (auto-switches scope to
     global), Flat/Grouped chips with the timeline_grouped_beta withhold
     flag. demo-data path (no supabase) still works.

## Acceptance criteria

A4.1 Verbatim copy pinned: eyebrow, subtitle, banner; footnote imported
    from timelineEngine (not re-typed); connector labels render between
    every pair (n−1 for n entries) in BOTH scopes.
A4.2 defaultArcSlug: first active arc else first arc else null.
A4.3 Entry normalization: arc_events → entries (key/date/type/title/
    description/confidence, articleId null); node events → entries
    (articleId from the suffix join); undated entries sort last and show
    "undated".
A4.4 Filters: month buckets derived from data; type options from data;
    active date filter excludes undated entries; count line remainder.
A4.5 Footer counts are live derivations (never literals) and navigate to
    the correct tab; zero counts navigate to explicit empty states.
A4.6 Arc-scope connectors are ALL "Sequence only" on the live record
    (arc_events not nodes) — asserted via buildConnectors over the
    normalized entries with edges=[].
A4.7 Read-path: doc_strength present in both timeline edge selects and
    flows through remapTimelineEdges (spread passthrough) to the
    connector engine; loadArcConnections/loadArticleExcerpt are
    read-only and null-safe (no-supabase path returns empty/null).
A4.8 Reuse not rebuild: CoverageGapBar + milestone checklist exist in
    exactly ONE file (ArcEvidencePanel.jsx) consumed by both views
    (static guard); StatusBadge/TypePill/TypeIcon/EpistemicBanner/
    TrustFooter/TimelineConnector/TimelineEntryDetail imported, not
    reimplemented.
A4.9 Withhold/honest degradation: no badge for unmapped confidence; no
    source line without a real outlet; no causal label without the full
    item-3 rule; no review date; unknown types humanize, never leak.
A4.10 Suite green (315 baseline + new), build clean, no hardcoded hex in
    new/changed files, byte-verified pushes, CI green per commit (a test
    and every file it guards ride the SAME commit — item-3 lesson).
A4.11 App wiring: view==='timeline' renders only TimelineView; legacy
    flat/grouped reachable inside global scope; focusEventKey jump still
    lands on the canonical card (auto-switch to global).
