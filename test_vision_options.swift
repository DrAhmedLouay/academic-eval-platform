import Foundation
import Vision
import AppKit

let imgPath = CommandLine.arguments[1]
guard let nsImg = NSImage(contentsOfFile: imgPath),
      let cgImg = nsImg.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    print("Could not load image")
    exit(1)
}

for langCorr in [true, false] {
    print("=== Testing with usesLanguageCorrection = \(langCorr) ===")
    let req = VNRecognizeTextRequest()
    req.recognitionLanguages = ["ar-SA", "ars-SA", "en-US"]
    req.recognitionLevel = .accurate
    req.usesLanguageCorrection = langCorr
    
    let handler = VNImageRequestHandler(cgImage: cgImg, options: [:])
    try? handler.perform([req])
    if let results = req.results {
        for obs in results {
            let candidates = obs.topCandidates(3).map { $0.string }
            let box = obs.boundingBox
            print("Box: (x:\(String(format: "%.2f", box.origin.x)), y:\(String(format: "%.2f", box.origin.y)), w:\(String(format: "%.2f", box.size.width)), h:\(String(format: "%.2f", box.size.height))) -> Candidates: \(candidates)")
        }
    }
}
