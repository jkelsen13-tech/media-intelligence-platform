# Probabilistic Location Corroboration — Specification

Status: specification only (Working Document 02A, Amendment B). This document
renames and re-scopes the feature formerly called "Sky Verification." No
deployment of the location feature belongs to this phase.

## Rename

The feature formerly named **Sky Verification** is now **Probabilistic
Location Corroboration**.

Rationale: sky position, shadows, terrain, weather, and sensor data may
constrain a location, but they do not uniquely verify identity or precise
position. Timestamps and sensors can also be spoofed.

## Deprecation note (deliberate retained references)

The following legacy identifiers are retained for schema and history
compatibility and are **deprecated names** for Probabilistic Location
Corroboration. They must not appear in user-facing language:

- Database table `public.sky_verifications` and column `edges.sky_verified`
  (renaming them is a production migration — out of scope for 02A; a separate
  migration plan is required before any field rename).
- Migration file `supabase/migrations/20260729_sky_verification.sql`
  (historical record; not edited).
- Prototype folder `sky-verification-ios/` and its Swift type names
  (historical prototype; carries a deprecation note in its README).
- Code identifiers in `src/lib/sky.js`, `src/panels/SkyBadge.jsx`, and CSS
  class names (internal identifiers, not user-facing labels).

## Language rules

- Use **"corroborates," "is consistent with,"** or **"does not support"** —
  never "verifies."
- UI language must not be mistakable for identity verification.
- Treat failed corroboration as **unresolved**, unless evidence directly
  contradicts the claimed location.

## Display rules

- Display a **plausible location band, never a precise point.**
- Show **assumptions, evidence inputs, confidence limits, and spoofing
  risks** alongside any corroboration result.
- Do not expose a reporter's or private individual's precise location.

## Output schema (specification)

A corroboration result must support:

| Field | Content |
| --- | --- |
| band | Plausible location band (region/radius), never a point |
| evidence_inputs | The inputs used (e.g., shadow/sky measurement, sensor tier, weather) |
| confidence | Confidence limits, expressed as a qualified range, not a verdict |
| uncertainty | Remaining uncertainty, per the shared uncertainty vocabulary |
| review_status | Review status, per the shared uncertainty vocabulary |

Plus explicit spoofing-risk disclosure.

## Pre-deployment gates (implementation acceptance)

Before any real-world use, the feature requires:

1. **Privacy review** — including the no-precise-location rule for reporters
   and private individuals.
2. **Anti-spoofing tests** — timestamp and sensor spoofing must be detected
   or disclosed as limitations.
3. **Independent security review.**

These requirements are part of implementation acceptance for any future
deployment phase.
