# G2 — Legacy-Signal Mapping Table

Every uncertainty signal the platform already stores, from Table 1 of the G2 spec, mapped
deterministically onto the locked axes or explicitly retired with a stated reason. 100%
coverage; nothing left in limbo. Companion to `docs/UNCERTAINTY_VOCABULARY.md` (the single
source). Verified against live production, 2026-07-28 (read-only).

| # | Legacy signal | Where stored / live state | Disposition | Deterministic mapping / retirement reason |
|---|---|---|---|---|
| 1 | Per-node confidence % (65 / 70) | `nodes.confidence`; live values only 65 (evt-) and 70 (art- mirror), 355 event nodes | **Mapped** | 70 → E3 (circumstantial floor: mirror of a carried article); 65 → E4 (asserted, single-source). Exact, total — no other values exist. |
| 2 | Legend reliability scale 1–4 (1 = highest) | UI legend copy only | **Mapped** | 1:1 onto R1–R4 (Axis 1). Numerals retired from display per P5; levels keep the ordering. |
| 3 | `edges.reliability` integer | Live values {1, 2, 4} | **Mapped** | Same R1–R4 scale; per-edge value read as the source reliability of the underlying citation/outlet. |
| 4 | `outlets` ownership / editorial stance | `outlets` (5 rows) | **Mapped (as input)** | Inputs to R-tier assignment, not levels. Tier assignment remains recorded editorial judgment (open question 1.1). |
| 5 | Edge weight heavy / medium / light | Live: heavy 305, light 67; medium only in `edges_backup_20260726_tier3` | **Retired** | Deterministic shadow of relationship type (heavy = actor/constrained_by, light = sequence, medium = pre-remediation causal). Adds no information Axis 4 doesn't carry. Display words retired per P5. |
| 6 | `edges.signal_source` = citation | 38 live edges | **Mapped** | Evidence source → E1 when `doc_strength='documented'` (37 rows), E2 when corroborated (1 row). |
| 7 | `edges.signal_source` = shared_entity | 334 live edges | **Mapped** | Evidence source → E2 (corroborated, 267) or E3 (circumstantial, 67) per `doc_strength`. Not a relationship type (D-04). |
| 8 | `edges.signal_source` = causal_language / temporal | 0 live; present in tier3 backup | **Mapped** | causal_language → RT-causal candidate at E3 evidence, subject to r4 guard; temporal-only → RT-sequence, E3 cap. |
| 9 | `edges.doc_strength` documented / corroborated / circumstantial | 37 / 268 / 67 live | **Mapped** | 1:1 → E1 / E2 / E3. |
| 10 | Edge types causal / sequence / actor / constrained_by | `edges.type`; 0 / 67 / 304 / 1 live | **Mapped** | 1:1 → RT-causal / RT-sequence / RT-actor / RT-constrained_by (Axis 4). |
| 11 | Legend-only type `financial` | UI legend copy only | **Retired** | Topic tag, not an uncertainty signal; topic lives in `node_topics` (333 rows). Representable without a type. |
| 12 | Legend-only type `conflict` | UI legend copy only | **Retired** | Same as #11 — topic tag. |
| 13 | Legend-only type `documentary` | UI legend copy only | **Retired** | Restates evidence strength; use E1 (`documented`). |
| 14 | Legend-only type `sourced` | UI legend copy only | **Retired** | Restates evidence strength; use E1/E2 per `doc_strength`. |
| 15 | Legend-only type `MIP-hypothesis` | UI legend copy only | **Retired** | Restates low-evidence + unreviewed state; representable as E3/E4 + V0/V1 + U-level. No separate type. |
| 16 | Timeline "% documented" label | UI timeline copy only | **Retired (as metric)** | Display alias of Axis 2; the percentage is the E1+E2 share and must not appear as a separate number (P5). |
| 17 | `articles.unattributed` flag | 100 live rows | **Mapped** | A3 (flagged-suspect provenance) **and** U1 (known-unknown attribution). One row, two axes (P1). |
| 18 | `articles.monoculture` flag | 2 live rows | **Mapped** | A3; monoculture concern recorded as U1 on the article. |
| 19 | `articles.is_digest` flag | 11 live rows | **Mapped** | Source reliability input: digest class caps origin at R4 (Axis 1, level R4 definition). |
| 20 | Gate-round verdicts / verifier run records / Tier acceptance decisions | Outside data model (docs, backups) | **Mapped** | Axis 5 history: accepted hand-checks → V2, owner rulings → V3. Persistence deferred (F-02). |
| 21 | `edges.sky_verified` boolean | false on all 372 live rows | **Mapped** | false → V0. Placeholder candidate store for review status (F-02); an unchecked row is never "verified" (Axis 3 note). |
| 22 | `edges.stance` / `disputed_by` / `alternative_causes` / `counterfactual_test` | stance='supports' ×372; dispute fields empty | **Mapped (reserved)** | stance≠supports or non-empty dispute payloads → U2 (contested); counterfactual_test present → strengthens causal claim review trail (V-history). |
| 23 | Parked observation: art-/evt- arc_id mismatches | 5+ live pairs (e.g. `2146acc7`/`d4871a73`) | **Mapped (examples only)** | U1 known-unknown on both members of each pair. Resolution explicitly out of G2 scope. |
| 24 | Parked observation: Iranian-backed-Yemeni / Houthis pair | nodes `d1829b9e…`, `dfb3719d…` | **Mapped (examples only)** | U2 contested on both nodes until the owner review rules. Investigation out of G2 scope. |
| 25 | Unattributed article state (as vocabulary item) | See #17 | **Mapped** | Covered by #17 (A3 + U1). |
| 26 | Unclassified arcs | 11 active `category='unclassified'` arcs | **Mapped** | U1 known-unknown (classification pending). |
| 27 | Absence of a known-unknowns field | Schema-wide | **Recorded** | Follow-up F-03 (`remaining_uncertainty` column), not executed in G2. |
| 28 | `citations.documentation_strength` numeric (0.35–1.0) | `citations` table | **Mapped** | ≥0.8 → E1; 0.5–0.8 → E2; <0.5 → E3 (threshold ruling D-06). |
| 29 | `story_arcs.category_confidence` / `category_evidence` | 0.30–0.95 live; 11 null (unclassified) | **Mapped** | Evidence strength of the *classification claim*: ≥0.8 E2, 0.45–0.8 E3, <0.45 or null → E4 + U1 (D-06/D-07). |
| 30 | `story_arcs.coverage_gap` boolean | 0 live rows true | **Mapped (reserved)** | true → U1 on the arc. |
| 31 | r5 causal guard's causal-language vs citation distinction | `edges_causal_evidence_guard` (r4, live) | **Mapped** | Evidence-axis discriminator on RT-causal rows: citation → E1 path, causal_language → E3 path (see #8). |
| 32 | Phase 0 sanitization / decode / entity-resolution repair outcomes | 19 backup tables, zero-artifact sweep | **Mapped** | Passed → A1; rejected duplicate material → A4 (backups only, excluded from live graph). |
| 33 | Type-agreement guard | Pipeline guard (G1 suite `classification.test.mjs`) | **Mapped** | Mismatch verdict → A3 on the affected row. |

**Coverage check:** 33 rows cover every signal enumerated in G2 Table 1 (source reliability,
per-node confidence, timeline label, signal_source, sanitization/entity-resolution, type-agreement
guard, anomaly handling, edge types, legend-only types, causal-language distinction,
temporal-only sequencing, gate verdicts, verifier records, Tier decisions, parked observations,
unattributed state, unclassified arcs, missing known-unknowns field) plus the additional stored
signals found in preflight (edges.reliability, doc_strength, sky_verified, stance/dispute fields,
citations.documentation_strength, story_arcs.category_confidence, coverage_gap, is_digest).
None left unmapped.
