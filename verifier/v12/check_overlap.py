"""Track B Step 2 item 1 — overlap/layout verification (regenerated 2026-08-17).

Runs against a local dev server build of main @ commit 4a98d402.
Checks, per viewport:
  - graph chrome (toolbar, rail, legend, controls, topics panel) occupies
    normal flow: no bounding-box overlap with the canvas stage
  - opening Relationship list / Review status / Topics produces no
    collision between chrome elements
  - screenshots for human review
"""
import json
import sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5199/media-intelligence-platform/"
SHOTS = "/mnt/agents/work/screenshots"

OVERLAP_JS = """
(pairs) => {
  const out = []
  // Clip-aware: intersect the element's rect with every ancestor that
  // clips overflow (scroll/auto/hidden). A child extending past a
  // scrollable rail is scrolled content, not an overlay.
  const clipRect = (el) => {
    let r = el.getBoundingClientRect()
    let clip = { x: r.x, y: r.y, right: r.right, bottom: r.bottom }
    let p = el.parentElement
    while (p) {
      const cs = getComputedStyle(p)
      if (cs.overflow !== 'visible' || cs.overflowY !== 'visible') {
        const pr = p.getBoundingClientRect()
        clip = {
          x: Math.max(clip.x, pr.x),
          y: Math.max(clip.y, pr.y),
          right: Math.min(clip.right, pr.right),
          bottom: Math.min(clip.bottom, pr.bottom),
        }
      }
      p = p.parentElement
    }
    return { x: clip.x, y: clip.y,
             w: Math.max(0, clip.right - clip.x),
             h: Math.max(0, clip.bottom - clip.y),
             right: clip.right, bottom: clip.bottom }
  }
  const visible = (el) => {
    const cs = getComputedStyle(el)
    const r = clipRect(el)
    return cs.display !== 'none' && cs.visibility !== 'hidden' &&
           r.w > 0 && r.h > 0
  }
  for (const [a, b] of pairs) {
    const ea = document.querySelector(a)
    const eb = document.querySelector(b)
    if (!ea || !eb) { out.push({ a, b, skipped: true }); continue }
    if (!visible(ea) || !visible(eb)) { out.push({ a, b, skipped: true }); continue }
    const ra = clipRect(ea), rb = clipRect(eb)
    const ox = Math.max(0, Math.min(ra.right, rb.right) - Math.max(ra.x, rb.x))
    const oy = Math.max(0, Math.min(ra.bottom, rb.bottom) - Math.max(ra.y, rb.y))
    out.push({ a, b, overlap: ox > 0 && oy > 0,
               area: ox * oy, ra, rb })
  }
  return out
}
"""

CHROME_PAIRS = [
    (".graph-toolbar", ".graph-stage"),
    (".graph-rail", ".graph-stage"),
    (".legend", ".graph-stage"),
    (".graph-controls", ".graph-stage"),
    (".topic-browser", ".graph-stage"),
    (".graph-toolbar", ".graph-rail"),
    (".legend", ".graph-controls"),
    (".legend", ".topic-browser"),
    (".graph-controls", ".topic-browser"),
    (".focus-trail", ".graph-stage"),
    (".edge-list", ".graph-toolbar"),
    (".review-status", ".graph-toolbar"),
]

def check(page, label, results):
    pairs = [(a, b) for (a, b) in CHROME_PAIRS]
    rows = page.evaluate(OVERLAP_JS, pairs)
    bad = [r for r in rows if r.get("overlap")]
    status = "PASS" if not bad else "FAIL"
    results.append({"state": label, "status": status, "checks": rows})
    print(f"[{status}] {label}: {len(rows)} pair-checks, {len(bad)} overlaps")
    for r in bad:
        print(f"    OVERLAP: {r['a']} x {r['b']} area={r['area']}px^2")
    return not bad

def shot(page, name):
    page.screenshot(path=f"{SHOTS}/{name}.png", full_page=False)
    print(f"    screenshot: {name}.png")

def run():
    results = []
    ok = True
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ---------- Desktop 1280x800 ----------
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.goto(BASE, wait_until="networkidle")
        page.click("text=Graph")
        page.wait_for_selector(".graph-stage canvas", timeout=30000)
        page.wait_for_timeout(4000)  # let fcose layout settle

        ok &= check(page, "desktop/baseline", results)
        shot(page, "2026-08-17-item1-desktop-graph")

        # Topics panel open (rail-docked)
        page.click("text=Topics")
        page.wait_for_selector(".topic-browser", timeout=10000)
        page.wait_for_timeout(500)
        ok &= check(page, "desktop/topics-open", results)
        shot(page, "2026-08-17-item1-desktop-topics")
        page.click("text=Topics")

        # Relationship list + Review status open
        page.click("text=Relationship list")
        page.wait_for_selector(".edge-list", timeout=10000)
        page.wait_for_timeout(500)
        ok &= check(page, "desktop/edge-list-open", results)
        page.click("text=Relationship list")
        page.click("text=Review status")
        page.wait_for_selector(".review-status", timeout=10000)
        page.wait_for_timeout(500)
        ok &= check(page, "desktop/review-status-open", results)
        page.click("text=Review status")

        # Search interaction (dropdown must not collide with toolbar)
        page.fill(".graph-search input", "a")
        page.wait_for_selector(".graph-search-results", timeout=10000)
        page.wait_for_timeout(300)
        ok &= check(page, "desktop/search-open", results)
        page.fill(".graph-search input", "")
        page.close()

        # ---------- Mobile 390x844 ----------
        m = browser.new_page(viewport={"width": 390, "height": 844},
                             is_mobile=True, has_touch=True)
        m.goto(BASE, wait_until="networkidle")
        m.click("nav.bottom-nav >> text=Graph")
        m.wait_for_selector(".hub-list", timeout=30000)
        m.click("text=Show full graph")
        m.wait_for_selector(".graph-stage canvas", timeout=30000)
        m.wait_for_timeout(4000)

        ok &= check(m, "mobile/baseline", results)
        shot(m, "2026-08-17-item1-mobile-graph")

        # Legend expanded (mobile)
        toggle = m.query_selector(".legend-toggle")
        if toggle:
            m.click(".legend-toggle")
            m.wait_for_timeout(400)
        ok &= check(m, "mobile/legend-expanded", results)
        shot(m, "2026-08-17-item1-mobile-legend-expanded")

        # Topics open on mobile (rail strip)
        btn = m.query_selector(".graph-topics-btn")
        if btn:
            m.click(".graph-topics-btn")
            m.wait_for_selector(".topic-browser", timeout=10000)
            m.wait_for_timeout(500)
            ok &= check(m, "mobile/topics-open", results)
            shot(m, "2026-08-17-item1-mobile-topics")
        m.close()
        browser.close()

    with open("/mnt/agents/work/overlap-results.json", "w") as f:
        json.dump(results, f, indent=2)
    print("OVERALL:", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)

if __name__ == "__main__":
    run()
