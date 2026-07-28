# MIP — Shared Uncertainty Vocabulary (G2, LOCKED)

**Status:** LOCKED 2026-07-28 under owner-authorized G2 run. Single source of truth for all
uncertainty language in the platform. Any other wording in the repo, UI copy, or SQL is a
citation of this document, never a rival definition.
**Change class:** golden-set-class. Adding, renaming, or reordering any level requires owner
review plus an entry in `tests/golden/CHANGELOG.md`.
**Machine-checkable encoding:** `tests/golden/fixtures/uncertainty_vocabulary.json` (byte-for-byte
the canonical level sets, ordering, and mappings below).

Six axes. Each answers a different question. **No master score is ever computed from them**
(00_INDEX integration rule: "Use the shared vocabulary; never create a master score").
Critical distinction inherited from 00_INDEX: **missing evidence is not contradicting
evidence.** "We could not verify this" is not "this is false."

---

## Axis 1 — Source reliability

**(a) What it measures:** how much we trust an outlet or origin as an institution,
independent of any single article it produced.

**(b) Level set (ordered, highest first):** `R1` · `R2` · `R3` · `R4`

| Level | Definition | Worked examples (real rows) |
|---|---|---|
| `R1` established-primary | International/national outlet with independent editorial process and correction record. | BBC — `sources` row `4b440195-e910-5d43-956a-8e7556e211e5` ("UK 'ready to defend itself'…"); New York Times — `outlets` row `27965b6a-4244-4cb1-9858-855e8a908280` |
| `R2` established-secondary | Established outlet with known funding/ownership caveat or regional frame (state-funded, advocacy-adjacent) but professional editorial process. | Al Jazeera — `outlets` row `34e62685-5a61-414f-80d1-3d132c33ca61` (Qatar state-funded); South China Morning Post — 78 rows in `sources` (largest single outlet) |
| `R3` partisan-weighted | Outlet whose news/opinion blend requires per-piece caution; reliability depends on desk, not brand. | Fox News — `outlets` row `aa7c7ab1-8af8-4b72-84cf-32626bf3da78` (notes: "opinion/News division distinction matters"); Fox News article `57eb2c6f-6f0d-42b0-bfbe-1c2978f01ae4` |
| `R4` unvetted-origin | Origin with no established editorial record in the system, or content class that carries no institutional backing (quizzes, digests, live-blog fragments). | Times of India — 15 rows in `sources`, no `outlets` profile row; `is_digest` articles (11 rows, e.g. any row in the 11-row `is_digest=true` set) |

**(c) Ordering:** R1 > R2 > R3 > R4. Ordering governs presentation emphasis only; it never
raises the evidence-strength level of any claim (Precedence P2).

**(d) Mapping in:** legend reliability scale 1–4 maps 1:1 (legend 1 = R1 … legend 4 = R4);
`edges.reliability` (values 1/2/4 live) maps onto the same scale; the `outlets` table's
ownership/stance fields are inputs to tiering, not levels themselves.

**(e) Open questions for owner before re-tiering (lock stands as-is):**
1. Objective criteria for tiering *new* outlets (correction policy? ownership test?) — currently editorial judgment formalized.
2. Whether NPR / Democracy Now! / Guardian sit at R1 or R2 (currently R1, R3, R1 respectively by editorial judgment).

---

## Axis 2 — Evidence strength

**(a) What it measures:** how well a *specific claim or row* is supported, regardless of who said it.

**(b) Level set (ordered, strongest first):** `E1` · `E2` · `E3` · `E4`

| Level | Definition | Worked examples (real rows) |
|---|---|---|
| `E1` documented | Primary documentary evidence directly attached (citation edge with `doc_strength='documented'`). | `edges` row `1375a644-ae0c-4c29-a19e-d0db265338fd` (citation/documented, reliability 1); `edges` row `36a620b6-c922-4410-8f1d-57edd5e81f3c` (citation/documented) |
| `E2` corroborated | Multiple independent outlets carry the same claim (`doc_strength='corroborated'`, 268 live edges). | Any of the 267 `shared_entity`/corroborated edges, e.g. the class represented by `signal_source='shared_entity', doc_strength='corroborated', reliability=2`; `citations.documentation_strength=1.0` rows |
| `E3` circumstantial | Inference from shared entities or indirect context (`doc_strength='circumstantial'`, 67 live edges). | The 67 `shared_entity`/circumstantial/reliability-4 edges (the full `type='sequence'`, `weight='light'` class); `citations.documentation_strength=0.35` rows |
| `E4` asserted | Single-source assertion with no independent corroboration; the 65-confidence event-node class. | `nodes` row `89d5d4b8-fa3d-4cb1-b654-5106050eddb1` (confidence 65, evt- node, arc_id null); `nodes` row `163fd4bc-af01-46c3-8f53-fc071050a7b7` (confidence 65) |

