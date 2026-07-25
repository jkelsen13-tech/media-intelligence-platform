//
//  CaptureManager.swift
//  Sky Verification (Shadow-First) — Task 1: sensor capture
//
//  CoreMotion device attitude (heading, pitch, roll) + timestamp and
//  AVFoundation rear-camera capture with exposure/focus locked.
//  Output is raw JSON — no GPS, no EXIF location, no PII.
//

import Foundation
import CoreMotion
import AVFoundation
import UIKit

/// Raw capture record. `image` is either a base64 JPEG string or an on-disk
/// file reference (filename inside the app sandbox) — never both.
public struct SkyCaptureRecord {
    public let headingDeg: Double   // magnetic heading (magnetic-north reference frame)
    public let pitchDeg: Double
    public let rollDeg: Double
    public let timestampUTC: Date   // device clock, UTC
    public let headingStdDevDeg: Double
    public let imageBase64: String?
    public let imageFileRef: String?

    public func jsonObject() -> [String: Any] {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var dict: [String: Any] = [
            "heading": headingDeg,
            "pitch": pitchDeg,
            "roll": rollDeg,
            "timestamp": iso.string(from: timestampUTC),
            "heading_stddev": headingStdDevDeg,
        ]
        if let b64 = imageBase64 { dict["image"] = b64 }
        if let ref = imageFileRef { dict["image_file"] = ref }
        return dict
    }

    public func jsonData() throws -> Data {
        try JSONSerialization.data(withJSONObject: jsonObject(), options: [.sortedKeys])
    }
}

public enum CaptureError: Error {
    case headingUnstable(stdDevDeg: Double)
    case headingUnavailable
    case cameraUnavailable
    case captureFailed
}

/// Coordinates CoreMotion attitude sampling and AVFoundation photo capture.
///
/// Repeatability design:
///  - Before the shutter fires, heading is sampled at ~20 Hz for 1 second.
///    If the circular sample standard deviation exceeds `maxHeadingStdDevDeg`
///    (2°), the capture is rejected with `CaptureError.headingUnstable`.
///  - Exposure and focus are locked before capture so the frame is not
///    mid-metering when taken.
final class CaptureManager: NSObject {

    static let maxHeadingStdDevDeg: Double = 2.0

    private let motion = CMMotionManager()
    private let motionQueue = OperationQueue()

    private var attitudeSamples: [(heading: Double, pitch: Double, roll: Double)] = []
    private var attitudeContinuation: CheckedContinuation<[(Double, Double, Double)], Never>?

    // MARK: - Camera

    let captureSession = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    private var photoContinuation: CheckedContinuation<Data, Error>?

    // MARK: - Heading stability sampling

    /// Sample device attitude at ~20 Hz for `duration` seconds.
    /// Throws `headingUnstable` if the circular stddev of heading exceeds the
    /// 2° threshold, or `headingUnavailable` if motion data is missing.
    func sampleStableAttitude(duration: TimeInterval = 1.0) async throws -> (heading: Double, pitch: Double, roll: Double, stdDev: Double) {
        guard motion.isDeviceMotionAvailable else { throw CaptureError.headingUnavailable }
        attitudeSamples = []
        motion.deviceMotionUpdateInterval = 0.05

        let samples: [(Double, Double, Double)] = await withCheckedContinuation { cont in
            self.attitudeContinuation = cont
            motion.startDeviceMotionUpdates(using: .xMagneticNorthZVertical, to: motionQueue) { [weak self] dm, err in
                guard let self = self, err == nil, let dm = dm else { return }
                let heading = dm.heading // degrees, magnetic north reference; <0 while calibrating
                let pitch = dm.attitude.pitch * 180.0 / .pi
                let roll = dm.attitude.roll * 180.0 / .pi
                if heading >= 0 {
                    self.attitudeSamples.append((heading, pitch, roll))
                }
            }
            DispatchQueue.global().asyncAfter(deadline: .now() + duration) { [weak self] in
                self?.finishSampling()
            }
        }

        guard samples.count >= 5 else { throw CaptureError.headingUnavailable }

        // Circular standard deviation of heading (handles 0/360 wrap).
        let headings = samples.map { $0.0 }
        let stdDev = CaptureManager.circularStdDevDeg(headings)
        guard stdDev <= CaptureManager.maxHeadingStdDevDeg else {
            throw CaptureError.headingUnstable(stdDevDeg: stdDev)
        }

        // Circular mean heading; arithmetic mean pitch/roll.
        let meanHeading = CaptureManager.circularMeanDeg(headings)
        let meanPitch = samples.map { $0.1 }.reduce(0, +) / Double(samples.count)
        let meanRoll = samples.map { $0.2 }.reduce(0, +) / Double(samples.count)
        return (meanHeading, meanPitch, meanRoll, stdDev)
    }

