// Track B Step 2 item 3 (04_TRACK_B Step 2: "focused subgraph of one or
// two levels by default; full graph as an explicit opt-in").
//
// Desktop opens on the top hub's depth-2 neighborhood instead of the
// full graph. The full graph remains an explicit opt-in ("Show full
// graph" in the focus trail); a matching "Focused view" control in the
// toolbar returns to the default. Mobile is deliberately out of scope:
// it already enters through the ranked hub list, and this helper never
// synthesizes a focus crumb on mobile.
//
// A synthetic crumb is marked `synthetic: true` so the UI can label it
// as the default focus rather than a user-chosen breadcrumb (it is not
// pushed onto the focus stack, so Back/ crumb navigation is untouched).

export function resolveFocal({ isMobile, desktopShowAll, focusStack, topHub }) {
  if (focusStack.length > 0) return focusStack[focusStack.length - 1]
  if (!isMobile && !desktopShowAll && topHub) {
    return {
      kind: 'node',
      id: topHub.id ?? topHub.slug,
      label: topHub.label ?? (topHub.id ?? topHub.slug),
      synthetic: true,
    }
  }
  return null
}

// Track B Step 2b, owner-ruled adjustment 5 (2026-08-18): mobile focused
// views render at depth-1, never depth-2. Pre-build verification (verifier/
// trackb2b-v1) showed depth-2 card nodes fit a 390px viewport only at zoom
// 0.377 — below the legibility floor — while depth-1 fits at 0.465 and
// renders cards at 74.5px. Desktop keeps depth-2 (wider canvas, fits).
export function focusDepth(isMobile) {
  return isMobile ? 1 : 2
}
