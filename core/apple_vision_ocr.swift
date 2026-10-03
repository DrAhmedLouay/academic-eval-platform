import Foundation
import Vision
import PDFKit
import AppKit

struct BoundingBox: Codable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

struct LineInfo: Codable {
    let text: String
    let confidence: Float
    let bbox: BoundingBox?
}

struct PageResult: Codable {
    let page_index: Int
    let text: String
    let lines: [LineInfo]
}

struct OCRResponse: Codable {
    let success: Bool
    let full_text: String
    let pages: [PageResult]
    let error: String?
}

func recognizeTextInCGImage(_ cgImg: CGImage) -> (String, [LineInfo]) {
    var extractedLines: [LineInfo] = []

    // 1. Try Accurate Recognition (Supports Arabic & English)
    let semAccurate = DispatchSemaphore(value: 0)
    let reqAccurate = VNRecognizeTextRequest { req, _ in
        defer { semAccurate.signal() }
        guard let observations = req.results as? [VNRecognizedTextObservation] else { return }
        for obs in observations {
            if let top = obs.topCandidates(1).first {
                let trimmed = top.string.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty {
                    let box = BoundingBox(
                        x: Double(obs.boundingBox.origin.x),
                        y: Double(obs.boundingBox.origin.y),
                        width: Double(obs.boundingBox.size.width),
                        height: Double(obs.boundingBox.size.height)
                    )
                    extractedLines.append(LineInfo(text: trimmed, confidence: top.confidence, bbox: box))
                }
            }
        }
    }

    reqAccurate.recognitionLanguages = ["ar-SA", "ars-SA", "en-US"]
    reqAccurate.recognitionLevel = .accurate
    reqAccurate.usesLanguageCorrection = true

    let handler1 = VNImageRequestHandler(cgImage: cgImg, options: [:])
    do {
        try handler1.perform([reqAccurate])
        _ = semAccurate.wait(timeout: .now() + 20.0)
    } catch {
        // Fallback below
    }

    // 2. If accurate returned no text (e.g. cache restrictions or non-Arabic doc), fallback to Fast Recognition
    if extractedLines.isEmpty {
        let semFast = DispatchSemaphore(value: 0)
        let reqFast = VNRecognizeTextRequest { req, _ in
            defer { semFast.signal() }
            guard let observations = req.results as? [VNRecognizedTextObservation] else { return }
            for obs in observations {
                if let top = obs.topCandidates(1).first {
                    let trimmed = top.string.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !trimmed.isEmpty {
                        let box = BoundingBox(
                            x: Double(obs.boundingBox.origin.x),
                            y: Double(obs.boundingBox.origin.y),
                            width: Double(obs.boundingBox.size.width),
                            height: Double(obs.boundingBox.size.height)
                        )
                        extractedLines.append(LineInfo(text: trimmed, confidence: top.confidence, bbox: box))
                    }
                }
            }
        }
        reqFast.recognitionLevel = .fast
        let handler2 = VNImageRequestHandler(cgImage: cgImg, options: [:])
        do {
            try handler2.perform([reqFast])
            _ = semFast.wait(timeout: .now() + 10.0)
        } catch {}
    }

    let pageText = extractedLines.map { $0.text }.joined(separator: "\n")
    return (pageText, extractedLines)
}

func processFile(path: String, maxPages: Int = 3) -> OCRResponse {
    let fileUrl = URL(fileURLWithPath: path)
    let ext = fileUrl.pathExtension.lowercased()

    if ext == "pdf" {
        guard let doc = PDFDocument(url: fileUrl) else {
            return OCRResponse(success: false, full_text: "", pages: [], error: "Could not open PDF file")
        }

        var pagesResult: [PageResult] = []
        var allPagesText: [String] = []
        let count = min(maxPages, doc.pageCount)

        for i in 0..<count {
            guard let page = doc.page(at: i) else { continue }
            let pageRect = page.bounds(for: .mediaBox)
            let scale: CGFloat = 2.0
            let width = Int(pageRect.width * scale)
            let height = Int(pageRect.height * scale)
            let colorSpace = CGColorSpaceCreateDeviceRGB()

            guard let ctx = CGContext(
                data: nil,
                width: width,
                height: height,
                bitsPerComponent: 8,
                bytesPerRow: 0,
                space: colorSpace,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else { continue }

            ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
            ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
            ctx.scaleBy(x: scale, y: scale)
            page.draw(with: .mediaBox, to: ctx)

            guard let cgImg = ctx.makeImage() else { continue }

            let (pText, pLines) = recognizeTextInCGImage(cgImg)
            if !pText.isEmpty {
                pagesResult.append(PageResult(page_index: i, text: pText, lines: pLines))
                allPagesText.append(pText)
            }
        }

        let fullText = allPagesText.joined(separator: "\n\n--- صفحة تالية ---\n\n")
        return OCRResponse(success: true, full_text: fullText, pages: pagesResult, error: nil)

    } else {
        guard let imageSource = CGImageSourceCreateWithURL(fileUrl as CFURL, nil),
              let cgImg = CGImageSourceCreateImageAtIndex(imageSource, 0, nil) else {
            // Fallback via NSImage
            guard let nsImg = NSImage(contentsOfFile: path),
                  let cgImgFallback = nsImg.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
                return OCRResponse(success: false, full_text: "", pages: [], error: "Could not open image file")
            }
            let (pText, pLines) = recognizeTextInCGImage(cgImgFallback)
            let pageResult = PageResult(page_index: 0, text: pText, lines: pLines)
            return OCRResponse(success: true, full_text: pText, pages: [pageResult], error: nil)
        }

        let (pText, pLines) = recognizeTextInCGImage(cgImg)
        let pageResult = PageResult(page_index: 0, text: pText, lines: pLines)
        return OCRResponse(success: true, full_text: pText, pages: [pageResult], error: nil)
    }
}

let args = CommandLine.arguments
if args.count < 2 {
    let res = OCRResponse(success: false, full_text: "", pages: [], error: "Missing file path argument")
    if let data = try? JSONEncoder().encode(res), let str = String(data: data, encoding: .utf8) {
        print(str)
    }
    exit(1)
}

let filePath = args[1]
let maxPages = args.count > 2 ? (Int(args[2]) ?? 3) : 3
let result = processFile(path: filePath, maxPages: maxPages)

let encoder = JSONEncoder()
if let data = try? encoder.encode(result), let jsonStr = String(data: data, encoding: .utf8) {
    print(jsonStr)
} else {
    print("{\"success\":false,\"error\":\"JSON encoding failed\",\"full_text\":\"\",\"pages\":[]}")
}
