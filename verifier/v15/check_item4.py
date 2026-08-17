"""Track B Step 2 item 4 — plain-language edge labels (2026-08-17).

Verifies against a dev-server build of the item-4 tree:
  Desktop (1280x800):
    1. Canvas edge labels (zoom >= 1.2) show plain-language phrases —
       sequence edges read "happened before", never the raw DB label
       ("sequence: after") — and no canvas edge label contains machine
       vocabulary ("<type>: ...").
    2. The legend carries the meaning in words: every edge row shows
       'Label — "phrase"', and the causal-vs-sequence distinction is
       stated explicitly ("Causal claims one event led to another.
       Sequence claims only that one happened before the other — no
       causation is claimed.").
    3. Accent removal: under filter: grayscale(1) the legend text and
       the distinction note are still present (words carry the meaning).
    4. EdgeEvidence on a sequence edge: Type "Sequence", Meaning
       "happened before — temporal order only, no causation claimed",
       raw Relation ("sequence: ...") retained as extraction detail.
    5. Relationship list: Relationship column shows "happened before",
       never "sequence: ...".
    6. Causal Timeline: sequence links read "(happened before)", never
       "(sequence: ...)".
  Mobile (390x844):
    7. Legend text (plain phrases + distinction note) present.
"""
import json
import re
import sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:5199/media-intelligence-platform/"
SHOTS = "/mnt/agents/work/screenshots"

results = []

def record(name, ok, detail=""):
    results.append({"check": name, "status": "PASS" if ok else "FAIL", "detail": detail})
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    return ok

def cy(page):
    return page.evaluate_handle(
        "() => document.querySelector('.graph-canvas-wrap > div')._cyreg.cy")

