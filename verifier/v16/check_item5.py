"""Track B Step 2 item 5 — docked relationship panel with honest empty states.

Verifies against a dev-server build of the item-5 tree (desktop 1280x800 +
mobile 390x844), on live data:

  1. SOURCED edge (a209ab4f…, one of the 3 edges with real sourcing):
     named source list ("Federal Register" + linked title), recorded
     grounding excerpt, "Reviewed — human confirmed" badge, real axis
     values (reliability 1 of 4, evidence strength "documented"),
     falsification condition, correction history.
  2. UNSOURCED edge (d27247b2…, one of the 368 awaiting_review rows):
     honest states — "No sources documented yet", axes "Not yet
     available" (styled tone-unavailable), "Awaiting review",
     independence "Unverified — source lineage not yet tracked";
     meaning line carries the item-4 sequence distinction; raw Relation
     kept as extraction detail. Both states look intentional: no empty
     sections, explicit toned states.
  3. NO-EXPLANATION edge (0200bd0e…, one of the 39 graph edges with no
     provenance row): "No provenance recorded yet", grounding "not yet
     available".
  4. Docked layout: panel is a flex sibling of the stage — no overlap
     with the canvas; stage shrinks beside it.
  5. Popover retired: no .edge-evidence element ever appears; the
     relationship list Evidence button opens the same docked panel.
  6. Escape closes the panel.
  7. Mobile: panel is a fixed bottom sheet with the same honest states.
"""
import json
import sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5199/media-intelligence-platform/"
SHOTS = "/mnt/agents/work/screenshots"

SOURCED_EDGE = "a209ab4f-3345-4c9c-9f3e-845c51d3ae77"
UNSOURCED_EDGE = "d27247b2-09a3-4b69-8c79-0991872910d0"
NOEXPL_EDGE = "0200bd0e-c0b5-4530-9459-3bbe93412bba"

results = []

def record(name, ok, detail=""):
    results.append({"check": name, "status": "PASS" if ok else "FAIL", "detail": detail})
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    return ok

def tap_edge(page, edge_id):
    return page.evaluate("""(edgeId) => {
      const cy = document.querySelector('.graph-canvas-wrap > div')._cyreg.cy;
      const e = cy.edges().filter((el) => el.data('id') === edgeId).first();
      if (!e || e.empty()) return false;
      e.emit({ type: 'tap', originalEvent: {} });
      return true;
    }""", edge_id)


def wait_provenance(page):
    """Wait until the async provenance fetch settles (loading line gone)."""
    page.wait_for_function(
        """() => {
          const el = document.querySelector('.relationship-panel');
          return el && !el.innerText.includes('Loading provenance');
        }""",
        timeout=15000,
    )

def panel_text(page):
    return page.eval_on_selector(".relationship-panel", "e => e.innerText")

