# Run log — 2026-08-18 — Track B Step 2b pre-build verification

| # | Command | Exit | Result |
|---|---------|------|--------|
| 1 | `node verifier/trackb2b-v1/measure-step2b.mjs all` (initial: shipped + card-adjusted params, no relax) | 0 | T1 fitZoom 0.377/0.328, 69 overlaps; T2 111 overlaps auto-grown; T3 shipped 29,304 / adjusted 22,289 overlaps; band 48px pitch implicated |
| 2 | same, after harness v2 (card-aware params + variants A–D) | 0 | A: 63 overlaps, fz 0.377; B: 49, fz 0.261; C (depth-1): 47, fz 0.467, card 74.5px; D (120px card): 43, fz 0.297. T2: 0/20 fixed overflow, 86 auto-grown overlaps. T3: shipped 27,210 / card-aware 20,499 / strong 16,182 connected overlaps; purity ~2,000 violations, 6/6 hull overlaps |
| 3 | `node exp3.mjs` (fcose knob response) | 0 | nodeSeparation silently ignored (identical results across 0/40/80/100); repulsion 100K: 18,174→12,935; idealEdge 400: 18,551 — fcose local minima |
| 4 | `node exp3.mjs` global relax appended | 0 | 500 iters, 5,623ms, 303 residual overlaps, bb 1570×6031 — global relax not viable at 750 scale |
| 5 | `node exp4.mjs` focused + zoom-gated relax | 0 | focused depth-2: 61→0 in 145ms; full corpus zoom 1.2 hub view: 540 visible, 73,434→1,452 in 9.9s (not viable) |
| 6 | `node exp5.mjs` high-zoom viewports | 0 | desktop z2: 11 visible 4→0 in 17ms; z3: 107 visible 2,955→29 in 517ms; mobile390 z2: 5 visible, 0 overlaps |
| 7 | `node verifier/trackb2b-v1/measure-step2b.mjs all > canonical-run-2026-08-18.json` (final harness with relaxCards + zoom-gated metrics) | 0 | CANONICAL. T1: relax clears to 0 in 31–166ms, region labels OK all viewports; T2: DOM-card path 88→0 in 37ms, region labels 0 overlaps at 2x; T3: zoom-gated passes at desktop z2 / mobile z1+z2, max-zoom hub residual 132 |
| 8 | `node --test tests/` (baseline before any of this) | 0 | 338/338 pass — matches Index Step 3 closure figure |

Experiment scripts exp2–exp5 were scratch probes (fcose behavior, relax
viability); their questions and answers are folded into the canonical harness
as `relaxCards` and the zoom-gated T3 metrics, so every reported number
reproduces from `measure-step2b.mjs` alone. Scratch scripts deleted.
