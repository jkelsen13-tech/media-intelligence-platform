//
//  ShadowMeasurementView.swift
//  Sky Verification — Task 2: measurement UI
//
//  Displays the captured image; the user taps four points in order:
//    1. object base  2. object tip  3. shadow base  4. shadow tip
//  After the 4th tap, ShadowGeometry computes observed sun alt/az and the
//  view hands the observation (plus capture metadata) to its caller.
//

import SwiftUI

struct ShadowMeasurementView: View {
    let image: UIImage
    let headingDeg: Double
    let capturedAt: Date
    let headingStdDevDeg: Double
    let onComplete: (ShadowObservation) -> Void

    enum TapStage: Int {
        case objectBase = 0, objectTip, shadowBase, shadowTip, done
        var instruction: String {
            switch self {
            case .objectBase: return "Tap the BASE of the vertical object"
            case .objectTip:  return "Tap the TIP of the object"
            case .shadowBase: return "Tap the BASE of the shadow"
            case .shadowTip:  return "Tap the TIP of the shadow"
            case .done:       return "Measured"
            }
        }
    }

    @State private var stage: TapStage = .objectBase
    @State private var objectBase: ImagePoint?
    @State private var objectTip: ImagePoint?
    @State private var shadowBase: ImagePoint?
    @State private var shadowTip: ImagePoint?
    @State private var observation: ShadowObservation?
    @State private var errorMessage: String?

    private let geometry = ShadowGeometry()

    var body: some View {
        ZStack {
            GeometryReader { geo in
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(width: geo.size.width, height: geo.size.height)
                    .contentShape(Rectangle())
                    .onTapGesture { location in
                        handleTap(at: location, imageSize: geo.size)
                    }
                    .overlay(tapMarkers)
            }

            VStack {
                Text(stage.instruction)
                    .font(.headline)
                    .padding(8)
                    .background(.black.opacity(0.6))
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .padding(.top, 12)
                Spacer()
                if let obs = observation {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(String(format: "Sun altitude: %.1f°", obs.sunAltitudeDeg))
                        Text(String(format: "Sun azimuth: %.1f°", obs.sunAzimuthDeg))
                        Text(String(format: "Length ratio: %.2f", obs.lengthRatio))
                        Text(String(format: "Heading σ: %.2f°", headingStdDevDeg))
                        Button("Use this measurement") { onComplete(obs) }
                            .buttonStyle(.borderedProminent)
                    }
                    .padding()
                    .background(.black.opacity(0.6))
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .padding(.bottom, 12)
                }
                if let errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .padding(8)
                        .background(.black.opacity(0.6))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                Button("Reset taps") { reset() }
                    .padding(.bottom, 8)
            }
        }
    }

    private var tapMarkers: some View {
        Canvas { ctx, _ in
            let pts: [(ImagePoint?, Color)] = [
                (objectBase, .green), (objectTip, .green),
                (shadowBase, .orange), (shadowTip, .orange),
            ]
            for (p, color) in pts {
                if let p {
                    let rect = CGRect(x: p.x - 6, y: p.y - 6, width: 12, height: 12)
                    ctx.fill(Path(ellipseIn: rect), with: .color(color))
                }
            }
            // Connect object pair and shadow pair.
            if let b = objectBase, let t = objectTip {
                var path = Path()
                path.move(to: CGPoint(x: b.x, y: b.y))
                path.addLine(to: CGPoint(x: t.x, y: t.y))
                ctx.stroke(path, with: .color(.green), lineWidth: 2)
            }
            if let b = shadowBase, let t = shadowTip {
                var path = Path()
                path.move(to: CGPoint(x: b.x, y: b.y))
                path.addLine(to: CGPoint(x: t.x, y: t.y))
                ctx.stroke(path, with: .color(.orange), lineWidth: 2)
            }
        }
        .allowsHitTesting(false)
    }

    private func handleTap(at location: CGPoint, imageSize: CGSize) {
        let p = ImagePoint(x: location.x, y: location.y)
        switch stage {
        case .objectBase: objectBase = p; stage = .objectTip
        case .objectTip:  objectTip = p;  stage = .shadowBase
        case .shadowBase: shadowBase = p; stage = .shadowTip
        case .shadowTip:
            shadowTip = p
            stage = .done
            compute(imageWidth: imageSize.width)
        case .done:
            break
        }
    }

    private func compute(imageWidth: Double) {
        guard let ob = objectBase, let ot = objectTip,
              let sb = shadowBase, let st = shadowTip else { return }
        do {
            observation = try geometry.observation(
                objectBase: ob, objectTip: ot,
                shadowBase: sb, shadowTip: st,
                imageWidth: imageWidth,
                deviceHeadingDeg: headingDeg
            )
            errorMessage = nil
        } catch {
            observation = nil
            errorMessage = "Measurement rejected: \(error). Reset and try again."
        }
    }

    private func reset() {
        stage = .objectBase
        objectBase = nil; objectTip = nil
        shadowBase = nil; shadowTip = nil
        observation = nil; errorMessage = nil
    }
}
