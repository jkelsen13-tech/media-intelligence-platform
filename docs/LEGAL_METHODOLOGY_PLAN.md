# MIP Legal Layer — Public Methodology Plan

Status: specification only (Working Document 02A, Amendment A). No production
legal-case feature is released by this document. The future Legal working
document (02C) must inherit the non-goal and dimension framework defined here.

## Non-goal (binding)

MIP does **not** score guilt or innocence. A court verdict is a documented
institutional outcome, not a machine-confirmed truth. MIP may show the gap
between an asserted conclusion and its evidentiary record, but must not assert
guilt, innocence, or the judicial validity of any outcome.

## No composite alignment score

There is no "Verdict-Evidence Alignment" percentage and no equivalent
composite. A single percentage risks being read as an automated guilt,
innocence, or judicial-validity score, and is prohibited.

## The six independent dimensions

Every Legal-layer assessment is presented as the following six dimensions,
rendered separately:

1. **Evidence supporting the verdict or decision**
2. **Evidence contradicting the verdict or decision**
3. **Evidence excluded from the factfinder**
4. **Authentication completeness**
5. **Remaining uncertainty**
6. **Review status**

### Rules

- **Never average** these dimensions into a master score.
- **Do not use one semantic color** to summarize all dimensions.
- **Missing evidence is not contradicting evidence.** "We could not verify
  this" is not "this is false."
- A court verdict is a documented institutional outcome, not a
  machine-confirmed truth.

## Mapping to the shared uncertainty vocabulary (G2, locked)

Each dimension maps to the locked shared uncertainty vocabulary; no new
vocabulary is introduced:

| Legal dimension | Vocabulary axis |
| --- | --- |
| Evidence supporting the verdict/decision | Evidence strength |
| Evidence contradicting the verdict/decision | Evidence strength (opposing direction); never inferred from absence |
| Evidence excluded from the factfinder | Evidence strength + Remaining uncertainty (exclusion is recorded, not scored) |
| Authentication completeness | Authentication |
| Remaining uncertainty | Remaining uncertainty |
| Review status | Review status |

Source reliability continues to apply to every underlying source, per the
shared vocabulary.

## Fixtures and mockups

Legal fixtures and mockups must render the six dimensions separately. No
fixture, mockup, demo dataset, or UI sketch may present a single percentage,
letter grade, or color as a summary of a case's alignment with its record.
