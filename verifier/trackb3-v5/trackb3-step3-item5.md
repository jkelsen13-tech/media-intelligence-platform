# trackb3-v5 — Track B Step 3, Item 5 (final): ArcsView Timeline tab (Screen 4 ↔ Screen 5 parity)

Date: 2026-08-18. Namespace: trackb3-v5. Branch: main.
Reference: 04_ADDENDUM_SIX_SCREEN_REFERENCE_SPEC (2026-08-17), Screen 4
(Policy Arc) third tab + Screen 5 (Timeline) connector/entry anatomy —
the locked reference. Blue background in the reference is placeholder
only; light-theme tokens govern.

## Scope

Add the addendum's third tab (Timeline) to `src/views/ArcsView.jsx`,
consuming the shared `ArcTimeline` renderer and the item-3 connector
engine through the item-4 seams — reuse, never rebuild. Files:

1. `src/views/ArcsView.jsx` — third tab button (Timeline) between
   Overview and Evidence; Timeline tab body rendering ArcTimeline over
   the SAME arc_events detail Screen 4 already loads (loadArcDetail);
   closing footnote in the TrustFooter left slot, gated on the Timeline
   tab; the two stale "Timeline tab arrives/deferred" comments updated.
2. `tests/arcTimelineTab.test.mjs` — NEW static drift guards pinning the
   structure below. Rides the SAME commit as ArcsView (item-3 lesson:
   a test and every file it guards never split across commits).

No new components, no new lib functions, no supabase.js changes — every
dependency (ArcTimeline, normalizeArcEvent, TIMELINE_CLOSING_FOOTNOTE,
loadArticleExcerpt) already exists from items 3/4 and is imported.

## Design decisions (locked)

D1. Tab order is Overview / Timeline / Evidence — the addendum's Screen 4
    order. The Timeline tab button uses the same ep-tab/ep-tab-active
    classes and role="tab"/aria-selected pattern as the existing two.
D2. Entries: detail.events.map(normalizeArcEvent).filter(Boolean) — the
    item-4 seam, so the tab can never drift from Screen 5's arc scope.
D3. edges={[]} by construction: arc_events are not graph nodes, so every
    connector between every adjacent pair renders "Sequence only" — the
    honest state of the live record, identical to Screen 5's arc scope
    (item-4 D2/D8). Connectors are never dropped for density.
D4. loadArticle={loadArticleExcerpt} passed through unchanged; arc-scope
    entries carry articleId null, so expansion renders the explicit
    excerpt-unavailable state — no fabricated excerpts.
D5. emptyText: "No consequence events recorded yet for this arc." — the
    same string Screen 5's arc scope uses.
D6. Closing footnote: TIMELINE_CLOSING_FOOTNOTE imported via the
    timelineScreenModel re-export seam (never re-typed, never imported
    from timelineEngine directly — one seam owns screen copy), rendered
    as <span className="ep-tl-footnote"> in the TrustFooter left slot
    ONLY while the Timeline tab is active (left=null otherwise, so
    Overview/Evidence keep the footer they had). reviewedAt stays null.
D7. Both stale comments ("the Timeline tab arrives with the item-3/4
    engine" header line; "The addendum's third tab (Timeline) is added
    when the item-3/4 engine ships" state comment) are rewritten to
    describe the shipped tab — no dangling forward references.

## Acceptance criteria

A5.1 Three tabs in addendum order (overview, timeline, evidence), each
     role="tab" with aria-selected; Timeline body gated on
     activeTab === 'timeline'.
A5.2 ArcTimeline imported and rendered with entries from
     normalizeArcEvent(detail.events), edges={[]} literal at the call
     site, loadArticle={loadArticleExcerpt}, the D5 emptyText.
A5.3 Connectors: buildConnectors over the normalized entries with
     edges=[] yields n−1 "Sequence only" connectors — asserted in tests
     via the item-3 engine, mirroring A4.6.
A5.4 Footnote: TIMELINE_CLOSING_FOOTNOTE imported from
     timelineScreenModel (the seam), rendered in TrustFooter's left slot
     only when the Timeline tab is active; the string literal never
     appears in ArcsView (never re-typed).
A5.5 Reuse not rebuild: ArcsView contains no buildConnectors import, no
     connector/entry markup of its own, no ep-tl-* class definitions;
     ArcTimeline/TrustFooter/status badge system imported from the
     shared kit (static guard; hex audit clean on changed files).
A5.6 Stale comments removed; remaining comments describe shipped state.
A5.7 Full suite green (item-4 baseline 332 + new), build clean, live
     smoke: default arc Timeline tab renders entries with a "Sequence
     only" connector between every pair and the footnote in the footer.
A5.8 Acceptance pass: grayscale/accent-removal verification on BOTH
     screens (Screen 4 with the new tab, Screen 5), causal-vs-sequence
     distinction legible with color removed, AA contrast audit on all
     new/changed pairs, mobile 390px + desktop capture set.
A5.9 Push discipline: ONE commit carrying ArcsView + its guard test
     together; commit message re-read against the actual file list
     BEFORE pushing (trackb3 disclosure-1 rule) — flag and hold on
     mismatch; byte-verify every pushed blob; CI green per commit.
