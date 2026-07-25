//
//  ShadowGeometry.swift
//  Sky Verification — Task 2 math core (pure, no UIKit/CoreGraphics deps)
//
//  Given the four user taps (object base/tip, shadow base/tip) in image
//  coordinates plus the device heading at capture time, compute:
//    - shadow azimuth (degrees, clockwise from north, magnetic reference)
//    - shadow/object length ratio (unitless, in image space)
//    - observed sun altitude  = atan(objectHeight / shadowLength)
//    - observed sun azimuth   = shadow azimuth + 180° (sun is opposite the shadow)
//
//  Assumptions / limitations:
//    - The object is vertical (pole, signpost edge) and the ground is flat.
//    - Both object and shadow lie in the ground plane in the real world; the
//      RATIO of their lengths is used so unknown ground-plane foreshortening
//      mostly cancels as long as object and shadow are collinear in the scene.
//      (For exactness we measure object height as the tip-base pixel distance
//      and shadow length likewise; the resulting altitude is an approximation
//      good to a few degrees — acceptable per the phase doc's ~3° tolerance.)
//    - Camera is roughly upright; image x-axis maps to device heading via the
//      camera's horizontal field of view.
//

import Foundation

/// 2D point in image coordinates (plain struct so the file stays UIKit-free).
public struct ImagePoint: Equatable {
    public var x: Double
    public var y: Double
    public init(x: Double, y: Double) { self.x = x; self.y = y }

    public func distance(to other: ImagePoint) -> Double {
        let dx = x - other.x, dy = y - other.y
        return (dx * dx + dy * dy).squareRoot()
    }
}

public struct ShadowObservation {
    /// Observed sun altitude above horizon, degrees.
    public let sunAltitudeDeg: Double
    /// Observed sun azimuth, degrees clockwise from (magnetic) north.
    public let sunAzimuthDeg: Double
    /// Shadow azimuth (direction the shadow points), degrees from north.
    public let shadowAzimuthDeg: Double
    /// shadowLength / objectHeight ratio.
    public let lengthRatio: Double
}

public enum ShadowGeometryError: Error {
    case degenerateObject   // base == tip
    case degenerateShadow
    case implausibleRatio   // ratio too small/large to be physical
}

public struct ShadowGeometry {

    /// Camera horizontal field of view used to map image x-offsets to
    /// azimuth offsets from the device heading. ~67° is typical for the
    /// iPhone rear wide camera in a 4:3 photo; expose it for calibration.
    public var horizontalFOVDeg: Double

    public init(horizontalFOVDeg: Double = 67.0) {
        self.horizontalFOVDeg = horizontalFOVDeg
    }

    /// Compute the shadow observation.
    /// - Parameters:
    ///   - objectBase/objectTip: taps on the vertical object.
    ///   - shadowBase/shadowTip: taps on the shadow (base at the object base).
    ///   - imageWidth: pixel width of the image (for FOV mapping).
    ///   - deviceHeadingDeg: device heading at capture, degrees from magnetic north.
    public func observation(objectBase: ImagePoint,
                            objectTip: ImagePoint,
                            shadowBase: ImagePoint,
                            shadowTip: ImagePoint,
                            imageWidth: Double,
                            deviceHeadingDeg: Double) throws -> ShadowObservation {
        let objectLen = objectBase.distance(to: objectTip)
        let shadowLen = shadowBase.distance(to: shadowTip)
        guard objectLen > 0.5 else { throw ShadowGeometryError.degenerateObject }
        guard shadowLen > 0.5 else { throw ShadowGeometryError.degenerateShadow }

        let ratio = shadowLen / objectLen
        // Ratio outside [0.05, 100] means sun altitude >~87° or <~0.6° — not
        // usable for this method (near-zenith sun or sun on the horizon).
        guard ratio > 0.05, ratio < 100 else { throw ShadowGeometryError.implausibleRatio }

        // Observed sun altitude: the vertical object and its shadow form the
        // legs of a right triangle, so atan(objectHeight / shadowLength).
        let sunAlt = atan(1.0 / ratio) * 180.0 / .pi

        // Shadow direction in image space: angle of (shadowTip - shadowBase)
        // measured from "up" in the image (negative y), clockwise positive.
        let dx = shadowTip.x - shadowBase.x
        let dy = shadowTip.y - shadowBase.y
        // In image coords y grows downward. "Straight ahead" of the camera is
        // the top of the image (dy < 0). Compute bearing relative to image-up:
        var bearingInImage = atan2(dx, -dy) * 180.0 / .pi // degrees, +clockwise
        if bearingInImage < 0 { bearingInImage += 360 }

        // Correct for the fact that the image center, not the shadow base,
        // corresponds to the device heading. Offset of the shadow-base ray
        // from image center, mapped through the horizontal FOV:
        let centerOffsetFraction = (shadowBase.x + dx / 2 - imageWidth / 2) / imageWidth
        let azimuthCorrection = centerOffsetFraction * horizontalFOVDeg

        var shadowAz = deviceHeadingDeg + bearingInImage + azimuthCorrection
        shadowAz = shadowAz.truncatingRemainder(dividingBy: 360)
        if shadowAz < 0 { shadowAz += 360 }

        var sunAz = shadowAz + 180
        if sunAz >= 360 { sunAz -= 360 }

        return ShadowObservation(
            sunAltitudeDeg: sunAlt,
            sunAzimuthDeg: sunAz,
            shadowAzimuthDeg: shadowAz,
            lengthRatio: ratio
        )
    }

    /// Angular separation (deg) between two (alt, az) sky positions.
    public static func angularSeparationDeg(alt1: Double, az1: Double,
                                            alt2: Double, az2: Double) -> Double {
        let r = Double.pi / 180
        let a1 = alt1 * r, a2 = alt2 * r
        let dAz = (az1 - az2) * r
        let cosD = sin(a1) * sin(a2) + cos(a1) * cos(a2) * cos(dAz)
        return acos(max(-1, min(1, cosD))) / r
    }
}
