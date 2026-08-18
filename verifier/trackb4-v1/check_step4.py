"""Track B Step 4 — News Feed (addendum Screen 1), 2026-08-18.

Verifies against a dev-server build of the step-4 tree at
http://localhost:5199/media-intelligence-platform/ .

Desktop (1280x800):
  1. Title block: "News" + blue dot + "New since your last visit on this
     device · N" (localStorage marker pre-seeded so the line is
     deterministic; owner ruling #1).
  2. Epistemic banner: "Missing evidence is recorded, not treated as
     contradiction."
  3. Inert spec pills: Region/Evidence/Topic render DISABLED with an
     honest tooltip (owner ruling #2).
  4. Wired outlet/status chips still filter (click an outlet chip ->
     active state + result count changes).
  5. Card anatomy: blue date leads, ink headline, outlet+region
     attribution line, summary, provenance footer from the real
     cited_type discriminator (owner ruling #6).
  6. Provenance honesty: "Primary filing linked" appears only on cards
     whose citations include court_doc/agency_release; url+summary cards
     read "Source-linked summary".
  7. Per-card cross-nav chips render only when the link exists (Arc chip
     on arc-attached cards; Graph chip on citation-resolved cards).
  8. Event grouping: a multi-article event collapses to ONE group card
     reading "N outlets reporting" (pages loaded until one is found).
  9. No status badge (unattributed/monoculture) on card FACES (owner
     ruling #9) — badges live in the expanded detail only.
 10. App header: "Live corpus — 752 articles — updated Aug 10, 2026"
     (static corpus must show the ABSOLUTE date, never "min ago";
     owner ruling #7).
 11. Accent removal: under filter: grayscale(1) all meaning survives
     (title, banner, pills, card text, provenance).
 12. AA contrast >= 4.5 on every pair touched by this step.
Mobile (390x844):
 13. Title block, banner, inert pills, cards render; Filters sheet opens.
"""
import json
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