def run():
    ok = True
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ---------- Desktop ----------
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.goto(BASE, wait_until="networkidle")
        page.click("button.nav-tab:has-text('Graph')")
        page.wait_for_selector(".graph-stage canvas", timeout=30000)
        page.wait_for_timeout(4000)
        # Full-graph opt-in so all 411 edges (incl. the sourced one) render.
        page.click("button.focus-show-all")
        page.wait_for_timeout(6000)

        # --- 1. Sourced edge: real data renders ---
        ok &= record("desktop/tap-sourced-edge", tap_edge(page, SOURCED_EDGE))
        page.wait_for_selector(".relationship-panel", timeout=10000)
        page.wait_for_selector(".relationship-panel .ap-sources", timeout=10000)
        text = panel_text(page)
        ok &= record("desktop/sourced-named-source",
                     "Federal Register" in text and "Promoting Employee Accountability" in text,
                     f"excerpt={text[:160]!r}")
        ok &= record("desktop/sourced-reviewed-badge",
                     "Reviewed — human confirmed" in text)
        ok &= record("desktop/sourced-grounding",
                     page.query_selector(".relationship-panel .rp-grounding") is not None)
        ok &= record("desktop/sourced-axis-values",
                     "1 of 4 (1 = highest)" in text and "documented" in text)
        ok &= record("desktop/sourced-falsification",
                     "Falsified if the Federal Register document" in text)
        ok &= record("desktop/sourced-corrections",
                     "needs-source-first" in text)
        ok &= record("desktop/sourced-independence-unverified",
                     "Unverified — source lineage not yet tracked" in text)
        page.screenshot(path=f"{SHOTS}/2026-08-17-item5-desktop-sourced.png")
        print("    screenshot: item5-desktop-sourced")

        # --- 4. Docked layout: no overlap, stage shrinks ---
        stage_box = page.eval_on_selector(".graph-stage", "e => { const r = e.getBoundingClientRect(); return {x:r.x, w:r.width} }")
        panel_box = page.eval_on_selector(".relationship-panel", "e => { const r = e.getBoundingClientRect(); return {x:r.x, w:r.width} }")
        no_overlap = stage_box["x"] + stage_box["w"] <= panel_box["x"] + 1
        ok &= record("desktop/panel-docked-no-overlap",
                     no_overlap and panel_box["w"] >= 280,
                     f"stage_right={stage_box['x']+stage_box['w']:.0f} panel_x={panel_box['x']:.0f} panel_w={panel_box['w']:.0f}")

        # Popover retired.
        ok &= record("desktop/no-floating-popover",
                     page.query_selector(".edge-evidence") is None)

        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        ok &= record("desktop/escape-closes",
                     page.query_selector(".relationship-panel") is None)

        # --- 2. Unsourced edge: honest empty states ---
        ok &= record("desktop/tap-unsourced-edge", tap_edge(page, UNSOURCED_EDGE))
        page.wait_for_selector(".relationship-panel", timeout=10000)
        wait_provenance(page)
        text = panel_text(page)
        ok &= record("desktop/unsourced-no-sources",
                     "No sources documented yet" in text,
                     f"excerpt={text[:160]!r}")
        ok &= record("desktop/unsourced-awaiting-review",
                     "Awaiting review" in text)
        n_unavail = len(page.query_selector_all(".rp-axis.tone-unavailable"))
        n_unver = len(page.query_selector_all(".rp-axis.tone-unverified"))
        ok &= record("desktop/unsourced-axes-honest-tones",
                     "Not archived — authentication not yet available" in text and
                     n_unavail >= 1 and n_unver >= 1,
                     f"tone_unavailable={n_unavail} tone_unverified={n_unver}")
        ok &= record("desktop/unsourced-independence-unverified",
                     "Unverified — source lineage not yet tracked" in text)
        ok &= record("desktop/unsourced-meaning-in-words",
                     "happened before — temporal order only, no causation claimed" in text)
        ok &= record("desktop/unsourced-raw-relation-kept",
                     "sequence: after" in text)
        ok &= record("desktop/unsourced-no-false-falsification",
                     "Falsification condition" not in text)
        # Intentional, not broken: every section has visible content.
        empty_sections = page.evaluate("""() =>
          [...document.querySelectorAll('.relationship-panel .rp-section')]
            .filter((s) => s.innerText.trim().length < 12).length""")
        ok &= record("desktop/unsourced-sections-intentional",
                     empty_sections == 0, f"empty_sections={empty_sections}")
        page.screenshot(path=f"{SHOTS}/2026-08-17-item5-desktop-unsourced.png")
        print("    screenshot: item5-desktop-unsourced")
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)

        # --- 3. Edge with no explanation row ---
        ok &= record("desktop/tap-noexplanation-edge", tap_edge(page, NOEXPL_EDGE))
        page.wait_for_selector(".relationship-panel", timeout=10000)
        wait_provenance(page)
        text = panel_text(page)
        ok &= record("desktop/noexplanation-honest",
                     "No provenance recorded yet" in text and "not yet available" in text.lower(),
                     f"excerpt={text[:160]!r}")
        page.screenshot(path=f"{SHOTS}/2026-08-17-item5-desktop-noexplanation.png")
        print("    screenshot: item5-desktop-noexplanation")
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)

        # --- 5. Relationship list opens the same docked panel ---
        page.click("button.graph-toolbar-btn:has-text('Relationship list')")
        page.wait_for_selector(".edge-list-table", timeout=10000)
        page.click(".edge-list-evidence-btn >> nth=0")
        page.wait_for_selector(".relationship-panel", timeout=10000)
        ok &= record("desktop/edge-list-opens-docked-panel",
                     page.query_selector(".edge-evidence") is None and
                     page.query_selector(".relationship-panel") is not None)
        page.close()

        # ---------- Mobile ----------
        mpage = browser.new_page(viewport={"width": 390, "height": 844},
                                 is_mobile=True, has_touch=True)
        mpage.goto(BASE, wait_until="networkidle")
        mpage.click("nav.bottom-nav >> text=Graph")
        mpage.wait_for_selector(".hub-list", timeout=30000)
        mpage.click(".hub-show-all")
        mpage.wait_for_selector(".graph-stage canvas", timeout=30000)
        mpage.wait_for_timeout(4000)
        ok &= record("mobile/tap-unsourced-edge", tap_edge(mpage, UNSOURCED_EDGE))
        mpage.wait_for_selector(".relationship-panel.sheet-mode", timeout=10000)
        wait_provenance(mpage)
        mtext = panel_text(mpage)
        ok &= record("mobile/sheet-honest-states",
                     "No sources documented yet" in mtext and
                     "Unverified — source lineage not yet tracked" in mtext,
                     f"excerpt={mtext[:160]!r}")
        sheet_fixed = mpage.evaluate("""() => {
          const el = document.querySelector('.relationship-panel.sheet-mode');
          return getComputedStyle(el).position === 'fixed';
        }""")
        ok &= record("mobile/sheet-is-bottom-sheet", sheet_fixed)
        mpage.screenshot(path=f"{SHOTS}/2026-08-17-item5-mobile-sheet.png")
        print("    screenshot: item5-mobile-sheet")
        mpage.close()
        browser.close()

    with open("/mnt/agents/work/item5-results.json", "w") as f:
        json.dump(results, f, indent=2)
    print("OVERALL:", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)

if __name__ == "__main__":
    run()