    private func finishSampling() {
        motionQueue.addOperation { [weak self] in
            guard let self = self, let cont = self.attitudeContinuation else { return }
            self.attitudeContinuation = nil
            self.motion.stopDeviceMotionUpdates()
            cont.resume(returning: self.attitudeSamples)
        }
    }

    static func circularMeanDeg(_ angles: [Double]) -> Double {
        let rad = angles.map { $0 * .pi / 180 }
        let s = rad.map { sin($0) }.reduce(0, +) / Double(rad.count)
        let c = rad.map { cos($0) }.reduce(0, +) / Double(rad.count)
        var m = atan2(s, c) * 180 / .pi
        if m < 0 { m += 360 }
        return m
    }

    static func circularStdDevDeg(_ angles: [Double]) -> Double {
        let rad = angles.map { $0 * .pi / 180 }
        let s = rad.map { sin($0) }.reduce(0, +) / Double(rad.count)
        let c = rad.map { cos($0) }.reduce(0, +) / Double(rad.count)
        let r = max(0, min(1, (s * s + c * c).squareRoot()))
        // circular stddev in radians: sqrt(-2 ln R)
        return (-2.0 * log(max(r, 1e-9))).squareRoot() * 180 / .pi
    }

    // MARK: - Camera capture

    /// Configure the rear wide-angle camera. Call once before first capture
    /// (start `captureSession` on a background queue afterwards).
    func configureCamera() throws {
        captureSession.beginConfiguration()
        defer { captureSession.commitConfiguration() }
        captureSession.sessionPreset = .photo

        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let input = try? AVCaptureDeviceInput(device: device),
              captureSession.canAddInput(input),
              captureSession.canAddOutput(photoOutput) else {
            throw CaptureError.cameraUnavailable
        }
        captureSession.addInput(input)
        captureSession.addOutput(photoOutput)
    }

    /// Lock exposure/focus at their current metered values, then capture.
    /// Always pair with `sampleStableAttitude` (see `capture()` below).
    func capturePhoto() async throws -> Data {
        if let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) {
            try? device.lockForConfiguration()
            if device.isFocusModeSupported(.locked) { device.focusMode = .locked }
            if device.isExposureModeSupported(.locked) { device.exposureMode = .locked }
            device.unlockForConfiguration()
        }
        let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
        return try await withCheckedThrowingContinuation { cont in
            self.photoContinuation = cont
            photoOutput.capturePhoto(with: settings, delegate: self)
        }
    }

    /// Full repeatable capture flow: stable heading sample → locked photo → JSON record.
    /// - Parameter embedBase64: if true, embeds base64 JPEG; otherwise writes to a
    ///   temp file and stores a file reference.
    func capture(embedBase64: Bool = true) async throws -> SkyCaptureRecord {
        let attitude = try await sampleStableAttitude(duration: 1.0)
        let jpeg = try await capturePhoto()
        let timestamp = Date() // UTC by definition

        var b64: String? = nil
        var fileRef: String? = nil
        if embedBase64 {
            b64 = jpeg.base64EncodedString()
        } else {
            let name = "skycap-\(UUID().uuidString).jpg"
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
            try jpeg.write(to: url)
            fileRef = name
        }

        return SkyCaptureRecord(
            headingDeg: attitude.heading,
            pitchDeg: attitude.pitch,
            rollDeg: attitude.roll,
            timestampUTC: timestamp,
            headingStdDevDeg: attitude.stdDev,
            imageBase64: b64,
            imageFileRef: fileRef
        )
    }
}

extension CaptureManager: AVCapturePhotoCaptureDelegate {
    func photoOutput(_ output: AVCapturePhotoOutput,
                     didFinishProcessingPhoto photo: AVCapturePhoto,
                     error: Error?) {
        guard let cont = photoContinuation else { return }
        photoContinuation = nil
        if let data = photo.fileDataRepresentation(), error == nil {
            cont.resume(returning: data)
        } else {
            cont.resume(throwing: CaptureError.captureFailed)
        }
    }
}
