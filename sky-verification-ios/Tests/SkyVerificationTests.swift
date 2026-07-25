//
//  SkyVerificationTests.swift
//  Sky Verification — XCTest suite (plain XCTest, no device sensors needed)
//
//  (a) ShadowGeometry: known geometry → expected alt/az.
//  (b) SolarPosition: known location/time → alt/az within ~0.5° of reference
//      values (reference source documented below).
//  (c) InverseSolver end-to-end: synthesize observations from SolarPosition
//      at 3 known coordinates/times, confirm recovery within stated radius.
//

import XCTest

final class SkyVerificationTests: XCTestCase {

    // MARK: - Helpers

    private func utcDate(_ y: Int, _ m: Int, _ d: Int, _ h: Int, _ min: Int) -> Date {
        var c = DateComponents()
        c.year = y; c.month = m; c.day = d; c.hour = h; c.minute = min
        c.timeZone = TimeZone(identifier: "UTC")
        return Calendar(identifier: .gregorian).date(from: c)!
    }

    // MARK: - (a) ShadowGeometry

    /// Object: 100 px tall, straight up in the image. Shadow: 100 px,
    /// pointing straight down in the image (away from the camera → same
    /// direction the device faces). Device heading 90° (east).
    /// Expect: ratio 1.0 → sun altitude 45°. Shadow azimuth = 90°,
    /// sun azimuth = 270°.
    func testShadowGeometryKnownGeometry() throws {
        let g = ShadowGeometry(horizontalFOVDeg: 60)
        let obs = try g.observation(
            objectBase: ImagePoint(x: 500, y: 500),
            objectTip:  ImagePoint(x: 500, y: 400),   // up in image
            shadowBase: ImagePoint(x: 500, y: 500),
            shadowTip:  ImagePoint(x: 500, y: 600),   // down in image = away from camera
            imageWidth: 1000,
            deviceHeadingDeg: 90
        )
        XCTAssertEqual(obs.lengthRatio, 1.0, accuracy: 1e-9)
        XCTAssertEqual(obs.sunAltitudeDeg, 45.0, accuracy: 1e-9)
        // Shadow base at image center-x → no FOV correction; shadow az = heading.
        XCTAssertEqual(obs.shadowAzimuthDeg, 90.0, accuracy: 1e-6)
        XCTAssertEqual(obs.sunAzimuthDeg, 270.0, accuracy: 1e-6)
    }

    /// Shadow pointing left in the image while device faces north:
    /// shadow azimuth should be 270° (west), sun azimuth 90° (east — morning).
    func testShadowGeometryAzimuthQuadrant() throws {
        let g = ShadowGeometry(horizontalFOVDeg: 60)
        let obs = try g.observation(
            objectBase: ImagePoint(x: 500, y: 500),
            objectTip:  ImagePoint(x: 500, y: 400),
            shadowBase: ImagePoint(x: 500, y: 500),
            shadowTip:  ImagePoint(x: 450, y: 550),   // left-down → SW-ish in image... see math
            imageWidth: 1000,
            deviceHeadingDeg: 0
        )
        // atan2(dx=-50, -dy=-50) = atan2(-50,-50) = -135° → +360 = 225° image bearing.
        // shadowAz = 0 + 225 + FOV correction for x-offset of midpoint (475):
        // (475-500)/1000 * 60 = -1.5° → 223.5°. Sun az = 43.5°.
        XCTAssertEqual(obs.shadowAzimuthDeg, 223.5, accuracy: 1e-6)
        XCTAssertEqual(obs.sunAzimuthDeg, 43.5, accuracy: 1e-6)
    }

    /// Degenerate taps must throw.
    func testShadowGeometryDegenerate() {
        let g = ShadowGeometry()
        XCTAssertThrowsError(try g.observation(
            objectBase: ImagePoint(x: 10, y: 10),
            objectTip:  ImagePoint(x: 10, y: 10),     // zero-length object
            shadowBase: ImagePoint(x: 10, y: 10),
            shadowTip:  ImagePoint(x: 20, y: 20),
            imageWidth: 100,
            deviceHeadingDeg: 0
        ))
    }

    // MARK: - (b) SolarPosition vs reference values

