# Run log — 2026-08-10 — Part 2: Arc search + SC title search

HEAD verified: 7d67cd06 (main). Deployed via Pages run #215 (Success, 49s).
Golden CI run #113 Success (15s). Local suite at same bytes: 145/145 pass;
production build clean (7.19s).

## Remote blob SHAs (byte-verified, local git hash-object == GitHub blob sha)
- src/lib/listFilters.js            c54d2437203bf5458b81728897512b90bef862a1
- tests/listFilters.test.mjs        5bc6a10ae239eee5d86bd68328f4962c866687cc
- src/views/ArcsView.jsx            87b752f330c070f05a7274a2f9f0a72af8637853
- src/views/SourceComparisonView.jsx 16b1d63d6f402be5d8f74e990967b5d88ef88381
- src/views/sourcecomparison.css    e00dc6baed0afe7e770601b6d05fa445315283db
- src/index.css                     5bf9699496d2749082efbb645f84c3c0ef535b61
  (differs from pre-push local 63758e66 only by one trailing newline —
   normalized during re-push verification; content otherwise identical)

## Live checks (production, ~2026-08-10 UTC+8)
1. Arcs sidebar search, query "trade dispute" -> exactly 4 arcs rendered
   (category-label match path exercised). PASS — part2-arc-search-category.png
2. Arcs sidebar search, no-match query -> 'No arcs match "...".' PASS —
   part2-arc-search-nomatch.png
3. SC search, query "Rhine" -> exactly the 1 matching event card
   (2026-08-03 Rhine drought event). PASS — part2-sc-search-filter.png
4. SC search, query "zzz-no-such-event" -> 'No events match
   "zzz-no-such-event". Clear the search to see all 347 comparison events.'
   PASS — part2-sc-search-nomatch.png

## Incidents during run (disclosed)
- First push reported 'Service temporarily unavailable' but 5 of 6 files had
  landed; index.css re-pushed alone (7d67cd06) after read-only remote check.
- Commit fragmentation: change landed as 4 commits on main
  (8a33c2c2, 51e42050, d696103e, 7d67cd06) instead of the intended 1-2.
- One evidence screenshot (SC no-match) was initially captured against the
  wrong view (News Feed search); re-captured against the correct SC view.
  Final artifact verified to show the SC-specific notice.

Verdict: PASS — both search UIs behave as specified, honest degradation intact.
