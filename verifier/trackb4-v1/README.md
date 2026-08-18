# verifier/trackb4-v1 — Track B Step 4 (News Feed, addendum Screen 1)

Date: 2026-08-18
Harness: `check_step4.py` (Playwright, dev server at
`http://localhost:5199/media-intelligence-platform/`, light theme live via
theme flag). Run record: `verifier/runs/2026-08-18-trackb-step4-news-feed.md`.

## Acceptance criteria (owner rulings 2026-08-18 applied)

| # | Check | Basis |
|---|-------|-------|
| 1 | Title block "News" + blue dot + "New since your last visit on this device · N" | Addendum Screen 1; ruling #1 (browser-local, honest label; localStorage pre-seeded for determinism) |
| 2 | Epistemic banner: "Missing evidence is recorded, not treated as contradiction." | Addendum inline epistemic banner |
| 3 | Region/Evidence/Topic pills render disabled + honest tooltip | Ruling #2 (visibly inert; no pill implies filtering it does not do) |
| 4 | Wired outlet/status chips still filter | Ruling #2 (coexistence) |
| 5 | Card anatomy: blue date (= active theme `--accent-soft`), ink headline, outlet + region attribution, summary, provenance footer | Addendum card anatomy; region via outlets.country join (articles carry no region column) |
| 6 | Provenance vocabulary limited to the two ruled labels; "Primary filing linked" only on a card with a real court_doc/agency_release citation (deterministic search probe) | Ruling #6 (cited_type discriminator exists — never fabricate) |
| 7 | Arc chip only when arc_id exists; Graph chip only when a citation resolved to a node | Addendum: chips shown ONLY when the link exists |
| 8 | Multi-article event collapses to one group card, "N outlets reporting" | Parent-doc Step 4 grouping requirement |
| 9 | No status badge on card faces (badges confined to expanded detail) | Ruling #9 |
| 10 | App header "Live corpus — 752 articles — updated Aug 1x, 2026" (absolute date — static corpus must never read "min ago") | Addendum carried-forward header; ruling #7 |
| 11 | Accent removal: all meaning survives grayscale(1) | Standard acceptance discipline |
| 12 | AA contrast ≥ 4.5:1 on every pair touched by this step (effective background resolved by ancestor walk) | Standard acceptance discipline |
| 13 | Mobile 390px: title, banner, inert pills, cards, Filters sheet | Browser smoke requirement |

Unit pins: `tests/newsFeedModel.test.mjs` (9 pins) guards
`src/lib/newsFeedModel.js` — provenance basis, freshness label (relative
<24h / absolute ≥24h), live-corpus label, event grouping, last-visit
read-then-advance.