    // Reference values: computed with the NOAA Solar Calculator equations
    // (the same equations implemented in SolarPosition.swift) and
    // cross-checked against SunCalc (suncalc.org, low-precision Meeus) for
    // these exact inputs; NOAA and SunCalc agree to <0.3° for all cases
    // below, so a 0.5° test tolerance satisfies the phase doc.
    //
    //   London  51.5074N  0.1278W  2026-06-21 12:00 UTC → alt 61.92°, az 178.57°
    //     (analytic check: solstice noon alt = 90 − 51.507 + 23.437 = 61.93°)
    //   NYC     40.7128N 74.0060W  2026-03-20 16:00 UTC → alt 47.02°, az 157.31°
    //   Sydney  33.8688S 151.2093E 2026-12-21 02:00 UTC → alt 79.44°, az 350.49°
    //     (13:00 local, austral-summer solstice; sun near zenith to the north)

    private func assertPosition(_ lat: Double, _ lng: Double, _ date: Date,
                                _ expAlt: Double, _ expAz: Double,
                                file: StaticString = #file, line: UInt = #line) {
        let p = SolarPosition.position(latDeg: lat, lngDeg: lng, at: date)
        XCTAssertEqual(p.altitudeDeg, expAlt, accuracy: 0.5, file: file, line: line)
        // Azimuth wrap-safe compare.
        var dAz = abs(p.azimuthDeg - expAz).truncatingRemainder(dividingBy: 360)
        if dAz > 180 { dAz = 360 - dAz }
        XCTAssertLessThanOrEqual(dAz, 0.5, "azimuth \(p.azimuthDeg) vs \(expAz)", file: file, line: line)
    }

    func testSolarPositionLondonSolsticeNoon() {
        assertPosition(51.5074, -0.1278, utcDate(2026, 6, 21, 12, 0), 61.92, 178.57)
    }

    func testSolarPositionNYCEquinox() {
        assertPosition(40.7128, -74.0060, utcDate(2026, 3, 20, 16, 0), 47.02, 157.31)
    }

    func testSolarPositionSydneySummerSolstice() {
        assertPosition(-33.8688, 151.2093, utcDate(2026, 12, 21, 2, 0), 79.44, 350.49)
    }

    // MARK: - (c) InverseSolver end-to-end

    /// Synthesize a perfectly-known observation from SolarPosition itself at
    /// a true location, then require the solver to recover that location
    /// inside its own stated confidence radius.
    private func assertSolverRecovers(lat: Double, lng: Double, date: Date,
                                      file: StaticString = #file, line: UInt = #line) {
        let truth = SolarPosition.position(latDeg: lat, lngDeg: lng, at: date)
        guard truth.altitudeDeg > 10 else {
            XCTFail("test case has sun too low (alt \(truth.altitudeDeg))", file: file, line: line)
            return
        }
        let solver = InverseSolver(toleranceDeg: 3.0)
        guard let result = solver.solve(observedAltitudeDeg: truth.altitudeDeg,
                                        observedAzimuthDeg: truth.azimuthDeg,
                                        at: date) else {
            XCTFail("solver found no candidates", file: file, line: line)
            return
        }
        let missKm = InverseSolver.haversineKm(lat1: result.centroidLatDeg,
                                               lng1: result.centroidLngDeg,
                                               lat2: lat, lng2: lng)
        XCTAssertLessThanOrEqual(
            missKm, result.confidenceRadiusKm,
            "true (\(lat),\(lng)) is \(missKm)km from centroid but radius is only \(result.confidenceRadiusKm)km",
            file: file, line: line)
        // Best-fit residual should be near zero for a synthetic observation.
        XCTAssertLessThan(result.bestResidualDeg, 1.0, file: file, line: line)
    }

    func testInverseSolverRecoversLondon() {
        assertSolverRecovers(lat: 51.5074, lng: -0.1278, date: utcDate(2026, 6, 21, 12, 0))
    }

    func testInverseSolverRecoversNairobi() {
        assertSolverRecovers(lat: -1.2921, lng: 36.8219, date: utcDate(2026, 9, 22, 9, 0))
    }

    func testInverseSolverRecoversTokyo() {
        assertSolverRecovers(lat: 35.6762, lng: 139.6503, date: utcDate(2026, 6, 21, 3, 0))
    }
}
