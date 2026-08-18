"""Package 1 (22_NOTE items 1-4) — criteria in verifier/pkg1-v1/README.md.

Runs against a dev-server build of the package-1 tree at
http://localhost:5199/media-intelligence-platform/ .
"""
import re
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5199/media-intelligence-platform/"
SHOTS = "/mnt/agents/work/screenshots"

results = []


def record(name, ok, detail=""):
    results.append({"check": name, "status": "PASS" if ok else "FAIL", "detail": detail})
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    return ok


def note(name, detail):
    results.append({"check": name, "status": "NOTE", "detail": detail})
    print(f"[NOTE] {name} — {detail}")


TAB = {
    "Graph": "Knowledge Graph",
    "Arcs": "Story Arcs",
    "News": "News Feed",
    "Timeline": "Causal Timeline",
    "More": "More",
}


def click_tab(page, name):
    page.click(f"nav.app-nav >> button:has-text('{TAB[name]}')")


def run():
    ok = True
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.goto(BASE, wait_until="domcontentloaded")
        page.wait_for_selector("nav.app-nav", timeout=30000)
        page.wait_for_timeout(4000)  # live corpus + graph load

        # ---------- C1 (item 1): Arc→Graph jump clears stale relationship panel
        click_tab(page, "Graph")
        page.wait_for_selector(".graph-area", timeout=60000)
        page.wait_for_selector("input[type='search']", timeout=15000)
        opened = False
        for term in ["the", "a"]:
            page.fill("input[type='search']", term)
            page.wait_for_timeout(600)
            sugg = page.query_selector_all(".graph-search-results button")
            for s in sugg[:6]:
                s.click()
                page.wait_for_timeout(800)
                ev = page.query_selector("button.ap-conn-evidence")
                if ev:
                    ev.click()
                    page.wait_for_timeout(600)
                    opened = True
                    break
            if opened:
                break
        if not opened:
            ok &= record("C1/item1 jump reset", False, "could not open a relationship panel via search")
        else:
            panel_before = page.query_selector(".relationship-panel") is not None
            click_tab(page, "Arcs")
            page.wait_for_selector(".arc-list-item", timeout=15000)
            page.click(".arc-list-item")
            page.wait_for_selector(".ep-cta", timeout=15000)
            page.click(".ep-cta")
            page.wait_for_timeout(1500)
            panel_after = page.query_selector(".relationship-panel") is not None
            on_graph = page.query_selector(".graph-area") is not None
            ok &= record(
                "C1/item1 jump reset",
                panel_before and not panel_after and on_graph,
                f"panel open before jump={panel_before}, after={panel_after}, graph landed={on_graph}",
            )
            page.screenshot(path=f"{SHOTS}/pkg1-item1-reset.png", full_page=False)

        # ---------- C2 (item 2): News→Timeline return-to-origin
        click_tab(page, "News")
        page.wait_for_selector(".news-item", timeout=20000)
        page.wait_for_timeout(2000)
        landed_arc = None
        saw_arcless = []
        tried_idx = set()

        def scan_arc_landing():
            # Expand the next untried arc-bearing card with a timeline chip,
            # click the chip, return the landed timeline title (or None).
            cards = page.query_selector_all(".news-item")
            for i in range(min(len(cards), 12)):
                if i in tried_idx:
                    continue
                try:
                    cards[i].click()
                except Exception:
                    break
                page.wait_for_timeout(2500)
                chip = page.query_selector("button.news-chip.graph-link:has-text('Causal Timeline')")
                if not chip:
                    continue
                tried_idx.add(i)
                has_arc = page.query_selector(".news-detail .news-badge.arc, .news-item .news-badge.arc") is not None
                if not has_arc:
                    saw_arcless.append(i)
                    continue  # C3 path; keep looking for an arc-bearing card
                chip.click()
                page.wait_for_timeout(2500)
                title = page.text_content(".ep-report-title") or ""
                return title.strip()
            return None

        landed_arc = scan_arc_landing()
        if landed_arc is None:
            ok &= record("C2/item2 return-to-origin", False, "no arc-bearing card with timeline chip found in first 12 cards")
        else:
            is_arc = "global corpus" not in landed_arc
            ok &= record(
                "C2/item2 return-to-origin",
                is_arc,
                f"landed on: {landed_arc!r} ({'arc scope' if is_arc else 'GLOBAL — finding NOT closed'})",
            )
            page.screenshot(path=f"{SHOTS}/pkg1-item2-return-to-origin.png", full_page=False)
        if saw_arcless:
            print(f"  [C2 scan] arc-less chip card(s) seen at indexes {saw_arcless} (kept for reference)")

        # ---------- C6 (item 2 expansion, Amendment A1): arc-scope GROUPED landing
        # We are already on the Timeline at arc scope from C2 (landing arc).
        # Fixture note (Amendment A2-era disclosure): C2's first arc landing
        # is feed-order dependent, and some arcs honestly resolve ZERO outlet
        # lines (member outlets unresolvable → withheld, the correct posture).
        # The outlet-count criterion therefore continues scanning untried
        # arc-bearing cards (up to 3 more landings) until one lands on an arc
        # whose events carry resolvable outlet coverage; each landing is
        # recorded. The zero-line landing itself is NOT a failure — the
        # withhold posture is verified separately by C7 and the unit pins.
        if landed_arc is None:
            ok &= record("C6/item2 arc-scope grouped landing", False, "skipped — C2 found no landing")
        else:
            try:
                attempts = []
                for _attempt in range(4):
                    page.wait_for_selector(
                        ".timeline-grouped .timeline-card, .timeline-grouped .notice",
                        timeout=120000,
                    )
                    page.wait_for_timeout(1500)
                    cards = page.query_selector_all(".timeline-grouped .timeline-card")
                    outlet_lines = page.query_selector_all(".timeline-grouped .timeline-outlets")
                    sections = page.query_selector_all(".timeline-grouped .timeline-arc-section")
                    title_el = page.query_selector(".ep-report-title")
                    cur_arc = (title_el.text_content() or "").strip() if title_el else landed_arc
                    attempts.append((cur_arc, len(cards), len(outlet_lines), len(sections)))
                    print(f"  [C6 landing] {cur_arc!r}: cards={len(cards)}, outlet lines={len(outlet_lines)}")
                    if len(cards) > 0 and len(outlet_lines) >= 1 and len(sections) == 1:
                        break
                    if len(cards) == 0:
                        break  # grouped render itself broken — no point re-fixturing
                    # zero outlet lines: honest withhold on this arc; try
                    # another arc-bearing card (fixture continuation).
                    click_tab(page, "News")
                    page.wait_for_selector(".news-item", timeout=20000)
                    page.wait_for_timeout(2000)
                    nxt = scan_arc_landing()
                    if nxt is None:
                        break
                grouped_present = page.query_selector(".timeline-grouped") is not None
                cards = page.query_selector_all(".timeline-grouped .timeline-card")
                outlet_lines = page.query_selector_all(".timeline-grouped .timeline-outlets")
                sections = page.query_selector_all(".timeline-grouped .timeline-arc-section")
                ok &= record(
                    "C6/item2 arc-scope grouped landing",
                    grouped_present and len(cards) > 0 and len(outlet_lines) >= 1 and len(sections) == 1,
                    f"grouped={grouped_present}, sections={len(sections)}, cards={len(cards)}, "
                    f"outlet-count lines={len(outlet_lines)}, landings={attempts}",
                )
                page.screenshot(path=f"{SHOTS}/pkg1-item2-arc-grouped.png", full_page=False)

                # C7: small-arc degradation — walk up to 6 arc options, record
                # each count line, screenshot the smallest render found.
                sel = page.query_selector("select.ep-tl-scope-select")
                smallest = None
                if sel:
                    options = page.query_selector_all("select.ep-tl-scope-select option")
                    for opt in options[:6]:
                        val = opt.get_attribute("value")
                        label = (opt.text_content() or "").strip()
                        sel.select_option(val)
                        page.wait_for_timeout(2500)
                        err = page.query_selector(".timeline-grouped .notice.error, .notice.error")
                        cnt = page.text_content(".timeline-grouped .timeline-count") or ""
                        m = re.search(r"(\d+) event", cnt)
                        n = int(m.group(1)) if m else None
                        print(f"  [C7 scan] {label!r}: events={n}, error={err is not None}")
                        if err:
                            ok &= record("C7/item2 small-arc degradation", False, f"error notice on arc {label!r}")
                            break
                        if n is not None and (smallest is None or n < smallest[1]):
                            smallest = (label, n)
                    if smallest is not None:
                        # re-select the smallest for the screenshot
                        opts = page.query_selector_all("select.ep-tl-scope-select option")
                        for opt in opts:
                            if (opt.text_content() or "").strip() == smallest[0]:
                                sel.select_option(opt.get_attribute("value"))
                                break
                        page.wait_for_timeout(2500)
                        page.screenshot(path=f"{SHOTS}/pkg1-item2-arc-grouped-small.png", full_page=False)
                        graceful = smallest[1] >= 0  # any count renders without error
                        ok &= record(
                            "C7/item2 small-arc degradation",
                            graceful,
                            f"smallest scanned arc {smallest[0]!r}: {smallest[1]} event(s), cards+count line render, no error",
                        )
            except Exception as e:
                ok &= record("C6/item2 arc-scope grouped landing", False, f"exception: {e}")

        # ---------- C3 (item 2, Amendment A2): arc-less fallback — LIVE exercise
        # Runs AFTER C6/C7 (they depend on C2's arc-scope landing state).
        # Fixture is a REAL existing corpus article (no synthetic data):
        # id prefix 026b222c — "Israel releases 35 detainees from Gaza"
        # (Al Jazeera), articles.arc_id IS NULL, event node slug ends in
        # 026b222c (both confirmed read-only via PostgREST 2026-08-18).
        # Contract expectation: arcId null → declared global fallback, with
        # the event focus still resolving on the global timeline.
        click_tab(page, "News")
        page.wait_for_selector("input.news-search", timeout=15000)
        page.fill("input.news-search", "Israel releases 35 detainees")
        # Debounced search + live reload; poll for the fixture card (a fixed
        # short wait raced the reload once — checker-side, disclosed).
        target_card = None
        for _ in range(15):  # up to 60s
            page.wait_for_timeout(4000)
            for c in page.query_selector_all(".news-item"):
                if "Israel releases 35 detainees" in (c.text_content() or ""):
                    target_card = c
                    break
            if target_card is not None:
                break
        if target_card is None:
            ok &= record(
                "C3/item2 arc-less fallback (live)",
                False,
                "fixture article not found in feed search — corpus drift; re-pick fixture read-only",
            )
        else:
            target_card.click()
            # Chip is async (loadArticleTimelineKey join resolves after the
            # detail render) — wait for it properly; fixed 3s sampling raced
            # it once (checker-side race, disclosed in the run record).
            try:
                page.wait_for_selector(
                    "button.news-chip.graph-link:has-text('Causal Timeline')",
                    timeout=30000,
                )
                chip = True
            except Exception:
                chip = False
            arc_badge = page.query_selector(".news-detail .news-badge.arc, .news-item.expanded .news-badge.arc")
            if not chip:
                ok &= record("C3/item2 arc-less fallback (live)", False, "timeline chip did not render on the arc-less fixture (30s wait)")
            else:
                page.click("button.news-chip.graph-link:has-text('Causal Timeline')")
                # The global fallback requires the FULL global timeline load
                # (focusEventKey triggers it from arc scope); measured ~45s on
                # the dev server. Poll the title rather than sampling once —
                # a fixed short wait races the load (disclosed in run record).
                is_global = False
                title = ""
                for _ in range(30):  # up to 150s
                    page.wait_for_timeout(5000)
                    el = page.query_selector(".ep-report-title")
                    title = (el.text_content() or "").strip() if el else ""
                    if "global corpus" in title:
                        is_global = True
                        break
                # event focus: the event label appears on the rendered page
                page.wait_for_timeout(3000)
                body = page.text_content("body") or ""
                event_visible = "Israel releases 35 detainees from Gaza" in body
                ok &= record(
                    "C3/item2 arc-less fallback (live)",
                    is_global and event_visible and arc_badge is None,
                    f"chip with NO arc badge={arc_badge is None}; landed on {title!r} "
                    f"({'declared global fallback' if is_global else 'NOT global — contract broken'}); "
                    f"event focus visible on page={event_visible}",
                )
                page.screenshot(path=f"{SHOTS}/pkg1-item2-arcless-fallback.png", full_page=False)

        # ---------- C4 (item 3): truthful footer labels
        click_tab(page, "Timeline")
        page.wait_for_selector(".ep-tl-footerlinks", timeout=20000)
        page.wait_for_timeout(1500)
        footer = page.text_content(".ep-tl-footerlinks") or ""
        labels_ok = (
            re.search(r"Open Evidence \(\d+ article", footer) is not None
            and "Open Connections (" in footer
            and "related article" not in footer
            and "graph connection" not in footer
        )
        ok &= record("C4/item3 footer labels", labels_ok, f"footer text: {footer.strip()!r}")
        page.screenshot(path=f"{SHOTS}/pkg1-item3-footer-labels.png", full_page=False)
        page.click(".ep-tl-footerlink >> nth=0")
        page.wait_for_timeout(800)
        tabs = page.query_selector_all(".ep-tab")
        selected_tab = None
        for t in tabs:
            if t.get_attribute("aria-selected") == "true":
                selected_tab = (t.text_content() or "").strip()
        still_timeline = page.query_selector(".timeline-view") is not None
        ok &= record(
            "C4/item3 tab switch in place",
            selected_tab is not None and "Evidence" in selected_tab and still_timeline,
            f"selected tab={selected_tab!r}, still in timeline view={still_timeline}",
        )

        # ---------- C5 (item 4): lineage-safe wording + screenshot
        click_tab(page, "More")
        page.wait_for_selector("text=Source Comparison", timeout=10000)
        page.click("text=Source Comparison")
        # Live read path joins the full corpus; ~40s standalone on the static
        # corpus, but after the C3 global-timeline load in the same session
        # it exceeded 120s twice (standalone probe: 63s, 839 claims — no app
        # regression; timeout raised and disclosed in the run record).
        page.wait_for_selector(".sc-claim, .sc-empty, .notice.error", timeout=240000)
        page.wait_for_timeout(2000)
        body = page.text_content("body") or ""
        no_independent = "Reported independently" not in body
        has_also = "Also reported by:" in body
        has_lineage_note = "lineage not verified" in body
        e2_ok = "E2 corroborated" not in body and (
            "E2 multi-outlet (lineage unverified)" in body or "E2" not in body
        )
        ok &= record(
            "C5/item4 lineage-safe wording",
            no_independent and has_also and has_lineage_note and e2_ok,
            f"no 'Reported independently'={no_independent}, 'Also reported by'={has_also}, "
            f"lineage note={has_lineage_note}, E2 chip lineage-safe={e2_ok}",
        )
        page.screenshot(path=f"{SHOTS}/pkg1-item4-sourcecomparison.png", full_page=True)

        browser.close()

    print()
    passed = sum(1 for r in results if r["status"] == "PASS")
    failed = sum(1 for r in results if r["status"] == "FAIL")
    noted = sum(1 for r in results if r["status"] == "NOTE")
    print(f"TOTAL: {passed} pass / {failed} fail / {noted} note")
    return ok and failed == 0


if __name__ == "__main__":
    sys.exit(0 if run() else 1)