**(c) Ordering:** E1 > E2 > E3 > E4.

**(d) Mapping in:** per-node `confidence` percentages → 70 (art- mirror) = E3 floor, 65 = E4
(deterministic, exact; the two only live values); `doc_strength` documented/corroborated/
circumstantial → E1/E2/E3 (1:1); timeline "% documented" label → display alias of this axis,
retired as a separate metric; `citations.documentation_strength` numeric → E1 at ≥0.8, E2 at
0.5–0.8, E3 below (thresholds recorded as owner rulings D-06).

**(e) Open questions:** 1. Exact numeric cut-points if `citations.documentation_strength` gains
values between 0.35 and 1.0. 2. Whether corroboration across syndicated copies of one wire
story counts as E2 (currently: no — syndication is one source).

---

## Axis 3 — Authentication

**(a) What it measures:** whether an item is genuinely what it claims to be (real article, real
actor, real document) — provenance, not plausibility.

**(b) Level set (ordered):** `A1` · `A2` · `A3` · `A4`

| Level | Definition | Worked examples (real rows) |
|---|---|---|
| `A1` verified-genuine | Passed Phase 0 sanitization, decode, and entity-resolution checks with zero artifacts. | Any article in the final 34-column/19-table zero-artifact sweep (572-row `articles` table, e.g. `10c53760-9007-4a9e-8e19-2d28f1ef18ad`); resolved citation rows in `citations` with non-null `resolved_node_id` |
| `A2` unreviewed | Default state; no authentication check has run on this row. | All 372 live edges (`sky_verified=false` on every row); the 321 actor nodes (no review field, never individually checked) |
| `A3` flagged-suspect | System or reviewer flagged a provenance problem; row stays visible but marked. | 100 `unattributed=true` articles, e.g. `57eb2c6f-6f0d-42b0-bfbe-1c2978f01ae4` (Fox News, no byline); 2 `monoculture=true` articles `67b1022b-a963-41fb-a44a-5b1023ae33ef`, `c7574137-8a8f-4edb-a45c-6c0a0472f4ad` |
| `A4` rejected-duplicate | Confirmed non-canonical copy; retained only in backups, excluded from the live graph. | `nodes_tier6_iran_backup_20260728` (2 rows — duplicate Iran actor nodes); `edges_tier6_iran_backup_20260728` (2 rows) |

**(c) Ordering:** A1 > A2 > A3 > A4 (A4 excluded from presentation).

**(d) Mapping in:** Phase 0 sanitization/decode/entity-resolution repair outcomes → A1/A4;
type-agreement guard verdicts → A3 on mismatch; `unattributed`, `monoculture` flags → A3;
`sky_verified=false` → A2 (not A1 — an unchecked row is never "verified").

**(e) Open questions:** 1. Does A1 expire (re-verification cadence) once ingestion resumes?
2. Who can set A3→A1 (owner only, or pipeline on re-check)? Currently: owner only.

---

## Axis 4 — Relationship type

**(a) What it measures:** what kind of connection an edge asserts, and (via companion axis 2)
how certain that connection is — never conflated with the strength of its evidence.

**(b) Level set (no ordering — these are kinds, not ranks):**
`RT-causal` · `RT-sequence` · `RT-actor` · `RT-constrained_by`

| Level | Definition | Worked examples (real rows) |
|---|---|---|
| `RT-causal` | One event is asserted to have caused or materially enabled another; requires causal-language or citation evidence under the r4 guard. | Backup rows `d27247b2-09a3-4b69-8c79-0991872910d0` and `d8c5243e-b070-491a-a1fc-e1ef7a62615d` (`edges_backup_20260726_tier3`, type=causal, signal_source=causal_language) — zero live today by design after Tier 3 remediation |
| `RT-sequence` | Temporal ordering only; explicitly not causal. | 67 live `type='sequence'` edges (weight=light, doc_strength=circumstantial); the full 67-row sequence class |
| `RT-actor` | Participation/attribution between an actor and an event. | 304 live `type='actor'` edges, e.g. documented ones `1375a644-ae0c-4c29-a19e-d0db265338fd`, `36a620b6-c922-4410-8f1d-57edd5e81f3c` |
| `RT-constrained_by` | A policy/legal/structural constraint binding an event or actor. | The single live row `80d290c1-4417-40ba-9e43-ab13d350e7be` (type=constrained_by); its backup counterpart in `edges_backup_20260726_tier3` |

