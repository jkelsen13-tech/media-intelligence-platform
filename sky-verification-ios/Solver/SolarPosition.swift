//
//  SolarPosition.swift
//  Sky Verification — Task 3 support: solar ephemeris
//
//  Self-contained solar position algorithm (no external packages).
//  Implementation follows the NOAA Solar Calculator approximation
//  (https://gml.noaa.gov/grad/solcalc/calcdetails.html), which is itself a
//  compact low-precision version of the NREL SPA (Reda & Andreas, 2004).
//  Stated accuracy: ~±0.01° for years roughly 1950–2050 — well inside the
//  phase doc's requirement of matching published SunCalc values within 0.5°.
//
//  Angles in degrees. Longitude positive EAST. Azimuth clockwise from true
//  north (0=N, 90=E, 180=S, 270=W). Altitude above the geometric horizon
//  (no atmospheric refraction correction — refraction is <0.1° above 10°
//  altitude, and shadow measurements below that are rejected anyway).
//

import Foundation

public struct SunPosition {
    public let altitudeDeg: Double
    public let azimuthDeg: Double
}

public enum SolarPosition {

    private static let rad = Double.pi / 180.0

    /// Julian Day from a UTC date.
    public static func julianDay(from date: Date) -> Double {
        // Seconds since 2001-01-01 00:00:00 UTC → unix → JD.
        let unix = date.timeIntervalSinceReferenceDate + 978_307_200.0
        return unix / 86400.0 + 2440587.5
    }

    /// Sun apparent position for a given UTC instant.
    /// Returns (declinationDeg, equationOfTimeMinutes).
    public static func declinationAndEqTime(julianDay jd: Double) -> (declDeg: Double, eqTimeMin: Double) {
        let T = (jd - 2451545.0) / 36525.0 // Julian centuries since J2000.0

        // Geometric mean longitude of the sun (deg), normalized.
        var L0 = 280.46646 + T * (36000.76983 + T * 0.0003032)
        L0 = L0.truncatingRemainder(dividingBy: 360)
        if L0 < 0 { L0 += 360 }

        // Mean anomaly (deg).
        let M = 357.52911 + T * (35999.05029 - 0.0001537 * T)
        let Mrad = M * rad

        // Eccentricity of Earth's orbit.
        let e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T)

        // Equation of center (deg).
        let C = sin(Mrad) * (1.914602 - T * (0.004817 + 0.000014 * T))
              + sin(2 * Mrad) * (0.019993 - 0.000101 * T)
              + sin(3 * Mrad) * 0.000289

        let trueLong = L0 + C

        // Omega for aberration/nutation correction (deg).
        let omega = 125.04 - 1934.136 * T
        let appLong = trueLong - 0.00569 - 0.00478 * sin(omega * rad)

        // Mean obliquity of the ecliptic (deg).
        let sec = 21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))
        let obliqMean = 23.0 + (26.0 + sec / 60.0) / 60.0
        let obliqCorr = obliqMean + 0.00256 * cos(omega * rad)
        let eps = obliqCorr * rad

        // Declination.
        let lam = appLong * rad
        let decl = asin(sin(eps) * sin(lam)) / rad

        // Equation of time (minutes).
        let y = tan(eps / 2); let y2 = y * y
        let L0rad = L0 * rad
        let eqTime = 4.0 / rad * (
            y2 * sin(2 * L0rad)
            - 2.0 * e * sin(Mrad)
            + 4.0 * e * y * sin(Mrad) * cos(2 * L0rad)
            - 0.5 * y2 * y2 * sin(4 * L0rad)
            - 1.25 * e * e * sin(2 * Mrad)
        )

        return (decl, eqTime)
    }

    /// Sun altitude/azimuth at (latDeg, lngDeg) for a UTC instant.
    public static func position(latDeg: Double, lngDeg: Double, at date: Date) -> SunPosition {
        let jd = julianDay(from: date)
        let (decl, eqTime) = declinationAndEqTime(julianDay: jd)

        // Minutes past midnight UTC.
        let unix = date.timeIntervalSinceReferenceDate + 978_307_200.0
        let minutesUTC = (unix / 60.0).truncatingRemainder(dividingBy: 1440.0)

        // True solar time (minutes), longitude positive east.
        var tst = minutesUTC + eqTime + 4.0 * lngDeg
        tst = tst.truncatingRemainder(dividingBy: 1440.0)
        if tst < 0 { tst += 1440 }

        // Hour angle (deg).
        var ha = tst / 4.0 - 180.0
        if ha < -180 { ha += 360 }

        let phi = latDeg * rad
        let d = decl * rad
        let H = ha * rad

        // Zenith angle.
        var cosZenith = sin(phi) * sin(d) + cos(phi) * cos(d) * cos(H)
        cosZenith = max(-1, min(1, cosZenith))
        let zenith = acos(cosZenith)
        let altitude = 90.0 - zenith / rad

        // Azimuth, clockwise from north (NOAA convention).
        let azRad = atan2(sin(H), cos(H) * sin(phi) - tan(d) * cos(phi))
        var azimuth = azRad / rad + 180.0
        azimuth = azimuth.truncatingRemainder(dividingBy: 360)
        if azimuth < 0 { azimuth += 360 }

        return SunPosition(altitudeDeg: altitude, azimuthDeg: azimuth)
    }
}
