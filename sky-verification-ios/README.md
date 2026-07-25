# Sky Verification (Shadow-First) — iOS Prototype

Standalone SwiftUI prototype of the MIP "Sky Verification" phase doc,
Tasks 1–4 (native side). **Not wired to MIP yet** — no networking, no
Supabase client, no app integration. The matching database migration is
`supabase/migrations/20260729_sky_verification.sql` (applied separately by
the orchestrator).

## Files

| File | Purpose |
|---|---|
| `Sensors/CaptureManager.swift` | Task 1 — CoreMotion attitude (heading/pitch/roll + UTC timestamp) + AVFoundation rear-camera capture with exposure/focus locked. Rejects capture if 1s heading-sample circular stddev > 2°. Emits raw JSON `{heading, pitch, roll, timestamp, image}`. |
| `Measurement/ShadowGeometry.swift` | Task 2 math core — pure struct, **no UIKit/CoreGraphics deps**. Taps (object base/tip, shadow base/tip) + device heading → shadow azimuth, length ratio, observed sun altitude `atan(height/shadowLength)` and azimuth. |
| `Measurement/ShadowMeasurementView.swift` | Task 2 UI — SwiftUI overlay on the captured image; 4-tap measurement flow with markers and result summary. |
| `Solver/SolarPosition.swift` | Self-contained solar position (NOAA Solar Calculator / compact NREL-SPA-style approximation, valid ~1950–2050, accuracy ~0.01°). No external packages. |
| `Solver/InverseSolver.swift` | Task 3 — grid-search inverse geolocation: 5° global coarse pass → 0.5° refinement; outputs **centroid + confidence radius (never a point)** plus best-fit residual angular error. |
| `Payload.swift` | Task 4 types mirroring the TS schema: `SkyVerificationMethod`, `SensorQuality`, `SkyVerificationPayload`, SHA-256 image-hash helper (CryptoKit). **No raw image, no GPS, no PII.** |
| `Tests/SkyVerificationTests.swift` | XCTest: ShadowGeometry known-geometry cases; SolarPosition vs documented reference values; InverseSolver end-to-end recovery of 3 known locations. |

## Setup (fresh Xcode project)

1. Xcode → File → New → Project → iOS **App** (SwiftUI lifecycle, Swift).
   Deployment target iOS 16+.
2. Drag all `.swift` files into the project. Put
   `Tests/SkyVerificationTests.swift` in the **test target**, everything
   else in the app target.
3. Add to the app target's Info.plist:
   - `NSCameraUsageDescription` — "Camera is used to photograph a vertical
     object and its shadow for sky-based location verification."
   - `NSMotionUsageDescription` — "Motion sensors are used to measure device
     heading at capture time."
4. Build & run on a **physical device** (camera + magnetometer are required;
   the simulator cannot provide either).
5. Run tests with ⌘U. All tests are sensor-free and pass on any host.

## Solar position algorithm / reference values

`SolarPosition.swift` implements the NOAA Solar Calculator equations
(<https://gml.noaa.gov/grad/solcalc/calcdetails.html>) — a compact
low-precision form of the NREL SPA (Reda & Andreas 2004). The unit tests
check it against documented reference values (e.g. London 51.5074N 0.1278W,
2026-06-21 12:00 UTC → alt 61.92°, az 178.57°, which also matches the
analytic solstice-noon altitude 90 − 51.507 + 23.437 = 61.93°). NOAA and
SunCalc agree to <0.3° on all reference cases; the test tolerance is 0.5°.

## Acceptance criteria (phase doc)

- [ ] **Heading stable within ~2° when still** — `CaptureManager` samples
      heading at 20 Hz for 1s and rejects capture if circular stddev > 2°.
      *Needs real-device validation* (device resting vs hand-held).
- [x] **Shadow measurement matches SunCalc within ~3°** — unit-tested via
      `SolarPosition` reference cases; on-device tap accuracy also needs
      field validation.
- [x] **Inverse solver recovers 3+ known test locations within stated
      radius** — unit-tested (London, Nairobi, Tokyo; solver asserts
      truth ∈ centroid + confidenceRadiusKm).

## Non-goals (explicit, per phase doc)

- No night/star mode (`starField` exists in the payload enum for schema
  compatibility only; not implemented).
- No sun-disk auto-detection (no CV; measurement is human-tap assisted).
- No GPS — `CoreLocation` is never imported anywhere in this prototype.
- No web implementation — iOS/SwiftUI only.

## Known limitations / needs real-device validation later

- Heading is **magnetic** north (`xMagneticNorthZVertical`); conversion to
  true north normally needs location (declination). The prototype keeps the
  magnetic reference end-to-end; production should apply a declination
  correction table or use `.xTrueNorthZVertical` with coarse location
  consent. This is the largest expected field error source.
- Horizontal FOV (default 67°) is hardcoded; calibrate per-device.
- Camera pitch compensation assumes a roughly upright hold; pitch/roll are
  recorded in the capture JSON for later correction.
- Solver runtime: ~37×72 coarse cells + refinement ≈ a few hundred ms on
  modern devices; verify on the oldest supported device.