**(c) Ordering:** none among levels. Certainty of the connection lives on Axis 2, never here.

**(d) Mapping in:** edge types causal/sequence/actor/constrained_by map 1:1. The r5/r4
causal-language-vs-citation distinction → evidence axis (E1 vs E3) on RT-causal rows.
Temporal-only sequencing → RT-sequence with E3 cap. Legend-only types are **retired**
(reasons in mapping table): `financial`/`conflict` are topic tags (live in `node_topics`, 333
rows), `documentary`/`sourced` restate evidence strength, `MIP-hypothesis` restates
low-evidence + unreviewed status — all are representable without a type of their own.

**(e) Open questions:** 1. When causal edges return (post-Gate-Round-3), do they need a
sub-level for "alleged causal" (currently handled by E-level + review status, per P2)?
2. Should `correlational` become a fifth level for shared-entity-only actor pairs? Currently
rejected — `shared_entity` is an evidence source, not a relationship kind (Decision D-04).

---

## Axis 5 — Review status

**(a) What it measures:** whether a human (or which named process) has examined this specific
row, and what they concluded.

**(b) Level set (ordered by rigor):** `V0` · `V1` · `V2` · `V3`

| Level | Definition | Worked examples (real rows) |
|---|---|---|
| `V0` unreviewed | No process or human has examined this row. Default. | All 372 edges (`sky_verified=false`); unattributed article `b92ad4d9-ddab-48a5-a7f4-7d9bdd66083b` |
| `V1` pipeline-verified | Passed the automated gates: golden suite, monitors, constraint guards. | All rows covered by the G1 monitors' zero-alert baselines (edges 372, arcs 40, articles 572 at 2026-07-28 baseline); rows accepted under the r4 `edges_causal_evidence_guard` |
| `V2` human-reviewed | A named human examined the row and accepted it. | The 8 arcs / 61+ articles hand-checked in Phase 0 Item 1 (e.g. `story_arcs` rows `317eb508-4960-4f19-ae81-3d58224e8365`, `0a4c7483-135a-4e2a-a02a-cb0a102144fe`); owner-accepted Tier remediation rows |
| `V3` adjudicated | Owner ruled on a dispute about this row; ruling recorded in a decision log. | Tier 3 remediation decisions (17 rows in `edges_tier3_remediation_backup_20260727`); the r4 constraint body itself (blob `09c66e1e`, byte-verified) |

**(c) Ordering:** V0 < V1 < V2 < V3. Higher review never raises an E-level; it only licenses
the "reviewed" label (Precedence P3).

**(d) Mapping in:** gate-round verdicts, verifier run records, Tier acceptance decisions
(currently outside the data model) → V2/V3 as recorded history; `sky_verified` boolean →
V0/V1 placeholder (false=V0 today; the column is a candidate future store, recorded as
follow-up F-02, **not** executed in G2).

**(e) Open questions:** 1. Does V2 decay (a row edited after review drops to V1)? Currently:
yes, any mutation resets to V1. 2. Whether reviewer identity is stored per row (deferred to
Phase 2 provenance, follow-up F-02).

---

## Axis 6 — Remaining uncertainty

**(a) What it measures:** after all other axes are set, what is explicitly still unknown or
disputed about this item — the known unknowns, recorded rather than implied.

**(b) Level set (ordered, calmest first):** `U0` · `U1` · `U2` · `U3`

