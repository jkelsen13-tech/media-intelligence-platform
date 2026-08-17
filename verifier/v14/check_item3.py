"""Track B Step 2 item 3 — desktop focused-subgraph default (2026-08-17).

Verifies against a dev-server build of the item-3 tree:
  Desktop (1280x800):
    1. Initial Graph render is the top hub's focused subgraph, NOT the
       full graph (cytoscape node count < total node count), with the
       focus trail showing "Default focus: <hub>" and an explicit
       "Show full graph (N nodes)" opt-in.
    2. Clicking the opt-in renders the full graph (count == N) and
       surfaces a discoverable "Focused view: <hub>" return control in
       the toolbar.
    3. The return control restores the default focused subgraph.
    4. Search-selecting a node still pushes a real focus crumb (user
       navigation semantics unchanged).
  Mobile (390x844) — item 3 is desktop-only; mobile must be UNCHANGED:
    5. Entry is still the ranked hub list (no synthetic desktop focus,
       no "Default focus" trail, no "Focused view" toolbar button).
    6. Hub-list -> full graph path still works.
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

def cy_counts(page):
    return page.evaluate(
        "() => { const cy = document.querySelector('.graph-canvas-wrap > div')._cyreg.cy;"
        " return {nodes: cy.nodes().length, edges: cy.edges().length}; }")

def run():
    ok = True
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ---------- Desktop ----------
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.goto(BASE, wait_until="networkidle")
        page.click("button.nav-tab:has-text('Graph')")
        page.wait_for_selector(".graph-stage canvas", timeout=30000)
        page.wait_for_timeout(4500)

        # 1. Focused subgraph is the default render
        sub = cy_counts(page)
        trail = page.query_selector(".focus-trail")
        static_crumb = page.eval_on_selector(
            ".focus-crumb-static", "e => e.textContent") if page.query_selector(".focus-crumb-static") else None
        optin = page.eval_on_selector(
            ".focus-show-all", "e => e.textContent.trim()") if page.query_selector(".focus-show-all") else None
        m = re.search(r"\((\d+)\s*nodes?\)", optin or "")
        total_nodes = int(m.group(1)) if m else None
        ok &= record("desktop/default-is-subgraph",
                     total_nodes is not None and sub["nodes"] < total_nodes,
                     f"rendered={sub['nodes']} total={total_nodes} edges={sub['edges']}")
        ok &= record("desktop/default-focus-crumb",
                     static_crumb is not None and static_crumb.startswith("Default focus: "),
                     f"crumb={static_crumb!r}")
        ok &= record("desktop/optin-explicit",
                     optin is not None and optin.startswith("Show full graph ("),
                     f"optin={optin!r}")
        page.screenshot(path=f"{SHOTS}/2026-08-17-item3-desktop-default-focus.png")
        print("    screenshot: item3-desktop-default-focus")

        # 2. Opt-in renders the full graph + return control appears
        page.click(".focus-show-all")
        page.wait_for_timeout(4500)
        full = cy_counts(page)
        ok &= record("desktop/optin-renders-full-graph",
                     full["nodes"] == total_nodes,
                     f"rendered={full['nodes']} total={total_nodes}")
        ok &= record("desktop/trail-clears-on-full",
                     page.query_selector(".focus-trail") is None)
        ret = page.query_selector(".graph-toolbar-focus-btn")
        ret_text = ret.evaluate("e => e.textContent.trim()") if ret else None
        ok &= record("desktop/return-control-discoverable",
                     ret_text is not None and ret_text.startswith("Focused view: "),
                     f"return={ret_text!r}")
        page.screenshot(path=f"{SHOTS}/2026-08-17-item3-desktop-full-graph.png")
        print("    screenshot: item3-desktop-full-graph")

        # 3. Return control restores the default focused subgraph
        page.click(".graph-toolbar-focus-btn")
        page.wait_for_timeout(4500)
        back = cy_counts(page)
        ok &= record("desktop/return-restores-subgraph",
                     back["nodes"] == sub["nodes"] and
                     page.query_selector(".focus-crumb-static") is not None,
                     f"rendered={back['nodes']} expected={sub['nodes']}")

        # 4. Search-select still pushes a real crumb (stack wins)
        page.fill(".graph-search input", "a")
        page.wait_for_selector(".graph-search-results button", timeout=10000)
        page.click(".graph-search-results button")
        page.wait_for_timeout(3000)
        crumb_btns = page.eval_on_selector_all(
            ".focus-crumb-btn", "els => els.map(e => e.textContent.trim())")
        ok &= record("desktop/search-pushes-real-crumb",
                     len(crumb_btns) == 1 and page.query_selector(".focus-back") is not None,
                     f"crumbs={crumb_btns}")
        ok &= record("desktop/static-crumb-replaced",
                     page.query_selector(".focus-crumb-static") is None)
        page.close()

        # ---------- Mobile (must be unchanged) ----------
        mpage = browser.new_page(viewport={"width": 390, "height": 844},
                                 is_mobile=True, has_touch=True)
        mpage.goto(BASE, wait_until="networkidle")
        mpage.click("nav.bottom-nav >> text=Graph")
        mpage.wait_for_selector(".hub-list", timeout=30000)
        ok &= record("mobile/entry-still-hub-list",
                     mpage.query_selector(".hub-items") is not None)
        ok &= record("mobile/no-synthetic-focus",
                     mpage.query_selector(".focus-crumb-static") is None and
                     mpage.query_selector(".graph-toolbar-focus-btn") is None)
        mpage.screenshot(path=f"{SHOTS}/2026-08-17-item3-mobile-hub-list.png")
        print("    screenshot: item3-mobile-hub-list")
        mpage.click(".hub-show-all")
        mpage.wait_for_selector(".graph-stage canvas", timeout=30000)
        mpage.wait_for_timeout(4500)
        mcounts = cy_counts(mpage)
        ok &= record("mobile/show-all-still-full-graph",
                     mcounts["nodes"] == total_nodes and
                     mpage.query_selector(".focus-trail") is None,
                     f"rendered={mcounts['nodes']} total={total_nodes}")
        mpage.screenshot(path=f"{SHOTS}/2026-08-17-item3-mobile-full-graph.png")
        print("    screenshot: item3-mobile-full-graph")
        mpage.close()
        browser.close()

    with open("/mnt/agents/work/item3-results.json", "w") as f:
        json.dump(results, f, indent=2)
    print("OVERALL:", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)

if __name__ == "__main__":
    run()
