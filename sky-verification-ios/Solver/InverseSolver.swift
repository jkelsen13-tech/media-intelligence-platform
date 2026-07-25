//
//  InverseSolver.swift
//  Sky Verification — Task 3: inverse geolocation from sun observation
//
//  Given an observed sun altitude + azimuth and an exact UTC timestamp,
//  grid-search the Earth's surface for the locus where the predicted sun
//  position (SolarPosition, NOAA/SPA approximation) matches within a
//  tolerance. Coarse 5° global pass, then a 0.5° refinement around each
//  candidate cluster.
//
//  Output is ALWAYS a region (centroid + radius confidence band), never a
//  point. The caller should treat the radius as the honest uncertainty of
//  the method given the angular tolerance.
//

import Foundation

public struct GeoCandidate: Equatable {
    public let latDeg: Double
    public let lngDeg: Double
    /// Angular separation (deg) between observed and predicted sun position.
    public let residualDeg: Double
}

public struct InverseSolveResult {
    /// Area-weighted centroid of accepted candidates (degrees).
    public let centroidLatDeg: Double
    public let centroidLngDeg: Double
    /// Radius (km) of a circle on the centroid that contains all accepted
    /// refined candidates — the confidence band.
    public let confidenceRadiusKm: Double
    /// Residual angular error (deg) of the single best-fit candidate.
    public let bestResidualDeg: Double
    /// Number of refined candidates inside tolerance.
    public let candidateCount: Int
}

public struct InverseSolver {

    /// Angular tolerance (deg) for accepting a (lat,lng) as matching the
    /// observation. 3° matches the phase doc's measurement acceptance bar.
    public var toleranceDeg: Double
    /// Coarse grid step (deg).
    public var coarseStepDeg: Double
    /// Refinement grid step (deg).
    public var fineStepDeg: Double

    public init(toleranceDeg: Double = 3.0,
                coarseStepDeg: Double = 5.0,
                fineStepDeg: Double = 0.5) {
        self.toleranceDeg = toleranceDeg
        self.coarseStepDeg = coarseStepDeg
        self.fineStepDeg = fineStepDeg
    }

    /// Solve for the region consistent with the observation.
    /// Returns nil if no cell on Earth matches within tolerance (bad
    /// measurement or bad timestamp — caller should reject the capture).
    public func solve(observedAltitudeDeg: Double,
                      observedAzimuthDeg: Double,
                      at date: Date) -> InverseSolveResult? {

        // --- Coarse pass: 5° global grid ----------------------------------
        var coarse: [GeoCandidate] = []
        var lat = -85.0 // poles: sun geometry degenerates; cap like SunCalc
        while lat <= 85.0 {
            var lng = -180.0
            while lng < 180.0 {
                let p = SolarPosition.position(latDeg: lat, lngDeg: lng, at: date)
                let err = ShadowGeometry.angularSeparationDeg(
                    alt1: observedAltitudeDeg, az1: observedAzimuthDeg,
                    alt2: p.altitudeDeg, az2: p.azimuthDeg)
                if err <= toleranceDeg + coarseStepDeg * 0.75 {
                    coarse.append(GeoCandidate(latDeg: lat, lngDeg: lng, residualDeg: err))
                }
                lng += coarseStepDeg
            }
            lat += coarseStepDeg
        }
        guard !coarse.isEmpty else { return nil }

        // --- Fine pass: 0.5° refinement around coarse candidates ----------
        var refined: [GeoCandidate] = []
        let reach = coarseStepDeg * 0.75
        for c in coarse {
            var la = c.latDeg - reach
            while la <= c.latDeg + reach {
                guard la >= -85, la <= 85 else { la += fineStepDeg; continue }
                var ln = c.lngDeg - reach
                while ln <= c.lngDeg + reach {
                    var wrapped = ln
                    if wrapped < -180 { wrapped += 360 }
                    if wrapped >= 180 { wrapped -= 360 }
                    let p = SolarPosition.position(latDeg: la, lngDeg: wrapped, at: date)
                    let err = ShadowGeometry.angularSeparationDeg(
                        alt1: observedAltitudeDeg, az1: observedAzimuthDeg,
                        alt2: p.altitudeDeg, az2: p.azimuthDeg)
                    if err <= toleranceDeg {
                        refined.append(GeoCandidate(latDeg: la, lngDeg: wrapped, residualDeg: err))
                    }
                    ln += fineStepDeg
                }
                la += fineStepDeg
            }
        }
        guard !refined.isEmpty else { return nil }

        // --- Region summary: cosine-lat-weighted centroid + max radius ----
        let weights = refined.map { max(0.05, cos($0.latDeg * .pi / 180)) }
        let wSum = weights.reduce(0, +)
        let cLat = zip(refined, weights).map { $0.latDeg * $1 }.reduce(0, +) / wSum
        // Longitude mean must be circular; use the weighted vector mean.
        let sinMean = zip(refined, weights).map { sin($0.lngDeg * .pi / 180) * $1 }.reduce(0, +) / wSum
        let cosMean = zip(refined, weights).map { cos($0.lngDeg * .pi / 180) * $1 }.reduce(0, +) / wSum
        var cLng = atan2(sinMean, cosMean) * 180 / .pi
        if cLng < -180 { cLng += 360 }
        if cLng > 180 { cLng -= 360 }

        var maxRadiusKm = 0.0
        for c in refined {
            let d = InverseSolver.haversineKm(lat1: cLat, lng1: cLng,
                                              lat2: c.latDeg, lng2: c.lngDeg)
            maxRadiusKm = max(maxRadiusKm, d)
        }

        let best = refined.min(by: { $0.residualDeg < $1.residualDeg })!

        return InverseSolveResult(
            centroidLatDeg: cLat,
            centroidLngDeg: cLng,
            confidenceRadiusKm: maxRadiusKm,
            bestResidualDeg: best.residualDeg,
            candidateCount: refined.count
        )
    }

    public static func haversineKm(lat1: Double, lng1: Double,
                                   lat2: Double, lng2: Double) -> Double {
        let r = 6371.0
        let p1 = lat1 * .pi / 180, p2 = lat2 * .pi / 180
        let dp = (lat2 - lat1) * .pi / 180
        var dl = (lng2 - lng1) * .pi / 180
        if dl > .pi { dl -= 2 * .pi }
        if dl < -.pi { dl += 2 * .pi }
        let a = sin(dp / 2) * sin(dp / 2) + cos(p1) * cos(p2) * sin(dl / 2) * sin(dl / 2)
        return 2 * r * asin(min(1, a.squareRoot()))
    }
}