| Level | Definition | Worked examples (real rows) |
|---|---|---|
| `U0` none-outstanding | No recorded open question. | Fully resolved arcs such as `b492cb87-23ff-4e7c-81d1-59ed978b3fea` (Canada — trade dispute); the 457 articles with no flags and arc assignment attempted |
| `U1` known-unknown | A specific, recorded gap whose resolution is pending but not disputed. | 11 `category='unclassified'` active arcs; art-/evt- `arc_id` mismatch pairs (e.g. art `2146acc7-42ca-4a36-84d9-ca3a12f4fc11` in arc `ab781e56…` vs evt twin `d4871a73-20e5-47f4-bcd5-0b06d60e68cf` arc_id null) — parked observation, example only, resolution out of G2 scope |
| `U2` contested | Two live records disagree about the same world fact; both retained. | The Houthis actor pair `dfb3719d-3f56-4b66-ae21-88b91eb19afc` ("Iranian-aligned Houthis") vs `d1829b9e-de89-48f9-b198-d3fa34693d44` ("Iranian-backed Yemeni") — parked entity pair under review; duplicate arc-title candidates flagged by the G1 monitor baseline 0 |
| `U3` unresolved-blocker | The unknown blocks a downstream conclusion; item must not be presented as settled. | The 405 unattached articles (70.8% baseline monitor) blocking arc completeness claims; `edges.disputed_by`/`alternative_causes` payloads when populated (currently empty — level reserved) |

**(c) Ordering:** U0 < U1 < U2 < U3 by escalation. U2/U3 are always displayed alongside the
item; they are never suppressed (Precedence P4).

**(d) Mapping in:** parked observations (art- arc_id mismatches, entity pairs under review) →
U1/U2 as examples only; `unattributed` article state → U1 in addition to A3 (one row, two
axes); unclassified arcs → U1; absence of any known-unknowns field → follow-up F-03
(future `remaining_uncertainty` column, **not** executed in G2).

**(e) Open questions:** 1. Do parked observations get owner-visible aging (e.g. >30 days →
U3)? Currently: no aging, owner reviews on cadence. 2. Whether U-levels apply per-row only or
also per-arc aggregate (currently per-row; arc aggregate = max of members, recorded D-08).

---

## Precedence rules

- **P1 — Storage independence.** All six axes are stored independently. No axis ever
  overwrites another. A disagreement between axes is data, not an error.
- **P2 — Presentation is weakest-link.** The displayed standing of any item is governed by
  the weakest of {authentication, evidence strength}. Source reliability may modulate
  emphasis within one evidence level but can never raise it. A high-reliability source
  carrying a weak-evidence claim is presented as *weak evidence from a reliable source*.
- **P3 — Review status governs labels only.** V2+ licenses the "reviewed" label; V3 licenses
  "adjudicated". Review status never changes how evidence or authentication is displayed.
- **P4 — Remaining uncertainty is never suppressed.** U1+ is always rendered with the item.
  U3 blocks any "settled" presentation regardless of other axes.
- **P5 — Legacy numeric displays retired.** No confidence percentages, 1–4 reliability
  numerals, or weight words in user-facing copy once a later phase adopts this vocabulary;
  UI shows axis level names. (UI adoption itself is out of G2 scope.)

## Disagreement cases (acceptance criterion 4)

1. **Reliable source / weak evidence.** BBC article `10c53760-9007-4a9e-8e19-2d28f1ef18ad`:
   R1 outlet, E4-class single-source claim, A3 (unattributed=true). P2 → displayed as weak,
   flagged provenance; the R1 badge cannot raise it. Both facts stored (P1).
2. **Strong causal language / contested authentication.** Backup causal edge
   `d27247b2-09a3-4b69-8c79-0991872910d0` (causal_language, medium): RT-causal with E3
   language evidence, A2 (`sky_verified=false` class). P2 → if reinstated it presents as
   *alleged causal*, not established; Tier 3 remediation history is exactly this case.
3. **Reviewed row / high remaining uncertainty.** Arc `317eb508-4960-4f19-ae81-3d58224e8365`
   (hand-checked in Item 1 → V2) sits in the same graph as art-/evt- mismatch pair
   `2146acc7`/`d4871a73` (U1). P3 → the arc keeps its "reviewed" label; P4 → the mismatch is
   still shown on the affected nodes. Neither fact cancels the other.

## Follow-ups (recorded, NOT executed in G2)

- **F-01:** Schema column(s) for per-row axis storage (deferred to a later authorized phase).
- **F-02:** Review-status persistence incl. reviewer identity (Phase 2 provenance candidate;
  `sky_verified` is the placeholder).
- **F-03:** `remaining_uncertainty` known-unknowns field.
- **F-04:** UI adoption of level names (legend, timeline "% documented", badges) — Track B,
  gated on this lock.