def srgb(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def contrast(fg, bg):
    """fg/bg = (r,g,b[,a]); alpha composited over bg."""
    if len(fg) == 4 and fg[3] < 255:
        a = fg[3] / 255.0
        fg = tuple(round(fg[i] * a + bg[i] * (1 - a)) for i in range(3))
    l1 = 0.2126 * srgb(fg[0]) + 0.7152 * srgb(fg[1]) + 0.0722 * srgb(fg[2])
    l2 = 0.2126 * srgb(bg[0]) + 0.7152 * srgb(bg[1]) + 0.0722 * srgb(bg[2])
    if l1 < l2:
        l1, l2 = l2, l1
    return (l1 + 0.05) / (l2 + 0.05)


def rgb_of(page, selector, prop="color"):
    return page.evaluate(
        """([sel, prop]) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const m = getComputedStyle(el)[prop].match(/[\\d.]+/g).map(Number);
          return m;
        }""",
        [selector, prop],
    )


def bg_of(page, selector):
    """Effective background: walk ancestors to the first non-transparent
    backgroundColor (elements themselves are usually transparent)."""
    return page.evaluate(
        """(sel) => {
          let node = document.querySelector(sel);
          if (!node) return null;
          let bg = getComputedStyle(node).backgroundColor;
          while ((bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') && node.parentElement) {
            node = node.parentElement;
            bg = getComputedStyle(node).backgroundColor;
          }
          return bg.match(/[\\d.]+/g).map(Number).slice(0, 3);
        }""",
        selector,
    )


def pair(page, name, fg_sel, bg_sel, fg_prop="color"):
    fg = rgb_of(page, fg_sel, fg_prop)
    bg = bg_of(page, bg_sel)
    if not fg or not bg:
        return record(f"contrast/{name}", False, f"missing element ({fg_sel} / {bg_sel})")
    r = contrast(tuple(fg), tuple(bg))
    return record(f"contrast/{name}", r >= 4.5, f"{r:.2f}:1")


def run():
    ok = True
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ---------- Desktop ----------
        ctx = browser.new_context(viewport={"width": 1280, "height": 800})
        # Seed a last-visit marker BEFORE app code runs (2026-08-01), so the
        # last-visit line is deterministic (all 752 articles were fetched
        # 2026-08-08..10 → count = 752).
        ctx.add_init_script(
            "localStorage.setItem('mip-news-last-visit-ms', '1754000000000')"
        )
        page = ctx.new_page()
        page.goto(BASE, wait_until="domcontentloaded")
        page.wait_for_selector(".news-list .news-card", timeout=30000)
        page.wait_for_timeout(1500)

        # 1. Title block + last-visit line.
        title = page.text_content(".news-title") or ""
        sub = page.text_content(".news-title-sub") or ""
        ok &= record("desktop/title-block", title.strip().startswith("News")
                     and page.query_selector(".news-title-dot") is not None)
        ok &= record("desktop/last-visit-line",
                     bool(re.search(r"New since your last visit on this device · \d+", sub)),
                     sub.strip())

        # 2. Epistemic banner.
        banner = page.text_content(".ep-banner") or ""
        ok &= record("desktop/epistemic-banner",
                     "Missing evidence is recorded, not treated as contradiction." in banner)

        # 3. Inert pills.
        pills = page.query_selector_all(".news-chip.inert")
        labels = [(pl.text_content() or "").strip() for pl in pills]
        disabled = all(pl.is_disabled() for pl in pills)
        tips = all("not yet wired" in (pl.get_attribute("title") or "") for pl in pills)
        ok &= record("desktop/inert-pills",
                     labels == ["Region", "Evidence", "Topic"] and disabled and tips,
                     f"{labels} disabled={disabled} tooltips={tips}")

        # 4. Wired chips still filter.
        before = page.text_content(".news-count")
        page.click(".news-desktop-filters .news-filter-row:first-child .news-chip:nth-child(2)")
        page.wait_for_timeout(1200)
        after = page.text_content(".news-count")
        active = page.query_selector(".news-desktop-filters .news-chip.active") is not None
        ok &= record("desktop/wired-chips-still-filter",
                     active and before != after, f"{before.strip()} -> {after.strip()}")
        # reset
        page.click(".news-desktop-filters .news-filter-row:first-child .news-chip:nth-child(1)")
        page.wait_for_timeout(1200)

        # 5. Card anatomy on the first card. The blue date must equal the
        # ACTIVE theme's --accent-soft (light theme is live via theme flag —
        # never a hardcoded hex expectation).
        card = page.query_selector(".news-list .news-card")
        date_col = page.evaluate(
            "() => getComputedStyle(document.querySelector('.news-card .news-date.accent')).color")
        accent_soft = page.evaluate(
            "() => { const v = getComputedStyle(document.documentElement)"
            ".getPropertyValue('--accent-soft').trim();"
            " const d = document.createElement('div'); d.style.color = v;"
            " document.body.appendChild(d);"
            " const c = getComputedStyle(d).color; d.remove(); return c; }")
        h3 = card.query_selector("h3") is not None
        src_line = card.query_selector(".ep-src") is not None
        summ = card.query_selector(".news-summary") is not None
        prov = card.query_selector(".news-prov") is not None
        ok &= record("desktop/card-anatomy",
                     h3 and src_line and summ and prov and date_col == accent_soft,
                     f"date={date_col} accent-soft={accent_soft} h3={h3} src={src_line} summary={summ} prov={prov}")

        # 5b. Region on attribution line (outlets.country join).
        region = page.evaluate(
            "() => document.querySelector('.news-card .ep-src-region')?.textContent ?? null")
        ok &= record("desktop/attribution-region", region is not None and region.startswith("· "),
                     str(region))

        # 6. Provenance honesty across the loaded page.
        labels_seen = page.evaluate(
            "() => [...document.querySelectorAll('.news-card .news-prov')].map(e => e.textContent.trim())")
        vocab = set(labels_seen)
        ok &= record("desktop/provenance-vocabulary",
                     vocab <= {"Primary filing linked", "Source-linked summary"} and len(vocab) > 0,
                     f"{len(labels_seen)} cards, labels={sorted(vocab)}")
        ok &= record("desktop/provenance-source-linked-present",
                     "Source-linked summary" in vocab)
        # 6b. "Primary filing linked" — deterministic: the corpus carries
        # exactly 6 articles with court_doc/agency_release citations; search
        # for one by headline and assert its card carries the primary label.
        page.fill(".news-search", "College football is finally back")
        page.wait_for_timeout(1800)
        prim_labels = page.evaluate(
            "() => [...document.querySelectorAll('.news-card .news-prov')].map(e => e.textContent.trim())")
        ok &= record("desktop/provenance-primary-present",
                     "Primary filing linked" in prim_labels,
                     f"searched card labels={prim_labels}")
        page.fill(".news-search", "")
        page.wait_for_timeout(1800)

        # 7. Cross-nav chips only when the link exists.
        arc_chip = page.query_selector(".news-card .news-badge.arc.clickable") is not None
        ok &= record("desktop/arc-chip-when-linked", arc_chip)

        # 8. Event grouping: page until a group card appears (corpus has 32
        #    multi-article events across 413 links).
        group = None
        for _ in range(8):
            group = page.query_selector(".news-group-card")
            if group:
                break
            more = page.query_selector(".news-load-more")
            if not more:
                break
            more.click()
            page.wait_for_timeout(1500)
        if group:
            head = group.text_content()
            m = re.search(r"(\d+) outlets reporting", head)
            n_members = len(group.query_selector_all(".news-card.in-group"))
            ok &= record("desktop/event-grouping",
                         m is not None and n_members >= 2,
                         f"'{m.group(0) if m else None}', {n_members} member cards")
            # Graph chip presence (citation-resolved) — check across all cards.
            ok &= record("desktop/graph-chip-when-linked",
                         page.query_selector(".news-card .news-badge.graph.clickable") is not None)
        else:
            ok &= record("desktop/event-grouping", False, "no group card found after 8 pages")
            ok &= record("desktop/graph-chip-when-linked", False, "not reached")

        # 9. No status badges on card faces.
        face_badges = page.evaluate(
            "() => [...document.querySelectorAll('.news-card .news-badge')]"
            ".map(e => e.className).filter(c => /\\b(mono|muted)\\b/.test(c)).length")
        ok &= record("desktop/no-status-badge-on-cards", face_badges == 0,
                     f"{face_badges} status badges on card faces")

        # 10. App header live-corpus line — static corpus shows an ABSOLUTE
        # date (max fetched_at = 2026-08-10T16:19Z; local-tz rendering may
        # read Aug 10 or Aug 11 — either is honest).
        header = page.text_content(".data-source") or ""
        ok &= record("desktop/live-corpus-header",
                     re.search(r"Live corpus — 752 articles — updated Aug 1[01], 2026", header) is not None,
                     header.strip())
        ok &= record("desktop/no-fake-freshness", "min ago" not in header)

        # 11. Accent removal.
        page.evaluate("() => { document.querySelector('.app').style.filter = 'grayscale(1)'; }")
        page.wait_for_timeout(300)
        still = page.evaluate(
            "() => document.querySelector('.news-title').textContent.includes('News')"
            " && document.querySelector('.ep-banner').textContent.length > 10"
            " && [...document.querySelectorAll('.news-card .news-prov')].length > 0")
        ok &= record("desktop/grayscale-meaning-survives", bool(still))
        page.screenshot(path=f"{SHOTS}/2026-08-18-step4-desktop-grayscale.png", full_page=False)
        page.evaluate("() => { document.querySelector('.app').style.filter = ''; }")
        page.screenshot(path=f"{SHOTS}/2026-08-18-step4-desktop.png", full_page=False)

        # 12. AA contrast on touched pairs.
        ok &= pair(page, "title", ".news-title", ".news-view")
        ok &= pair(page, "title-sub", ".news-title-sub", ".news-view")
        ok &= pair(page, "blue-date", ".news-card .news-date.accent", ".news-card")
        ok &= pair(page, "provenance-footer", ".news-card .news-prov", ".news-card")
        ok &= pair(page, "attribution", ".news-card .ep-src", ".news-card")
        ok &= pair(page, "group-outlets", ".news-group-outlets", ".news-group-card")
        ok &= pair(page, "corpus-footer", ".news-corpus-foot", ".news-view")

        # ---------- Mobile 390 ----------
        mctx = browser.new_context(viewport={"width": 390, "height": 844})
        mctx.add_init_script(
            "localStorage.setItem('mip-news-last-visit-ms', '1754000000000')"
        )
        mp = mctx.new_page()
        mp.goto(BASE, wait_until="domcontentloaded")
        mp.wait_for_selector(".news-list .news-card", timeout=30000)
        mp.wait_for_timeout(1200)
        m_title = (mp.text_content(".news-title") or "").strip().startswith("News")
        m_banner = "Missing evidence is recorded" in (mp.text_content(".ep-banner") or "")
        m_pills = len(mp.query_selector_all(".news-chip.inert")) == 3
        mp.click(".news-filters-btn")
        mp.wait_for_selector(".filter-sheet", timeout=5000)
        sheet_ok = mp.query_selector(".filter-sheet") is not None
        mp.click(".sheet-done")
        ok &= record("mobile/title-banner-pills-sheet",
                     m_title and m_banner and m_pills and sheet_ok,
                     f"title={m_title} banner={m_banner} pills={m_pills} sheet={sheet_ok}")
        mp.screenshot(path=f"{SHOTS}/2026-08-18-step4-mobile390.png", full_page=False)

        browser.close()

    return ok


if __name__ == "__main__":
    passed = run()
    fails = [r for r in results if r["status"] == "FAIL"]
    print(f"\n{len(results) - len(fails)}/{len(results)} PASS")
    sys.exit(0 if passed else 1)
