//
//  Payload.swift
//  Sky Verification — Task 4: payload types mirroring the TS schema
//
//  PRIVACY CONTRACT (explicit, per phase doc):
//    - NO raw image bytes ever leave the device in this payload.
//      Only `imageHash` (SHA-256 of the cropped measurement region,
//      computed with CryptoKit) is included, for provenance/dedup.
//    - NO GPS. No CLLocation is touched anywhere in this prototype.
//    - NO PII. No user identifiers, device identifiers, or EXIF metadata.
//

import Foundation
import CryptoKit

public enum SkyVerificationMethod: String, Codable {
    case shadowAssisted = "shadow_assisted"
    case shadowAuto     = "shadow_auto"
    case skyDisk        = "sky_disk"
    case starField      = "star_field"
}

public enum SensorQuality: String, Codable {
    case high, medium, low

    /// Derive quality from the capture-time heading stability and the
    /// solver's best-fit residual.
    public static func assess(headingStdDevDeg: Double,
                              angularErrorDeg: Double?) -> SensorQuality {
        let err = angularErrorDeg ?? .infinity
        if headingStdDevDeg <= 0.75 && err <= 1.0 { return .high }
        if headingStdDevDeg <= 1.5 && err <= 2.0 { return .medium }
        return .low
    }
}

public struct SkyVerificationPayload: Codable {
    public let articleId: UUID
    public let arcId: UUID?
    public let observedAzimuthDeg: Double
    public let observedAltitudeDeg: Double
    public let capturedAt: Date          // exact UTC capture instant
    public let sensorQuality: SensorQuality
    public let angularErrorDeg: Double?  // solver best-fit residual
    public let imageHash: String         // SHA-256 hex of the measurement crop
    public let method: SkyVerificationMethod

    public init(articleId: UUID,
                arcId: UUID? = nil,
                observedAzimuthDeg: Double,
                observedAltitudeDeg: Double,
                capturedAt: Date,
                sensorQuality: SensorQuality,
                angularErrorDeg: Double? = nil,
                imageHash: String,
                method: SkyVerificationMethod = .shadowAssisted) {
        self.articleId = articleId
        self.arcId = arcId
        self.observedAzimuthDeg = observedAzimuthDeg
        self.observedAltitudeDeg = observedAltitudeDeg
        self.capturedAt = capturedAt
        self.sensorQuality = sensorQuality
        self.angularErrorDeg = angularErrorDeg
        self.imageHash = imageHash
        self.method = method
    }

    /// Wire format for the future edge function.
    /// (`capturedAt` encoded as ISO-8601 UTC; decoder uses the same strategy.)
    public func jsonData() throws -> Data {
        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        enc.outputFormatting = [.sortedKeys]
        return try enc.encode(self)
    }
}

public enum ImageHasher {
    /// SHA-256 hex digest of the cropped measurement region's JPEG data.
    /// The crop itself (and the original frame) stays on-device.
    public static func sha256Hex(ofCropJPEG data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
}
