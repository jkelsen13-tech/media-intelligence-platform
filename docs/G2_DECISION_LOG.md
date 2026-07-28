# G2 — Decision Log

Every question ruled on during the G2 lock, the ruling, and the rejected alternatives.
Later phases must not re-litigate these without a golden-set-class change.

| # | Question | Ruling | Rejected alternatives |
|---|---|---|---|
| D-01 | One master confidence score? | **No.** Six independent axes; weakest-link presentation (P2) only. | Composite score (violates 00_INDEX integration rule); source-weighted average (lets R1 launder E4). |
| D-02 | Axis count and identity | **Six**, exactly as the G2 spec names them: source reliability, evidence strength, authentication, relationship type, review status, remaining uncertainty. | Merging authentication into evidence (conflates provenance with plausibility); splitting "correlational" into its own axis. |
| D-03 | Four levels per axis? | **Yes, four levels each** (R/E/A/V/U ×4; RT is a 4-kind unordered set). Uniform depth keeps the machine-checkable encoding trivial and matches the 1–4 legacy scale depth. | Variable depth per axis (harder drift guards); three levels (can't separate "unreviewed" from "flagged"). |
| D-04 | Is `shared_entity` a relationship type? | **No — it is an evidence source** (E2/E3), not a fifth RT level. | RT-correlational level (confuses how we know with what is claimed). |
| D-05 | Retire edge weight words? | **Yes** — heavy/medium/light are a deterministic shadow of edge type; retired with reason recorded. | Keep as display convenience (two parallel vocabularies = the ambiguity G2 exists to kill). |
| D-06 | Numeric thresholds for legacy numerics | `citations.documentation_strength`: ≥0.8→E1, 0.5–0.8→E2, <0.5→E3. Arc `category_confidence`: ≥0.8→E2, 0.45–0.8→E3, <0.45/null→E4. | Per-axis bespoke curves (unauditable); carrying raw numerics forward (P5 violation). |
| D-07 | Unclassified arc = ? | **U1** (known-unknown), never "disproven" — missing evidence is not contradicting evidence. | Treating unclassified as low-quality (punishes the backlog, not the data). |
| D-08 | Arc-level aggregate of U-levels | **Max of member rows.** An arc containing a U2 pair is U2. | Average (hides contested members); root-node-only (misses parked pairs). |
| D-09 | Does review status raise evidence? | **No (P3).** V2/V3 license labels only. | "Reviewed ⇒ more true" (conflates process with evidence). |
| D-10 | sky_verified=false meaning | **V0** (unreviewed), never A1. An unchecked row is not a verified row. | Mapping false→A2 for all rows (loses the distinction between "no check exists" and "check pending"). |
| D-11 | Parked observations in scope? | **Examples only** on Axis 6. Investigation/resolution is out of G2 scope per spec §7. | Folding resolution into G2 (scope creep into a mutation task). |
| D-12 | Fixture implementation timing | Vocabulary JSON fixture ships **with** the lock (it encodes the vocabulary, owner-authorized in this run); drift-guard *tests* wait for owner approval of this vocabulary (spec deliverable 3). | Shipping guard tests now (would enforce a vocabulary the owner hasn't countersigned); shipping no fixture at all (violates "machine-checkable"). |

All rulings recorded under the owner-authorized G2 run of 2026-07-28 ("define and lock the
six shared uncertainty dimensions"). Owner countersign of this log finalizes D-12's gate.