def run():
    ok = True
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ---------- Desktop: graph ----------
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.goto(BASE, wait_until="networkidle")
        page.click("button.nav-tab:has-text('Graph')")
        page.wait_for_selector(".graph-stage canvas", timeout=30000)
        page.wait_for_timeout(4500)

        # 1. Canvas edge labels at zoom >= 1.2 are plain language.
        labels = page.evaluate("""() => {
          const cy = document.querySelector('.graph-canvas-wrap > div')._cyreg.cy;
          cy.zoom(1.5);
          cy.center();
          return new Promise((res) => setTimeout(() => {
            const out = cy.edges('.lbl').map((e) => ({
              type: e.data('type'), raw: e.data('label'), shown: e.style('label'),
            }));
            res(out);
          }, 800));
        }""")
        seq = [l for l in labels if l["type"] == "sequence"]
        machine = [l for l in labels if l["shown"] and re.match(r"^[a-z_]+:\s", l["shown"])]
        ok &= record("desktop/canvas-labels-present",
                     len(labels) > 0 and len(seq) > 0,
                     f"labeled={len(labels)} sequence={len(seq)}")
        ok &= record("desktop/canvas-sequence-plain",
                     len(seq) > 0 and all(l["shown"] == "happened before" for l in seq),
                     f"sample={seq[:2] if seq else None}")
        ok &= record("desktop/canvas-no-machine-vocab",
                     len(machine) == 0,
                     f"violations={machine[:2]}")

        # 2. Legend carries the meaning in words.
        legend_text = page.eval_on_selector(".legend", "e => e.innerText")
        ok &= record("desktop/legend-plain-phrases",
                     'Causal — “led to”' in legend_text and
                     'Sequence — “happened before”' in legend_text and
                     'Actor — “involves”' in legend_text,
                     f"excerpt={legend_text[:160]!r}")
        ok &= record("desktop/legend-distinction-in-words",
                     "Causal claims one event led to another" in legend_text and
                     "happened before the other" in legend_text and
                     "no causation is claimed" in legend_text.lower())

        # 3. Accent removal: words survive grayscale.
        page.evaluate("() => { document.querySelector('.app').style.filter = 'grayscale(1)'; }")
        page.wait_for_timeout(300)
        gray_text = page.eval_on_selector(".legend", "e => e.innerText")
        ok &= record("desktop/grayscale-meaning-survives",
                     "Causal claims one event led to another" in gray_text and
                     'Sequence — “happened before”' in gray_text)
        page.screenshot(path=f"{SHOTS}/2026-08-17-item4-desktop-grayscale.png")
        print("    screenshot: item4-desktop-grayscale")
        page.evaluate("() => { document.querySelector('.app').style.filter = ''; }")

        # 4. EdgeEvidence on a sequence edge: meaning in words, raw kept.
        page.evaluate("""() => {
          const cy = document.querySelector('.graph-canvas-wrap > div')._cyreg.cy;
          const e = cy.edges('[type = "sequence"]').first();
          e.emit({ type: 'tap', originalEvent: {} });
        }""")
        page.wait_for_selector(".edge-evidence", timeout=10000)
        ev_text = page.eval_on_selector(".edge-evidence", "e => e.innerText")
        ok &= record("desktop/evidence-sequence-meaning",
                     "happened before — temporal order only, no causation claimed" in ev_text,
                     f"excerpt={ev_text[:200]!r}")
        ok &= record("desktop/evidence-raw-relation-kept",
                     re.search(r"relation\s*\n?\s*sequence:", ev_text, re.I) is not None)
        page.screenshot(path=f"{SHOTS}/2026-08-17-item4-evidence-sequence.png")
        print("    screenshot: item4-evidence-sequence")
        page.click(".edge-evidence .ap-icon-btn")

        # 5. Relationship list: plain phrase in the Relationship column.
        page.click("button.graph-toolbar-btn:has-text('Relationship list')")
        page.wait_for_selector(".edge-list-table", timeout=10000)
        list_text = page.eval_on_selector(".edge-list", "e => e.innerText")
        ok &= record("desktop/edge-list-plain",
                     "happened before" in list_text and "sequence: after" not in list_text,
                     f"excerpt={list_text[:160]!r}")
        page.click(".edge-list .ap-icon-btn")

        # 6. Causal Timeline: plain phrase, no machine vocabulary.
        page.click("button.nav-tab:has-text('Timeline')")
        page.wait_for_selector(".timeline", timeout=30000)
        page.wait_for_timeout(1500)
        tl_text = page.eval_on_selector(".timeline-view", "e => e.innerText")
        ok &= record("desktop/timeline-plain",
                     "(happened before)" in tl_text and "(sequence:" not in tl_text,
                     f"excerpt={tl_text[:160]!r}")
        page.screenshot(path=f"{SHOTS}/2026-08-17-item4-timeline.png")
        print("    screenshot: item4-timeline")
        page.close()

        # ---------- Mobile ----------
        mpage = browser.new_page(viewport={"width": 390, "height": 844},
                                 is_mobile=True, has_touch=True)
        mpage.goto(BASE, wait_until="networkidle")
        mpage.click("nav.bottom-nav >> text=Graph")
        mpage.wait_for_selector(".hub-list", timeout=30000)
        mpage.click(".hub-show-all")
        mpage.wait_for_selector(".graph-stage canvas", timeout=30000)
        mpage.wait_for_timeout(3000)
        # Mobile legend starts collapsed — expand it.
        if mpage.query_selector(".legend-collapsed"):
            mpage.click(".legend-collapsed")
        mpage.wait_for_selector(".legend section", timeout=10000)
        mlegend = mpage.eval_on_selector(".legend", "e => e.innerText")
        ok &= record("mobile/legend-plain-phrases",
                     'Sequence — “happened before”' in mlegend and
                     "Causal claims one event led to another" in mlegend)
        mpage.screenshot(path=f"{SHOTS}/2026-08-17-item4-mobile-legend.png")
        print("    screenshot: item4-mobile-legend")
        mpage.close()
        browser.close()

    with open("/mnt/agents/work/item4-results.json", "w") as f:
        json.dump(results, f, indent=2)
    print("OVERALL:", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)

if __name__ == "__main__":
    run()
